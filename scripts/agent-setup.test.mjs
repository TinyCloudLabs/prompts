import assert from "node:assert/strict";
import { marked } from "marked";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const helper = join(root, "scripts/agent-env.mjs");
const homes = [];
const home = () => { const dir = mkdtempSync(join(realpathSync(tmpdir()), "tc-agent-setup-")); homes.push(dir); return dir; };
const shell = (script, env) => spawnSync("sh", ["-c", script], { encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
const block = (text, heading, language = "sh") => {
  const section = text.split(heading)[1];
  assert.ok(section, `missing ${heading}`);
  const match = section.match(new RegExp("```" + language + "\\n([\\s\\S]*?)\\n```"));
  assert.ok(match, `missing ${heading} shell block`);
  return match[1];
};
const executable = (path, body) => { writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o700 }); chmodSync(path, 0o700); };
after(() => { for (const dir of homes) rmSync(dir, { recursive: true, force: true }); });

test("CLI setup respects an operator binary without replacing a conflicting tc", () => {
  const dir = home();
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const selected = join(bin, "custom-cli");
  const conflicting = join(bin, "tc");
  executable(selected, 'echo 1.5.0');
  executable(conflicting, 'echo unrelated');
  executable(join(bin, "curl"), `cp '${join(root, "_site/install-cli.mjs")}' "$4"`);
  const original = readFileSync(conflicting);
  const result = spawnSync("sh", [join(root, "_site/skills/install-cli.sh")], { encoding: "utf8", env: { HOME: dir, TC_BIN: selected, PATH: `${bin}:${process.env.PATH}` } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /TC_CONFLICT tc other/);
  assert.match(result.stdout, /^TC_OLDER 1\.5\.0 \S+custom-cli is older than the pinned 1\.6\.6; keeping this operator-selected CLI$/m);
  assert.deepEqual(readFileSync(conflicting), original);
  assert.equal(existsSync(join(dir, ".local/share/tinycloud/cli")), false);
});


before(() => {
  const built = spawnSync(process.execPath, [join(root, "scripts/build-site.mjs")], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
});

test("feed skill is listed and its published relative reference resolves", () => {
  const site = join(root, "_site");
  const index = readFileSync(join(site, "index.html"), "utf8");
  const skills = JSON.parse(readFileSync(join(site, "skills/index.json"), "utf8"));
  const skill = skills.skills.find((entry) => entry.name === "tinycloud-feed");
  assert.ok(skill, "feed skill in install index");
  assert.match(index, /href="\/feed"/);
  assert.match(index, /href="\/skills\/feed\.md"/);
  assert.ok(skill.files.some((file) => file.path === "creating-a-post.md" && file.url === "/skills/feed/creating-a-post.md"));
  const published = readFileSync(join(site, "skills/feed.md"), "utf8");
  assert.match(published, /\]\(feed\/creating-a-post\.md\)/);
  const reference = readFileSync(join(site, "skills/feed/creating-a-post.md"), "utf8");
  const guide = readFileSync(join(site, "feed"), "utf8");
  assert.equal(guide, reference.replace(
    "[creating-a-post.md](creating-a-post.md)",
    "[creating-a-post.md](https://agents.tinycloud.xyz/skills/feed/creating-a-post.md)",
  ));
});

test("CLI skill install reference has no standalone installer commands", () => {
  const text = readFileSync(join(root, "_site/skills/cli/INSTALL.md"), "utf8");
  assert.doesNotMatch(text, /install\.js|npm\s+(?:i|install)\b|curl[^\n|]*\|\s*(?:sh|bash)/i);
});

const minimalClients = new Map([
  ["claude-code", { title: "Set up TinyCloud in Claude Code", use: "Use this page only in Claude Code." }],
  ["codex", { title: "Set up TinyCloud in Codex", use: "Use this page only in Codex." }],
  ["opencode", { title: "Set up TinyCloud in OpenCode", use: "Use this page only in OpenCode." }],
  ["gemini-cli", { title: "Set up TinyCloud in Gemini CLI", use: "Use this page for Gemini CLI only. Antigravity is a different client." }],
  ["grok-bot", { title: "Set up TinyCloud in Grok Bot", use: "Use this page only in Grok Bot with a persistent terminal." }],
  ["cli", { title: "Set up TinyCloud in another CLI agent", use: "Use this page only in a CLI-capable agent without a named TinyCloud page." }],
]);
const existingClients = ["chatgpt", "claude", "cursor", "gemini", "grok", "muse", "perplexity", "openclaw", "hermes"];

test("/connect is a short router to every named client page", () => {
  const router = readFileSync(join(root, "_site/connect.md"), "utf8");
  assert.ok(Buffer.byteLength(router) <= 4_500, `${Buffer.byteLength(router)} bytes`);
  for (const client of [...minimalClients.keys()].filter((name) => name !== "cli").concat(existingClients)) {
    assert.ok(router.includes(`https://agents.tinycloud.xyz/connect/${client}.md`), client);
  }
  assert.ok(router.includes("https://agents.tinycloud.xyz/connect/cli.md"));
});

test("root and /connect client links resolve to matching HTML and Markdown guides", () => {
  const site = join(root, "_site");
  const index = readFileSync(join(site, "index.html"), "utf8");
  const router = readFileSync(join(site, "connect.md"), "utf8");
  const clients = [...minimalClients.keys(), ...existingClients].sort();
  const indexClients = [...index.matchAll(/href="\/connect\/([^"]+)"/g)].map((match) => match[1]).sort();
  const routerClients = [...router.matchAll(/\]\(https:\/\/agents\.tinycloud\.xyz\/connect\/([a-z-]+)\.md\)/g)].map((match) => match[1]).sort();
  assert.deepEqual(indexClients, clients);
  assert.deepEqual(routerClients, clients);
  for (const client of clients) {
    const markdown = readFileSync(join(site, "connect", `${client}.md`), "utf8");
    assert.doesNotMatch(markdown, /install\.js|\bsudo\b|npm\s+(?:i|install)\s+(?:-g|--global)|curl[^\n|]*\|\s*(?:sh|bash)/i, `${client}: install mechanics`);
    const html = readFileSync(join(site, "connect", `${client}.html`), "utf8");
    const title = markdown.match(/^# (.+)$/m)?.[1];
    assert.ok(title, `${client}: Markdown title`);
    assert.ok(html.includes(`<h1 id=`) && html.includes(`>${title}</h1>`), `${client}: HTML title`);
    assert.equal(
      readFileSync(join(root, "functions/connect", `${client}.js`), "utf8"),
      `import { htmlOrMarkdown } from "../../scripts/page-negotiation.mjs";\n\nexport const onRequest = htmlOrMarkdown("/connect/${client}");\n`,
      `${client}: extensionless HTML handler`,
    );
  }
});

test("each new CLI page is a minimal progressive entry with validated literal commands", () => {
  for (const [route, expected] of minimalClients) {
    const text = readFileSync(join(root, "_site/connect", `${route}.md`), "utf8");
    const nonblank = text.split("\n").filter((line) => line.trim());
    assert.ok(nonblank.length <= 9, `${route}: ${nonblank.length} nonblank lines`);
    assert.ok(Buffer.byteLength(text) <= 1_500, `${route}: ${Buffer.byteLength(text)} bytes`);
    for (const line of [
      `# ${expected.title}`,
      expected.use,
      "The TinyCloud CLI is TinyCloud's own tool, published on npm as `@tinycloud/cli`.",
      "`npx --prefix \"$HOME\" -y -p @tinycloud/cli@1.6.6 tinycloud onboard --timeout 1s`",
      "Follow what it prints.",
      "Wherever it says `tinycloud`, run `npx --prefix \"$HOME\" -y -p @tinycloud/cli@1.6.6 tinycloud` instead.",
      "Then continue the owner's request.",
    ]) assert.ok(text.includes(`\n${line}\n`) || text.endsWith(`\n${line}\n`), `${route}: ${line}`);
    const source = readFileSync(join(root, "setup/connect", `${route}.md`), "utf8");
    assert.equal(source.split("@{{CLI_VERSION}}").length - 1, 2, `${route}: version token`);
    assert.doesNotMatch(text.split("\n").slice(1).join("\n"), /\b(?:curl|sudo)\b|install\.js/, `${route}: install mechanics`);
    if (route === "grok-bot") assert.ok(text.includes("Before you run anything, tell the owner that [Grok Bot shares command-line credentials across their Bots](https://docs.x.ai/grok-bot/computer-and-apps#one-computer-shared-by-all-your-bots)."));
    assert.doesNotMatch(text, /\bPATH\b|\bpermissions?\b|--version|TC_ACTION|--check|install-cli|needs-install|blocked|retry/i, route);
  }
});

test("hosted split pages route their CLI names to the new entry pages", () => {
  for (const [hosted, cli] of new Map([["claude", "claude-code"], ["gemini", "gemini-cli"], ["grok", "grok-bot"]])) {
    const text = readFileSync(join(root, "_site/connect", `${hosted}.md`), "utf8");
    assert.ok(text.includes(`https://agents.tinycloud.xyz/connect/${cli}.md`), hosted);
  }
});

test("tc-apps onboards generic apps first and keeps Health Log on its dedicated profile", () => {
  const site = join(root, "_site");
  const onboarding = "https://agents.tinycloud.xyz/onboarding";
  for (const file of ["apps", "skills/apps/SKILL.md"]) {
    const rules = readFileSync(join(site, file), "utf8").split("\n").filter((line) => line.includes("`onboard-first`") && line.includes(onboarding));
    assert.equal(rules.length, 1, file);
    assert.match(rules[0], /generic apps?/);
    assert.match(rules[0], /original request/);
    assert.match(rules[0], /rerun/);
  }
  const catalog = readFileSync(join(site, "skills/apps/TINY-APPS.md"), "utf8");
  assert.match(catalog, /Health Log always uses its own app-scoped profile and approval/);
  assert.match(catalog, /never use the onboarded profile for Health Log/);
  assert.match(catalog, /Check only the existing Health Log app grant on `agent-meal`, not a broad onboarding grant/);
  assert.match(catalog, /--profile agent-meal auth request --preset apps-agent --write --app xyz\.tinycloud\.sample\.healthlog --emit/);
  assert.match(catalog, /### Health Log's per-app access/);
  const recipeOnboarding = catalog.split("\n\n").find((paragraph) => paragraph.includes("onboard-first") && paragraph.includes(onboarding));
  assert.ok(recipeOnboarding);
  assert.match(recipeOnboarding, /For Recipes, fetch the onboarding guide raw/);
  assert.match(recipeOnboarding, /keeping the owner's original request/);
  assert.match(recipeOnboarding, /Ask the owner first in one line \("I need to set up TinyCloud here/);
  assert.match(recipeOnboarding, /rerun the check above/);
  assert.match(recipeOnboarding, /Never use this check or its profile for Health Log/);
});



test("a full storage sends the owner to the storage page from tc-apps and tc-publish", () => {
  const site = join(root, "_site");
  const storage = "https://account.tinycloud.xyz/storage";
  const lines = (file) => readFileSync(join(site, file), "utf8").split("\n");
  const errors = (file) => lines(file).slice(lines(file).indexOf("## 8. Errors"));
  for (const [file, rows] of [
    ["skills/apps/SKILL.md", errors("skills/apps/SKILL.md")],
    ["skills/apps/LEGACY.md", errors("skills/apps/LEGACY.md")],
    ["skills/publish/SKILL.md", lines("skills/publish/SKILL.md")],
  ]) {
    const row = rows.filter((line) => line.includes("`STORAGE_QUOTA_EXCEEDED`") && line.includes("`STORAGE_LIMIT_REACHED`"));
    assert.equal(row.length, 1, file);
    assert.ok(row[0].includes(storage), file);
    assert.match(row[0], /[Dd]on't retry|Do not retry/, file);
  }
  const guides = readdirSync(site, { recursive: true }).filter((file) => /^skills\/(apps|publish|secrets|feed)\/.*\.md$/.test(file));
  assert.ok(guides.includes("skills/apps/QUICKSTART.md") && guides.includes("skills/publish/SKILL.md"));
  for (const file of guides) assert.doesNotMatch(readFileSync(join(site, file), "utf8"), /account\.tinycloud\.xyz\/billing/, file);
});

test("a Markdown guide's URL with .md added redirects to the guide; an html page's .md stays a file beside its HTML", () => {
  const site = join(root, "_site");
  const redirects = readFileSync(join(site, "_redirects"), "utf8").split("\n");
  for (const guide of ["setup", "apps", "secrets", "publish", "chat", "courier"]) {
    assert.ok(redirects.includes(`/${guide}.md /${guide} 301`), `/${guide}.md`);
    assert.equal(existsSync(join(site, `${guide}.md`)), false);
  }
  for (const page of ["connect", "onboarding"]) {
    assert.equal(redirects.some((line) => line.startsWith(`/${page}.md `)), false, page);
    assert.equal(existsSync(join(site, `${page}.md`)), true, page);
    assert.match(readFileSync(join(site, `${page}.html`), "utf8"), /^<!doctype html>/, page);
    assert.equal(existsSync(join(root, "functions", `${page}.js`)), true, page);
  }
});

test("Courier selection resolves saved TC_BIN before approval and preserves process precedence", () => {
  const guide = readFileSync(join(root, "setup/courier.md"), "utf8");
  const probe = block(guide, "## Before approval");
  for (const scenario of ["saved", "process", "old", "private", "unset"]) {
    const dir = home();
    const bin = join(dir, "bin");
    mkdirSync(bin);
    // The agent's own private copy is left to the official CLI installer.
    const saved = scenario === "private" ? join(dir, ".local/share/tinycloud/cli/node_modules/.bin/tinycloud") : join(bin, "saved-cli");
    const override = join(bin, "process-cli");
    mkdirSync(dirname(saved), { recursive: true });
    executable(saved, `case "$*" in --version) echo ${scenario === "old" || scenario === "private" ? "1.5.2" : "1.6.6"} ;; esac`);
    executable(override, 'case "$*" in --version) echo 1.6.6 ;; esac');
    const envFile = join(dir, "owner/agent.env");
    const config = join(dir, ".config/tinycloud");
    mkdirSync(config, { recursive: true, mode: 0o700 });
    const helperPath = join(config, "agent-env.mjs");
    writeFileSync(helperPath, readFileSync(helper), { mode: 0o600 });
    if (scenario !== "unset") {
      assert.equal(shell(`node "${helperPath}" set TC_BIN "${saved}"`, { HOME: dir, TC_AGENT_ENV: envFile }).status, 0);
    }
    const result = shell(`${probe}\nprintf 'RESOLVED=%s\\n' "$TC_BIN"`, {
      HOME: dir,
      TC_AGENT_ENV: envFile,
      ...(scenario === "process" ? { TC_BIN: override } : {}),
      PATH: `${bin}:${process.env.PATH}`,
    });
    if (scenario === "old") {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /COURIER_CLI_VERSION/);
      assert.doesNotMatch(result.stdout, /RESOLVED=/);
    } else {
      assert.equal(result.status, 0, result.stderr);
      const expected = scenario === "process" ? override : scenario === "unset" || scenario === "private" ? "" : saved;
      assert.equal(result.stdout.trim(), `RESOLVED=${expected}`);
    }
  }
});

test("Courier preview resolver preserves an explicitly selected binary and checks its release and features", () => {
  const guide = readFileSync(join(root, "setup/courier.md"), "utf8");
  const probe = block(guide, "## Check the CLI");
  for (const scenario of ["current", "old", "broken", "missing", "not-executable", "no-join"]) {
    const dir = home();
    const selected = join(dir, "operator-cli");
    // The Courier skill is installed, so the block reaches its CLI checks.
    mkdirSync(join(dir, ".agents/skills/courier"), { recursive: true });
    writeFileSync(join(dir, ".agents/skills/courier/SKILL.md"), "");
    const body = `case "$*" in
      --version) ${scenario === "broken" ? "exit 23" : `echo ${scenario === "old" ? "1.5.2" : "1.6.6"}`} ;;
      "courier --help") printf '%s\\n' '  start [--new subject | --session id]' '  invite --session id --mode same-owner|anyone --consent' '  invite serve id' ${scenario === "no-join" ? "" : "'  join link --consent'"} ;;
      *) exit 90 ;;
    esac`;
    if (scenario !== "missing") executable(selected, body);
    if (scenario === "not-executable") chmodSync(selected, 0o600);
    const before = scenario === "missing" ? null : readFileSync(selected);
    const result = shell(`${probe}\nprintf 'COURIER_LINK_ORIGIN=%s\\n' "$COURIER_LINK_ORIGIN"`, { HOME: dir, TC_BIN: selected });
    assert.equal(result.status === 0, scenario === "current", `${scenario}: ${result.stderr}`);
    assert.equal(result.stdout.trim(), scenario === "current" ? "COURIER_LINK_ORIGIN=https://courier.tinycloud.xyz" : "");
    if (before) assert.deepEqual(readFileSync(selected), before);
    else assert.equal(existsSync(selected), false);
    assert.equal(existsSync(join(dir, ".local/share/tinycloud/cli")), false);
    if (scenario !== "current") assert.match(result.stderr, /TC_NOT_FOUND|COURIER_CLI/);
  }
});

// Automatic pickup runs one exact pre-release of the standalone Courier through
// npx's home prefix. The served page is read, so the test exercises the rendered pin.
test("Courier automatic pickup runs the watcher's exact pinned Courier through npx", () => {
  const served = readFileSync(join(root, "_site/courier"), "utf8");
  const start = block(served, "**2. Start the watcher's Courier.**");
  const pin = start.match(/@tinycloud\/courier@(\d+\.\d+\.\d+-[0-9A-Za-z.]+)/)?.[1];
  assert.ok(pin, "the served block names an exact pre-release");
  assert.ok(!served.includes("{{COURIER_WATCH_VERSION}}"), "the token is rendered");
  const installFlag = process.platform === "darwin" ? "--install-launchd" : "--install-systemd";
  const unitPath = (dir) => process.platform === "darwin" ? join(dir, "Library/LaunchAgents/xyz.tinycloud.courier.watch.plist") : join(dir, ".config/systemd/user/courier-watch.service");
  for (const scenario of ["claude", "other-agent", "other-agent-login-absent", "reinstall", "taken"]) {
    const dir = home();
    const tools = join(dir, "tools");
    mkdirSync(tools);
    const calls = join(dir, "npx-calls");
    executable(join(tools, "npx"), `for arg in "$@"; do printf '%s\\n' "$arg"; done > "$CALLS"`);
    const courierHome = join(dir, ".courier");
    if (scenario === "reinstall" || scenario === "taken") {
      mkdirSync(dirname(unitPath(dir)), { recursive: true });
      writeFileSync(unitPath(dir), `COURIER_HOME=${scenario === "taken" ? join(dir, "another-agent/.courier") : courierHome}\n`);
    }
    const agent = scenario.startsWith("other-agent") ? { AGENT_CMD: '/opt/codex/bin/codex exec "$COURIER_PROMPT"' } : {};
    const login = scenario.startsWith("other-agent") ? { HOME_FILE: ".codex/auth.json" } : {};
    if (scenario === "other-agent") {
      mkdirSync(join(dir, ".codex"));
      writeFileSync(join(dir, ".codex/auth.json"), "{}");
    }
    const work = join(dir, "work");
    const result = shell(start, { HOME: dir, PATH: `${tools}:${process.env.PATH}`, WATCH_DIR: work, CALLS: calls, ...agent, ...login });
    const refusal = { taken: /^WATCH_TAKEN /, "other-agent-login-absent": /^WATCH_LOGIN_MISSING \.codex\/auth\.json/ }[scenario];
    if (refusal) {
      assert.notEqual(result.status, 0, scenario);
      assert.match(result.stderr, refusal, scenario);
      assert.equal(existsSync(calls), false, `${scenario}: the watcher is not started`);
      continue;
    }
    assert.equal(result.status, 0, `${scenario}: ${result.stderr}`);
    const expected = scenario.startsWith("other-agent")
      ? ["--prefix", dir, "-y", "-p", `@tinycloud/courier@${pin}`, "courier", "watch", "--wake", "exec", "--unguarded", "--agent-cli", "--exec", agent.AGENT_CMD, "--home-file", login.HOME_FILE, "--cwd", work, installFlag]
      : ["--prefix", dir, "-y", "-p", `@tinycloud/courier@${pin}`, "courier", "watch", "--wake", "claude", "--cwd", work, installFlag];
    assert.deepEqual(readFileSync(calls, "utf8").trimEnd().split("\n"), expected, scenario);
  }
});

// The start check decides whether a non-Claude agent may go on to ask the owner. It must say yes only when the agent,
// started the way the watcher starts it (empty home, the one login file, no inherited environment), really ran the
// check script, and the script could reach the network and write outside the working directory, as answering a
// message does. `node` is faked here so the test needs no network: it stands for "the network answered" or not.
test("Courier automatic pickup's start check passes only an agent that works the way the watcher starts it", () => {
  const guide = readFileSync(join(root, "setup/courier.md"), "utf8");
  const check = block(guide, "check that the watcher can start you.**");
  const run = "sh ./courier-check.sh";
  const agents = {
    works: run,
    "needs-login": `[ -f "$HOME/.codex/auth.json" ] && ${run}`,
    "echoes-prompt": 'printf "%s\\n" "$COURIER_PROMPT"',
    "writes-only-here": "echo ok > courier-ready",
    broken: "echo 'login expired' >&2; exit 1",
    "wants-owner-home": `[ -f "$HOME/owner-only" ] && ${run}`,
    "wants-owner-env": `[ -n "\${OWNER_SECRET-}" ] && ${run}`,
  };
  const cases = [
    ["works", {}, true, true],
    ["works", {}, false, false],
    ["needs-login", { HOME_FILE: ".codex/auth.json" }, true, true],
    ["needs-login", {}, true, false],
    ["works", { HOME_FILE: ".gemini/oauth_creds.json" }, true, false],
    ["echoes-prompt", {}, true, false],
    ["writes-only-here", {}, true, false],
    ["broken", {}, true, false],
    ["wants-owner-home", {}, true, false],
    ["wants-owner-env", {}, true, false],
  ];
  for (const [agent, login, network, ok] of cases) {
    const dir = home();
    mkdirSync(join(dir, ".codex"));
    writeFileSync(join(dir, ".codex/auth.json"), "{}");
    writeFileSync(join(dir, "owner-only"), "");
    mkdirSync(join(dir, "bin"));
    executable(join(dir, "bin/node"), `exit ${network ? 0 : 1}`);
    const bin = join(dir, "agent");
    executable(bin, agents[agent]);
    const result = shell(check, { HOME: dir, PATH: `${join(dir, "bin")}:${process.env.PATH}`, OWNER_SECRET: "s3cret", AGENT_CMD: `${bin} "$COURIER_PROMPT"`, ...login });
    const label = `${agent} ${JSON.stringify(login)} network=${network}`;
    assert.equal(result.stdout.split("\n")[0], ok ? "AGENT_OK" : "AGENT_FAILED", `${label}: ${result.stderr}`);
    if (agent === "broken") assert.match(result.stdout, /login expired/, "the agent's last lines are shown");
    assert.doesNotMatch(result.stdout, /s3cret/, label);
  }
});

test("Courier preview offers exactly same-owner and anyone and never executes another mode", () => {
  const guide = readFileSync(join(root, "setup/courier.md"), "utf8");
  const invite = block(guide, "## Choose how to invite");
  for (const mode of ["same-owner", "anyone", "named", "email", ""]) {
    const dir = home();
    const selected = join(dir, "tc");
    const calls = join(dir, "calls");
    executable(selected, `printf '%s\\n' "$@" > "$CALLS"`);
    const result = shell(invite, { HOME: dir, TC: selected, MODE: mode, SESSION_ID: "01M62GPP936EPBR37DK93RWS1H", CALLS: calls });
    const allowed = mode === "same-owner" || mode === "anyone";
    assert.equal(result.status === 0, allowed, result.stderr);
    if (allowed) assert.deepEqual(readFileSync(calls, "utf8").trimEnd().split("\n"),
      ["courier", "invite", "--session", "01M62GPP936EPBR37DK93RWS1H", "--mode", mode, "--consent", "--wait", "1"]);
    else assert.equal(existsSync(calls), false);
  }
});

// Invitation steps retain their behavior without prescribing when the agent's turn ends or resumes.
test("Courier invite returns its link and invitation steps do not prescribe turn timing", () => {
  const guide = readFileSync(join(root, "setup/courier.md"), "utf8");
  const section = (heading) => guide.split(`\n## ${heading}\n`)[1]?.split("\n## ")[0] ?? "";
  const shellBlocks = (text) => [...text.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((match) => match[1]);
  const NO_FILTER = "Run it exactly as written; don't pipe it through `tail`, `head` or a filter; read the whole output.";
  const incoming = section("Incoming invitation takes priority");
  assert.equal(shellBlocks(incoming).length, 1);
  assert.ok(shellBlocks(incoming)[0].includes('{ { "$TC" courier join "$INVITATION_URL" --consent --wait 60; echo "$?" > "$ERR.rc"; }'));
  assert.ok(incoming.includes(`${NO_FILTER} The CLI's own output shows in full; then the block prints one last line. Do what a \`NEXT:\` line says. It waits at most a minute for the issuer`));
  assert.ok(incoming.includes("If it exits 1 with `[invite-pending]` on stderr, the issuer hasn't finished pairing yet and your claim is kept: without asking the owner, run the same block again, at most 10 times in a row"));
  const invite = section("Choose how to invite");
  assert.ok(shellBlocks(invite).at(-1).includes('\n{ { "$TC" courier invite --session "$SESSION_ID" --mode "$MODE" --consent --wait 1; echo "$?" > "$OUT.rc"; }'));
  assert.ok(invite.includes(`${NO_FILTER} With \`--wait 1\` it returns within seconds: its first JSON line has \`status: invitation\`, and it then exits 1 with \`[invite-pending]\` on stderr. That first \`[invite-pending]\` is expected: the invitation is kept. Give the owner its \`link\``));
  assert.ok(invite.includes("Only after that message is sent, run the serve block below."));
  const serving = section("Keep the issuer serving");
  assert.equal(shellBlocks(serving).length, 1);
  assert.ok(shellBlocks(serving)[0].includes('{ { "$TC" courier invite serve "$INVITATION_ID" --wait 60; echo "$?" > "$ERR.rc"; }'));
  assert.ok(serving.includes(NO_FILTER));
  assert.ok(serving.includes("First send the owner the invitation link: serving before the link has been sent is useless, because nobody can join a link they don't have. Only then serve the **same** invitation"));
  assert.ok(serving.includes("- **Exit 1, `[invite-pending]` on stderr** (\"No claim received\"): the recipient hasn't joined yet; the same invitation and any claim are kept. Without asking the owner, run the `invite serve` block again. This is the normal wait, not a failure. Repeat until it prints `paired`, at most 10 `invite serve` runs in a row (about 10 minutes); the `invite` call's own `[invite-pending]` doesn't count."));
  assert.ok(serving.includes("- **Exit 1, `[invite-expired]`:**"));
  assert.doesNotMatch([incoming, invite, serving].join("\n"), /\b(?:same turn|do not end your turn|end your turn)\b/i);
  assert.doesNotMatch(guide, /Keep that process running/);
  for (const line of shellBlocks(guide).join("\n").split("\n").filter((text) => /courier (?:invite|join)\b/.test(text))) {
    assert.match(line, /courier invite --session/.test(line) ? / --wait 1; echo "\$\?" > "\$OUT\.rc"; \} 2>&1 1>&3 \| tee "\$OUT\.err" >&2; \} 3>&1 \| tee "\$OUT"$/ : / --wait 60; echo "\$\?" > "\$ERR\.rc"; \} 2>&1 1>&3 \| tee "\$ERR" >&2; \} 3>&1$/, line);
  }
  const start = readFileSync(join(root, "_site/skills/courier/start.md"), "utf8");
  assert.ok(start.includes(`"$TC" courier join '<exact link>' --consent --wait 60 `));
  assert.ok(start.includes(`"$TC" courier invite --session <id> --mode same-owner|anyone --consent --wait 1: it returns within seconds with the handoff link and then exits 1 with [invite-pending], which is expected`));
  assert.ok(start.includes(`Give me its exact handoff link at once. Then, without asking me, keep the issuer serving that same invitation with "$TC" courier invite serve <invitationId> --wait 60`));
  const invitationText = start.split("\n\n").filter((paragraph) => /Courier invitation link|Offer exactly two invitation choices/.test(paragraph)).join("\n");
  assert.doesNotMatch(invitationText, /\b(?:same turn|do not end your turn|end your turn)\b/i);
  assert.ok(start.includes("at most 10 serve runs in a row; the invite call's own [invite-pending] doesn't count."));
  assert.doesNotMatch(start, /--wait 300/);
});

// invite serve and join print what to do next after the CLI's full output: stderr is copied for the
// [invite-pending] check and still shown; stdout passes through; the block exits with the CLI's code.
test("Courier invite serve and join blocks print a NEXT line on paired/joined and on [invite-pending], else *_EXIT", () => {
  const guide = readFileSync(join(root, "setup/courier.md"), "utf8");
  for (const [heading, done, waiting, other] of [
    ["## Keep the issuer serving", "NEXT: paired; continue.", "NEXT: no one has joined yet; run this block again to continue serving the invitation.", "INVITE_EXIT"],
    ["## Incoming invitation takes priority", "NEXT: joined; continue.", "NEXT: the issuer has not finished pairing yet; run this block again to continue joining.", "JOIN_EXIT"],
  ]) {
    const script = block(guide, heading);
    for (const [exit, stdout, stderr, last] of [
      [0, '{"status":"paired"}\n', "", done],
      [1, "", "tinycloud courier: [invite-pending] No claim received.\n", waiting],
      [1, "", "tinycloud courier: [invite-expired] Invitation expired.\n", `${other} 1`],
      [2, "", "courier invite serve <invitationId>\n", `${other} 2`],
    ]) {
      const dir = home();
      executable(join(dir, "tc"), `printf '%s' "$FAKE_STDOUT"\nprintf '%s' "$FAKE_STDERR" >&2\nexit "$FAKE_EXIT"`);
      const result = shell(script, { HOME: dir, TC: join(dir, "tc"), INVITATION_ID: "01M62GPP936EPBR37DK93RWS1H", INVITATION_URL: "https://courier.tinycloud.xyz/c/x#k", FAKE_EXIT: String(exit), FAKE_STDOUT: stdout, FAKE_STDERR: stderr });
      assert.equal(result.status, exit, `${heading} ${exit}: ${result.stderr}`);
      assert.equal(result.stderr, stderr, heading);
      assert.equal(result.stdout, `${stdout}${last}\n`, heading);
    }
  }
});

// The first `invite --wait 1` call: its expected [invite-pending] comes with the link on stdout, so the block
// prints the invitation ID and a NEXT line to send that link and start serving; stdout and stderr show unchanged.
test("Courier invite block prints INVITATION_ID and a send-the-link NEXT line on its expected [invite-pending]", () => {
  const script = block(readFileSync(join(root, "setup/courier.md"), "utf8"), "## Choose how to invite");
  const link = "https://courier.tinycloud.xyz/c/01M62GPP936EPBR37DK93RWS1J#k=abc&v=1";
  const invitation = `{"status":"invitation","invitationId":"01M62GPP936EPBR37DK93RWS1J","sessionId":"01M62GPP936EPBR37DK93RWS1H","mode":"anyone","link":"${link}","expiresAt":"2026-11-03T00:00:00.000Z"}\n`;
  const pending = "tinycloud courier: [invite-pending] No claim received. Resume with courier invite serve 01M62GPP936EPBR37DK93RWS1J; the same invitation and winner reservation are preserved.\n";
  for (const [exit, stdout, stderr, last] of [
    [1, invitation, pending, `INVITATION_ID=01M62GPP936EPBR37DK93RWS1J\nNEXT: before anything else, send the owner this invitation link, on its own line: ${link} Only after that message is sent, run the serve block below.`],
    [0, `${invitation}{"status":"paired","invitationId":"01M62GPP936EPBR37DK93RWS1J"}\n`, "", "NEXT: paired; continue."],
    [1, "", "tinycloud courier: [invite-pending] No claim received.\n", "INVITE_EXIT 1"],
    [1, invitation, "tinycloud courier: [conflict] Something else.\n", "INVITE_EXIT 1"],
    [2, "", "Choose exactly one invitation mode: same-owner, anyone, named.\n", "INVITE_EXIT 2"],
  ]) {
    const dir = home();
    executable(join(dir, "tc"), `printf '%s' "$FAKE_STDOUT"\nprintf '%s' "$FAKE_STDERR" >&2\nexit "$FAKE_EXIT"`);
    const result = shell(script, { HOME: dir, TC: join(dir, "tc"), MODE: "anyone", SESSION_ID: "01M62GPP936EPBR37DK93RWS1H", FAKE_EXIT: String(exit), FAKE_STDOUT: stdout, FAKE_STDERR: stderr });
    assert.equal(result.status, exit, result.stderr);
    assert.equal(result.stderr, stderr);
    assert.equal(result.stdout, `${stdout}${last}\n`);
  }
});

// The codes and exit the guide relies on, in the pinned CLI's Courier bundle: an unclaimed wait throws
// [invite-pending] (the invitation is kept), a past expiresAt throws [invite-expired], and both exit 1.
test("the pinned CLI's Courier ends an unclaimed invite wait with exit 1 [invite-pending], and --wait is 1–604800 s", () => {
  const bundle = readFileSync(join(root, "node_modules/@tinycloud/cli/dist/courier-entry.js"), "utf8");
  assert.ok(bundle.includes('throw new CourierError("invite-pending", `No claim received. Resume with courier invite serve ${body.id}; the same invitation and winner reservation are preserved.`);'));
  assert.ok(bundle.includes('throw new CourierError("invite-expired", "Invitation expired; no session was created or substituted.");'));
  assert.ok(bundle.includes('throw new CourierError("invite-pending", "Issuer has not completed pairing yet. Ask them to resume invite serve, then join the same link; no different session was created.");'));
  assert.ok(bundle.includes('if (!Number.isInteger(value2) || value2 < 1 || value2 > 604800)'));
  assert.match(bundle, /console\.error\(`\$\{programName\(\)\}: \$\{info\.code \? `\[\$\{info\.code\}\] ` : ""\}\$\{info\.message\}`\);\n\s*return 1;/);
});


// The served Courier setup: request, wait, then the fallback code import and its separate read.
const COURIER_SURFACES = ["setup/courier.md", "_site/skills/courier/SKILL.md", "_site/skills/courier/start.md"];
const courierSetup = (surface) => {
  const text = readFileSync(join(root, surface), "utf8");
  const section = text.split("\n## Set up Courier once\n")[1]?.split("\n## ")[0];
  assert.ok(section, `${surface}: missing executable remote setup`);
  const blocks = [...section.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((match) => match[1]);
  const [request, wait, redeem] = blocks;
  return { request, wait, redeem };
};
// Step 1 prints only the link, on one line, so the agent can copy it without retyping; the full request stays in a private file.
const requested = (issued, courierHome, surface) => {
  assert.ifError(issued.error);
  assert.equal(issued.status, 0, issued.stderr);
  const approval = JSON.parse(readFileSync(join(courierHome, "request.json"), "utf8"));
  assert.equal(statSync(join(courierHome, "request.json")).mode & 0o777, 0o600);
  assert.equal(issued.stdout, `${approval.openkeyUrl}\n`, `${surface}: step 1 must print only the approval link`);
  return approval;
};
// The real-CLI tests run the pinned CLI; COURIER_TEST_TC points them at a candidate build before a pin bump.
const COURIER_CLI = process.env.COURIER_TEST_TC || join(root, "node_modules/.bin/tinycloud");
// js-sdk #821 (TC-2300) adds `courier init --wait`; the pinned 1.6.6 has it. A COURIER_TEST_TC without it skips the real-CLI test.
const COURIER_SHORT_LINK = spawnSync(COURIER_CLI, ["courier", "--help"], { encoding: "utf8" }).stdout?.includes("init [--request | --wait") ?? false;
const OPENKEY = "https://openkey.example.invalid";
const LINKS_API = "https://links.example.invalid";
// A sandbox for the real CLI: no network except stubs for an expired short code, the links API's create call and
// OpenKey's "not approved yet" poll. Every other connection attempt is logged in `forbidden` and fails.
const courierSandbox = () => {
  const dir = home();
  const courierHome = join(dir, "courier");
  const cliHome = join(dir, "cli");
  mkdirSync(cliHome, { mode: 0o700 });
  writeFileSync(join(cliHome, "sentinel"), "existing CLI context\n");
  const requests = join(dir, "requests.jsonl");
  const polls = join(dir, "polls.jsonl");
  const forbidden = join(dir, "forbidden.jsonl");
  const fence = join(dir, "network-fence.cjs");
  writeFileSync(fence, `
    const fs = require("node:fs");
    const { randomBytes } = require("node:crypto");
    const { syncBuiltinESMExports } = require("node:module");
    const deny = (operation) => () => {
      fs.appendFileSync(${JSON.stringify(forbidden)}, operation + "\\n");
      throw Error("COURIER_TEST_NETWORK_DENIED");
    };
    globalThis.fetch = async (input, options = {}) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = options.method || "GET";
      if (url === ${JSON.stringify(`${LINKS_API}/v1/links`)} && method === "POST") {
        const id = Array.from(randomBytes(26), (byte) => "abcdefghijklmnopqrstuvwxyz234567"[byte % 32]).join("");
        return Response.json({ id, expiresAt: JSON.parse(options.body).header.expiresAt }, { status: 201 });
      }
      const poll = ${JSON.stringify(`${OPENKEY}/api/approval-requests/`)};
      if (url.startsWith(poll) && /^[a-z2-7]{26}\\/result$/.test(url.slice(poll.length)) && method === "POST") {
        fs.appendFileSync(${JSON.stringify(polls)}, JSON.stringify({ url }) + "\\n");
        return new Response(null, { status: 202 });
      }
      if (url !== ${JSON.stringify(`${OPENKEY}/api/delegation-codes/abcd-efgh`)}) return deny("fetch " + url)();
      fs.appendFileSync(${JSON.stringify(requests)}, JSON.stringify({ url, method, redirect: options.redirect }) + "\\n");
      return new Response("{}", { status: 404 });
    };
    for (const name of ["http", "https"]) {
      const module = require("node:" + name);
      for (const operation of ["get", "request", "createServer"]) module[operation] = deny(name + "." + operation);
    }
    for (const [name, operations] of [["net", ["connect", "createConnection", "createServer"]], ["tls", ["connect"]], ["dns", ["lookup"]]]) {
      const module = require("node:" + name);
      for (const operation of operations) module[operation] = deny(name + "." + operation);
    }
    syncBuiltinESMExports();
  `);
  const env = {
    PATH: process.env.PATH, HOME: dir, TC_HOME: cliHome, TC_PROFILE: "existing-owner",
    COURIER_HOME: courierHome, COURIER_TEST: "1", COURIER_TEST_HOME: dir,
    COURIER_HOST: "https://node.example.invalid", COURIER_OPENKEY_HOST: OPENKEY, COURIER_OPENKEY_API_HOST: OPENKEY,
    TC_LINKS_API_ORIGIN: LINKS_API, TC: COURIER_CLI, NODE_OPTIONS: `--require=${fence}`, FORCE_COLOR: "0",
  };
  const run = (script, code) => spawnSync("sh", ["-c", script], {
    env: { ...env, ...(code === undefined ? {} : { COURIER_CODE: code }) },
    encoding: "utf8", timeout: 15000,
  });
  const untouched = () => {
    assert.equal(existsSync(forbidden), false, existsSync(forbidden) ? readFileSync(forbidden, "utf8") : "");
    assert.deepEqual(readdirSync(cliHome), ["sentinel"]);
    assert.equal(readFileSync(join(cliHome, "sentinel"), "utf8"), "existing CLI context\n");
  };
  return { courierHome, requests, polls, run, untouched };
};

for (const surface of COURIER_SURFACES) {

  test(`Courier fallback imports a non-TTY code in the background with the real CLI: ${surface}`, () => {
    const { request, redeem } = courierSetup(surface);
    const { courierHome, requests, run, untouched } = courierSandbox();
    const approval = requested(run(request), courierHome, surface);
    const url = new URL(approval.openkeyUrl);
    assert.equal(url.origin, OPENKEY);
    assert.equal(url.searchParams.has("callback"), false);
    assert.equal("d" in approval.publicJwk, false);
    assert.equal(JSON.parse(readFileSync(join(courierHome, "profile.json"), "utf8")).courierDid, approval.courierDid);
    const keyDigest = () => createHash("sha256").update(readFileSync(join(courierHome, "key.json"))).digest("hex");
    const originalKey = keyDigest();
    // The import must return to the agent at once and finish in the background, with its result in files
    // private to the owner, so a tool time limit can never kill it after the one-time code is spent.
    const importResult = (code) => {
      const rcPath = join(courierHome, "import.rc");
      const started = Date.now();
      const result = run(redeem, code);
      assert.ifError(result.error);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout, "IMPORT_STARTED\n", `${surface}: the import step must start the import and return`);
      assert.ok(Date.now() - started < 1500, `${surface}: the import step waited for the import`);
      const deadline = Date.now() + 15000;
      while (readFileSync(rcPath, "utf8") === "") {
        assert.ok(Date.now() < deadline, `${surface}: the background import never wrote import.rc`);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
      for (const name of ["import.rc", "import.out", "import.err"]) assert.equal(statSync(join(courierHome, name)).mode & 0o777, 0o600);
      assert.equal(readFileSync(join(courierHome, "import.out"), "utf8"), "");
      return { status: Number(readFileSync(rcPath, "utf8")), err: readFileSync(join(courierHome, "import.err"), "utf8") };
    };
    const malformed = importResult("not-a-grant");
    assert.equal(malformed.status, 1, malformed.err);
    assert.match(malformed.err, /^tinycloud courier: \[bad-grant\]/m);
    assert.equal(existsSync(requests), false);
    const expired = importResult("ABCD-EFGH");
    assert.equal(expired.status, 1, expired.err);
    assert.match(expired.err, /^tinycloud courier: \[code-not-found\]/m);
    assert.deepEqual(readFileSync(requests, "utf8").trim().split("\n").map((line) => JSON.parse(line)), [{
      url: `${OPENKEY}/api/delegation-codes/abcd-efgh`, method: "GET", redirect: "error",
    }]);
    assert.equal(keyDigest(), originalKey);
    assert.equal(existsSync(join(courierHome, "grant.json")), false);
    untouched();
  });

  // Needs a CLI with js-sdk #821. Re-run after the CLI/Courier pin bump; until then node:test reports it as skipped.
  test(`Courier setup requests a short link and the real CLI's wait exits 8 with it: ${surface}`, {
    skip: COURIER_SHORT_LINK ? false : "needs js-sdk #821's `courier init --wait`; re-run after the CLI/Courier pin bump",
  }, () => {
    const { request, wait } = courierSetup(surface);
    const { courierHome, polls, run, untouched } = courierSandbox();
    const issued = run(request);
    const { openkeyUrl } = requested(issued, courierHome, surface);
    // The CLI's stderr note shows the same link alone on one line.
    assert.ok(issued.stderr.split("\n").includes(openkeyUrl), issued.stderr);
    assert.match(openkeyUrl, /^https:\/\/openkey\.example\.invalid\/a\/[a-z2-7]{26}#v=4&/);
    assert.equal(statSync(join(courierHome, "approval-pending.json")).mode & 0o777, 0o600);
    // Asking again while the request is open returns the same link.
    assert.equal(requested(run(request), courierHome, surface).openkeyUrl, openkeyUrl);
    // The guide's 60 s wait, shortened so the test is quick; the owner never approves.
    assert.equal(wait.split("--timeout 60s").length, 2);
    const started = Date.now();
    const waited = run(wait.replace("--timeout 60s", "--timeout 2s"));
    assert.ifError(waited.error);
    assert.equal(waited.status, 8, waited.stderr);
    assert.ok(Date.now() - started < 10000);
    const lines = waited.stdout.trimEnd().split("\n");
    const { pending } = JSON.parse(lines.slice(0, -1).join("\n"));
    assert.deepEqual({ ...pending, expiresAt: typeof pending.expiresAt }, { step: 1, of: 1, approvalUrl: openkeyUrl, expiresAt: "string" });
    const id = new URL(openkeyUrl).pathname.split("/").pop();
    const polled = readFileSync(polls, "utf8").trim().split("\n").map((line) => JSON.parse(line).url);
    assert.ok(polled.length > 0);
    assert.deepEqual([...new Set(polled)], [`${OPENKEY}/api/approval-requests/${id}/result`]);
    assert.equal(existsSync(join(courierHome, "grant.json")), false);
    untouched();
  });
}
test("Courier guide links to production skill pages present in the built site", () => {
  const guide = readFileSync(join(root, "setup/courier.md"), "utf8");
  const links = [...guide.matchAll(/\[[^\]]+\]\((https:\/\/[^)]+\/skills\/courier\/(?:SKILL|start)\.md)\)/g)]
    .map((match) => match[1]);
  assert.deepEqual(links, [
    "https://agents.tinycloud.xyz/skills/courier/SKILL.md",
    "https://agents.tinycloud.xyz/skills/courier/start.md",
  ]);
  for (const link of links) {
    assert.ok(existsSync(join(root, "_site", new URL(link).pathname.slice(1))));
  }
});
test("Courier skill instructions retain the production invitation viewer origin", () => {
  for (const surface of ["SKILL.md", "start.md"]) {
    const text = readFileSync(join(root, `_site/skills/courier/${surface}`), "utf8");
    assert.match(text, /COURIER_LINK_ORIGIN=https:\/\/courier\.tinycloud\.xyz/);
    assert.doesNotMatch(text, /COURIER_LINK_ORIGIN=https:\/\/preview-tc1544-step1\.courier-ae3\.pages\.dev/);
  }
});

