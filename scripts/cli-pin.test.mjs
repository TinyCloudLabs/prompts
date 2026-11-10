import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
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
const PASSING = [CLI_VERSION, "1.6.5", "1.7.0", "1.6.10", "1.7.0-beta.1"];
const cliOlder = (bin) => `CLI_OLDER ${OLDER} ${bin}: run the CLI setup at https://agents.tinycloud.xyz/cli (it upgrades a CLI the agent installed), then rerun this block`;
const tcOlder = (bin) => `TC_OLDER ${OLDER} ${bin} is older than the pinned ${CLI_VERSION}; keeping this operator-selected CLI`;

// `stops`: an operator's older TC_BIN also stops the block (owner notice); otherwise the block continues to its feature probes.
const blocks = [
  { name: "tc-apps SKILL.md §1", file: "skills/tc-apps/SKILL.md", heading: "## 1. Read the paths and the time", stops: true },
  { name: "tc-secrets SKILL.md §1", file: "skills/tc-secrets/SKILL.md", heading: "## 1. Check the CLI", stops: false, probes: "secrets get --help\nauth login --help\nsecrets wait --help\nsecrets request --help\n", ok: "CLI_OK" },
  { name: "tc-publish SKILL.md §1", file: "skills/tc-publish/SKILL.md", heading: "## 1. Check the CLI", stops: false, probes: "onboard --help\nauth login --help\n", ok: "CLI_OK" },
  { name: "tinycloud-feed SKILL.md §1", file: "skills/tinycloud-feed/SKILL.md", heading: "## 1. Check the CLI", stops: true },
  { name: "/feed §1", file: "skills/tinycloud-feed/creating-a-post.md", heading: "## 1. Check the CLI", stops: true },
  { name: "/onboarding step 2", file: "setup/onboarding.md", heading: "**2. Run onboarding.**", stops: true, onboarding: true },
];

// A home with a stand-in CLI that records each call. `where`:
// private: the agent's own install, found by the resolver; saved-private: agent.env names that private install;
// process-private: a process TC_BIN names that private install (as /cli's PowerShell flow exports it);
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
  // Keep the optional core skill present for this CLI-selection matrix; onboarding does not require it.
  mkdirSync(join(home, ".agents/skills/tinycloud-cli"), { recursive: true });
  writeFileSync(join(home, ".agents/skills/tinycloud-cli/SKILL.md"), "skill");
  const env = { PATH: process.env.PATH, HOME: home };
  if (where === "process" || where === "process-private") env.TC_BIN = bin;
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
    for (const where of ["private", "saved-private", "process-private"]) {
      const { bin, result, calls } = fresh(block, where, OLDER);
      assert.notEqual(result.status, 0, `${where}: ${result.stdout}`);
      assert.equal(calls, "--version\n", where);
      assert.doesNotMatch(result.stdout + result.stderr, /TC_OLDER|CLI_OK|STALE/, where);
      if (block.onboarding) {
        assert.equal(result.stderr, `${cliOlder(bin)}\n`, where);
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
        if (block.onboarding) assert.equal(calls, "--version\nonboard --timeout 1s\n");
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
      const { bin, result, calls } = fresh(block, where, OLDER);
      assert.doesNotMatch(result.stdout + result.stderr, /CLI_OLDER/, where);
      if (block.stops) {
        assert.notEqual(result.status, 0, where);
        assert.equal(calls, "--version\n", where);
        if (block.onboarding) assert.equal(result.stderr, `${tcOlder(bin)}\n`, where);
        else assert.equal(result.stdout.trimEnd().split("\n").at(-1), tcOlder(bin), where);
      } else {
        assert.equal(result.status, 0, `${where}: ${result.stderr}`);
        assert.equal(calls, `--version\n${block.probes}`, where);
        assert.match(result.stdout, new RegExp(`^${tcOlder(bin).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n${block.ok}\\n${OLDER.replaceAll(".", "\\.")}$`, "m"), where);
      }
    }
  });
}

