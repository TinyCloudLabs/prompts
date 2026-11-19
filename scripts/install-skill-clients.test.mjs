// TC-3246: the skill installer writes to the folder each agent client reads, in user or project scope, and says where.
// Run: node --test scripts/install-skill-clients.test.mjs
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharedTmp = realpathSync(tmpdir());
const work = mkdtempSync(join(sharedTmp, "install-skill-clients-"));
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

// Runs the installer with `home` as HOME, from `cwd`, and returns its exit code, stdout and stderr lines.
const run = (args, { cwd = home, env = {} } = {}) =>
  new Promise((done) =>
    execFile(process.execPath, [installer, "demo", ...args], { cwd, env: { HOME: home, PATH: process.env.PATH, ...env } }, (error, stdout, stderr) =>
      done({ code: error ? error.code : 0, out: stdout.split("\n").filter(Boolean), err: stderr.split("\n").filter(Boolean) }),
    ),
  );
const installed = (result) => result.out.filter((line) => line.startsWith("SKILL_INSTALLED ")).map((line) => line.split(" ").slice(3).join(" "));

before(async () => {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const source = readFileSync(join(ROOT, "scripts/install-skill.js"), "utf8");
  installer = join(work, "install.js");
  writeFileSync(installer, source.replace(`const SITE = "https://agents.tinycloud.xyz";`, `const SITE = "http://127.0.0.1:${server.address().port}";`));
});
beforeEach(() => {
  home = join(work, `home-${++n}`);
  mkdirSync(home);
});
after(() => {
  server.close();
  rmSync(work, { recursive: true, force: true });
});

// Where each client reads user skills, from each vendor's skills page. Every client but Claude Code
// gets the shared copy, because the setup guides read it; Amp, Hermes and OpenClaw also get a folder of their own.
const SHARED = [".agents", "skills"];
const USER_FOLDERS = {
  "claude-code": [[".claude", "skills"]],
  codex: [SHARED],
  gemini: [SHARED],
  cursor: [SHARED],
  opencode: [SHARED],
  omp: [SHARED],
  copilot: [SHARED],
  amp: [SHARED, [".config", "agents", "skills"]],
  hermes: [SHARED, [".hermes", "skills"]],
  openclaw: [SHARED, [".openclaw", "skills"]],
  agents: [SHARED],
};

for (const [client, folders] of Object.entries(USER_FOLDERS)) {
  test(`--agent ${client} installs for the user into ${folders.map((f) => `~/${f.join("/")}`).join(" and ")} and says so`, async () => {
    const result = await run(["--agent", client]);
    const dests = folders.map((folder) => join(home, ...folder, "demo"));
    assert.equal(result.code, 0, result.err.join("\n"));
    assert.deepEqual(installed(result), dests);
    for (const dest of dests) assert.equal(readFileSync(join(dest, "SKILL.md"), "utf8"), body);
    const scope = result.out.filter((line) => line.startsWith("SKILL_SCOPE "));
    assert.equal(scope.length, 1);
    assert.match(scope[0], /^SKILL_SCOPE user: any session on this computer account can use it, in any folder \(installed for /);
    assert.match(scope[0], /--scope project/);
  });
}

test("--agent is accepted before or after the skill and --scope in either order", async () => {
  const result = await run(["--scope", "user", "--agent", "codex"]);
  assert.equal(result.code, 0, result.err.join("\n"));
  assert.deepEqual(installed(result), [join(home, ".agents", "skills", "demo")]);
});

test("CLAUDE_CONFIG_DIR moves Claude Code's folder", async () => {
  const config = join(work, `claude-config-${n}`);
  const result = await run(["--agent", "claude-code"], { env: { CLAUDE_CONFIG_DIR: config } });
  assert.deepEqual(installed(result), [join(config, "skills", "demo")]);
  assert.equal(existsSync(join(home, ".claude")), false);
});

test("clients that share a folder get one copy; Claude Code gets its own", async () => {
  const result = await run(["--agent", "claude-code,codex,gemini,omp"]);
  assert.equal(result.code, 0, result.err.join("\n"));
  assert.deepEqual(installed(result), [join(home, ".claude", "skills", "demo"), join(home, ".agents", "skills", "demo")]);
  const scope = result.out.find((line) => line.startsWith("SKILL_SCOPE "));
  assert.match(scope, /installed for Claude Code; Codex, Gemini CLI, OMP\)/);
});

test("a client with a folder of its own as well as the shared one is named once in the scope line", async () => {
  for (const [agent, label] of [["amp", "Amp"], ["hermes", "Hermes"], ["openclaw", "OpenClaw"]]) {
    const result = await run(["--agent", agent]);
    assert.equal(result.code, 0, result.err.join("\n"));
    const scope = result.out.find((line) => line.startsWith("SKILL_SCOPE "));
    assert.ok(scope.includes(`(installed for ${label}). `), scope);
  }
  const mixed = await run(["--agent", "hermes,codex"]);
  assert.ok(mixed.out.find((line) => line.startsWith("SKILL_SCOPE ")).includes("(installed for Hermes, Codex)."));
});

