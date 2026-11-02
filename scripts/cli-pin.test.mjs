import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { CLI_VERSION } from "./install-cli.mjs";

// Every block that selects the CLI and prints its version stops before any other
// TinyCloud call when the selection is older than the pin: CLI_OLDER for a CLI the
// agent installed, TC_OLDER for an operator's TC_BIN (process or agent.env).
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const helper = join(root, "scripts/agent-env.mjs");
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-cli-pin-"));
after(() => rmSync(work, { recursive: true, force: true }));
let runs = 0;

const section = (file, heading) => {
  const text = readFileSync(join(root, file), "utf8").split(heading)[1];
  assert.ok(text, `${file}: missing ${heading}`);
  const match = text.match(/```sh\n([\s\S]*?)\n```/);
  assert.ok(match, `${file}: missing the shell block after ${heading}`);
  return match[1];
};

const OLDER = "1.5.1";
const PASSING = [CLI_VERSION, "1.5.10", "1.6.0-beta.1"];
const cliOlder = (bin) => `CLI_OLDER ${OLDER} ${bin}: run the CLI setup at https://agents.tinycloud.xyz/cli (it upgrades a CLI the agent installed), then rerun this block`;
const tcOlder = (bin) => `TC_OLDER ${OLDER} ${bin} is older than the pinned ${CLI_VERSION}; keeping this operator-selected CLI`;

// `stops`: an operator's older TC_BIN also stops the block (owner notice); otherwise the block continues to its feature probes.
const blocks = [
  { name: "tc-apps SKILL.md §1", file: "skills/tc-apps/SKILL.md", heading: "## 1. Read the paths and the time", stops: true },
  { name: "tc-secrets SKILL.md §1", file: "skills/tc-secrets/SKILL.md", heading: "## 1. Check the CLI", stops: false, probes: "secrets get --help\nauth login --help\nsecrets wait --help\nsecrets request --help\n", ok: "CLI_OK" },
  { name: "tc-publish SKILL.md §1", file: "skills/tc-publish/SKILL.md", heading: "## 1. Check the CLI", stops: false, probes: "enable share --help\nauth login --help\n", ok: "CLI_OK" },
  { name: "tinycloud-feed SKILL.md check", file: "skills/tinycloud-feed/SKILL.md", heading: "### Install and sign in (weight bot example)", stops: true },
  { name: "/feed check", file: "skills/tinycloud-feed/creating-a-post.md", heading: "### Install and sign in (weight bot example)", stops: true },
  { name: "/onboarding step 2", file: "setup/onboarding.md", heading: "**2. Run onboarding.**", stops: true, onboarding: true },
];

// A home with a stand-in CLI that records each call. `where`:
// private: the agent's own install, found by the resolver; saved-private: agent.env names that private install;
// process: an operator TC_BIN in the environment; saved: an operator TC_BIN in agent.env.
function fresh(block, where, version) {
  const dir = join(work, `run-${++runs}`);
  const home = join(dir, "home");
  const cwd = join(dir, "cwd");
  mkdirSync(cwd, { recursive: true });
  const operator = where === "process" || where === "saved";
  const bin = operator ? join(home, "opt/tinycloud-cli/bin/tinycloud") : join(home, ".local/share/tinycloud/cli/node_modules/.bin/tinycloud");
  mkdirSync(dirname(bin), { recursive: true });
  const calls = join(dir, "calls");
  writeFileSync(bin, `#!/bin/sh
echo "$*" >> ${JSON.stringify(calls)}
case "$*" in
  --version) echo ${version} ;;
  "secrets get --help") echo '  --raw' ;;
  "auth login --help") echo '  --owner --expiry' ;;
  "secrets wait --help") echo '  --timeout' ;;
  "secrets request --help") echo '  --requester' ;;
  "enable share --help") echo '  --replace-session' ;;
  onboard) echo '{"onboarded": true}' ;;
esac
`, { mode: 0o700 });
  // /onboarding requires the tinycloud-cli skill before it runs the CLI.
  mkdirSync(join(home, ".agents/skills/tinycloud-cli"), { recursive: true });
  writeFileSync(join(home, ".agents/skills/tinycloud-cli/SKILL.md"), "skill");
  const env = { PATH: process.env.PATH, HOME: home };
  if (where === "process") env.TC_BIN = bin;
  if (where === "saved" || where === "saved-private") {
    const config = join(home, ".config/tinycloud");
    mkdirSync(config, { recursive: true, mode: 0o700 });
    writeFileSync(join(config, "agent-env.mjs"), readFileSync(helper), { mode: 0o600 });
    const saved = spawnSync(process.execPath, [join(config, "agent-env.mjs"), "set", "TC_BIN", bin], { env, encoding: "utf8" });
    assert.equal(saved.status, 0, saved.stderr);
  }
  const script = section(block.file, block.heading).replaceAll("<TC_BIN>", bin);
  const result = spawnSync("sh", ["-c", script], { cwd, env, encoding: "utf8" });
  let ran = "";
  try { ran = readFileSync(calls, "utf8"); } catch {}
  return { bin, cwd, result, calls: ran };
}