test("every gate's comparison: older below the pin, equal or newer passes, a prerelease of the pin is older", () => {
  const cases = { "1.5.1": true, "1.4.99": true, "0.9.0": true, "1.5.2": true, "1.5.9": true, "1.6.0": true, "1.6.0-beta.1": true, "1.6.2-beta.2": true, "1.6.2-rc.0": true, "1.6.2": true, "1.6.3-beta.2": true, "1.6.3-rc.0": true, "1.6.3": true, "1.6.4-beta.2": true, "": true, "1.6.4": false, "1.6.5": false, "1.6.10": false, "1.7.0": false, "1.7.0-beta.1": false, "2.0.0": false, "1.6.2+build.7": true };
  for (const block of blocks) {
    const compare = section(block.file, block.heading).match(/awk -F\. -v p=\S+ '[^']*'/)?.[0];
    assert.ok(compare, `${block.name}: no comparison`);
    for (const [version, older] of Object.entries(cases)) {
      const result = spawnSync("sh", ["-c", `printf '%s\\n' "$1" | ${compare}`, "sh", version], { encoding: "utf8" });
      assert.equal(result.status === 0, older, `${block.name}: ${JSON.stringify(version)}`);
    }
  }
});

// A2 (production QA): a private 1.5.1 from the old installer (`.bin/tc` and `.bin/tinycloud`), with
// `~/.local/bin/tinycloud` linked to `.bin/tc` and on PATH, and no agent.env. `linked-process` and
// `linked-saved` select that link as TC_BIN; `path-outside` has only an older CLI on PATH, outside the
// private install, which install-cli.mjs never reuses (it installs the private pin instead).
function shaped(block, shape) {
  const dir = join(work, `run-${++runs}`);
  const home = join(dir, "home");
  const cwd = join(dir, "cwd");
  mkdirSync(cwd, { recursive: true });
  const calls = join(dir, "calls");
  const stub = `#!/bin/sh\necho "$*" >> ${JSON.stringify(calls)}\ncase "$*" in --version) echo ${OLDER} ;; esac\n`;
  const pkg = shape === "path-outside" ? join(home, "global/lib/node_modules/@tinycloud/cli") : join(home, ".local/share/tinycloud/cli/node_modules/@tinycloud/cli");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@tinycloud/cli", version: OLDER }));
  writeFileSync(join(pkg, "cli.js"), stub, { mode: 0o700 });
  const bins = shape === "path-outside" ? join(home, "global/bin") : join(home, ".local/share/tinycloud/cli/node_modules/.bin");
  mkdirSync(bins, { recursive: true });
  for (const name of ["tc", "tinycloud"]) symlinkSync(join(pkg, "cli.js"), join(bins, name));
  const local = join(home, ".local/bin");
  mkdirSync(local, { recursive: true });
  const link = join(local, "tinycloud");
  if (shape !== "path-outside") symlinkSync(join(bins, "tc"), link);
  mkdirSync(join(home, ".agents/skills/tinycloud-cli"), { recursive: true });
  writeFileSync(join(home, ".agents/skills/tinycloud-cli/SKILL.md"), "skill");
  const onPath = shape === "path-outside" ? join(bins, "tinycloud") : link;
  const env = { PATH: `${shape === "path-outside" ? bins : local}:${process.env.PATH}`, HOME: home };
  if (shape === "linked-process") env.TC_BIN = link;
  if (shape === "linked-saved") {
    const config = join(home, ".config/tinycloud");
    mkdirSync(config, { recursive: true, mode: 0o700 });
    writeFileSync(join(config, "agent-env.mjs"), readFileSync(helper), { mode: 0o600 });
    const saved = spawnSync(process.execPath, [join(config, "agent-env.mjs"), "set", "TC_BIN", link], { env, encoding: "utf8" });
    assert.equal(saved.status, 0, saved.stderr);
  }
  // The skills prefer the private `.bin/tinycloud` over PATH; /onboarding runs the path /cli or the agent found.
  const selected = block.onboarding ? onPath
    : shape === "clarissa" ? join(bins, "tinycloud")
    : shape === "path-outside" ? onPath : link;
  const script = section(block.file, block.heading).replaceAll("<TC_BIN>", onPath);
  const result = spawnSync("sh", ["-c", script], { cwd, env, encoding: "utf8" });
  let ran = "";
  try { ran = readFileSync(calls, "utf8"); } catch {}
  return { selected, result, calls: ran };
}

