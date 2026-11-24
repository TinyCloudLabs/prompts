// test-ruling: TC-3278 whole-site install cleanup
// test-ruling: task-guide pinned npx fallback replaces the publish/apps missing-CLI expectations (2026-11-19)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-absent-helper-"));
let runs = 0;
after(() => rmSync(work, { recursive: true, force: true }));

const block = (file, heading) => {
  const section = readFileSync(join(root, file), "utf8").split(heading)[1];
  assert.ok(section, `${file}: missing ${heading}`);
  const match = section.match(/```sh\n([\s\S]*?)\n```/);
  assert.ok(match, `${file}: missing shell block after ${heading}`);
  return match[1];
};

const fresh = () => {
  const dir = join(work, `run-${++runs}`);
  const home = join(dir, "home");
  const cwd = join(dir, "cwd");
  const cli = join(dir, "tinycloud");
  const calls = join(dir, "calls");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd);
  writeFileSync(cli, `#!/bin/sh
echo "$*" >> ${JSON.stringify(calls)}
case "$*" in
  --version) echo 1.9.1 ;;
  "courier --help") printf '%s\\n' '  start ' '  invite --session ' '  invite serve ' '  join ' ;;
  "onboard --timeout 1s") echo '{"onboarded":true}' ;;
  "onboard --help") exit 0 ;;
  "auth login --help") echo '--owner --expiry' ;;
  "secrets get --help") echo '--raw' ;;
  "secrets wait --help") echo '--timeout' ;;
  "secrets request --help") echo '--requester' ;;
esac
`, { mode: 0o700 });
  const env = { HOME: home, PATH: "/usr/bin:/bin" };
  assert.equal(existsSync(join(home, ".config/tinycloud/agent-env.mjs")), false);
  assert.equal(existsSync(join(home, ".config/tinycloud/agent.env")), false);
  return { dir, home, cwd, cli, calls, env };
};

const run = (script, fixture, extra = {}) => spawnSync("sh", ["-c", script], {
  cwd: fixture.cwd,
  env: { ...fixture.env, ...extra },
  encoding: "utf8",
});

const calls = (fixture) => existsSync(fixture.calls) ? readFileSync(fixture.calls, "utf8") : "";
const addNpx = (fixture) => {
  const bin = join(fixture.dir, "bin");
  mkdirSync(bin);
  const npx = join(bin, "npx");
  writeFileSync(npx, `#!/bin/sh
echo "$*" >> ${JSON.stringify(fixture.calls)}
shift 6
case "$*" in
  --version) echo 1.9.1 ;;
  "courier --help") printf '%s\\n' '  start ' '  invite --session ' '  invite serve ' '  join ' ;;
  "onboard --help") exit 0 ;;
  "auth login --help") echo '--owner --expiry' ;;
esac
`, { mode: 0o700 });
  return `${bin}:/usr/bin:/bin`;
};


test("publish preamble uses process variables without agent.env and falls back to the pinned npx command", () => {
  const script = block("skills/tc-publish/SKILL.md", "## 1. Check the CLI");
  const selected = fresh();
  const ok = run(script, selected, { TC_BIN: selected.cli, TC_OWNER_EMAIL: "owner@example.com" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /^CLI_OK$/m);
  assert.equal(calls(selected), "--version\nonboard --help\nauth login --help\n");

  const fallback = fresh();
  const used = run(script, fallback, { PATH: addNpx(fallback) });
  assert.equal(used.status, 0, used.stderr);
  assert.match(used.stdout, /^CLI_OK$/m);
  const prefix = `--prefix ${fallback.home} -y -p @tinycloud/cli@1.9.1 tinycloud`;
  assert.equal(calls(fallback), `${prefix} --version\n${prefix} onboard --help\n${prefix} auth login --help\n`);
});

test("Courier preamble uses process TC_BIN without agent.env and falls back to the pinned npx command", () => {
  const script = `COURIER_SKILL=read\n${block("setup/courier.md", "## Check the CLI")}`;
  const selected = fresh();
  const ok = run(script, selected, { TC_BIN: selected.cli });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(calls(selected), "--version\ncourier --help\n");

  const fallback = fresh();
  const used = run(script, fallback, { PATH: addNpx(fallback) });
  assert.equal(used.status, 0, used.stderr);
  const prefix = `--prefix ${fallback.home} -y -p @tinycloud/cli@1.9.1 tinycloud`;
  assert.equal(calls(fallback), `${prefix} --version\n${prefix} courier --help\n`);
});

test("onboarding uses its selected command without agent.env", () => {
  const fixture = fresh();
  const script = block("setup/onboarding.md", "**2. Run onboarding.**").replaceAll("<TC_BIN>", fixture.cli);
  const result = run(script, fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls(fixture), "--version\nonboard --timeout 1s\n");
  assert.match(result.stdout, /NEXT: onboarding is done/);
});

test("apps preamble uses process TC_BIN without agent.env and falls back to the pinned npx command", () => {
  const script = block("skills/tc-apps/SKILL.md", "## 1. Read the paths and the time");
  const selected = fresh();
  const ok = run(script, selected, { TC_BIN: selected.cli });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, new RegExp(selected.cli.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(calls(selected), "--version\n");

  const fallback = fresh();
  const used = run(script, fallback, { PATH: addNpx(fallback) });
  assert.equal(used.status, 0, used.stderr);
  const prefix = `--prefix ${fallback.home} -y -p @tinycloud/cli@1.9.1 tinycloud`;
  assert.match(used.stdout, new RegExp(join(fallback.home, ".local/share/tinycloud/npx/tinycloud").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(calls(fallback), `${prefix} --version\n`);
});

test("Secrets preamble uses process variables without agent.env and reports a missing owner DID", () => {
  const script = block("skills/tc-secrets/SKILL.md", "## 1. Check the CLI");
  const selected = fresh();
  const ownerDid = "did:pkh:eip155:1:0x1111111111111111111111111111111111111111";
  const ok = run(script, selected, { TC_BIN: selected.cli, TC_OWNER_DID: ownerDid });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /^CLI_OK$/m);
  assert.match(ok.stdout, /^OWNER_OK$/m);

  const missing = fresh();
  const stopped = run(script, missing, { TC_BIN: missing.cli });
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.match(stopped.stdout, /^OWNER_UNSET$/m);
});
