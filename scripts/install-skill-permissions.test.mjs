// TC-3278: a skills folder the user cannot write stops the skill install with the folder and the cause, and no fix.
// Run: node --test scripts/install-skill-permissions.test.mjs
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const skip = process.platform === "win32" || (typeof process.getuid === "function" && process.getuid() === 0);
// /nonexistent and /usr answer differently on macOS (ENOENT, or a sealed system volume): the outside-the-home wording is checked on Linux only.
const skipOutside = skip || process.platform === "darwin";
const work = mkdtempSync(join(realpathSync(tmpdir()), "install-skill-perm-"));
const home = join(work, "home");
const agents = join(home, ".agents");
const body = "new";
const sha256 = createHash("sha256").update(body).digest("hex");
const server = createServer((req, res) => {
  const served = {
    "/skills/index.json": JSON.stringify({ skills: [{ short: "demo", name: "demo", version: "1.0.0", files: [{ path: "SKILL.md", url: "/skills/demo/SKILL.md", sha256 }] }] }),
    "/skills/demo/SKILL.md": body,
  }[req.url];
  res.writeHead(served === undefined ? 404 : 200).end(served);
});
let installer;

const run = (homeDir) =>
  new Promise((done) =>
    execFile(process.execPath, [installer, "demo", "--agent", "codex"], { env: { HOME: homeDir, PATH: process.env.PATH } }, (error, stdout, stderr) =>
      done({ code: error ? error.code : 0, out: stderr.split("\n").filter(Boolean) }),
    ),
  );

before(async () => {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const source = readFileSync(join(ROOT, "scripts/install-skill.js"), "utf8");
  installer = join(work, "install.js");
  writeFileSync(installer, source.replace(`const SITE = "https://agents.tinycloud.xyz";`, `const SITE = "http://127.0.0.1:${server.address().port}";`));
});
after(() => {
  server.close();
  try { chmodSync(agents, 0o755); } catch { /* never created */ }
  rmSync(work, { recursive: true, force: true });
});

// What must never be printed: a fix line, a command, advice to ask someone, or an instruction to retry.
const instructions = (out) => out.filter((line) => /SKILL_FIX|chmod|chown|icacls|sudo|ask the person|run this yourself|again|safe to repeat/.test(line));

test("an unwritable ~/.agents names the folder and the cause, then says the CLI still works", { skip }, async () => {
  mkdirSync(agents, { recursive: true });
  chmodSync(agents, 0o555);
  const result = await run(home);
  assert.equal(result.code, 1);
  assert.match(result.out[0], /^SKILL_INSTALL_FAILED EACCES: permission denied, mkdir /);
  assert.equal(result.out[1], `SKILL_CAUSE ${agents} is read-only for this user (mode 555), or the disk is read-only`);
  assert.equal(result.out[2], "The CLI works without the skill.");
  assert.equal(result.out.length, 3);
  assert.deepEqual(instructions(result.out), []);
  assert.equal(existsSync(join(agents, "skills")), false);
});

test("a skills folder outside the home, as with HOME=/nonexistent, is reported as outside it, with no command", { skip: skipOutside }, async () => {
  const result = await run("/nonexistent");
  assert.equal(result.code, 1);
  assert.equal(result.out[1], "SKILL_CAUSE this user can't write to /, which is outside the home folder");
  assert.equal(result.out[2], "The CLI works without the skill.");
  assert.deepEqual(instructions(result.out), []);
});

test("a ~/.agents that is a link to a system folder is reported as outside the home, with no command", { skip: skipOutside }, async () => {
  const linked = join(work, "linked-home");
  mkdirSync(linked);
  symlinkSync("/usr", join(linked, ".agents"));
  const result = await run(linked);
  assert.equal(result.code, 1);
  assert.equal(result.out[1], `SKILL_CAUSE this user can't write to ${join(linked, ".agents")}, which is outside the home folder`);
  assert.deepEqual(instructions(result.out), []);
});
