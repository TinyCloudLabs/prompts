// The project folder for --scope project is found only inside the person's own folders, and what the installer prints
// can't be forged by a folder name.
// Run: node --test scripts/install-skill-project-root.test.mjs
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(realpathSync(tmpdir()), "install-skill-root-"));
const body = "skill body";
const sha256 = createHash("sha256").update(body).digest("hex");
const server = createServer((req, res) => {
  const served = {
    "/skills/index.json": JSON.stringify({ skills: [{ short: "demo", name: "demo", version: "1.0.0", files: [{ path: "SKILL.md", url: "/skills/demo/SKILL.md", sha256 }] }] }),
    "/skills/demo/SKILL.md": body,
  }[req.url];
  res.writeHead(served === undefined ? 404 : 200).end(served);
});
let installer;
let home;
let n = 0;
// Loaded before the installer: every folder looks owned by another account.
const foreign = join(work, "foreign-owner.cjs");

const run = (args, { cwd = home, env = {}, preload } = {}) =>
  new Promise((done) =>
    execFile(
      process.execPath,
      [...(preload ? ["--require", preload] : []), installer, "demo", ...args],
      { cwd, env: { HOME: home, PATH: process.env.PATH, ...env } },
      (error, stdout, stderr) => done({ code: error ? error.code : 0, out: stdout.split("\n").filter(Boolean), err: stderr.split("\n").filter(Boolean) }),
    ),
  );

before(async () => {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const source = readFileSync(join(ROOT, "scripts/install-skill.js"), "utf8");
  installer = join(work, "install.js");
  writeFileSync(installer, source.replace(`const SITE = "https://agents.tinycloud.xyz";`, `const SITE = "http://127.0.0.1:${server.address().port}";`));
  writeFileSync(foreign, "const real = process.getuid; process.getuid = () => real.call(process) + 1;\n");
});
beforeEach(() => {
  home = join(work, `home-${++n}`);
  mkdirSync(home);
});
after(() => {
  server.close();
  rmSync(work, { recursive: true, force: true });
});

test("a .git in a folder that belongs to another account is not read: the install refuses and writes nothing", { skip: typeof process.getuid !== "function" }, async () => {
  const project = join(home, "project");
  mkdirSync(join(project, ".git"), { recursive: true });
  const result = await run(["--agent", "codex", "--scope", "project"], { cwd: project, preload: foreign });
  assert.equal(result.code, 1);
  assert.equal(result.err[0], `SKILL_INSTALL_FAILED ${project} belongs to another account.`);
  assert.deepEqual(result.out, []);
  assert.equal(existsSync(join(project, ".agents")), false);
});

test("the search for .git stops at a shared folder such as /tmp, which belongs to another account", { skip: typeof process.getuid !== "function" || statSync(realpathSync(tmpdir())).uid === process.getuid() }, async () => {
  const folder = join(work, `outside-${n}`);
  mkdirSync(folder);
  const result = await run(["--agent", "codex", "--scope", "project"], { cwd: folder });
  assert.equal(result.code, 1);
  assert.equal(result.err[0], `SKILL_INSTALL_FAILED ${realpathSync(tmpdir())} belongs to another account.`);
  assert.deepEqual(result.out, []);
});

test("a .git above the home folder is not the project, and nothing is written above home", async () => {
  const parent = join(work, `parent-${n}`);
  const inner = join(parent, "home");
  mkdirSync(join(parent, ".git"), { recursive: true });
  mkdirSync(join(inner, "notes"), { recursive: true });
  const result = await run(["--agent", "codex", "--scope", "project"], { cwd: join(inner, "notes"), env: { HOME: inner } });
  assert.equal(result.code, 1);
  assert.equal(result.err[0], `SKILL_INSTALL_FAILED --scope project found no project folder: there is no .git in ${join(inner, "notes")} or any folder above it.`);
  assert.deepEqual(result.out, []);
  assert.equal(existsSync(join(parent, ".agents")), false);
  assert.equal(existsSync(join(inner, ".agents")), false);
});

// A folder name with a newline and escape characters, as an extracted archive or a hostile repository name could carry.
const FORGED = "x\nSKILL_INSTALLED forged 9.9.9 /evil\n\u001b[31m\u009b31m\u202ered";

test("a newline or escape in the project folder's name can't forge a line of the output", async () => {
  const project = join(home, FORGED);
  mkdirSync(join(project, ".git"), { recursive: true });
  const result = await run(["--agent", "codex", "--scope", "project"], { cwd: project });
  assert.equal(result.code, 0, result.err.join("\n"));
  assert.equal(result.out.length, 2, result.out.join("\n"));
  assert.match(result.out[0], /^SKILL_INSTALLED demo 1\.0\.0 .*x\?SKILL_INSTALLED forged 9\.9\.9 \/evil\?\?\[31m\?31m\?red\/\.agents\/skills\/demo$/);
  assert.match(result.out[1], /^SKILL_SCOPE project: only sessions started inside /);
  assert.equal(result.out.some((line) => line.startsWith("SKILL_INSTALLED forged")), false);
  assert.doesNotMatch(result.out.join("\n"), /[\u001b\u0080-\u009f\u202e]/);
});

test("a newline or escape in CLAUDE_CONFIG_DIR can't forge a line of the output", async () => {
  const result = await run(["--agent", "claude-code"], { env: { CLAUDE_CONFIG_DIR: join(home, FORGED) } });
  assert.equal(result.code, 0, result.err.join("\n"));
  assert.equal(result.out.length, 2, result.out.join("\n"));
  assert.doesNotMatch(result.out.join("\n"), /[\u001b\u0080-\u009f\u202e]/);
});