for (const block of blocks) {
  test(`${block.name}: an agent-installed CLI older than the pin prints CLI_OLDER and makes no further CLI call`, () => {
    for (const where of ["private", "saved-private"]) {
      const { bin, cwd, result, calls } = fresh(block, where, OLDER);
      assert.notEqual(result.status, 0, `${where}: ${result.stdout}`);
      assert.equal(calls, "--version\n", where);
      assert.doesNotMatch(result.stdout + result.stderr, /TC_OLDER|CLI_OK|STALE/, where);
      if (block.onboarding) {
        assert.equal(result.stderr, `${cliOlder(bin)}\n`, where);
        assert.equal(readFileSync(join(cwd, "onboard.err"), "utf8"), `${cliOlder(bin)}\n`, where);
      } else {
        assert.equal(result.stdout.trimEnd().split("\n").at(-1), cliOlder(bin), where);
      }
    }
  });

  test(`${block.name}: the pin and newer releases pass`, () => {
    for (const version of PASSING) {
      for (const where of ["private", "process"]) {
        const { bin, result, calls } = fresh(block, where, version);
        assert.equal(result.status, 0, `${version} ${where}: ${result.stdout}${result.stderr}`);
        assert.doesNotMatch(result.stdout + result.stderr, /CLI_OLDER|TC_OLDER/, `${version} ${where}`);
        assert.ok(calls.startsWith("--version\n"), `${version} ${where}: ${calls}`);
        if (block.onboarding) assert.equal(calls, "--version\nonboard\n");
        else if (block.probes) {
          assert.equal(calls, `--version\n${block.probes}`, `${version} ${where}`);
          assert.match(result.stdout, new RegExp(`^${block.ok}\\n${version.replaceAll(".", "\\.")}$`, "m"));
        } else {
          assert.equal(calls, "--version\n", `${version} ${where}`);
          assert.ok(result.stdout.includes(`${bin}\n`), `${version} ${where}`);
          assert.equal(result.stdout.trimEnd().split("\n").at(-1), version, `${version} ${where}`);
        }
      }
    }
  });

  test(`${block.name}: an operator TC_BIN older than the pin prints TC_OLDER and ${block.stops ? "stops" : "continues to the feature probes"}`, () => {
    for (const where of ["process", "saved"]) {
      const { bin, cwd, result, calls } = fresh(block, where, OLDER);
      assert.doesNotMatch(result.stdout + result.stderr, /CLI_OLDER/, where);
      if (block.stops) {
        assert.notEqual(result.status, 0, where);
        assert.equal(calls, "--version\n", where);
        if (block.onboarding) {
          assert.equal(result.stderr, `${tcOlder(bin)}\n`, where);
          assert.equal(readFileSync(join(cwd, "onboard.err"), "utf8"), `${tcOlder(bin)}\n`, where);
        } else assert.equal(result.stdout.trimEnd().split("\n").at(-1), tcOlder(bin), where);
      } else {
        assert.equal(result.status, 0, `${where}: ${result.stderr}`);
        assert.equal(calls, `--version\n${block.probes}`, where);
        assert.match(result.stdout, new RegExp(`^${tcOlder(bin).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n${block.ok}\\n${OLDER.replaceAll(".", "\\.")}$`, "m"), where);
      }
    }
  });
}

test("every gate's comparison: older below the pin, equal or newer passes, a prerelease of the pin is older", () => {
  const cases = { "1.5.1": true, "1.4.99": true, "0.9.0": true, "1.5.2-beta.4": true, "": true, "1.5.2": false, "1.5.10": false, "1.6.0-beta.1": false, "1.5.3-beta.1": false, "2.0.0": false, "1.5.2+build.7": false };
  for (const block of blocks) {
    const compare = section(block.file, block.heading).match(/awk -F\. -v p=\S+ '[^']*'/)?.[0];
    assert.ok(compare, `${block.name}: no comparison`);
    for (const [version, older] of Object.entries(cases)) {
      const result = spawnSync("sh", ["-c", `printf '%s\\n' "$1" | ${compare}`, "sh", version], { encoding: "utf8" });
      assert.equal(result.status === 0, older, `${block.name}: ${JSON.stringify(version)}`);
    }
  }
});
