import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import { appendUserPath, cliInvocation, compatible, installCli, linkCommands, resolveCli } from "./install-cli.mjs";

const windows = process.platform === "win32";
const homes = [];
const home = () => { const dir = mkdtempSync(join(realpathSync(tmpdir()), "tc-install-")); homes.push(dir); return dir; };
const installer = fileURLToPath(new URL("./install-cli.mjs", import.meta.url));
const helper = fileURLToPath(new URL("./agent-env.mjs", import.meta.url));
const envFor = (dir) => {
  const { TC_BIN, TC_AGENT_ENV, ...env } = process.env;
  return { ...env, HOME: dir, USERPROFILE: dir };
};
const executable = (file, version) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, windows ? `@echo off\r\necho ${version}\r\n` : `#!/bin/sh\nprintf '%s\\n' '${version}'\n`, { mode: 0o700 });
  if (!windows) chmodSync(file, 0o700);
};
const privateCli = (dir, version) => {
  const root = join(dir, ".local/share/tinycloud/cli/node_modules");
  const target = join(root, "@tinycloud/cli/cli.js");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(join(dirname(target), "package.json"), JSON.stringify({ name: "@tinycloud/cli" }));
  const bin = join(root, ".bin", windows ? "tc.cmd" : "tc");
  if (windows) {
    executable(bin, version);
    writeFileSync(bin, `${readFileSync(bin, "utf8")}rem ../@tinycloud/cli/cli.js\r\n`);
  } else {
    executable(target, version);
    mkdirSync(dirname(bin), { recursive: true });
    symlinkSync(target, bin);
  }
  return bin;
};
afterEach(() => { for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test("user PATH append preserves long raw values and is idempotent across Windows spellings", () => {
  const old = `%TOOLS%\\bin;${Array.from({ length: 600 }, (_, index) => `C:\\tools\\${index}`).join(";")};`;
  const directory = "C:\\Users\\Owner Name\\.local\\bin";
  const changed = appendUserPath(old, directory);
  assert.equal(changed, old + directory);
  assert.equal(appendUserPath(changed, directory.toUpperCase() + "\\"), changed);
  const expanded = 'C:\\keep;"%USERPROFILE%\\.local\\bin\\";C:\\after';
  assert.equal(appendUserPath(expanded, directory, { USERPROFILE: "C:\\Users\\Owner Name" }), expanded);
  assert.equal(appendUserPath("", directory), directory);
});

test("automatic reuse excludes the old approval protocol but does not downgrade newer releases", () => {
  assert.equal(compatible("1.5.0-beta.23"), false);
  assert.equal(compatible("1.5.0"), true);
  assert.equal(compatible("1.5.1-beta.1"), true);
  assert.equal(compatible("2.0.0"), true);
  assert.equal(compatible("1.4.9"), false);
  assert.equal(compatible("not-a-cli-version"), false);
});

test("resolver reuses a newer private CLI without creating launchers or installations", () => {
  const dir = home();
  const bin = privateCli(dir, "1.6.0");
  const selected = resolveCli({ env: envFor(dir), searchPath: "" });
  assert.equal(selected.bin, bin);
  assert.equal(selected.version, "1.6.0");
  assert.equal(selected.source, "private");
  assert.equal(existsSync(join(dir, ".local/bin")), false);
});

test("unrelated commands are not executed during automatic CLI discovery", () => {
  const dir = home();
  const binDir = join(dir, "other");
  const marker = join(dir, "executed");
  const command = join(binDir, windows ? "tinycloud.cmd" : "tinycloud");
  executable(command, "1.6.0");
  writeFileSync(command, windows ? `@echo off\r\necho touched > "${marker}"\r\n` : `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o700 });
  assert.equal(resolveCli({ env: envFor(dir), searchPath: binDir }), null);
  assert.equal(existsSync(marker), false);
});

test("explicit CLI and persisted selection take precedence without replacement", () => {
  const dir = home();
  const config = join(dir, ".config/tinycloud");
  mkdirSync(config, { recursive: true, mode: 0o700 });
  copyFileSync(helper, join(config, "agent-env.mjs"));
  const saved = join(dir, windows ? "saved custom.cmd" : "saved custom");
  const explicit = join(dir, windows ? "explicit.cmd" : "explicit");
  executable(saved, "1.5.0");
  executable(explicit, "1.6.0");
  writeFileSync(join(config, "agent.env"), `TC_BIN=${saved}\n`, { mode: 0o600 });
  const env = envFor(dir);
  assert.equal(resolveCli({ env }).bin, saved);
  assert.equal(resolveCli({ env }).source, "agent-env");
  assert.equal(resolveCli({ env: { ...env, TC_BIN: explicit } }).bin, explicit);
  assert.equal(existsSync(join(dir, ".local")), false);
});

test("an incompatible explicit CLI is rejected without changing its files or installing another copy", () => {
  const dir = home();
  const selected = join(dir, windows ? "selected.cmd" : "selected");
  executable(selected, "1.3.5");
  const before = readFileSync(selected);
  assert.throws(() => installCli({ env: { ...envFor(dir), TC_BIN: selected } }), /Selected CLI 1\.3\.5.*incompatible/);
  assert.deepEqual(readFileSync(selected), before);
  assert.equal(existsSync(join(dir, ".local")), false);
});

test("an explicitly empty selection fails rather than falling through to another CLI", () => {
  const dir = home();
  privateCli(dir, "1.6.0");
  assert.throws(() => resolveCli({ env: { ...envFor(dir), TC_BIN: "" } }), /absolute executable path/);
  assert.throws(() => installCli({ env: { ...envFor(dir), TC_BIN: "" } }), /absolute executable path/);
  assert.equal(existsSync(join(dir, ".local/bin")), false);
});

test("read-only resolver fails rather than replacing a broken explicit selection", () => {
  const dir = home();
  const result = spawnSync(process.execPath, [installer, "--resolve"], {
    env: { ...envFor(dir), TC_BIN: join(dir, "missing-cli") }, encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.equal(existsSync(join(dir, ".local")), false);
});

test("the installer executes through a linked download directory", () => {
  const dir = home();
  const selected = join(dir, windows ? "selected.cmd" : "selected");
  executable(selected, "1.6.0");
  const download = join(dir, "download");
  symlinkSync(dirname(installer), download, windows ? "junction" : "dir");
  const result = spawnSync(process.execPath, [join(download, "install-cli.mjs"), "--resolve"], {
    env: { ...envFor(dir), TC_BIN: selected }, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), selected);
  assert.equal(existsSync(join(dir, ".local")), false);
});

test("Windows launcher creation respects occupied names even before bin is on PATH", () => {
  const dir = home();
  const bin = join(dir, ".local/bin");
  mkdirSync(bin, { recursive: true });
  const unrelated = join(bin, "tc.exe");
  writeFileSync(unrelated, "unrelated traffic tool");
  const selected = join(dir, "selected.cmd");
  writeFileSync(selected, "@echo off\r\necho 1.5.0\r\n");
  const log = [];
  const opts = { home: dir, platform: "win32", env: { PATH: "", PATHEXT: ".EXE;.CMD" }, log: (line) => log.push(line) };
  linkCommands({ bin: selected, version: "1.5.0" }, opts);
  assert.equal(readFileSync(unrelated, "utf8"), "unrelated traffic tool");
  assert.equal(existsSync(join(bin, "tc.cmd")), false);
  assert.ok(log.includes("TC_CONFLICT tc other"));
  const launcher = readFileSync(join(bin, "tinycloud.cmd"));
  linkCommands({ bin: selected, version: "1.5.0" }, opts);
  assert.deepEqual(readFileSync(join(bin, "tinycloud.cmd")), launcher);
  assert.ok(log.includes("TC_READY 1.5.0 tinycloud"));
});

test("Unix link creation leaves occupied and dangling destination names untouched", { skip: windows }, () => {
  const dir = home();
  const bin = join(dir, ".local/bin");
  mkdirSync(bin, { recursive: true });
  const selected = join(dir, "selected");
  executable(selected, "1.5.0");
  symlinkSync(join(dir, "unrelated-missing"), join(bin, "tinycloud"));
  executable(join(bin, "tc"), "unrelated");
  const oldTc = readFileSync(join(bin, "tc"));
  const output = [];
  linkCommands({ bin: selected, version: "1.5.0" }, { home: dir, env: { PATH: bin }, log: (line) => output.push(line) });
  assert.deepEqual(readFileSync(join(bin, "tc")), oldTc);
  assert.ok(output.includes("TC_CONFLICT tinycloud other"));
  assert.ok(output.includes("TC_CONFLICT tc other"));
});

test("Windows launchers actually execute paths with spaces and preserve arguments", { skip: !windows }, () => {
  const dir = home();
  const selected = join(dir, "selected CLI.cmd");
  writeFileSync(selected, '@echo off\r\necho [%~1] [%~2]\r\n');
  linkCommands({ bin: selected, version: "1.5.0" }, { home: dir, env: { ...envFor(dir), PATH: "" }, log: () => {} });
  const command = '"' + join(dir, ".local/bin/tinycloud.cmd") + '" "two words" --json';
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${command}"`], { encoding: "utf8", windowsVerbatimArguments: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "[two words] [--json]");
});

test("Windows npm invocation passes JSON and shell metacharacters as literal arguments", () => {
  const dir = home();
  const modules = join(dir, "node_modules");
  const packageDir = join(modules, "@tinycloud/cli");
  const shim = join(modules, ".bin/tc.cmd");
  mkdirSync(packageDir, { recursive: true });
  mkdirSync(dirname(shim), { recursive: true });
  writeFileSync(join(packageDir, "package.json"), JSON.stringify({ name: "@tinycloud/cli", bin: { tc: "cli.cjs" } }));
  writeFileSync(join(packageDir, "cli.cjs"), "console.log(JSON.stringify(process.argv.slice(2)))");
  writeFileSync(shim, "@echo off\r\nrem ../@tinycloud/cli/cli.cjs\r\n");
  const args = ['{"body":"two words"}', "&echo not-a-command", "%USERPROFILE%", "one\"quote"];
  const invocation = cliInvocation(shim, args, "win32");
  const result = spawnSync(invocation.file, invocation.args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), args);
});

test("private install refuses to overwrite an unrelated executable", { skip: windows }, () => {
  const dir = home();
  const bin = join(dir, ".local/share/tinycloud/cli/node_modules/.bin/tc");
  executable(bin, "unrelated");
  const original = readFileSync(bin);
  assert.throws(() => installCli({ env: { ...envFor(dir), PATH: "" }, log: () => {} }), /Unrelated private executable/);
  assert.deepEqual(readFileSync(bin), original);
  assert.equal(existsSync(join(dir, ".local/share/tinycloud/cli/package.json")), false);
});
