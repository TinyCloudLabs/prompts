import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const helper = join(root, "scripts/agent-env.mjs");
const homes = [];
const home = () => { const dir = mkdtempSync(join(tmpdir(), "tc-agent-setup-")); homes.push(dir); return dir; };
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
    .replaceAll("https://agents.tinycloud.xyz/agent-env.mjs", `file://${helper}`)
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

test("directory replacement during helper download cannot activate into its target", () => {
  const dir = home();
  const config = join(dir, ".config/tinycloud");
  const target = join(dir, "unrelated");
  const bin = join(dir, "bin");
  mkdirSync(config, { recursive: true, mode: 0o700 });
  mkdirSync(target, { mode: 0o700 });
  mkdirSync(bin);
  executable(join(bin, "curl"), `
mv "$HOME/.config/tinycloud" "$HOME/.config/tinycloud-old"
ln -s "$HOME/unrelated" "$HOME/.config/tinycloud"
while [ "$1" != "-o" ]; do shift; done
cp "$SOURCE_HELPER" "$2"`);
  const result = shell(helperInstall(), { HOME: dir, SOURCE_HELPER: helper, PATH: `${bin}:${process.env.PATH}` });
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(join(target, "agent-env.mjs")), false);
  assert.equal(existsSync(join(target, "agent-env.mjs.download")), false);
});

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
  });
}
