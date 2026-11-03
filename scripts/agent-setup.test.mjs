import assert from "node:assert/strict";
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
const helperInstall = () => {
  const guide = readFileSync(join(root, "setup/agent.md"), "utf8");
  const digest = createHash("sha256").update(readFileSync(helper)).digest("hex");
  const pinned = guide.match(/[a-f0-9]{64}/)?.[0];
  assert.ok(pinned);
  return block(guide, "### 2. Non-secret owner defaults")
    .replaceAll("https://agents.tinycloud.xyz/agent-env.mjs", `data:application/javascript;base64,${readFileSync(helper).toString("base64")}`)
    .replaceAll(pinned, digest);
};
after(() => { for (const dir of homes) rmSync(dir, { recursive: true, force: true }); });

test("published helper install does not follow a predictable download symlink", () => {
  const dir = home();
  const config = join(dir, ".config/tinycloud");
  mkdirSync(config, { recursive: true, mode: 0o700 });
  const sentinel = join(dir, "sentinel");
  writeFileSync(sentinel, "unrelated\n");
  symlinkSync(sentinel, join(config, "agent-env.mjs.download"));
  const result = shell(helperInstall(), { HOME: dir });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(sentinel, "utf8"), "unrelated\n");
  assert.equal(statSync(join(config, "agent-env.mjs")).isFile(), true);
  assert.equal(statSync(join(config, "agent-env.mjs")).mode & 0o777, 0o600);
});

test("temporary helper directory is 0700 while the download is in flight", () => {
  const dir = home();
  const marker = join(dir, "temp-mode");
  const hook = join(dir, "temp-mode.cjs");
  writeFileSync(hook, `
    const fs = require("node:fs");
    const { syncBuiltinESMExports } = require("node:module");
    const original = fs.mkdtempSync;
    fs.mkdtempSync = (prefix, options) => {
      const temp = original(prefix, options);
      if (prefix === ".agent-env.") {
        const stat = fs.statSync(temp);
        fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({
          directory: stat.isDirectory(), mode: stat.mode & 0o777,
        }));
      }
      return temp;
    };
    syncBuiltinESMExports();
  `);
  const result = shell(helperInstall(), { HOME: dir, NODE_OPTIONS: `--require=${hook}` });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(marker, "utf8")), { directory: true, mode: 0o700 });
  noDownloadResidue(join(dir, ".config/tinycloud"));
});

test("published helper install refuses a linked directory or installed helper", () => {
  const dir = home();
  const target = join(dir, "other");
  mkdirSync(target, { mode: 0o755 });
  const config = join(dir, ".config");
  mkdirSync(config, { mode: 0o700 });
  symlinkSync(target, join(config, "tinycloud"));
  const linkedDir = shell(helperInstall(), { HOME: dir });
  assert.notEqual(linkedDir.status, 0);
  assert.equal(statSync(target).mode & 0o777, 0o755);
  assert.equal(existsSync(join(target, "agent-env.mjs")), false);
  rmSync(join(config, "tinycloud"));
  mkdirSync(join(config, "tinycloud"), { mode: 0o700 });
  const sentinel = join(dir, "sentinel");
  writeFileSync(sentinel, "unrelated\n");
  symlinkSync(sentinel, join(config, "tinycloud/agent-env.mjs"));
  const linkedFile = shell(helperInstall(), { HOME: dir });
  assert.notEqual(linkedFile.status, 0);
  assert.equal(readFileSync(sentinel, "utf8"), "unrelated\n");
});

test("checksum failure leaves no helper or temporary download", () => {
  const dir = home();
  const config = join(dir, ".config/tinycloud");
  const invalid = helperInstall().replace(
    `data:application/javascript;base64,${readFileSync(helper).toString("base64")}`,
    "data:text/plain;base64,d3Jvbmc=",
  );
  const result = shell(invalid, { HOME: dir });
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(join(config, "agent-env.mjs")), false);
  noDownloadResidue(config);
});

const noDownloadResidue = (config) => {
  assert.deepEqual(readdirSync(config).filter((name) => name.startsWith(".agent-env.")), []);
};