test("OpenClaw gets the shared copy and a copy in its state folder, which OPENCLAW_STATE_DIR moves", async () => {
  const result = await run(["--agent", "openclaw"]);
  assert.deepEqual(installed(result), [join(home, ".agents", "skills", "demo"), join(home, ".openclaw", "skills", "demo")]);
  const state = join(work, `openclaw-state-${n}`);
  const moved = await run(["--agent", "openclaw"], { env: { OPENCLAW_STATE_DIR: state } });
  assert.deepEqual(installed(moved), [join(home, ".agents", "skills", "demo"), join(state, "skills", "demo")]);
});

test("Amp's user folder is its own, and in a project it shares .agents/skills with the other clients", async () => {
  const project = join(home, "proj");
  mkdirSync(join(project, ".git"), { recursive: true });
  const user = await run(["--agent", "amp,codex"]);
  assert.deepEqual(installed(user), [join(home, ".agents", "skills", "demo"), join(home, ".config", "agents", "skills", "demo")]);
  const inProject = await run(["--agent", "amp,codex", "--scope", "project"], { cwd: project });
  assert.deepEqual(installed(inProject), [join(project, ".agents", "skills", "demo")]);
  assert.match(inProject.out.find((line) => line.startsWith("SKILL_SCOPE ")), /installed for Amp, Codex\)/);
});

test("Hermes and OpenClaw copy only into folders the project scope can name", async () => {
  const project = join(home, "proj");
  mkdirSync(join(project, ".git"), { recursive: true });
  const hermes = await run(["--agent", "hermes", "--scope", "project"], { cwd: project });
  assert.deepEqual(installed(hermes), [join(project, ".agents", "skills", "demo"), join(project, ".hermes", "skills", "demo")]);
  const openclaw = await run(["--agent", "openclaw", "--scope", "project"], { cwd: project });
  assert.deepEqual(installed(openclaw), [join(project, ".agents", "skills", "demo")]);
});

test("--scope project installs into the project's folder, found by its .git above the current folder, and not into the home folder", async () => {
  const project = join(home, "work", "proj");
  mkdirSync(join(project, ".git"), { recursive: true });
  mkdirSync(join(project, "src", "deep"), { recursive: true });
  const result = await run(["--agent", "codex,claude-code", "--scope", "project"], { cwd: join(project, "src", "deep") });
  assert.equal(result.code, 0, result.err.join("\n"));
  assert.deepEqual(installed(result), [join(project, ".agents", "skills", "demo"), join(project, ".claude", "skills", "demo")]);
  assert.equal(existsSync(join(home, ".agents")), false);
  assert.equal(existsSync(join(home, ".claude")), false);
  const scope = result.out.find((line) => line.startsWith("SKILL_SCOPE "));
  assert.ok(scope.startsWith(`SKILL_SCOPE project: only sessions started inside ${project} can use it`), scope);
  assert.match(scope, /--scope user/);
});

test("--scope project with no .git above the current folder refuses, and writes nothing", async () => {
  const folder = join(home, "notes");
  mkdirSync(folder);
  const result = await run(["--agent", "opencode", "--scope", "project"], { cwd: folder });
  assert.equal(result.code, 1);
  assert.equal(result.err[0], `SKILL_INSTALL_FAILED --scope project found no project folder: there is no .git in ${folder} or any folder above it.`);
  assert.deepEqual(installed(result), []);
  assert.equal(existsSync(join(folder, ".agents")), false);
  assert.equal(existsSync(join(home, ".agents")), false);
});

test("--scope project refuses the home folder, and writes nothing", async () => {
  const result = await run(["--agent", "codex", "--scope", "project"], { cwd: home });
  assert.equal(result.code, 1);
  assert.equal(result.err[0], `SKILL_INSTALL_FAILED --scope project found no project folder: ${home} is the home folder or the top of the disk.`);
  assert.equal(existsSync(join(home, ".agents")), false);
});

test("--scope project refuses a project that is the home folder because home is a git repository", async () => {
  mkdirSync(join(home, ".git"));
  const folder = join(home, "notes");
  mkdirSync(folder);
  const result = await run(["--agent", "codex", "--scope", "project"], { cwd: folder });
  assert.equal(result.code, 1);
  assert.equal(existsSync(join(home, ".agents")), false);
});

test("--scope project refuses the home folder when HOME is a link to it", async () => {
  const link = join(work, `link-${n}`);
  symlinkSync(home, link);
  const result = await run(["--agent", "codex", "--scope", "project"], { cwd: home, env: { HOME: link } });
  assert.equal(result.code, 1);
  assert.match(result.err[0], /^SKILL_INSTALL_FAILED --scope project found no project folder: .* is the home folder or the top of the disk\.$/);
  assert.equal(existsSync(join(home, ".agents")), false);
});

