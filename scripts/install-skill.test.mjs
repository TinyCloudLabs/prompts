// Tests for scripts/install-skill.js against a local stand-in for the site.
// Run: node --test scripts/install-skill.test.mjs
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(tmpdir(), "install-skill-test-"));
const home = join(work, "home");
const skills = join(home, ".agents", "skills");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
// A process id that is no longer running.
const deadPid = spawnSync(process.execPath, ["-e", ""]).pid;

// What the stand-in site serves: path → body, or { redirect: location }.
let site = {};
// Requests that reached the second, "other" origin.
let elsewhere = [];
const server = createServer((req, res) => {
  const entry = site[req.url];
  if (entry?.redirect) return res.writeHead(302, { Location: entry.redirect }).end();
  res.writeHead(entry === undefined ? 404 : 200).end(entry);
});
const other = createServer((req, res) => {
  elsewhere.push(req.url);
  res.writeHead(200).end("new");
});
let installer;

// Serves one skill whose index entry is `entry` (name and files), with each listed file's body.
function serve(entry, bodies) {
  site = { "/skills/index.json": JSON.stringify({ skills: [{ short: "demo", version: "1.0.0", ...entry }] }) };
  Object.assign(site, bodies);
}
const file = (path, body, url = `/skills/demo/${path}`) => ({ path, url, sha256: sha256(body) });
const TWO_FILES = [{ name: "demo", files: [file("SKILL.md", "new"), file("refs/a.md", "a")] }, { "/skills/demo/SKILL.md": "new", "/skills/demo/refs/a.md": "a" }];

// Runs the installer for the Codex folder; `preload` is a CommonJS file loaded first.
function install(preload) {
  const args = [...(preload ? ["--require", preload] : []), installer, "demo", "--agent", "codex"];
  return new Promise((done) =>
    execFile(process.execPath, args, { env: { HOME: home, PATH: process.env.PATH } }, (error, stdout, stderr) =>
      done({ code: error ? error.code : 0, stdout, stderr }),
    ),
  );
}
// The installed demo skill holds exactly the new files.
function assertNewInstall() {
  assert.equal(readFileSync(join(skills, "demo", "SKILL.md"), "utf8"), "new");
  assert.equal(readFileSync(join(skills, "demo", "refs", "a.md"), "utf8"), "a");
  assert.deepEqual(readdirSync(join(skills, "demo")).sort(), ["SKILL.md", "refs"]);
  assert.deepEqual(readdirSync(skills), ["demo"]);
}

before(async () => {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  await new Promise((done) => other.listen(0, "127.0.0.1", done));
  const source = readFileSync(join(ROOT, "scripts/install-skill.js"), "utf8");
  installer = join(work, "install.js");
  writeFileSync(installer, source.replace(`const SITE = "https://agents.tinycloud.xyz";`, `const SITE = "http://127.0.0.1:${server.address().port}";`));
});
after(() => {
  server.close();
  other.close();
  rmSync(work, { recursive: true, force: true });
});
beforeEach(() => {
  elsewhere = [];
  rmSync(home, { recursive: true, force: true });
  mkdirSync(join(skills, "demo"), { recursive: true });
  writeFileSync(join(skills, "demo", "SKILL.md"), "old");
});

test("installs and replaces the skill folder", async () => {
  serve(...TWO_FILES);
  const run = await install();
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.stdout, /^SKILL_INSTALLED demo 1\.0\.0 /);
  assertNewInstall();
});

test("refuses a skill name that leaves the skills folder", async () => {
  mkdirSync(join(home, ".agents", "victim"), { recursive: true });
  writeFileSync(join(home, ".agents", "victim", "keep"), "sentinel");
  serve({ name: "../victim", files: [file("SKILL.md", "x")] }, { "/skills/demo/SKILL.md": "x" });
  const run = await install();
  assert.equal(run.code, 1);
  assert.match(run.stderr, /SKILL_INSTALL_FAILED unsafe skill name/);
  assert.equal(readFileSync(join(home, ".agents", "victim", "keep"), "utf8"), "sentinel");
});

for (const path of ["..\\x", "../x", "/etc/x", "a/../../x", "C:x"]) {
  test(`refuses the file path ${JSON.stringify(path)}`, async () => {
    serve({ name: "demo", files: [file(path, "x", "/skills/demo/x")] }, { "/skills/demo/x": "x" });
    const run = await install();
    assert.equal(run.code, 1);
    assert.match(run.stderr, /SKILL_INSTALL_FAILED unsafe file path/);
    assert.equal(readFileSync(join(skills, "demo", "SKILL.md"), "utf8"), "old");
    assert.deepEqual(readdirSync(skills), ["demo"]);
  });
}

test("refuses a file URL that would leave the site", async () => {
  serve({ name: "demo", files: [file("SKILL.md", "x", "@evil.example/x")] }, {});
  const run = await install();
  assert.equal(run.code, 1);
  assert.match(run.stderr, /SKILL_INSTALL_FAILED unsafe URL path/);
});

test("refuses a file that redirects to another origin, without fetching it", async () => {
  serve({ name: "demo", files: [file("SKILL.md", "new", "/redirect")] }, { "/redirect": { redirect: `http://127.0.0.1:${other.address().port}/x` } });
  const run = await install();
  assert.equal(run.code, 1);
  assert.match(run.stderr, /SKILL_INSTALL_FAILED .*\/redirect: redirects elsewhere \(HTTP 302\); refused/);
  assert.deepEqual(elsewhere, []);
  assert.equal(readFileSync(join(skills, "demo", "SKILL.md"), "utf8"), "old");
});