for (const scenario of ["parent-link", "destination-link", "moved-temp-parent", "failed-moved-parent"]) {
  test(`relative rename handles ${scenario} at activation`, () => {
    const dir = home();
    const config = join(dir, ".config");
    const destination = join(config, "tinycloud");
    const target = join(dir, "unrelated");
    mkdirSync(destination, { recursive: true, mode: 0o700 });
    mkdirSync(target, { mode: 0o700 });
    const marker = join(dir, "late-rename-fired");
    const hook = join(dir, "late-rename.cjs");
    writeFileSync(hook, `
      const fs = require("node:fs");
      const { syncBuiltinESMExports } = require("node:module");
      const original = fs.renameSync;
      let fired = false;
      fs.renameSync = (from, to) => {
        if (!fired && to === "../agent-env.mjs") {
          fired = true;
          fs.writeFileSync(${JSON.stringify(marker)}, "fired");
          ${scenario === "parent-link"
            ? `original(${JSON.stringify(destination)}, ${JSON.stringify(join(dir, "moved"))}); fs.symlinkSync(${JSON.stringify(target)}, ${JSON.stringify(destination)});`
            : scenario === "destination-link"
              ? `fs.symlinkSync(${JSON.stringify(target)}, ${JSON.stringify(join(destination, "agent-env.mjs"))});`
              : `original(${JSON.stringify(config)}, ${JSON.stringify(join(dir, "moved-config"))}); fs.mkdirSync(${JSON.stringify(destination)}, {recursive: true, mode: 0o700}); ${scenario === "failed-moved-parent" ? 'throw Error("injected rename failure");' : ""}`}
        }
        return original(from, to);
      };
      syncBuiltinESMExports();
    `);
    const result = shell(helperInstall(), { HOME: dir, NODE_OPTIONS: `--require=${hook}` });
    assert.equal(existsSync(marker), true, "activation hook was not exercised");
    if (scenario === "destination-link") {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(statSync(join(destination, "agent-env.mjs")).isFile(), true);
    } else assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(target, "agent-env.mjs")), false);
    assert.equal(existsSync(join(target, "helper")), false);
    if (scenario === "parent-link") {
      assert.equal(existsSync(join(dir, "moved/agent-env.mjs")), false);
      noDownloadResidue(join(dir, "moved"));
    } else if (scenario === "moved-temp-parent" || scenario === "failed-moved-parent") noDownloadResidue(join(dir, "moved-config/tinycloud"));
    else noDownloadResidue(destination);
  });
}

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
  assert.match(result.stdout, /^TC_OLDER 1\.5\.0 \S+custom-cli is older than the pinned 1\.6\.2; keeping this operator-selected CLI$/m);
  assert.deepEqual(readFileSync(conflicting), original);
  assert.equal(existsSync(join(dir, ".local/share/tinycloud/cli")), false);
});


