// Courier's CLI check requires its skill; onboarding can run without tinycloud-cli.
// A required-skill guard stops before any CLI call when that skill is not installed.
// install.js defines the supported client folders.
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
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-required-skills-"));
const sh = (text, heading) => text.split(heading)[1]?.match(/```sh\n([\s\S]*?)\n```/)?.[1];
const onboardingGuide = readFileSync(join(root, "setup/onboarding.md"), "utf8");
const courierGuide = readFileSync(join(root, "setup/courier.md"), "utf8");
const source = readFileSync(join(root, "scripts/install-skill.js"), "utf8");
// Every client install.js installs for, read from its ROOTS table.
const clients = [...source.match(/const ROOTS = \{([\s\S]*?)\n\};/)[1].matchAll(/^\s*"?([a-z-]+)"?:/gm)].map((m) => m[1]);
const missing = (skill, step, page) =>
  `SKILL_MISSING ${skill}: run the "${step}" step at https://agents.tinycloud.xyz/${page} (it is required), then rerun this block\n`;

// A stand-in site serving the two skills under their real short names and folder names.
const skillBody = (name) => `---\nname: ${name}\n---\n`;
const entry = (short, name, version) => ({
  short, name, version,
  files: [{ path: "SKILL.md", url: `/skills/${short}/SKILL.md`, sha256: createHash("sha256").update(skillBody(name)).digest("hex") }],
});
const site = {
  "/skills/index.json": JSON.stringify({ skills: [entry("cli", "tinycloud-cli", "1.6.2"), entry("courier", "courier", "0.5.2")] }),
  "/skills/cli/SKILL.md": skillBody("tinycloud-cli"),
  "/skills/courier/SKILL.md": skillBody("courier"),
};
const server = createServer((req, res) => res.writeHead(site[req.url] === undefined ? 404 : 200).end(site[req.url]));
let installer;
let runs = 0;

const exec = (file, args, options) =>
  new Promise((done) => execFile(file, args, options, (error, stdout, stderr) => done({ code: error ? error.code : 0, stdout, stderr })));

// A fresh home and working folder, and a stand-in 1.6.2 CLI with Courier that records each call.
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
  --version) echo 1.6.2 ;;
  "courier --help") printf '%s\\n' '  start [--new subject | --session id]' '  invite --session id --mode same-owner|anyone --consent' '  invite serve id' '  join link --consent' ;;
  "onboard --timeout 1s") echo '{"onboarded": true}' ;;
esac
`, { mode: 0o700 });
  return { dir, home, cwd, tc, calls: join(dir, "calls") };
}
const callsOf = (run) => (existsSync(run.calls) ? readFileSync(run.calls, "utf8") : "");

const onboardingBlock = sh(onboardingGuide, "**2. Run onboarding.**");
const runOnboarding = (run, env) => exec("sh", ["-c", onboardingBlock.replaceAll("<TC_BIN>", run.tc)], { cwd: run.cwd, env });
const onboardingRan = (run, result) => {
  assert.equal(callsOf(run), "--version\nonboard --timeout 1s\n");
  assert.equal(result.stdout, '{"onboarded": true}\nNEXT: onboarding is done; continue with the owner\'s goal.\n');
  assert.equal(result.stderr, "");
};
const guarded = {
  courier: {
    skill: "courier",
    short: "courier",
    message: missing("courier", "Install the Courier skill", "courier"),
    block: sh(courierGuide, "## Check the installed CLI"),
    // The operator's CLI is selected with TC_BIN; the later commands run in the same shell.
    run: (run, env) =>
      exec("sh", ["-c", `${guarded.courier.block}\nprintf 'COURIER_LINK_ORIGIN=%s\\n' "$COURIER_LINK_ORIGIN"`], { cwd: run.cwd, env: { TC_BIN: run.tc, ...env } }),
    ran: (run, result) => {
      assert.equal(callsOf(run), "--version\ncourier --help\n");
      assert.equal(result.stdout, "COURIER_LINK_ORIGIN=https://courier.tinycloud.xyz\n");
    },
  },
};
// `claude` maps the run's folder to a CLAUDE_CONFIG_DIR value; without it the variable is unset.
const envFor = (run, claude) => ({
  PATH: process.env.PATH,
  HOME: run.home,
  ...(claude ? { CLAUDE_CONFIG_DIR: claude(run.dir) } : {}),
});

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

test("/onboarding runs with the selected CLI when the optional core skill is absent", async () => {
  const run = fresh();
  const result = await runOnboarding(run, envFor(run));
  assert.equal(result.code, 0, result.stderr);
  onboardingRan(run, result);
});

for (const [page, guard] of Object.entries(guarded)) {
  test(`/${page}'s guarded block stops with SKILL_MISSING ${guard.skill} and calls no CLI when the skill is not installed`, async () => {
    assert.ok(guard.block, `missing /${page}'s guarded shell block`);
    for (const claude of [undefined, (dir) => join(dir, "claude-config")]) {
      const run = fresh();
      // Another skill, and a skill folder without its SKILL.md, are not the skill.
      mkdirSync(join(run.home, `.agents/skills/${guard.skill}`), { recursive: true });
      mkdirSync(join(run.home, ".claude/skills/tc-apps"), { recursive: true });
      writeFileSync(join(run.home, ".claude/skills/tc-apps/SKILL.md"), "other");
      // With CLAUDE_CONFIG_DIR set, Claude Code doesn't read ~/.claude, so a skill there doesn't count.
      if (claude) {
        mkdirSync(join(run.home, `.claude/skills/${guard.skill}`), { recursive: true });
        writeFileSync(join(run.home, `.claude/skills/${guard.skill}/SKILL.md`), "elsewhere");
      }
      const result = await guard.run(run, envFor(run, claude));
      assert.notEqual(result.code, 0);
      assert.equal(result.stderr, guard.message);
      assert.equal(result.stdout, "");
      assert.equal(callsOf(run), "", "the CLI must not run");
    }
  });

  test(`/${page}'s guarded block runs once install.js installs ${guard.skill} for any client`, async () => {
    assert.deepEqual([...clients].sort(), ["claude-code", "codex", "opencode"], "a new install.js client needs the guards to check its folder");
    // install.js trims CLAUDE_CONFIG_DIR and falls back to ~/.claude when nothing is left; the guards must agree.
    const cases = [
      ...clients.map((client) => ({ client })),
      { client: "claude-code", claude: (dir) => join(dir, "claude-config"), label: "CLAUDE_CONFIG_DIR set" },
      { client: "claude-code", claude: () => "   ", label: 'CLAUDE_CONFIG_DIR="   "' },
      { client: "claude-code", claude: (dir) => ` ${join(dir, "claude-config")} `, label: 'CLAUDE_CONFIG_DIR=" /dir "' },
      { client: "claude-code", claude: (dir) => `\t${join(dir, "claude-config")}\n`, label: "CLAUDE_CONFIG_DIR tab/newline padded" },
    ];
    for (const { client, claude, label: how } of cases) {
      const run = fresh();
      const env = envFor(run, claude);
      const label = `${client}${how ? ` with ${how}` : ""}`;

      const absent = await guard.run(run, env);
      assert.equal(absent.stderr, guard.message, `${label}: before the install`);
      assert.equal(callsOf(run), "", `${label}: before the install`);

      const install = await exec(process.execPath, [installer, guard.short, "--agent", client], { env });
      assert.equal(install.code, 0, install.stderr);
      assert.match(install.stdout, new RegExp(`^SKILL_INSTALLED ${guard.skill} `), label);

      const ready = await guard.run(run, env);
      assert.equal(ready.code, 0, `${label}: ${ready.stderr}`);
      guard.ran(run, ready);
    }
  });
}

