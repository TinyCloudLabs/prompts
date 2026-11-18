import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import { linkCommands, permissionLines } from "./install-cli.mjs";

// TC-3278: a permission problem during the first install stops with the path, the cause and the exact fix.
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
// A stand-in for npm that fails the way npm reports a permission error, naming the path it could not write.
const failingNpm = (dir, named) => {
  const bin = join(dir, "npm-bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "npm"), `#!/bin/sh\necho 'npm error code EACCES' >&2\necho 'npm error syscall mkdir' >&2\necho 'npm error path ${named}' >&2\necho 'npm error errno -13' >&2\nexit 243\n`, { mode: 0o700 });
  return bin;
};
const install = (dir, path) => spawnSync(process.execPath, [installer], { env: envFor(dir, { PATH: path }), encoding: "utf8" });
// Only node and the base system folders, so no CLI already on the owner's PATH is kept instead of installed.
const basePath = `${dirname(process.execPath)}:/usr/bin:/bin`;
const lines = (text) => text.split("\n").filter(Boolean);

test("an unwritable ~/.local stops the install naming the folder, the cause and the chmod fix", { skip }, () => {
  const dir = home();
  const blocked = lock(join(dir, ".local"));
  const result = install(dir, basePath);
  assert.equal(result.status, 2);
  const out = lines(result.stderr);
  assert.equal(out[0], `TC_INSTALL_FAILED permission denied: cannot create ${join(blocked, "share/tinycloud/cli")} (EACCES)`);
  assert.match(out[1], new RegExp(`^TC_CAUSE ${blocked} is read-only for .+ \\(mode 555\\)`));
  assert.equal(out[2], `TC_FIX run yourself: chmod u+rwx "${blocked}"`);
  assert.ok(out.includes("TC_FIX then run the same installer command again; it is safe to repeat"));
  assert.equal(existsSync(join(blocked, "share")), false);
});

test("an npm permission error inside the home names npm's path and the fix for that folder", { skip }, () => {
  const dir = home();
  const cache = lock(join(dir, ".npm"));
  const result = install(dir, `${failingNpm(dir, join(cache, "_cacache"))}:${basePath}`);
  assert.equal(result.status, 2);
  const out = lines(result.stderr);
  assert.ok(out.includes("npm error code EACCES"), "npm's own output stays visible");
  assert.ok(out.includes(`TC_INSTALL_FAILED permission denied: npm cannot write ${join(cache, "_cacache")} (EACCES)`));
  assert.ok(out.includes(`TC_FIX run yourself: chmod u+rwx "${cache}"`));
});

test("an npm permission error outside the home points at npm's prefix and cache settings", { skip: windows }, () => {
  const dir = home();
  const result = install(dir, `${failingNpm(dir, "/usr/local/lib/node_modules")}:${basePath}`);
  assert.equal(result.status, 2);
  const out = lines(result.stderr);
  assert.ok(out.includes("TC_INSTALL_FAILED permission denied: npm cannot write /usr/local/lib/node_modules (EACCES)"));
  assert.ok(out.some((line) => line.startsWith("TC_CAUSE npm writes only under ") && line.includes("outside your home")));
  assert.ok(out.includes("TC_FIX run: npm config get prefix && npm config get cache  (both should be inside your home folder)"));
  assert.equal(out.some((line) => /sudo/.test(line)), false, "no sudo advice for an npm setting");
});

const link = (dir) => {
  const logged = [];
  const bin = join(dir, "cli-bin");
  writeFileSync(bin, "#!/bin/sh\necho 1.6.6\n", { mode: 0o700 });
  linkCommands({ bin, version: "1.6.6", source: "installed" }, { home: dir, platform: "linux", env: { PATH: `${join(dir, ".local/bin")}:/usr/bin:/bin` }, log: (line) => logged.push(line) });
  return logged;
};

test("an unwritable ~/.local/bin leaves the CLI usable and prints TC_NOT_LINKED with the fix, not a conflict", { skip }, () => {
  const dir = home();
  const bin = lock(join(dir, ".local/bin"));
  const logged = link(dir);
  assert.equal(logged[0], `TC_NOT_LINKED tinycloud permission ${join(bin, "tinycloud")}`);
  assert.ok(logged.includes(`TC_FIX run yourself: chmod u+rwx "${bin}"`));
  assert.ok(logged.includes("TC_FIX until then use the absolute path named on the TC_SELECTED line"));
  assert.equal(logged.some((line) => /TC_CONFLICT tinycloud/.test(line)), false);
  assert.deepEqual(readdirSync(bin), []);
});

test("a ~/.local that cannot hold a bin folder also ends in TC_NOT_LINKED instead of a thrown error", { skip }, () => {
  const dir = home();
  const blocked = lock(join(dir, ".local"));
  const logged = link(dir);
  assert.equal(logged[0], `TC_NOT_LINKED tinycloud,tc permission ${join(blocked, "bin")}`);
  assert.ok(logged.includes(`TC_FIX run yourself: chmod u+rwx "${blocked}"`));
});

test("a folder that belongs to another user gets the sudo chown fix, run by the owner and not an agent", { skip: windows }, () => {
  const out = permissionLines("/usr", { platform: "linux", env: {} });
  assert.match(out[0], /^TC_CAUSE \/usr belongs to another user/);
  assert.equal(out[1], 'TC_FIX run yourself in a terminal, not through an agent: sudo chown -R "$USER" "/usr"');
});

test("on Windows the fix is an icacls grant for the user", () => {
  const out = permissionLines("C:\\Users\\a\\.local", { platform: "win32", env: {} });
  assert.equal(out[0], "TC_CAUSE your Windows user cannot write to C:\\Users\\a\\.local");
  assert.match(out[1], /^TC_FIX in PowerShell run: icacls "C:\\Users\\a\\\.local" \/grant /);
});