before(() => {
  const built = spawnSync(process.execPath, [join(root, "scripts/build-site.mjs")], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
});
// The CLI skill has no lookup since 1.5.0 (its examples run `tinycloud` from the PATH); courier still does.
test("courier skill selects the persisted custom CLI in a fresh shell", () => {
  const dir = home();
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const selected = join(bin, "selected-cli");
  executable(selected, 'case "$*" in "--version") echo 1.2.3 ;; "courier --help") echo COURIER_SELECTED_1.2.3 ;; esac');
  executable(join(bin, "tc"), 'echo GLOBAL_1.2.1');
  const selectedEnv = join(dir, "owner/agent.env");
  const persisted = shell(helperInstall(), { HOME: dir, TC_BIN: selected, TC_AGENT_ENV: selectedEnv, PATH: `${bin}:${process.env.PATH}` });
  assert.equal(persisted.status, 0, persisted.stderr);
  const skill = readFileSync(join(root, "_site/skills/courier/SKILL.md"), "utf8");
  const result = shell(block(skill, "## Run Courier", "bash"), {
    HOME: dir, TC_AGENT_ENV: selectedEnv, PATH: `${bin}:${process.env.PATH}`,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /COURIER_SELECTED_1\.2\.3/);
  assert.doesNotMatch(result.stdout, /GLOBAL_1\.2\.1/);
  const override = join(bin, "override-cli");
  executable(override, 'case "$*" in "--version") echo OVERRIDE_1.2.4 ;; "courier --help") echo COURIER_OVERRIDE_1.2.4 ;; esac');
  const overridden = shell(block(skill, "## Run Courier", "bash"), {
    HOME: dir, TC_AGENT_ENV: selectedEnv, TC_BIN: override, PATH: `${bin}:${process.env.PATH}`,
  });
  assert.equal(overridden.status, 0, overridden.stderr);
  assert.match(overridden.stdout, /COURIER_OVERRIDE_1\.2\.4/);
  symlinkSync(join(dir, "owner"), join(dir, "linked-owner"));
  const linked = shell(block(skill, "## Run Courier", "bash"), {
    HOME: dir, TC_AGENT_ENV: join(dir, "linked-owner/agent.env"), PATH: `${bin}:${process.env.PATH}`,
  });
  assert.notEqual(linked.status, 0);
  assert.doesNotMatch(linked.stdout, /GLOBAL_1\.2\.1/);
  const overriddenLinked = shell(block(skill, "## Run Courier", "bash"), {
    HOME: dir, TC_AGENT_ENV: join(dir, "linked-owner/agent.env"), TC_BIN: override,
    PATH: `${bin}:${process.env.PATH}`,
  });
  assert.equal(overriddenLinked.status, 0, overriddenLinked.stderr);
  assert.match(overriddenLinked.stdout, /COURIER_OVERRIDE_1\.2\.4/);
  assert.doesNotMatch(overriddenLinked.stdout, /GLOBAL_1\.2\.1/);
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

test("/connect sends an agent that can run the CLI to /onboarding and gives each MCP app its own steps", () => {
  const site = join(root, "_site");
  const markdown = readFileSync(join(site, "connect.md"), "utf8");
  const html = readFileSync(join(site, "connect.html"), "utf8");
  const coding = markdown.split("\n## Agents that can run the CLI (preferred)\n")[1].split("\n## ChatGPT\n")[0];
  assert.ok(coding.includes("Any agent that can install and run the TinyCloud CLI"));
  for (const guide of ["onboarding", "apps", "secrets", "publish", "chat", "courier", "setup"]) {
    assert.ok(coding.includes(`](https://agents.tinycloud.xyz/${guide})`), `Markdown routes to /${guide}`);
    assert.ok(html.includes(`href="https://agents.tinycloud.xyz/${guide}"`), `HTML routes to /${guide}`);
  }
  for (const [app, id] of [["Grok", "grok"], ["Grok Bot", "grok-bot"], ["Perplexity", "perplexity"], ["Gemini", "gemini"], ["Meta Muse", "meta-muse"]]) {
    const section = markdown.split(`\n## ${app}\n`)[1]?.split("\n## ")[0];
    assert.ok(section, `${app} section`);
    assert.match(section, /`https:\/\/mcp\.tinycloud\.xyz\/mcp`/);
    assert.match(section, /OAuth/);
    assert.match(section, /\(#approve-access-and-continue\)/);
    assert.match(html, new RegExp(`<h2 id="${id}">`));
  }
});

test("tc-apps sends an agent with no onboarded profile through /onboarding before any scoped sign-in", () => {
  const site = join(root, "_site");
  const onboarding = "https://agents.tinycloud.xyz/onboarding";
  const catalog = readFileSync(join(site, "skills/apps/TINY-APPS.md"), "utf8");
  for (const file of ["apps", "skills/apps/SKILL.md", "skills/apps/TINY-APPS.md"]) {
    const rules = readFileSync(join(site, file), "utf8").split("\n").filter((line) => line.includes("`onboard-first`") && line.includes(onboarding));
    assert.equal(rules.length, 1, file);
    assert.match(rules[0], /original request/, file);
    assert.match(rules[0], /rerun/, file);
    assert.match(rules[0], /cannot run onboarding/, file);
  }
  const scoped = catalog.split("\n### Scoped setup without onboarding\n")[1].trim().split("\n")[0];
  assert.match(scoped, /only after `use-scoped-catalog-flow`, or after `onboard-first` when you cannot run onboarding/);
});

test("a full storage sends the owner to the storage page from /connect, tc-apps and tc-publish", () => {
  const site = join(root, "_site");
  const storage = "https://account.tinycloud.xyz/storage";
  const lines = (file) => readFileSync(join(site, file), "utf8").split("\n");
  const approve = readFileSync(join(site, "connect.md"), "utf8").split("\n## Approve access and continue\n")[1].split("\n### ")[0];
  const errors = (file) => lines(file).slice(lines(file).indexOf("## 8. Errors"));
  for (const [file, rows] of [
    ["connect.md", approve.split("\n")],
    ["skills/apps/SKILL.md", errors("skills/apps/SKILL.md")],
    ["skills/apps/LEGACY.md", errors("skills/apps/LEGACY.md")],
    ["skills/publish/SKILL.md", lines("skills/publish/SKILL.md")],
  ]) {
    const row = rows.filter((line) => line.includes("`STORAGE_QUOTA_EXCEEDED`") && line.includes("`STORAGE_LIMIT_REACHED`"));
    assert.equal(row.length, 1, file);
    assert.ok(row[0].includes(storage), file);
    assert.match(row[0], /[Dd]on't retry|Do not retry/, file);
  }
  const guides = readdirSync(site, { recursive: true }).filter((file) => /^(connect\.md|skills\/(apps|publish|secrets|feed)\/.*\.md)$/.test(file));
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

test("Courier pre-onboarding check resolves saved TC_BIN before onboarding and preserves process precedence", () => {
  const guide = readFileSync(join(root, "setup/courier.md"), "utf8");
  const probe = block(guide, "## Before onboarding");
  for (const scenario of ["saved", "process", "old", "private", "unset"]) {
    const dir = home();
    const bin = join(dir, "bin");
    mkdirSync(bin);
    // The agent's own private copy is left to onboarding's CLI setup, which upgrades it.
    const saved = scenario === "private" ? join(dir, ".local/share/tinycloud/cli/node_modules/.bin/tinycloud") : join(bin, "saved-cli");
    const override = join(bin, "process-cli");
    mkdirSync(dirname(saved), { recursive: true });
    executable(saved, `case "$*" in --version) echo ${scenario === "old" || scenario === "private" ? "1.5.2" : "1.6.2"} ;; esac`);
    executable(override, 'case "$*" in --version) echo 1.6.2 ;; esac');
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
  const probe = block(guide, "## Check the installed CLI");
  for (const scenario of ["current", "old", "broken", "missing", "not-executable", "no-join"]) {
    const dir = home();
    const selected = join(dir, "operator-cli");
    // The Courier skill is installed, so the block reaches its CLI checks.
    mkdirSync(join(dir, ".agents/skills/courier"), { recursive: true });
    writeFileSync(join(dir, ".agents/skills/courier/SKILL.md"), "");
    const body = `case "$*" in
      --version) ${scenario === "broken" ? "exit 23" : `echo ${scenario === "old" ? "1.5.2" : "1.6.2"}`} ;;
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

// Clarissa's #125 cell: `invite` ran with the default `--wait 300`, a 2-minute tool limit killed it, and the agent
// stopped serving to ask the owner. `invite --wait 1` returns the link within seconds (its [invite-pending] is
// expected and not counted); invite serve and join wait at most a minute, and an unclaimed wait (exit 1,
// `[invite-pending]`) is rerun in the same turn without asking, up to 10 times.
test("Courier invite returns the link at once; invite serve and join wait at most 60 s and rerun on [invite-pending] in the same turn", () => {
  const guide = readFileSync(join(root, "setup/courier.md"), "utf8");
  const section = (heading) => guide.split(`\n## ${heading}\n`)[1]?.split("\n## ")[0] ?? "";
  const shellBlocks = (text) => [...text.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((match) => match[1]);
  const NO_FILTER = "Run it exactly as written; don't pipe it through `tail`, `head` or a filter; read the whole output.";
  const incoming = section("Incoming invitation takes priority");
  assert.equal(shellBlocks(incoming).length, 1);
  assert.ok(shellBlocks(incoming)[0].includes('{ { "$TC" courier join "$INVITATION_URL" --consent --wait 60; echo "$?" > "$ERR.rc"; }'));
  assert.ok(incoming.includes(`${NO_FILTER} The CLI's own output shows in full; then the block prints one last line. Do what a \`NEXT:\` line says. It waits at most a minute for the issuer`));
  assert.ok(incoming.includes("If it exits 1 with `[invite-pending]` on stderr, the issuer hasn't finished pairing yet and your claim is kept: in the same turn and without asking the owner, run the same block again, at most 10 times in a row"));
  const invite = section("Choose how to invite");
  assert.ok(shellBlocks(invite).at(-1).includes('\n{ { "$TC" courier invite --session "$SESSION_ID" --mode "$MODE" --consent --wait 1; echo "$?" > "$OUT.rc"; }'));
  assert.ok(invite.includes(`${NO_FILTER} With \`--wait 1\` it returns within seconds: its first JSON line has \`status: invitation\`, and it then exits 1 with \`[invite-pending]\` on stderr. That first \`[invite-pending]\` is expected: the invitation is kept. Give the owner its \`link\` at once`));
  assert.ok(invite.includes("Only after that message is sent, in the same turn, keep the issuer serving as below."));
  const serving = section("Keep the issuer serving");
  assert.equal(shellBlocks(serving).length, 1);
  assert.ok(shellBlocks(serving)[0].includes('{ { "$TC" courier invite serve "$INVITATION_ID" --wait 60; echo "$?" > "$ERR.rc"; }'));
  assert.ok(serving.includes(NO_FILTER));
  assert.ok(serving.includes("First send the owner the invitation link: serving before the link has been sent is useless, because nobody can join a link they don't have. Only then serve the **same** invitation"));
  assert.ok(serving.includes("- **Exit 1, `[invite-pending]` on stderr** (\"No claim received\"): the recipient hasn't joined yet; the same invitation and any claim are kept. In the same turn and without asking the owner, run the `invite serve` block again. This is the normal wait, not a failure. Repeat until it prints `paired`, at most 10 `invite serve` runs in a row (about 10 minutes); the `invite` call's own `[invite-pending]` doesn't count."));
  assert.ok(serving.includes("- **Exit 1, `[invite-expired]`:**"));
  assert.doesNotMatch(guide, /Keep that process running/);
  for (const line of shellBlocks(guide).join("\n").split("\n").filter((text) => /courier (?:invite|join)\b/.test(text))) {
    assert.match(line, /courier invite --session/.test(line) ? / --wait 1; echo "\$\?" > "\$OUT\.rc"; \} 2>&1 1>&3 \| tee "\$OUT\.err" >&2; \} 3>&1 \| tee "\$OUT"$/ : / --wait 60; echo "\$\?" > "\$ERR\.rc"; \} 2>&1 1>&3 \| tee "\$ERR" >&2; \} 3>&1$/, line);
  }
  const start = readFileSync(join(root, "_site/skills/courier/start.md"), "utf8");
  assert.ok(start.includes(`"$TC" courier join '<exact link>' --consent --wait 60 `));
  assert.ok(start.includes(`"$TC" courier invite --session <id> --mode same-owner|anyone --consent --wait 1: it returns within seconds with the handoff link and then exits 1 with [invite-pending], which is expected`));
  assert.ok(start.includes(`Give me its exact handoff link at once. Then, in the same turn and without asking me, keep the issuer serving that same invitation with "$TC" courier invite serve <invitationId> --wait 60`));
  assert.ok(start.includes("at most 10 serve runs in a row; the invite call's own [invite-pending] doesn't count."));
  assert.doesNotMatch(start, /--wait 300/);
});

// invite serve and join print what to do next after the CLI's full output: stderr is copied for the
// [invite-pending] check and still shown; stdout passes through; the block exits with the CLI's code.
test("Courier invite serve and join blocks print a NEXT line on paired/joined and on [invite-pending], else *_EXIT", () => {
  const guide = readFileSync(join(root, "setup/courier.md"), "utf8");
  for (const [heading, done, waiting, other] of [
    ["## Keep the issuer serving", "NEXT: paired; continue.", "NEXT: no one has joined yet; run this block again now, in the same turn.", "INVITE_EXIT"],
    ["## Incoming invitation takes priority", "NEXT: joined; continue.", "NEXT: the issuer has not finished pairing yet; run this block again now, in the same turn.", "JOIN_EXIT"],
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
    [1, invitation, pending, `INVITATION_ID=01M62GPP936EPBR37DK93RWS1J\nNEXT: before anything else, send the owner this invitation link, on its own line: ${link} Only after that message is sent, run the serve block below, in the same turn.`],
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
const REFUSED_GRANT_LINE = `"I couldn't use that approval. You can remove it at https://account.tinycloud.xyz/delegations: it's the newest "Courier agent" row. Then please open this new link and approve, then tell me." Do not send the owner the CID.`;
const courierSetup = (surface) => {
  const text = readFileSync(join(root, surface), "utf8");
  const section = text.split("\n## Set up Courier once\n")[1]?.split("\n## ")[0];
  assert.ok(section, `${surface}: missing executable remote setup`);
  const blocks = [...section.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((match) => match[1]);
  assert.equal(blocks.length, 4, `${surface}: expected request, wait, code import and read blocks`);
  const [request, wait, redeem] = blocks;
  assert.match(request, /^"\$TC" courier init --request > "\$COURIER_HOME\/request\.json" &&$/m);
  assert.match(wait, /^\{ "\$TC" courier init --wait --timeout 60s; echo "\$\?" > "\$OUT\.rc"; \} \| tee "\$OUT"$/m);
  assert.match(redeem, /"\$TC" courier init --grant-file -/);
  // A refused grant names the labelled row on the delegations page; the agent never relays the CID to the owner.
  assert.ok(section.includes(REFUSED_GRANT_LINE), `${surface}: refused-grant owner line`);
  assert.doesNotMatch(section, /search box|in place of `<CID>`/, `${surface}: the owner is not asked to paste a CID`);
  return { section, request, wait, redeem };
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
// Courier link handling follows #152's relay line; expired links use the approved decline question.
test("Courier approval messages use the relay line and the decline rule, on every served surface", () => {
  for (const surface of COURIER_SURFACES) {
    const text = readFileSync(join(root, surface), "utf8");
    assert.doesNotMatch(text, /tell me when you're done|says they're done/, surface);
    for (const line of [
      "> Open this link and approve the one-time Courier permission, then tell me.",
      '"That didn\'t finish on my side. Please open this link and approve, then tell me."',
      REFUSED_GRANT_LINE,
      "Use the onboarding guide's owner line for its links; this line is only for the Courier approval.",
      "Exit 8 is pending only when stdout contains a JSON object with a non-empty `pending.approvalUrl`:",
      "Send `pending.approvalUrl` once and wait for the owner",
      "ask the decline question from the shared table",
    ]) assert.ok(text.includes(line), `${surface}: ${line}`);
  }
});
// js-sdk #821's exit-8 contract: wait for the owner and follow the `Next:` line.
const EXIT_PENDING_RULING = "Send `pending.approvalUrl` once and wait for the owner; if you already sent this exact link, don't send it again.";
const EXIT_OTHER_RULING = "Any other non-zero exit is an error: stderr carries `[code]`.";
// The real-CLI tests run the pinned CLI; COURIER_TEST_TC points them at a candidate build before a pin bump.
const COURIER_CLI = process.env.COURIER_TEST_TC || join(root, "node_modules/.bin/tinycloud");
// js-sdk #821 (TC-2300) adds `courier init --wait`; the pinned 1.6.2 has it. A COURIER_TEST_TC without it skips the real-CLI test.
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
  test(`Courier setup collects the approval in one bounded foreground call and passes exit 8 through: ${surface}`, () => {
    const { section, wait } = courierSetup(surface);
    for (const sentence of [EXIT_PENDING_RULING, EXIT_OTHER_RULING]) assert.ok(section.includes(sentence), `${surface}: missing js-sdk #821's exit-8 wording: ${sentence}`);
    assert.ok(section.includes("> Open this link and approve the one-time Courier permission, then tell me."));
    assert.doesNotMatch(section, /paste the short code here/);
    // Rotating the key would clear every pairing: no setup block may run it, though the CLI's errors suggest it.
    assert.doesNotMatch(section.match(/```sh\n[\s\S]*?\n```/g).join("\n"), /--rotate-key/);
    assert.ok(section.includes("Never run `init --rotate-key`, even when stderr suggests it."));
    assert.doesNotMatch(wait, /rc === "6"/, "Courier errors use exit 1, not the CLI's exit-6 behavior");
    assert.doesNotMatch(wait, /&\s*$|\bsleep\b|\bwhile\b|\buntil\b|\bnohup\b/m);
    assert.ok(Number(wait.match(/--timeout (\d+)s\b/)[1]) <= 90);
    // The block shows the CLI's stdout in full, exits with its code, then prints what to do next.
    const pendingOut = (url) => `{"pending":{"step":1,"of":1,"approvalUrl":"${url}","expiresAt":"2026-11-02T00:00:00.000Z"}}\n`;
    const newLink = (url) => `NEXT: this is a new link; send it to the owner in your reply now, on its own line, with the step 1 line: ${url} When the owner next writes to you, run this block again.`;
    const sameLink = "NEXT: the owner already has this link; when the owner next writes to you, run this block again.";
    for (const selected of [undefined, "chosen-home"]) {
      const dir = home();
      const log = join(dir, "tc-calls");
      const courierHome = join(dir, selected ?? ".courier");
      mkdirSync(courierHome, { recursive: true, mode: 0o700 });
      writeFileSync(join(courierHome, "request.json"), JSON.stringify({ openkeyUrl: "https://openkey.so/a/sent" }));
      executable(join(dir, "tc"), `printf '%s|%s\\n' "$*" "$COURIER_HOME" >> "$TC_LOG"\nprintf '%s' "$FAKE_STDOUT"\nexit "$FAKE_EXIT"`);
      for (const [exit, stdout, last] of [
        [8, pendingOut("https://openkey.so/a/sent"), sameLink],
        [8, pendingOut("https://openkey.so/a/other"), newLink("https://openkey.so/a/other")],
        [8, pendingOut("https://openkey.so/a/other"), sameLink],
        [8, "", "COURIER_EXIT 8"],
        [8, pendingOut(""), "COURIER_EXIT 8"],
        [0, '{"ok":true}\n', "NEXT: Courier is set up; continue."],
        [0, '{"ok":false}\n', "COURIER_EXIT 0"],
        [1, "", "COURIER_EXIT 1"],
        [2, "", "COURIER_EXIT 2"],
      ]) {
        const env = { HOME: dir, TC: join(dir, "tc"), TC_LOG: log, FAKE_EXIT: String(exit), FAKE_STDOUT: stdout };
        if (selected) env.COURIER_HOME = courierHome;
        const result = shell(wait, env);
        assert.equal(result.status, exit, result.stderr);
        assert.equal(result.stdout, `${stdout}${last}\n`);
      }
      assert.equal(readFileSync(log, "utf8"), `courier init --wait --timeout 60s|${courierHome}\n`.repeat(9));
      assert.equal(statSync(join(courierHome, "shown-link")).mode & 0o777, 0o600);
    }
  });

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
    // The link the owner was sent in step 1: the block says to rerun now, not to send it again.
    assert.equal(lines.at(-1), "NEXT: the owner already has this link; when the owner next writes to you, run this block again.");
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
