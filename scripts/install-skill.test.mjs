// Tests for scripts/install-skill.js against a local stand-in for the site.
// Run: node --test scripts/
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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

// What the stand-in site serves: path → body. Each test sets its own index.
let site = {};
const server = createServer((req, res) => {
  const body = site[req.url];
  res.writeHead(body === undefined ? 404 : 200).end(body);
});
let installer;

// Serves one skill whose index entry is `entry` (name and files), with each listed file's body.
function serve(entry, bodies) {
  site = { "/skills/index.json": JSON.stringify({ skills: [{ short: "demo", version: "1.0.0", ...entry }] }) };
  for (const [url, body] of Object.entries(bodies)) site[url] = body;
}
const file = (path, body, url = `/skills/demo/${path}`) => ({ path, url, sha256: sha256(body) });

// Runs the installer for the Codex folder; `preload` is a CommonJS file loaded first.
function install(preload) {
  const args = [...(preload ? ["--require", preload] : []), installer, "demo", "--agent", "codex"];
  return new Promise((done) =>
    execFile(process.execPath, args, { env: { HOME: home, PATH: process.env.PATH } }, (error, stdout, stderr) =>
      done({ code: error ? error.code : 0, stdout, stderr }),
    ),
  );
}

before(async () => {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const source = readFileSync(join(ROOT, "scripts/install-skill.js"), "utf8");
  installer = join(work, "install.js");
  writeFileSync(installer, source.replace(`const SITE = "https://agents.tinycloud.xyz";`, `const SITE = "http://127.0.0.1:${server.address().port}";`));
});
after(() => {
  server.close();
  rmSync(work, { recursive: true, force: true });
});
beforeEach(() => {
  rmSync(home, { recursive: true, force: true });
  mkdirSync(join(skills, "demo"), { recursive: true });
  writeFileSync(join(skills, "demo", "SKILL.md"), "old");
});

test("installs and replaces the skill folder", async () => {
  serve({ name: "demo", files: [file("SKILL.md", "new"), file("refs/a.md", "a")] }, { "/skills/demo/SKILL.md": "new", "/skills/demo/refs/a.md": "a" });
  const run = await install();
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.stdout, /^SKILL_INSTALLED demo 1\.0\.0 /);
  assert.equal(readFileSync(join(skills, "demo", "SKILL.md"), "utf8"), "new");
  assert.equal(readFileSync(join(skills, "demo", "refs", "a.md"), "utf8"), "a");
  assert.deepEqual(readdirSync(skills), ["demo"]);
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

test("refuses a file whose checksum doesn't match, keeping the old skill", async () => {
  serve({ name: "demo", files: [file("SKILL.md", "new")] }, { "/skills/demo/SKILL.md": "tampered" });
  const run = await install();
  assert.equal(run.code, 1);
  assert.match(run.stderr, /index\.json says/);
  assert.equal(readFileSync(join(skills, "demo", "SKILL.md"), "utf8"), "old");
});

test("puts the old skill back when moving the new one in fails", async () => {
  const preload = join(work, "fail-activation.cjs");
  writeFileSync(
    preload,
    `const fs = require("node:fs"); const rename = fs.renameSync;
fs.renameSync = (from, to) => { if (String(from).includes(".installing-")) throw Object.assign(new Error("EACCES: injected"), { code: "EACCES" }); return rename(from, to); };`,
  );
  serve({ name: "demo", files: [file("SKILL.md", "new")] }, { "/skills/demo/SKILL.md": "new" });
  const run = await install(preload);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /SKILL_INSTALL_FAILED EACCES: injected/);
  assert.equal(readFileSync(join(skills, "demo", "SKILL.md"), "utf8"), "old");
  assert.deepEqual(readdirSync(skills), ["demo"]);
});

test("recovers the old skill left aside by an interrupted install", async () => {
  // An install that stopped after moving the old skill aside, before moving the new one in.
  rmSync(join(skills, "demo"), { recursive: true });
  mkdirSync(join(skills, ".demo.previous"));
  writeFileSync(join(skills, ".demo.previous", "SKILL.md"), "old");
  serve({ name: "demo", files: [file("SKILL.md", "new")] }, { "/skills/demo/SKILL.md": "tampered" });
  const run = await install();
  assert.equal(run.code, 1);
  assert.equal(readFileSync(join(skills, "demo", "SKILL.md"), "utf8"), "old");
  assert.equal(existsSync(join(skills, ".demo.previous")), false);
});
