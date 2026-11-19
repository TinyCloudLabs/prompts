// The one CLI lookup: written once, in setup/courier.md, and served from there inside every skill that resolves the CLI.
// Reads the built site (run `node scripts/build-site.mjs` first).
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-resolve-block-"));
after(() => rmSync(work, { recursive: true, force: true }));

const LOOKUP = /^TC="\$\{TC_BIN-[^\n]*\n\[ "\$\{TC_BIN\+x\}" = x \][^\n]*$/m;
const guide = readFileSync(join(root, "setup/courier.md"), "utf8");
const lookup = guide.match(LOOKUP)?.[0];
const served = (file) => readFileSync(join(root, "_site", file), "utf8");
const occurrences = (text) => text.split(lookup).length - 1;

test("the Courier guide and the Courier skill serve the same two lookup lines, once each", () => {
  assert.ok(lookup, "setup/courier.md has the two lines that find the CLI");
  for (const file of ["courier", "skills/courier/SKILL.md"]) {
    assert.equal(occurrences(served(file)), 1, `${file} carries the lookup once`);
  }
});

test("a guide without the lookup lines fails the build instead of serving skills without them", async () => {
  const dir = join(work, "no-lookup");
  cpSync(root, dir, { recursive: true, filter: (src) => src === root || dirname(src) !== root || ![".git", "_site", "node_modules"].includes(basename(src)) });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  writeFileSync(join(dir, "setup/courier.md"), guide.replace(lookup, "TC=somewhere-else"));
  await assert.rejects(
    promisify(execFile)(process.execPath, [join(dir, "scripts/build-site.mjs")], { env: { PATH: process.env.PATH, HOME: work } }),
    (error) => /the two lines that find the CLI/.test(error.stderr),
  );
});

// Runs the lookup itself and prints the path it chose. `path` is the whole PATH, so a missing `npm` is a missing `npm`.
const resolve = ({ tcBin, home, path }) => {
  const env = { HOME: home, PATH: path };
  if (tcBin !== undefined) env.TC_BIN = tcBin;
  const run = spawnSync("/bin/sh", ["-c", `${lookup}\nprintf '%s' "$TC"`], { env, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
};
const home = join(work, "home");
const privateInstall = join(home, ".local/share/tinycloud/cli/node_modules/.bin/tinycloud");
const emptyBin = join(work, "empty-bin");
const npmBin = join(work, "npm-bin");
mkdirSync(home, { recursive: true });
mkdirSync(emptyBin);
mkdirSync(npmBin);
writeFileSync(join(npmBin, "npm"), "#!/bin/sh\nprintf '%s\\n' /fake/prefix\n");
chmodSync(join(npmBin, "npm"), 0o755);

test("TC_BIN wins, even when it is empty", () => {
  assert.equal(resolve({ tcBin: "/chosen/tinycloud", home, path: npmBin }), "/chosen/tinycloud");
  assert.equal(resolve({ tcBin: "", home, path: npmBin }), "");
});

test("without TC_BIN the private install is used when it is there, and the global one when it is not", () => {
  assert.equal(resolve({ home, path: npmBin }), "/fake/prefix/bin/tinycloud");
  mkdirSync(dirname(privateInstall), { recursive: true });
  writeFileSync(privateInstall, "#!/bin/sh\n");
  chmodSync(privateInstall, 0o755);
  assert.equal(resolve({ home, path: npmBin }), privateInstall);
});

test("with no private install and no npm the private path is still what the next line reports", () => {
  rmSync(privateInstall);
  assert.equal(resolve({ home, path: emptyBin }), privateInstall);
});