test("refuses an index that redirects", async () => {
  serve(...TWO_FILES);
  site["/moved.json"] = site["/skills/index.json"];
  site["/skills/index.json"] = { redirect: "/moved.json" };
  const run = await install();
  assert.equal(run.code, 1);
  assert.match(run.stderr, /index\.json: redirects elsewhere \(HTTP 302\); refused/);
  assert.equal(readFileSync(join(skills, "demo", "SKILL.md"), "utf8"), "old");
});

test("refuses a file whose checksum doesn't match, keeping the old skill", async () => {
  serve({ name: "demo", files: [file("SKILL.md", "new")] }, { "/skills/demo/SKILL.md": "tampered" });
  const run = await install();
  assert.equal(run.code, 1);
  assert.match(run.stderr, /index\.json says/);
  assert.equal(readFileSync(join(skills, "demo", "SKILL.md"), "utf8"), "old");
});

// Makes moving the new skill folder into place fail.
function failActivation() {
  const preload = join(work, "fail-activation.cjs");
  writeFileSync(
    preload,
    `const fs = require("node:fs"); const rename = fs.renameSync;
fs.renameSync = (from, to) => { if (String(from).includes(".installing-")) throw Object.assign(new Error("EACCES: injected"), { code: "EACCES" }); return rename(from, to); };`,
  );
  return preload;
}

test("puts the old skill back when moving the new one in fails", async () => {
  serve({ name: "demo", files: [file("SKILL.md", "new")] }, { "/skills/demo/SKILL.md": "new" });
  const run = await install(failActivation());
  assert.equal(run.code, 1);
  assert.match(run.stderr, /SKILL_INSTALL_FAILED EACCES: injected/);
  assert.equal(readFileSync(join(skills, "demo", "SKILL.md"), "utf8"), "old");
  assert.deepEqual(readdirSync(skills), ["demo"]);
});

test("recovers the old skill an exited install left aside, and clears its leftovers", async () => {
  // An install that exited after moving the old skill aside, before moving the new one in.
  rmSync(join(skills, "demo"), { recursive: true });
  mkdirSync(join(skills, `.demo.previous-${deadPid}-abc123`));
  writeFileSync(join(skills, `.demo.previous-${deadPid}-abc123`, "SKILL.md"), "old");
  mkdirSync(join(skills, `.demo.installing-${deadPid}-abc123`));
  // This install fails to move its own folder in, so what's left is what it recovered.
  serve(...TWO_FILES);
  const run = await install(failActivation());
  assert.equal(run.code, 1);
  assert.equal(readFileSync(join(skills, "demo", "SKILL.md"), "utf8"), "old");
  assert.deepEqual(readdirSync(skills), ["demo"]);
});

test("leaves another running install's folders alone", async () => {
  // Folders tagged with this test's own process id, which is running.
  const live = [`.demo.installing-${process.pid}-abc123`, `.demo.previous-${process.pid}-abc123`];
  for (const name of live) mkdirSync(join(skills, name));
  serve(...TWO_FILES);
  const run = await install();
  assert.equal(run.code, 0, run.stderr);
  assert.deepEqual(readdirSync(skills).sort(), [...live, "demo"].sort());
});

test("breaks a lock left by an install that exited", async () => {
  mkdirSync(join(skills, ".demo.lock"));
  writeFileSync(join(skills, ".demo.lock", "owner"), `${deadPid} abc123\n`);
  serve(...TWO_FILES);
  const run = await install();
  assert.equal(run.code, 0, run.stderr);
  assertNewInstall();
});

test("two overlapping installs end with one complete, checksum-valid skill", async () => {
  // Install A stops right after writing SKILL.md into its staging folder, until
  // the test releases it; install B starts meanwhile. Waiting on files across
  // processes needs real time: a short sleep loop in A, polling in the test.
  const paused = join(work, "a-paused");
  const release = join(work, "a-release");
  rmSync(paused, { force: true });
  rmSync(release, { force: true });
  const preload = join(work, "pause-after-skill-md.cjs");
  writeFileSync(
    preload,
    `const fs = require("node:fs"); const write = fs.writeFileSync; const wait = new Int32Array(new SharedArrayBuffer(4));
fs.writeFileSync = (path, ...rest) => {
  write(path, ...rest);
  if (String(path).includes(".installing-") && String(path).endsWith("SKILL.md")) {
    write(${JSON.stringify(paused)}, "");
    while (!fs.existsSync(${JSON.stringify(release)})) Atomics.wait(wait, 0, 0, 20);
  }
};`,
  );
  serve(...TWO_FILES);
  const a = install(preload);
  while (!existsSync(paused)) await new Promise((done) => setTimeout(done, 20));
  let bDone = false;
  const b = install().then((r) => ((bDone = true), r));
  await new Promise((done) => setTimeout(done, 500));
  assert.equal(bDone, false, "B must wait for A's lock");
  writeFileSync(release, "");
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.code, 0, ra.stderr);
  assert.equal(rb.code, 0, rb.stderr);
  assertNewInstall();
  const files = JSON.parse(site["/skills/index.json"]).skills[0].files;
  for (const f of files) assert.equal(sha256(readFileSync(join(skills, "demo", f.path))), f.sha256);
});
