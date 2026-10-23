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
  mkdirSync(join(root, ".evals"), { recursive: true });
  const privateRun = mkdtempSync(join(root, ".evals", "site-boundary-"));
  homes.push(privateRun);
  writeFileSync(join(privateRun, "session.md"), "# Private eval fixture\n\nEvaluation publication boundary sentinel.\n");
  const built = spawnSync(process.execPath, [join(root, "scripts/build-site.mjs")], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
});

test("site excludes evaluation sources, private runs and acceptance runbooks", () => {
  for (const path of [".evals", "evals", "tinycloud-chatgpt-first-user-readiness-todo.md", "tinycloud-mcp-first-user-readiness-todo.md"]) {
    assert.equal(existsSync(join(root, "_site", path)), false, `${path} must not be served`);
  }
  assert.doesNotMatch(readFileSync(join(root, "_site/llms-full.txt"), "utf8"), /Evaluation publication boundary sentinel/);
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
