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
  executable(selected, 'echo 1.5.0-beta.28');
  executable(conflicting, 'echo unrelated');
  const original = readFileSync(conflicting);
  const guide = readFileSync(join(root, "setup/tinycloud.md"), "utf8");
  const result = shell(block(guide, "## Install the CLI"), { HOME: dir, TC_BIN: selected, PATH: `${bin}:${process.env.PATH}` });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /TC_CONFLICT tc other/);
  assert.deepEqual(readFileSync(conflicting), original);
  assert.equal(existsSync(join(dir, ".local/share/tinycloud/cli")), false);
});

before(() => {
  const built = spawnSync(process.execPath, [join(root, "scripts/build-site.mjs")], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
});
for (const name of ["courier", "cli"]) {
  test(`${name} skill selects the persisted custom CLI in a fresh shell`, () => {
    const dir = home();
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const selected = join(bin, "selected-cli");
    executable(selected, 'case "$*" in "--version") echo 1.2.3 ;; "courier --help") echo COURIER_SELECTED_1.2.3 ;; esac');
    executable(join(bin, "tc"), 'echo GLOBAL_1.2.1');
    const selectedEnv = join(dir, "owner/agent.env");
    const persisted = shell(helperInstall(), { HOME: dir, TC_BIN: selected, TC_AGENT_ENV: selectedEnv, PATH: `${bin}:${process.env.PATH}` });
    assert.equal(persisted.status, 0, persisted.stderr);
    const skill = readFileSync(join(root, `_site/skills/${name}/SKILL.md`), "utf8");
    const result = shell(block(skill, name === "courier" ? "## Run Courier" : "# TinyCloud CLI", "bash"), {
      HOME: dir, TC_AGENT_ENV: selectedEnv, PATH: `${bin}:${process.env.PATH}`,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, name === "courier" ? /COURIER_SELECTED_1\.2\.3/ : /1\.2\.3/);
    assert.doesNotMatch(result.stdout, /GLOBAL_1\.2\.1/);
    const override = join(bin, "override-cli");
    executable(override, 'case "$*" in "--version") echo OVERRIDE_1.2.4 ;; "courier --help") echo COURIER_OVERRIDE_1.2.4 ;; esac');
    const overridden = shell(block(skill, name === "courier" ? "## Run Courier" : "# TinyCloud CLI", "bash"), {
      HOME: dir, TC_AGENT_ENV: selectedEnv, TC_BIN: override, PATH: `${bin}:${process.env.PATH}`,
    });
    assert.equal(overridden.status, 0, overridden.stderr);
    assert.match(overridden.stdout, name === "courier" ? /COURIER_OVERRIDE_1\.2\.4/ : /OVERRIDE_1\.2\.4/);
    symlinkSync(join(dir, "owner"), join(dir, "linked-owner"));
    const linked = shell(block(skill, name === "courier" ? "## Run Courier" : "# TinyCloud CLI", "bash"), {
      HOME: dir, TC_AGENT_ENV: join(dir, "linked-owner/agent.env"), PATH: `${bin}:${process.env.PATH}`,
    });
    assert.notEqual(linked.status, 0);
    assert.doesNotMatch(linked.stdout, /GLOBAL_1\.2\.1/);
    const overriddenLinked = shell(block(skill, name === "courier" ? "## Run Courier" : "# TinyCloud CLI", "bash"), {
      HOME: dir, TC_AGENT_ENV: join(dir, "linked-owner/agent.env"), TC_BIN: override,
      PATH: `${bin}:${process.env.PATH}`,
    });
    assert.equal(overriddenLinked.status, 0, overriddenLinked.stderr);
    assert.match(overriddenLinked.stdout, name === "courier" ? /COURIER_OVERRIDE_1\.2\.4/ : /OVERRIDE_1\.2\.4/);
    assert.doesNotMatch(overriddenLinked.stdout, /GLOBAL_1\.2\.1/);
  });
}

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
  for (const [app, id] of [["Grok", "grok"], ["Perplexity", "perplexity"], ["Gemini", "gemini"], ["Meta Muse", "meta-muse"]]) {
    const section = markdown.split(`\n## ${app}\n`)[1]?.split("\n## ")[0];
    assert.ok(section, `${app} section`);
    assert.match(section, /`https:\/\/mcp\.tinycloud\.xyz\/mcp`/);
    assert.match(section, /OAuth/);
    assert.match(section, /\(#approve-access-and-continue\)/);
    assert.match(html, new RegExp(`<h2 id="${id}">`));
  }
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
  for (const scenario of ["saved", "process", "old", "unset"]) {
    const dir = home();
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const saved = join(bin, "saved-cli");
    const override = join(bin, "process-cli");
    executable(saved, `case "$*" in --version) echo ${scenario === "old" ? "1.5.0-beta.28" : "1.5.0"} ;; esac`);
    executable(override, 'case "$*" in --version) echo 1.5.0 ;; esac');
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
      const expected = scenario === "process" ? override : scenario === "unset" ? "" : saved;
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
    const body = `case "$*" in
      --version) ${scenario === "broken" ? "exit 23" : `echo ${scenario === "old" ? "1.5.0-beta.28" : "1.5.0"}`} ;;
      "courier --help") printf '%s\\n' '  start [--new subject | --session id]' '  invite --session id --mode same-owner|anyone --consent' '  invite serve id' ${scenario === "no-join" ? "" : "'  join link --consent'"} ;;
      *) exit 90 ;;
    esac`;
    if (scenario !== "missing") executable(selected, body);
    if (scenario === "not-executable") chmodSync(selected, 0o600);
    const before = scenario === "missing" ? null : readFileSync(selected);
    const result = shell(probe, { HOME: dir, TC_BIN: selected });
    assert.equal(result.status === 0, scenario === "current", `${scenario}: ${result.stderr}`);
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
      ["courier", "invite", "--session", "01M62GPP936EPBR37DK93RWS1H", "--mode", mode, "--consent"]);
    else assert.equal(existsSync(calls), false);
  }
});

test("Courier preview installs and serves the approved release pins", () => {
  const skills = JSON.parse(readFileSync(join(root, "_site/skills/index.json"), "utf8")).skills;
  assert.equal(skills.find((entry) => entry.short === "cli").version, "1.5.0-beta.28");
  assert.equal(skills.find((entry) => entry.short === "courier").version, "0.4.0-beta.19");
  const dir = home();
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const calls = join(dir, "npm-calls");
  executable(join(bin, "npm"), `printf '%s\\n' "$@" > "$NPM_CALLS"
    mkdir -p "$HOME/.local/share/tinycloud/cli/node_modules/.bin"
    printf '#!/bin/sh\\necho 1.5.0-beta.28\\n' > "$HOME/.local/share/tinycloud/cli/node_modules/.bin/tc"
    chmod 700 "$HOME/.local/share/tinycloud/cli/node_modules/.bin/tc"`);
  const cliGuide = readFileSync(join(root, "setup/tinycloud.md"), "utf8");
  const installed = shell(block(cliGuide, "## Install the CLI"), { HOME: dir, PATH: `${bin}:${process.env.PATH}`, NPM_CALLS: calls });
  assert.equal(installed.status, 0, installed.stderr);
  assert.ok(readFileSync(calls, "utf8").split("\n").includes("@tinycloud/cli@1.5.0-beta.28"));
  const agentGuide = readFileSync(join(root, "setup/agent.md"), "utf8");
  assert.deepEqual([...agentGuide.matchAll(/@tinycloud\/cli@([0-9A-Za-z.-]+)/g)].map((match) => match[1]), ["1.5.0-beta.28"]);
});

for (const surface of ["setup/courier.md", "_site/skills/courier/SKILL.md", "_site/skills/courier/start.md"]) {
  test(`Courier remote setup consumes non-TTY codes with the real CLI: ${surface}`, () => {
    const text = readFileSync(join(root, surface), "utf8");
    const section = text.split("\n## Set up Courier once\n")[1]?.split("\n## ")[0];
    assert.ok(section, `${surface}: missing executable remote setup`);
    const [request, redeem] = [...section.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((match) => match[1]);
    assert.ok(request && redeem, `${surface}: missing request or code-import step`);
    const dir = home();
    const courierHome = join(dir, "courier");
    const cliHome = join(dir, "cli");
    mkdirSync(cliHome, { mode: 0o700 });
    writeFileSync(join(cliHome, "sentinel"), "existing CLI context\n");
    const requests = join(dir, "requests.jsonl");
    const forbidden = join(dir, "forbidden.jsonl");
    const fence = join(dir, "network-fence.cjs");
    writeFileSync(fence, `
      const fs = require("node:fs");
      const { syncBuiltinESMExports } = require("node:module");
      const deny = (operation) => () => {
        fs.appendFileSync(${JSON.stringify(forbidden)}, operation + "\\n");
        throw Error("COURIER_TEST_NETWORK_DENIED");
      };
      globalThis.fetch = async (input, options = {}) => {
        const url = String(input);
        if (url !== "https://openkey.example.invalid/api/delegation-codes/abcd-efgh") return deny("fetch")();
        fs.appendFileSync(${JSON.stringify(requests)}, JSON.stringify({ url, method: options.method || "GET", redirect: options.redirect }) + "\\n");
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
      COURIER_HOST: "https://node.example.invalid", COURIER_OPENKEY_HOST: "https://openkey.example.invalid",
      COURIER_OPENKEY_API_HOST: "https://openkey.example.invalid",
      TC: join(root, "node_modules/.bin/tinycloud"), NODE_OPTIONS: `--require=${fence}`, FORCE_COLOR: "0",
    };
    const run = (script, code) => spawnSync("sh", ["-c", script], {
      env: { ...env, ...(code === undefined ? {} : { COURIER_CODE: code }) },
      encoding: "utf8", timeout: 15000,
    });
    const issued = run(request);
    assert.ifError(issued.error);
    assert.equal(issued.status, 0, issued.stderr);
    const approval = JSON.parse(issued.stdout);
    const url = new URL(approval.openkeyUrl);
    assert.equal(url.origin, "https://openkey.example.invalid");
    assert.equal(url.searchParams.has("callback"), false);
    assert.equal("d" in approval.publicJwk, false);
    assert.equal(JSON.parse(readFileSync(join(courierHome, "profile.json"), "utf8")).courierDid, approval.courierDid);
    const keyDigest = () => createHash("sha256").update(readFileSync(join(courierHome, "key.json"))).digest("hex");
    const originalKey = keyDigest();
    const malformed = run(redeem, "not-a-grant");
    assert.ifError(malformed.error);
    assert.equal(malformed.status, 1, malformed.stderr);
    assert.match(malformed.stderr, /\[bad-grant\]/);
    assert.equal(existsSync(requests), false);
    const expired = run(redeem, "ABCD-EFGH");
    assert.ifError(expired.error);
    assert.equal(expired.status, 1, expired.stderr);
    assert.match(expired.stderr, /\[code-not-found\]/);
    assert.deepEqual(readFileSync(requests, "utf8").trim().split("\n").map((line) => JSON.parse(line)), [{
      url: "https://openkey.example.invalid/api/delegation-codes/abcd-efgh", method: "GET", redirect: "error",
    }]);
    assert.equal(keyDigest(), originalKey);
    assert.equal(existsSync(join(courierHome, "grant.json")), false);
    assert.equal(existsSync(forbidden), false);
    assert.deepEqual(readdirSync(cliHome), ["sentinel"]);
    assert.equal(readFileSync(join(cliHome, "sentinel"), "utf8"), "existing CLI context\n");
  });
}