// A shared folder such as /tmp belongs to root: another account could pre-create .agents there and swap the skill.
test("--scope project refuses a folder that belongs to another account", { skip: typeof process.getuid !== "function" || statSync(sharedTmp).uid === process.getuid() }, async () => {
  const result = await run(["--agent", "codex", "--scope", "project"], { cwd: sharedTmp });
  assert.equal(result.code, 1);
  assert.ok(result.err[0].startsWith(`SKILL_INSTALL_FAILED ${sharedTmp} belongs to another account`) ||
    result.err[0].startsWith(`SKILL_INSTALL_FAILED ${join(sharedTmp, ".agents")} belongs to another account`));
});

test("when a later folder fails, the failure line names the folders already installed", async () => {
  writeFileSync(join(home, ".agents"), "not a folder");
  const result = await run(["--agent", "claude-code,codex"]);
  assert.equal(result.code, 1);
  assert.deepEqual(installed(result), [join(home, ".claude", "skills", "demo")]);
  assert.ok(result.err[0].startsWith("SKILL_INSTALL_FAILED "), result.err[0]);
  assert.ok(result.err[0].endsWith(` (already installed in: ${join(home, ".claude", "skills", "demo")})`), result.err[0]);
});

test("auto installs for the clients whose folders exist, once per shared folder", async () => {
  mkdirSync(join(home, ".gemini"));
  mkdirSync(join(home, ".codex"));
  mkdirSync(join(home, ".claude"));
  const result = await run(["--agent", "auto"]);
  assert.equal(result.code, 0, result.err.join("\n"));
  assert.deepEqual(installed(result), [join(home, ".claude", "skills", "demo"), join(home, ".agents", "skills", "demo")]);
});

test("auto with only Claude Code present writes no shared copy", async () => {
  mkdirSync(join(home, ".claude"));
  const result = await run(["--agent", "auto"]);
  assert.deepEqual(installed(result), [join(home, ".claude", "skills", "demo")]);
  assert.equal(existsSync(join(home, ".agents")), false);
});

test("auto with no client found installs into the shared folder", async () => {
  const result = await run(["--agent", "auto"]);
  assert.deepEqual(installed(result), [join(home, ".agents", "skills", "demo")]);
});

test("auto in project scope installs into the project folders of the clients found", async () => {
  mkdirSync(join(home, ".claude"));
  mkdirSync(join(home, ".omp"));
  const project = join(home, "proj");
  mkdirSync(join(project, ".git"), { recursive: true });
  const result = await run(["--agent", "auto", "--scope", "project"], { cwd: project });
  assert.deepEqual(installed(result), [join(project, ".claude", "skills", "demo"), join(project, ".agents", "skills", "demo")]);
});

test("an unknown client, a bad scope or a repeated flag fails with the usage line and writes nothing", async () => {
  for (const args of [["--agent", "notepad"], ["--agent", "codex", "--scope", "everywhere"], ["--agent", "codex", "--agent", "gemini"], ["--agent"], []]) {
    const result = await run(args);
    assert.equal(result.code, 1, args.join(" "));
    assert.match(result.err[0], /^SKILL_INSTALL_FAILED (no client "notepad"\. )?usage: node install\.js <skill> --agent <amp\|claude-code\|codex\|copilot\|cursor\|gemini\|hermes\|omp\|openclaw\|opencode\|agents\|auto>/, args.join(" "));
    assert.equal(existsSync(join(home, ".agents")), false);
    assert.equal(existsSync(join(home, ".claude")), false);
  }
});

test("the scope line and the another-account failure state facts and tell the agent to run nothing", async () => {
  const user = await run(["--agent", "codex"]);
  assert.equal(user.out.at(-1), "SKILL_SCOPE user: any session on this computer account can use it, in any folder (installed for Codex). --scope project installs it for one project only.");
  const project = join(home, "proj");
  mkdirSync(join(project, ".git"), { recursive: true });
  const scoped = await run(["--agent", "codex", "--scope", "project"], { cwd: project });
  assert.equal(scoped.out.at(-1), `SKILL_SCOPE project: only sessions started inside ${project} can use it (installed for Codex). --scope user installs it for every folder on this computer account.`);
  if (typeof process.getuid === "function" && statSync(sharedTmp).uid !== process.getuid()) {
    const refused = await run(["--agent", "codex", "--scope", "project"], { cwd: sharedTmp });
    assert.ok([
      `SKILL_INSTALL_FAILED ${sharedTmp} belongs to another account.`,
      `SKILL_INSTALL_FAILED ${join(sharedTmp, ".agents")} belongs to another account.`,
    ].includes(refused.err[0]));
  }
});