for (const block of blocks) {
  test(`${block.name}: in A2's home, a CLI linked from ~/.local/bin or found on PATH is the agent's own: CLI_OLDER`, () => {
    for (const shape of ["clarissa", "linked-process", "linked-saved", "path-outside"]) {
      const { selected, result, calls } = shaped(block, shape);
      assert.notEqual(result.status, 0, `${shape}: ${result.stdout}`);
      assert.equal(calls, "--version\n", shape);
      assert.doesNotMatch(result.stdout + result.stderr, /TC_OLDER/, shape);
      const said = block.onboarding ? result.stderr : result.stdout;
      assert.equal(said.trimEnd().split("\n").at(-1), cliOlder(selected), shape);
    }
  });
}

// The rule an agent reads first: run the block; only TC_OLDER means operator-selected;
// upgrading is part of the owner's request; never `tinycloud upgrade` or a global install.
const UPGRADE = "Upgrading the CLI is part of the owner's request: don't ask first; at most one short line (\"Updating the TinyCloud CLI.\").";
const NEVER_UPGRADE = "Never run `tinycloud upgrade` or a global npm install of the TinyCloud CLI; the guide's installer (/cli) handles upgrades.";
const SKILL_STEP = "Installing the skill is part of the owner's request: don't ask first; at most one short line";
const surfaces = [
  { files: ["skills/tc-apps/SKILL.md", "_site/skills/apps/SKILL.md", "_site/skills/apps.md"], blk: "§1", stops: true },
  { files: ["setup/tc-apps.md", "_site/apps"], blk: "skill §1", stops: true },
  { files: ["skills/tc-secrets/SKILL.md", "_site/skills/secrets/SKILL.md", "_site/skills/secrets.md"], blk: "§1", stops: false },
  { files: ["skills/tc-publish/SKILL.md", "_site/skills/publish/SKILL.md", "_site/skills/publish.md"], blk: "§1", stops: false },
  { files: ["skills/tinycloud-feed/SKILL.md", "_site/skills/feed/SKILL.md", "_site/skills/feed.md"], blk: "the check", stops: true },
  { files: ["skills/tinycloud-feed/creating-a-post.md", "_site/skills/feed/creating-a-post.md", "_site/feed"], blk: "the check", stops: true },
  { files: ["setup/onboarding.md", "_site/onboarding.md"], blk: "step 2", stops: true },
];
const RULE = `**CLI rule (stable \`${CLI_VERSION}\`): `;
test("every CLI rule says to run the block first, that only TC_OLDER means operator-selected, that upgrading needs no asking, and never to run `tinycloud upgrade`", () => {
  for (const { files, blk, stops } of surfaces) {
    for (const file of files) {
      const text = readFileSync(join(root, file), "utf8");
      const rules = text.split("\n").filter((line) => line.startsWith(RULE));
      assert.equal(rules.length, 1, file);
      const [rule] = rules;
      assert.match(rule, /before any other (TinyCloud )?command|run step 2's block as written/, file);
      assert.ok(rule.includes(`Only a \`TC_OLDER\` line from ${blk}`), file);
      assert.ok(rule.includes(stops ? `tell the owner in one line that it is older than the required \`${CLI_VERSION}\`, and stop.` : `keep it, tell the operator once that \`${CLI_VERSION}\` is required, and continue with what ${blk} reports.`), file);
      assert.ok(rule.includes(`Any other older CLI is yours, including one on \`PATH\` or linked from \`~/.local/bin\`: ${blk} prints \`CLI_OLDER\``), file);
      assert.ok(rule.includes(`${UPGRADE} ${NEVER_UPGRADE}`), file);
      assert.match(rule, /[Dd]on't judge who installed the CLI yourself/, file);
      assert.doesNotMatch(text, /operator-selected CLI is kept|older CLI the operator selected is kept/, file);
    }
  }
});

// A fetch summary turned "No global installation, second beta CLI, …" into "don't
// install a second CLI", and the agent didn't upgrade. /onboarding keeps that
// sentence so its owner-facing HTML stays byte-identical; its step 2 stops on CLI_OLDER itself.
const NO_GLOBAL = "Don't install the CLI globally, with `sudo`, or by piping a download into a shell; /cli installs and upgrades the agent's own copy.";
const OLD_NO_GLOBAL = "second beta CLI";
test("every CLI rule but /onboarding's forbids a global, sudo or piped install, not a second CLI, as written and as served", () => {
  for (const { files } of surfaces) {
    for (const file of files) {
      const [rule] = readFileSync(join(root, file), "utf8").split("\n").filter((line) => line.startsWith(RULE));
      const onboarding = file.endsWith("onboarding.md");
      assert.equal(rule.includes(`${NO_GLOBAL}**`), !onboarding, file);
      assert.equal(rule.includes(OLD_NO_GLOBAL), onboarding, file);
    }
  }
  const keep = ["setup/onboarding.md", "_site/onboarding.md", "_site/llms-full.txt"];
  assert.deepEqual(served().filter((file) => readFileSync(join(root, file), "utf8").includes(OLD_NO_GLOBAL)).sort(), keep.sort());
});

test("/cli and every CLI_OLDER note say upgrading needs no asking and never `tinycloud upgrade`, as written and as served", () => {
  for (const file of ["setup/tinycloud.md", "_site/cli"]) {
    assert.ok(readFileSync(join(root, file), "utf8").includes(`**Upgrades go through this guide.** ${UPGRADE} ${NEVER_UPGRADE}`), file);
  }
  for (const { files } of surfaces) {
    for (const file of files) {
      // The prose that tells the agent what to do with a CLI_OLDER line (not the rule, not the block).
      const notes = readFileSync(join(root, file), "utf8").split("\n").filter((line) => line.includes("CLI_OLDER <version> <path>") && !line.startsWith("**CLI rule"));
      if (file === "setup/tc-apps.md" || file === "_site/apps") { assert.equal(notes.length, 0, file); continue; }
      assert.equal(notes.length, 1, file);
      assert.ok(notes[0].includes(`${UPGRADE} ${NEVER_UPGRADE}`), file);
    }
  }
});

test("the required Courier skill's SKILL_MISSING note says installation needs no asking, as written and as served", () => {
  for (const [file, line] of [
    ["setup/courier.md", "Installing the Courier skill."], ["_site/courier", "Installing the Courier skill."],
  ]) {
    const notes = readFileSync(join(root, file), "utf8").split("\n").filter((l) => /^(- \*\*)?`SKILL_MISSING/.test(l));
    assert.equal(notes.length, 1, file);
    assert.ok(notes[0].includes(`${SKILL_STEP} ("${line}").`), file);
  }
});

// Every Markdown guide and skill, as written and as served (including llms-full.txt).
const served = () => ["setup", "skills", "_site"].flatMap((dir) =>
  readdirSync(join(root, dir), { recursive: true }).map((f) => join(dir, f))
    .filter((f) => /\.(md|txt)$|^_site\/[^/.]+$/.test(f) && statSync(join(root, f)).isFile()));

test("no guide or skill keeps the CLI or skill steps from the owner, or suggests `tinycloud upgrade` or a global TinyCloud CLI install", () => {
  const files = served();
  assert.ok(files.includes("_site/cli") && files.includes("_site/llms-full.txt") && files.includes("skills/tc-apps/SKILL.md"));
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(text, /never ask the owner about the CLI|for you only|don't tell the owner(?! to send it)/i, file);
    for (const before of text.split("tinycloud upgrade").slice(0, -1)) assert.match(before, /Never run `$/, file);
    assert.doesNotMatch(text, /npm (install|i)\b[^\n]*(--global|\s-g\b)[^\n]*@tinycloud\/cli|npm (install|i)\b[^\n]*@tinycloud\/cli[^\n]*(--global|\s-g\b)/, file);
  }
});
