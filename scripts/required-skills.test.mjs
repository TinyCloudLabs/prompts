// Courier's CLI check accepts a directly read skill; onboarding can run without tinycloud-cli.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-required-skills-"));
const sh = (text, heading) => text.split(heading)[1]?.match(/```sh\n([\s\S]*?)\n```/)?.[1];
const onboardingGuide = readFileSync(join(root, "setup/onboarding.md"), "utf8");
const courierGuide = readFileSync(join(root, "setup/courier.md"), "utf8");
let runs = 0;

const exec = (file, args, options) =>
  new Promise((done) => execFile(file, args, options, (error, stdout, stderr) => done({ code: error ? error.code : 0, stdout, stderr })));

function fresh() {
  const dir = join(work, `run-${++runs}`);
  const home = join(dir, "home");
  const cwd = join(dir, "cwd");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd);
  const tc = join(dir, "tinycloud");
  writeFileSync(tc, `#!/bin/sh
echo "$*" >> ${JSON.stringify(join(dir, "calls"))}
case "$*" in
  --version) echo 1.9.1 ;;
  "courier --help") printf '%s\\n' '  start [--new subject | --session id]' '  invite --session id --mode same-owner|anyone --consent' '  invite serve id' '  join link --consent' ;;
  "onboard --timeout 1s") echo '{"onboarded": true}' ;;
esac
`, { mode: 0o700 });
  return { dir, home, cwd, tc, calls: join(dir, "calls") };
}

const callsOf = (run) => (existsSync(run.calls) ? readFileSync(run.calls, "utf8") : "");
const envFor = (run) => ({ PATH: process.env.PATH, HOME: run.home });
const onboardingBlock = sh(onboardingGuide, "**2. Run onboarding.**");
const courierBlock = sh(courierGuide, "## Check the CLI");

after(() => rmSync(work, { recursive: true, force: true }));

test("/onboarding runs with the selected CLI when the optional core skill is absent", async () => {
  const run = fresh();
  const result = await exec("sh", ["-c", onboardingBlock.replaceAll("<TC_BIN>", run.tc)], { cwd: run.cwd, env: envFor(run) });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(callsOf(run), "--version\nonboard --timeout 1s\n");
  assert.equal(result.stdout, '{"onboarded": true}\nNEXT: onboarding is done; continue with the owner\'s goal.\n');
  assert.equal(result.stderr, "");
});

test("/courier's guarded block runs after the agent says it read the skill directly", async () => {
  const run = fresh();
  const result = await exec("sh", ["-c", `COURIER_SKILL=read\n${courierBlock}`], { cwd: run.cwd, env: { ...envFor(run), TC_BIN: run.tc } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(callsOf(run), "--version\ncourier --help\n");
});

test("skill-owned onboard-first routes still ask the owner before onboarding", () => {
  const goAhead = "Ask the owner first in one line (\"I need to set up TinyCloud here to finish this. OK?\") and wait for their yes; onboarding tells you the rest.";
  for (const [source, served] of [
    ["skills/tc-apps/SKILL.md", "_site/skills/apps/SKILL.md"],
    ["skills/tc-apps/TINY-APPS.md", "_site/skills/apps/TINY-APPS.md"],
  ]) {
    for (const file of [source, served]) {
      const routes = readFileSync(join(root, file), "utf8").split("\n\n")
        .filter((p) => p.includes("onboard-first") && p.includes("https://agents.tinycloud.xyz/onboarding") && p.includes("follow it now"));
      assert.equal(routes.length, 1, file);
      assert.ok(routes[0].includes(`keeping the owner's original request. ${goAhead}`), file);
    }
  }
});
