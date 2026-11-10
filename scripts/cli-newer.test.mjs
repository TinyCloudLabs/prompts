// A newer installed CLI is never refused as if it were older. Runs the real gate blocks of the built guides
// (a copy of the repository is built, so the shared _site the other tests read is left alone) against stand-in
// CLIs that report each version, and the installer's own selection against the same versions.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { CLI_VERSION } from "./install-cli.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-cli-newer-"));
after(() => rmSync(work, { recursive: true, force: true }));

// version -> true when it is older than the pin (a prerelease of the pin is older).
const VERSIONS = { "1.5.9": true, "1.6.0": true, "1.6.2": true, "1.6.3-beta.2": true, "1.6.3": false, "1.6.4": false, "1.7.0": false };
assert.equal(CLI_VERSION, "1.6.3");

let site;
before(async () => {
  const dir = join(work, "build");
  cpSync(root, dir, { recursive: true, filter: (src) => src === root || dirname(src) !== root || ![".git", "_site", "node_modules"].includes(basename(src)) });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CF_PAGES.*|SITE_URL)$/.test(key)));
  await promisify(execFile)(process.execPath, [join(dir, "scripts/build-site.mjs")], { env: clean });
  site = join(dir, "_site");
});

// The first shell block after `heading` in a built guide.
const gate = (file, heading) => {
  const text = readFileSync(join(site, file), "utf8").split(heading)[1];
  assert.ok(text, `${file}: missing ${heading}`);
  const match = text.match(/```sh\n([\s\S]*?)\n```/);
  assert.ok(match, `${file}: missing the shell block after ${heading}`);
  return match[1];
};

let runs = 0;
// A home with a stand-in CLI that reports `version` and records each call. `private`: the agent's own install;
// `process`: an operator's TC_BIN.
function setup(version, where) {
  const dir = join(work, `run-${++runs}`);
  const home = join(dir, "home");
  const cwd = join(dir, "cwd");
  mkdirSync(cwd, { recursive: true });
  const bin = where === "process" ? join(home, "opt/tinycloud/bin/tinycloud") : join(home, ".local/share/tinycloud/cli/node_modules/.bin/tinycloud");
  mkdirSync(dirname(bin), { recursive: true });
  const calls = join(dir, "calls");
  writeFileSync(bin, `#!/bin/sh
echo "$*" >> ${JSON.stringify(calls)}
case "$*" in
  --version) echo ${version} ;;
  "courier --help") printf '%s\\n' '  start [--new subject | --session id]' '  invite --session id --mode same-owner|anyone --consent' '  invite serve id' '  join link --consent' ;;
  onboard*) echo '{"onboarded": true}' ;;
esac
`, { mode: 0o700 });
  chmodSync(bin, 0o700);
  for (const skill of ["tinycloud-cli", "courier"]) {
    mkdirSync(join(home, ".agents/skills", skill), { recursive: true });
    writeFileSync(join(home, ".agents/skills", skill, "SKILL.md"), "skill");
  }
  const env = { PATH: process.env.PATH, HOME: home };
  if (where === "process") env.TC_BIN = bin;
  return { bin, cwd, env, calls, ran: () => { try { return readFileSync(calls, "utf8"); } catch { return ""; } } };
}
const run = (script, { bin, cwd, env }) => spawnSync("sh", ["-c", script.replaceAll("<TC_BIN>", bin)], { cwd, env, encoding: "utf8" });

test("/onboarding step 2 (built): older than the pin prints CLI_OLDER and stops; the pin and newer run onboard", () => {
  const script = gate("onboarding.md", "**2. Run onboarding.**");
  for (const [version, older] of Object.entries(VERSIONS)) {
    const c = setup(version, "private");
    const result = run(script, c);
    if (older) {
      assert.notEqual(result.status, 0, version);
      assert.equal(c.ran(), "--version\n", version);
      assert.match(result.stderr, new RegExp(`^CLI_OLDER ${version.replaceAll(".", "\\.")} \\S+: run the CLI setup`), version);
    } else {
      assert.equal(result.status, 0, `${version}: ${result.stderr}`);
      assert.equal(c.ran(), "--version\nonboard --timeout 1s\n", version);
      assert.doesNotMatch(result.stderr, /CLI_OLDER|TC_OLDER/, version);
    }
  }
});

