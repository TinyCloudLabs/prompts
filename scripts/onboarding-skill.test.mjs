// /onboarding's step-2 block stops with SKILL_MISSING, before any CLI call, unless
// the tinycloud-cli skill is installed where install.js puts it for some client.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-onboarding-skill-"));
const guide = readFileSync(join(root, "setup/onboarding.md"), "utf8");
const step2 = guide.split("**2. Run onboarding.**")[1]?.match(/```sh\n([\s\S]*?)\n```/)?.[1];
const source = readFileSync(join(root, "scripts/install-skill.js"), "utf8");
// Every client install.js installs for, read from its ROOTS table.
const clients = [...source.match(/const ROOTS = \{([\s\S]*?)\n\};/)[1].matchAll(/^\s*"?([a-z-]+)"?:/gm)].map((m) => m[1]);
const MISSING =
  'SKILL_MISSING tinycloud-cli: run the "Install the core skill" step at https://agents.tinycloud.xyz/cli (it is required), then rerun this block';

const skillBody = "---\nname: tinycloud-cli\n---\n";
const site = {
  "/skills/index.json": JSON.stringify({
    skills: [{
      short: "cli",
      name: "tinycloud-cli",
      version: "1.5.2",
      files: [{ path: "SKILL.md", url: "/skills/cli/SKILL.md", sha256: createHash("sha256").update(skillBody).digest("hex") }],
    }],
  }),
  "/skills/cli/SKILL.md": skillBody,
};
const server = createServer((req, res) => res.writeHead(site[req.url] === undefined ? 404 : 200).end(site[req.url]));
let installer;
let runs = 0;

const exec = (file, args, options) =>
  new Promise((done) => execFile(file, args, options, (error, stdout, stderr) => done({ code: error ? error.code : 0, stdout, stderr })));

// A fresh home and working folder, and a stand-in CLI that records each call.
function fresh() {
  const dir = join(work, `run-${++runs}`);
  const home = join(dir, "home");
  const cwd = join(dir, "cwd");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd);
  const tc = join(dir, "tinycloud");
  writeFileSync(tc, `#!/bin/sh\necho "$*" >> ${JSON.stringify(join(dir, "calls"))}\necho '{"onboarded": true}'\n`, { mode: 0o700 });
  return { dir, home, cwd, tc, calls: join(dir, "calls") };
}

// Runs the step-2 block as the guide says to: <TC_BIN> replaced by the selected CLI.
const runBlock = ({ cwd, tc }, env) =>
  exec("sh", ["-c", step2.replaceAll("<TC_BIN>", tc)], { cwd, env: { PATH: process.env.PATH, ...env } });

before(async () => {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  installer = join(work, "install.js");
  const local = source.replace(`const SITE = "https://agents.tinycloud.xyz";`, `const SITE = "http://127.0.0.1:${server.address().port}";`);
  assert.notEqual(local, source);
  writeFileSync(installer, local);
});
after(() => {
  server.close();
  rmSync(work, { recursive: true, force: true });
});

test("onboarding step 2 stops with SKILL_MISSING and calls no CLI when no tinycloud-cli skill is installed", async () => {
  assert.ok(step2, "missing the step-2 shell block");
  for (const extra of [{}, { CLAUDE_CONFIG_DIR: "claude-config" }]) {
    const run = fresh();
    // Another skill, and a tinycloud-cli folder without its SKILL.md, are not the skill.
    mkdirSync(join(run.home, ".agents/skills/tinycloud-cli"), { recursive: true });
    mkdirSync(join(run.home, ".claude/skills/tc-apps"), { recursive: true });
    writeFileSync(join(run.home, ".claude/skills/tc-apps/SKILL.md"), "other");
    const env = { HOME: run.home, ...(extra.CLAUDE_CONFIG_DIR ? { CLAUDE_CONFIG_DIR: join(run.dir, extra.CLAUDE_CONFIG_DIR) } : {}) };
    const result = await runBlock(run, env);
    assert.notEqual(result.code, 0);
    assert.equal(result.stderr, `${MISSING}\n`);
    assert.equal(result.stdout, "");
    assert.equal(existsSync(run.calls), false, "the CLI must not run");
    // The agent reads onboard.err for the approval link; the reason is there too.
    assert.equal(readFileSync(join(run.cwd, "onboard.err"), "utf8"), `${MISSING}\n`);
  }
});

test("onboarding step 2 runs onboard once the skill is installed by install.js for any client", async () => {
  assert.deepEqual(clients.sort(), ["claude-code", "codex", "opencode"], "a new install.js client needs a step-2 check");
  const cases = [...clients.map((client) => ({ client })), { client: "claude-code", CLAUDE_CONFIG_DIR: "claude-config" }];
  for (const { client, CLAUDE_CONFIG_DIR } of cases) {
    const run = fresh();
    const env = { HOME: run.home, ...(CLAUDE_CONFIG_DIR ? { CLAUDE_CONFIG_DIR: join(run.dir, CLAUDE_CONFIG_DIR) } : {}) };
    const label = `${client}${CLAUDE_CONFIG_DIR ? " with CLAUDE_CONFIG_DIR" : ""}`;

    const missing = await runBlock(run, env);
    assert.match(missing.stderr, /^SKILL_MISSING tinycloud-cli: /, `${label}: before the install`);
    assert.equal(existsSync(run.calls), false, `${label}: before the install`);

    const install = await exec(process.execPath, [installer, "cli", "--agent", client], { env: { PATH: process.env.PATH, ...env } });
    assert.equal(install.code, 0, install.stderr);
    assert.match(install.stdout, /^SKILL_INSTALLED tinycloud-cli 1\.5\.2 /, label);

    const ready = await runBlock(run, env);
    assert.equal(ready.code, 0, `${label}: ${ready.stderr}`);
    assert.equal(readFileSync(run.calls, "utf8"), "onboard\n", label);
    assert.equal(readFileSync(join(run.cwd, "onboard.out"), "utf8"), '{"onboarded": true}\n', label);
    assert.equal(readFileSync(join(run.cwd, "onboard.err"), "utf8"), "", label);
  }
});
