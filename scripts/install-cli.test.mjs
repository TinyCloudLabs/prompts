import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import { appendUserPath, CLI_VERSION, cliInvocation, compatible, installCli, linkCommands, resolveCli } from "./install-cli.mjs";

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
  for (const name of ["tc", "tinycloud"]) {
    const bin = join(root, ".bin", windows ? `${name}.cmd` : name);
    if (windows) {
      executable(bin, version);
      writeFileSync(bin, `${readFileSync(bin, "utf8")}rem ../@tinycloud/cli/cli.js\r\n`);
    } else {
      executable(target, version);
      mkdirSync(dirname(bin), { recursive: true });
      symlinkSync(target, bin);
    }
  }
  return join(root, ".bin", windows ? "tinycloud.cmd" : "tinycloud");
};
// Stands in for npm: records its arguments and lays out the requested release like `npm install --prefix`.
const fakeNpm = (dir) => {
  const bin = join(dir, "npm-bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "npm"), `#!${process.execPath}
const fs = require("node:fs"), path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(join(dir, "npm-calls"))}, JSON.stringify(args) + "\\n");
const prefix = args[args.indexOf("--prefix") + 1];
const version = args[args.length - 1].split("@").pop();
const root = path.join(prefix, "node_modules"), cli = path.join(root, "@tinycloud/cli/cli.js");
fs.mkdirSync(path.dirname(cli), { recursive: true });
fs.mkdirSync(path.join(root, ".bin"), { recursive: true });
fs.writeFileSync(path.join(root, "@tinycloud/cli/package.json"), JSON.stringify({ name: "@tinycloud/cli", version }));
fs.writeFileSync(cli, "#!/bin/sh\\nprintf '%s\\\\n' '" + version + "'\\n", { mode: 0o700 });
fs.chmodSync(cli, 0o700);
for (const name of ["tc", "tinycloud"]) { const link = path.join(root, ".bin", name); fs.rmSync(link, { force: true }); fs.symlinkSync(cli, link); }
`, { mode: 0o700 });
  chmodSync(join(bin, "npm"), 0o700);
  return bin;
};
const npmCalls = (dir) => existsSync(join(dir, "npm-calls")) ? readFileSync(join(dir, "npm-calls"), "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [];
const privatePrefix = (dir) => join(dir, ".local/share/tinycloud/cli");
const assertPrivateOnly = (dir) => {
  const calls = npmCalls(dir);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["install", "--prefix", privatePrefix(dir), "--no-audit", "--no-fund", `@tinycloud/cli@${CLI_VERSION}`]);
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

test("automatic reuse needs the pinned release and never downgrades a newer one", () => {
  assert.equal(compatible("1.5.0-beta.23"), false);
  assert.equal(compatible("1.5.0"), false);
  assert.equal(compatible("1.5.1"), false);
  assert.equal(compatible("1.5.2-beta.4"), false);
  assert.equal(compatible(CLI_VERSION), true);
  assert.equal(compatible("1.5.3-beta.1"), true);
  assert.equal(compatible("1.6.0"), true);
  assert.equal(compatible("2.0.0"), true);
  assert.equal(compatible("not-a-cli-version"), false);
});

test("an older private CLI is upgraded in place to the pin and selected as tinycloud", { skip: windows }, () => {
  const dir = home();
  const bin = privateCli(dir, "1.5.1");
  const log = [];
  const selected = installCli({ env: { ...envFor(dir), PATH: fakeNpm(dir) }, log: (line) => log.push(line) });
  assert.deepEqual(selected, { bin, version: CLI_VERSION, source: "installed" });
  assert.match(bin, /node_modules\/\.bin\/tinycloud$/);
  assertPrivateOnly(dir);
  assert.ok(!log.some((line) => line.startsWith("TC_OLDER")));
});

test("a saved selection inside the private install is the agent's own: upgraded, then saved as tinycloud", { skip: windows }, () => {
  const dir = home();
  const bin = privateCli(dir, "1.5.1");
  const config = join(dir, ".config/tinycloud");
  mkdirSync(config, { recursive: true, mode: 0o700 });
  copyFileSync(helper, join(config, "agent-env.mjs"));
  writeFileSync(join(config, "agent.env"), `TC_BIN=${join(dirname(bin), "tc")}\n`, { mode: 0o600 });
  const selected = installCli({ env: { ...envFor(dir), PATH: fakeNpm(dir) }, log: () => {} });
  assert.deepEqual(selected, { bin, version: CLI_VERSION, source: "installed" });
  assertPrivateOnly(dir);
  assert.equal(readFileSync(join(config, "agent.env"), "utf8"), `TC_BIN=${bin}\n`);
});

test("with /agent's helper installed, the installer saves its selection in agent.env, the one saved location", { skip: windows }, () => {
  const dir = home();
  const config = join(dir, ".config/tinycloud");
  mkdirSync(config, { recursive: true, mode: 0o700 });
  copyFileSync(helper, join(config, "agent-env.mjs"));
  const selected = installCli({ env: { ...envFor(dir), PATH: fakeNpm(dir) }, log: () => {} });
  assert.equal(selected.source, "installed");
  assert.equal(readFileSync(join(config, "agent.env"), "utf8"), `TC_BIN=${selected.bin}\n`);
  const before = statSync(join(config, "agent.env")).mtimeMs;
  assert.equal(installCli({ env: { ...envFor(dir), PATH: fakeNpm(dir) }, log: () => {} }).source, "private");
  assert.equal(statSync(join(config, "agent.env")).mtimeMs, before);
});

test("a process TC_BIN is an operator override and is not written to agent.env", { skip: windows }, () => {
  const dir = home();
  const config = join(dir, ".config/tinycloud");
  mkdirSync(config, { recursive: true, mode: 0o700 });
  copyFileSync(helper, join(config, "agent-env.mjs"));
  const operator = join(dir, "operator", "tinycloud");
  executable(operator, CLI_VERSION);
  installCli({ env: { ...envFor(dir), TC_BIN: operator, PATH: fakeNpm(dir) }, log: () => {} });
  assert.equal(existsSync(join(config, "agent.env")), false);
});

for (const [where, version] of [["TC_BIN", "1.5.1"], ["agent-env", "1.5.1"], ["TC_BIN", "1.3.5"]]) test(`an older operator CLI (${version}) from ${where} is kept with a notice and left untouched`, { skip: windows }, () => {
  const dir = home();
  const operator = join(dir, "operator", "tinycloud");
  executable(operator, version);
  const before = readFileSync(operator);
  const env = { ...envFor(dir), PATH: fakeNpm(dir) };
  if (where === "TC_BIN") env.TC_BIN = operator;
  else {
    const config = join(dir, ".config/tinycloud");
    mkdirSync(config, { recursive: true, mode: 0o700 });
    copyFileSync(helper, join(config, "agent-env.mjs"));
    writeFileSync(join(config, "agent.env"), `TC_BIN=${operator}\n`, { mode: 0o600 });
  }
  const log = [];
  const selected = installCli({ env, log: (line) => log.push(line) });
  assert.deepEqual(selected, { bin: operator, version, source: where });
  assert.deepEqual(log.filter((line) => line.startsWith("TC_OLDER")), [`TC_OLDER ${version} ${operator} is older than the pinned ${CLI_VERSION}; keeping this operator-selected CLI`]);
  assert.deepEqual(readFileSync(operator), before);
  assert.deepEqual(npmCalls(dir), []);
  assert.equal(existsSync(privatePrefix(dir)), false);
});

test("an older CLI on PATH is left alone while the private pin is installed and selected", { skip: windows }, () => {
  const dir = home();
  const global = join(dir, "global");
  const target = join(global, "lib/node_modules/@tinycloud/cli/cli.js");
  executable(target, "1.5.1");
  mkdirSync(join(global, "bin"), { recursive: true });
  symlinkSync(target, join(global, "bin/tinycloud"));
  const before = readFileSync(target);
  const selected = installCli({ env: { ...envFor(dir), PATH: `${join(global, "bin")}:${fakeNpm(dir)}` }, log: () => {} });
  assert.deepEqual(selected, { bin: join(privatePrefix(dir), "node_modules/.bin/tinycloud"), version: CLI_VERSION, source: "installed" });
  assertPrivateOnly(dir);
  assert.deepEqual(readFileSync(target), before);
});

for (const version of [CLI_VERSION, "1.6.0"]) test(`a private CLI at ${version} is reused without npm or a downgrade`, { skip: windows }, () => {
  const dir = home();
  const bin = privateCli(dir, version);
  const selected = installCli({ env: { ...envFor(dir), PATH: fakeNpm(dir) }, log: () => {} });
  assert.deepEqual(selected, { bin, version, source: "private" });
  assert.deepEqual(npmCalls(dir), []);
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

test("an explicit CLI that reports no version is rejected without changing its files or installing another copy", () => {
  const dir = home();
  const selected = join(dir, windows ? "selected.cmd" : "selected");
  executable(selected, "not a version");
  const before = readFileSync(selected);
  assert.throws(() => installCli({ env: { ...envFor(dir), TC_BIN: selected } }), /not a TinyCloud CLI version/);
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
