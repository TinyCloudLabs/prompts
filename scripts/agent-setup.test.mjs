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
  executable(selected, 'echo 1.2.3');
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

test("/connect sends a coding agent to the guide for its request and gives each chat app its own steps", () => {
  const site = join(root, "_site");
  const markdown = readFileSync(join(site, "connect.md"), "utf8");
  const html = readFileSync(join(site, "connect.html"), "utf8");
  const coding = markdown.split("\n## Coding agents\n")[1].split("\n## ChatGPT\n")[0];
  for (const agent of ["Claude Code", "Codex", "OpenCode", "Cursor", "OpenClaw", "Hermes", "any agent with a shell"]) assert.ok(coding.includes(agent), agent);
  for (const guide of ["apps", "secrets", "publish", "chat", "courier", "setup"]) {
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

test("/connect's ChatGPT section is byte-identical to the verified one, and the coding route sends context requests to /apps", () => {
  const markdown = readFileSync(join(root, "_site", "connect.md"), "utf8");
  const chatgpt = markdown.split("\n## ChatGPT\n")[1].split("\n## Claude\n")[0];
  // ChatGPT's four-step reply of at most 120 words was verified against exactly this text; change it only with a new ChatGPT run.
  assert.equal(createHash("sha256").update(chatgpt).digest("hex"), "f160335270dfa6b2432b3c6b63a13183252b7a12ef012edb45f11ade31b09a76");
  const coding = markdown.split("\n## Coding agents\n")[1].split("\n## ChatGPT\n")[0];
  const context = coding.split("\n").filter((line) => line.startsWith("**Context:**"));
  assert.equal(context.length, 1);
  assert.ok(context[0].includes("](https://agents.tinycloud.xyz/apps)"), context[0]);
});
