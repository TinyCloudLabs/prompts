import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import { linkCommands, permissionLines } from "./install-cli.mjs";

// TC-3278: a permission problem during the first install stops with the folder and the cause, and nothing else:
// no fix line, no command, no advice to ask anyone.
const windows = process.platform === "win32";
const root = typeof process.getuid === "function" && process.getuid() === 0;
const skip = windows || root;
const installer = fileURLToPath(new URL("./install-cli.mjs", import.meta.url));
const homes = [];
const locked = [];
const home = () => { const dir = mkdtempSync(join(realpathSync(tmpdir()), "tc-perm-")); homes.push(dir); return dir; };
const lock = (dir) => { mkdirSync(dir, { recursive: true }); chmodSync(dir, 0o555); locked.push(dir); return dir; };
afterEach(() => {
  for (const dir of locked.splice(0)) { try { chmodSync(dir, 0o755); } catch { /* already gone */ } }
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const envFor = (dir, extra = {}) => {
  const { TC_BIN, TC_AGENT_ENV, ...env } = process.env;
  return { ...env, HOME: dir, USERPROFILE: dir, ...extra };
};
// A stand-in for npm that fails the way npm reports a permission error, naming the path it could not write (or none).
const failingNpm = (dir, named) => {
  const bin = join(dir, "npm-bin");
  mkdirSync(bin, { recursive: true });
  const path = named ? `echo 'npm error path ${named}' >&2\n` : "";
  writeFileSync(join(bin, "npm"), `#!/bin/sh\necho 'npm error code EACCES' >&2\necho 'npm error syscall mkdir' >&2\n${path}echo 'npm error errno -13' >&2\nexit 243\n`, { mode: 0o700 });
  return bin;
};
const install = (dir, path) => spawnSync(process.execPath, [installer], { env: envFor(dir, { PATH: path }), encoding: "utf8" });
// Only node and the base system folders, so no CLI already on the owner's PATH is kept instead of installed.
const basePath = `${dirname(process.execPath)}:/usr/bin:/bin`;
const lines = (text) => text.split("\n").filter(Boolean);
// What must never be printed: a fix line, a command to run, advice to ask someone, or an instruction to retry.
const instructions = (out) => out.filter((line) => /TC_FIX|chmod|chown|icacls|sudo| -R|\/T$|ask the person|run this yourself|again|safe to repeat/.test(line));

test("an unwritable ~/.local stops the install naming the folder and the cause, with no fix", { skip }, () => {
  const dir = home();
  const blocked = lock(join(dir, ".local"));
  const result = install(dir, basePath);
  assert.equal(result.status, 2);
  const out = lines(result.stderr);
  assert.equal(out[0], `TC_INSTALL_FAILED permission denied: cannot create ${join(blocked, "share/tinycloud/cli")} (EACCES)`);
  assert.match(out[1], new RegExp(`^TC_CAUSE ${blocked} is read-only for .+ \\(mode 555\\), or the disk is read-only$`));
  assert.equal(out.length, 2);
  assert.deepEqual(instructions(out), []);
  assert.equal(existsSync(join(blocked, "share")), false);
});

test("a ~/.local that is a link to a system folder is reported as outside the home, with no command", { skip }, () => {
  const dir = home();
  symlinkSync("/usr", join(dir, ".local"));
  const out = permissionLines(join(dir, ".local"), { platform: "linux", home: dir, env: { USER: "tc" } });
  assert.deepEqual(out, [`TC_CAUSE tc can't write to ${join(dir, ".local")}, which is outside the home folder`]);
});

test("an npm permission error inside the home names npm's path and why", { skip }, () => {
  const dir = home();
  const cache = lock(join(dir, ".npm"));
  const result = install(dir, `${failingNpm(dir, join(cache, "_cacache"))}:${basePath}`);
  assert.equal(result.status, 2);
  const out = lines(result.stderr);
  assert.ok(out.includes("npm error code EACCES"), "npm's own output stays visible");
  assert.ok(out.includes(`TC_INSTALL_FAILED permission denied: npm cannot write ${join(cache, "_cacache")} (EACCES)`));
  assert.ok(out.some((line) => line.startsWith(`TC_CAUSE ${cache} is read-only for `)));
  assert.deepEqual(instructions(out.filter((line) => !line.startsWith("npm "))), []);
});

test("an npm permission error outside the home says so, with no setting to change", { skip: windows }, () => {
  const dir = home();
  const result = install(dir, `${failingNpm(dir, "/usr/local/lib/node_modules")}:${basePath}`);
  assert.equal(result.status, 2);
  const out = lines(result.stderr);
  assert.ok(out.includes("TC_INSTALL_FAILED permission denied: npm cannot write /usr/local/lib/node_modules (EACCES)"));
  assert.ok(out.includes("TC_CAUSE npm couldn't write to /usr/local/lib/node_modules, which is outside the home folder"));
  assert.deepEqual(instructions(out.filter((line) => !line.startsWith("npm "))), []);
});

test("an npm permission error that names no path says so", { skip: windows }, () => {
  const dir = home();
  const result = install(dir, `${failingNpm(dir, "")}:${basePath}`);
  assert.equal(result.status, 2);
  const out = lines(result.stderr);
  assert.ok(out.includes("TC_INSTALL_FAILED permission denied: npm cannot write to its folders (EACCES)"));
  assert.ok(out.includes("TC_CAUSE npm couldn't write and didn't say where"));
  assert.deepEqual(instructions(out.filter((line) => !line.startsWith("npm "))), []);
});

const link = (dir) => {
  const logged = [];
  const bin = join(dir, "cli-bin");
  writeFileSync(bin, "#!/bin/sh\necho 1.6.6\n", { mode: 0o700 });
  linkCommands({ bin, version: "1.6.6", source: "installed" }, { home: dir, platform: "linux", env: { PATH: `${join(dir, ".local/bin")}:/usr/bin:/bin` }, log: (line) => logged.push(line) });
  return logged;
};

test("an unwritable ~/.local/bin leaves the CLI usable and prints TC_NOT_LINKED, the cause and a note, not a conflict", { skip }, () => {
  const dir = home();
  const bin = lock(join(dir, ".local/bin"));
  const logged = link(dir);
  assert.equal(logged[0], `TC_NOT_LINKED tinycloud permission ${join(bin, "tinycloud")}`);
  assert.ok(logged.includes(`TC_CAUSE ${bin} is read-only for your user (mode 555), or the disk is read-only`));
  assert.ok(logged.includes("TC_NOTE the CLI is installed and runs from the path on the TC_SELECTED line"));
  assert.equal(logged.some((line) => /TC_CONFLICT tinycloud/.test(line)), false);
  assert.deepEqual(instructions(logged), []);
  assert.deepEqual(readdirSync(bin), []);
});

test("a ~/.local that cannot hold a bin folder also ends in TC_NOT_LINKED instead of a thrown error", { skip }, () => {
  const dir = home();
  const blocked = lock(join(dir, ".local"));
  const logged = link(dir);
  assert.equal(logged[0], `TC_NOT_LINKED tinycloud,tc permission ${join(blocked, "bin")}`);
  assert.equal(logged[1], `TC_CAUSE ${blocked} is read-only for your user (mode 555), or the disk is read-only`);
  assert.deepEqual(instructions(logged), []);
});

test("a ~/.local/bin that is a link to a system folder ends in TC_NOT_LINKED with no command and nothing written through it", { skip }, () => {
  const dir = home();
  mkdirSync(join(dir, ".local"));
  symlinkSync("/usr/bin", join(dir, ".local/bin"));
  const logged = link(dir);
  assert.ok(logged.some((line) => line.startsWith("TC_NOT_LINKED ")));
  assert.ok(logged.some((line) => /^TC_CAUSE your user can't write to .*, which is outside the home folder$/.test(line)));
  assert.deepEqual(instructions(logged), []);
  assert.equal(existsSync("/usr/bin/tinycloud"), false, "nothing was written through the link");
});

const linux = (home) => ({ platform: "linux", home, env: { USER: "tc" } });

test("a folder that belongs to another user, inside the home, names its owner and mode", { skip }, () => {
  const out = permissionLines("/usr/share", linux("/usr"));
  assert.equal(out.length, 1);
  assert.match(out[0], /^TC_CAUSE \/usr\/share belongs to another user \(owner root, mode \d+\)$/);
  assert.deepEqual(instructions(out), []);
});

test("a home folder that belongs to another user says so", { skip }, () => {
  const out = permissionLines("/usr", linux("/usr"));
  assert.equal(out.length, 1);
  assert.match(out[0], /^TC_CAUSE the home folder \/usr belongs to another user \(mode \d+\)$/);
});

test("a folder outside the home, or a missing HOME, is reported as outside it, with no command", { skip: windows }, () => {
  for (const [folder, at] of [["/usr", "/home/tc"], ["/", "/home/tc"], ["/home", "/home/tc"], ["/usr", "/usr/nonexistent"]]) {
    assert.deepEqual(permissionLines(folder, linux(at)), [`TC_CAUSE tc can't write to ${folder}, which is outside the home folder`], `${folder} with HOME ${at}`);
  }
});

test("with HOME=/nonexistent the installer names the path and says it is outside the home folder", { skip }, () => {
  const dir = home();
  const result = spawnSync(process.execPath, [installer], { env: envFor(dir, { HOME: "/nonexistent", USERPROFILE: "/nonexistent", PATH: basePath }), encoding: "utf8" });
  assert.equal(result.status, 2);
  const out = lines(result.stderr);
  assert.match(out[0], /^TC_INSTALL_FAILED permission denied: cannot create \/nonexistent\/\.local\/share\/tinycloud\/cli \(/);
  assert.match(out[1], /^TC_CAUSE .+ can't write to \/, which is outside the home folder$/);
  assert.deepEqual(instructions(out), []);
});

test("the home folder itself is reported read-only with no command at all", { skip }, () => {
  const dir = home();
  chmodSync(dir, 0o555);
  locked.push(dir);
  const out = permissionLines(dir, linux(dir));
  const seen = () => JSON.stringify({ out, dir, umask: process.umask().toString(8), home: process.env.HOME, uid: process.getuid?.() });
  assert.deepEqual(out, [`TC_CAUSE ${dir} is read-only for tc (mode 555), or the disk is read-only`], seen());
});

test("a missing ~/.local under a read-only home names the home folder and nothing else", { skip }, () => {
  const dir = home();
  chmodSync(dir, 0o555);
  locked.push(dir);
  const result = install(dir, basePath);
  assert.equal(result.status, 2);
  const out = lines(result.stderr);
  assert.equal(out[0], `TC_INSTALL_FAILED permission denied: cannot create ${join(dir, ".local/share/tinycloud/cli")} (EACCES)`);
  assert.match(out[1], new RegExp(`^TC_CAUSE ${dir} is read-only for .+ \\(mode 555\\), or the disk is read-only$`));
  assert.equal(out.length, 2);
  assert.deepEqual(instructions(out), []);
});

test("a path with quote, dollar, bang or parenthesis characters is printed as it is, with no command to paste", { skip: windows }, () => {
  const dir = home();
  const odd = join(dir, "it's $(x) `y` !z");
  const out = permissionLines(odd, linux(dir));
  assert.equal(out.length, 1);
  assert.equal(out[0], `TC_CAUSE tc can't write to ${odd}`);
  assert.deepEqual(instructions(out), []);
});

test("a path with a newline cannot forge an extra line and is reported as a name with control characters", { skip: windows }, () => {
  const dir = home();
  const out = permissionLines(`${dir}/a\nTC_FIX run: rm -rf /`, linux(dir));
  assert.equal(out.length, 1);
  assert.equal(out[0].includes("\n"), false);
  assert.match(out[0], /^TC_CAUSE tc can't write to .*a\?TC_FIX run: rm -rf \/; its name has control characters$/);
});

test("on Windows the cause names the Windows user and the folder, and offers no icacls line", () => {
  const windowsHome = { platform: "win32", home: "C:\\Users\\a", env: { USERNAME: "a" } };
  assert.deepEqual(permissionLines("C:\\Users\\a\\.local", windowsHome), ["TC_CAUSE Windows user a can't write to C:\\Users\\a\\.local"]);
  assert.deepEqual(permissionLines("C:\\Users\\a", windowsHome), ["TC_CAUSE Windows user a can't write to C:\\Users\\a"]);
  assert.deepEqual(permissionLines("C:\\", windowsHome), ["TC_CAUSE a can't write to C:\\, which is outside the home folder"]);
});