test("tc-apps skill §1 (built): older than the pin prints CLI_OLDER and stops; the pin and newer pass", () => {
  const script = gate("skills/apps/SKILL.md", "## 1. Read the paths and the time");
  for (const [version, older] of Object.entries(VERSIONS)) {
    const c = setup(version, "private");
    const result = run(script, c);
    const last = result.stdout.trimEnd().split("\n").at(-1);
    assert.equal(c.ran(), "--version\n", version);
    if (older) {
      assert.notEqual(result.status, 0, version);
      assert.match(last, new RegExp(`^CLI_OLDER ${version.replaceAll(".", "\\.")} \\S+: run the CLI setup`), version);
    } else {
      assert.equal(result.status, 0, `${version}: ${result.stdout}${result.stderr}`);
      assert.doesNotMatch(result.stdout + result.stderr, /CLI_OLDER|TC_OLDER/, version);
      assert.equal(last, version);
    }
  }
});

test("courier guide (built): both version checks refuse older than the pin and accept the pin or newer", () => {
  const preOnboarding = gate("courier", "## Before onboarding");
  const postOnboarding = gate("courier", "## Check the installed CLI");
  for (const [version, older] of Object.entries(VERSIONS)) {
    // The pre-onboarding check looks only at an operator's TC_BIN; with none it leaves the CLI to onboarding.
    const c1 = setup(version, "process");
    const pre = run(preOnboarding, c1);
    if (older) {
      assert.notEqual(pre.status, 0, version);
      assert.equal(pre.stderr, `COURIER_CLI_VERSION: ${c1.bin} reports ${version}; need ${CLI_VERSION} or newer; binary left unchanged\n`, version);
    } else assert.equal(pre.status, 0, `${version}: ${pre.stderr}`);
    assert.equal(c1.ran(), "--version\n", version);

    const c2 = setup(version, "process");
    const post = run(postOnboarding, c2);
    if (older) {
      assert.notEqual(post.status, 0, version);
      assert.equal(post.stderr, `COURIER_CLI_VERSION: ${c2.bin} reports ${version}; need ${CLI_VERSION} or newer; binary left unchanged\n`, version);
      assert.equal(c2.ran(), "--version\n", version);
    } else {
      assert.equal(post.status, 0, `${version}: ${post.stderr}`);
      assert.equal(c2.ran(), "--version\ncourier --help\n", version);
    }
  }
});

test("install-cli.mjs --needs-install: a private CLI below the pin is replaced by the pin; the pin or newer is kept", { skip: process.platform === "win32" }, () => {
  for (const [version, older] of Object.entries(VERSIONS)) {
    const c = setup(version, "private");
    // The installer only selects a private copy that npm laid out: its `.bin` entry is a link into @tinycloud/cli.
    const prefix = join(c.env.HOME, ".local/share/tinycloud/cli/node_modules");
    const cli = join(prefix, "@tinycloud/cli/cli.js");
    mkdirSync(dirname(cli), { recursive: true });
    writeFileSync(join(dirname(cli), "package.json"), JSON.stringify({ name: "@tinycloud/cli", version }));
    writeFileSync(cli, readFileSync(c.bin), { mode: 0o700 });
    rmSync(c.bin);
    symlinkSync(cli, c.bin);
    const result = spawnSync(process.execPath, [join(root, "scripts/install-cli.mjs"), "--needs-install"], { env: { ...c.env, PATH: process.env.PATH }, encoding: "utf8" });
    if (older) {
      assert.equal(result.status, 0, `${version}: ${result.stdout}${result.stderr}`);
      assert.match(result.stdout, new RegExp(`^TC_INSTALL_NEEDED ${CLI_VERSION.replaceAll(".", "\\.")} `), version);
    } else {
      assert.equal(result.status, 1, `${version}: ${result.stdout}${result.stderr}`);
      assert.match(result.stdout, new RegExp(`^TC_INSTALL_NOT_NEEDED ${version.replaceAll(".", "\\.")} `), version);
    }
  }
});