test("/courier's guarded block passes without the skill only when the agent says it read the skill directly", async () => {
  const run = fresh();
  const result = await exec("sh", ["-c", `COURIER_SKILL=read\n${guarded.courier.block}`], { cwd: run.cwd, env: { ...envFor(run), TC_BIN: run.tc } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(callsOf(run), "--version\ncourier --help\n");
});

test("/courier names the two-call skill install, served unchanged, for the skill index's courier entry", () => {
  const { skills } = JSON.parse(readFileSync(join(root, "_site/skills/index.json"), "utf8"));
  const courier = skills.find((skill) => skill.short === "courier");
  assert.ok(courier);
  const download = 'mkdir -p "$HOME/.local/share/tinycloud" && curl -fsSL -o "$HOME/.local/share/tinycloud/install.js" https://agents.tinycloud.xyz/skills/install.js';
  const install = 'node "$HOME/.local/share/tinycloud/install.js" courier --agent CLIENT';
  for (const [surface, text] of [["setup/courier.md", courierGuide], ["_site/courier", readFileSync(join(root, "_site/courier"), "utf8")]]) {
    const step = text.split("\n## Install the Courier skill\n")[1]?.split("\n## ")[0];
    assert.ok(step, `${surface}: missing the Courier skill step`);
    const blocks = [...step.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    assert.deepEqual(blocks, [download, install], surface);
    assert.ok(step.includes(`\`SKILL_INSTALLED ${courier.name} ${courier.version} <folder>\``), surface);
    for (const client of clients) assert.ok(step.includes(`\`${client}\``), `${surface}: ${client}`);
    assert.match(step, /This step is required/, surface);
    assert.match(step, /Only if your client is none of those three, read SKILL\.md and start\.md directly instead/, surface);
  }
  // The /cli step also downloads both the CLI installer and shared skill installer.
  const cliSetup = readFileSync(join(root, "setup/tinycloud.md"), "utf8");
  assert.match(cliSetup, /install-cli\.mjs/);
  assert.match(cliSetup, /skills\/install\.js/);
});

test("every onboard-first route says the owner's request is the go-ahead, as written and as served", () => {
  const goAhead = "The owner's request is the go-ahead: don't stop to ask or explain first; onboarding tells you the one line to send the owner.";
  for (const [source, served] of [
    ["skills/tc-apps/SKILL.md", "_site/skills/apps/SKILL.md"],
    ["skills/tc-apps/TINY-APPS.md", "_site/skills/apps/TINY-APPS.md"],
    ["setup/tc-apps.md", "_site/apps"],
  ]) {
    for (const file of [source, served]) {
      // The paragraph that sends an onboard-first agent to /onboarding.
      const routes = readFileSync(join(root, file), "utf8").split("\n\n")
        .filter((p) => p.includes("onboard-first") && p.includes("https://agents.tinycloud.xyz/onboarding") && p.includes("follow it now"));
      assert.equal(routes.length, 1, file);
      assert.ok(routes[0].includes(`keeping the owner's original request. ${goAhead}`), file);
    }
  }
});

test("/apps installation and the tc-apps forward test require the version the site serves", () => {
  const { skills } = JSON.parse(readFileSync(join(root, "_site/skills/index.json"), "utf8"));
  const { version } = skills.find((skill) => skill.name === "tc-apps");
  const setup = readFileSync(join(root, "setup/tc-apps.md"), "utf8");
  assert.ok(setup.includes(`Require \`SKILL_INSTALLED tc-apps ${version} <folder>\``));
  assert.ok(readFileSync(join(root, "forward-tests-tc-apps.md"), "utf8").includes(`\`SKILL_INSTALLED tc-apps ${version} …\``));
});
