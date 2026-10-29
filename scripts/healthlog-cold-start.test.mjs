import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = mkdtempSync("/var/tmp/tc2174-cold.");
for (const key of ["HOME", "TC_HOME", "COURIER_HOME", "BUN_INSTALL_CACHE_DIR"]) process.env[key] = base;
for (const key of ["HOME", "TC_HOME", "COURIER_HOME", "BUN_INSTALL_CACHE_DIR"]) assert.equal(process.env[key], base);
writeFileSync(join(base, "temp-paths.txt"), base + "\n");
const env = { PATH: process.env.PATH, HOME: base, TC_HOME: base, COURIER_HOME: base,
  BUN_INSTALL_CACHE_DIR: base, TZ: "UTC", NODE_NO_WARNINGS: "1" };
after(() => rmSync(base, { recursive: true, force: true }));
const owner = "did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const space = owner.replace("did:", "tinycloud:") + ":applications";
const helper = join(root, "skills/tc-apps/healthlog-context.mjs");
const run = (bin, args, extra = {}) => spawnSync(bin, args, { env: { ...env, ...extra }, encoding: "utf8", timeout: 10000 });

const fresh = (prefix) => {
  const dir = mkdtempSync(join(base, prefix));
  writeFileSync(join(base, "temp-paths.txt"), readFileSync(join(base, "temp-paths.txt"), "utf8") + dir + "\n");
  return dir;
};
for (const [zone, expected] of [["Asia/Tokyo", "Asia/Tokyo"], ["UTC", "UTC"], ["Etc/GMT+5", "Etc/GMT+5"], ["Invalid/Zone", "UTC"]]) {
  test(`missing page and invalid saved timezone use host ${zone}, else UTC`, () => {
    const state = fresh("zone.");
    writeFileSync(join(state, "owner-did.txt"), owner);
    writeFileSync(join(state, "meal-space.txt"), space);
    writeFileSync(join(state, "owner-timezone.txt"), "Invalid/Zone");
    const cli = join(state, "cli");
    writeFileSync(cli, `#!/bin/sh\ncase "$*" in *context*) printf '%s\\n' '${JSON.stringify({ spaceId: space })}' ;; *) exit 4 ;; esac\n`, { mode: 0o755 });
    const result = run(process.execPath, [helper, cli, state], { TZ: zone });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(JSON.parse(result.stdout).timeZone, expected);
  });
}

test("fresh owner sign-in records binding before guarded Health Log write and read", () => {
  const home = fresh("fresh.");
  const state = join(home, "state");
  mkdirSync(state);
  const cli = join(home, "cli.mjs");
  // Auth is a bounded local fixture; SQL is a real on-disk database, not echoed parameters.
  writeFileSync(cli, `#!${process.execPath}
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const home = process.env.HOME, a = process.argv.slice(2), signed = join(home, 'signed');
if (a.includes('init')) { writeFileSync(signed, 'owner'); process.exit(0); }
if (a.includes('show')) { if (!existsSync(signed)) { console.error('PROFILE_NOT_FOUND'); process.exit(4); } process.exit(0); }
if (a.includes('context')) { if (!existsSync(signed)) process.exit(4); console.log(JSON.stringify({ ownerDid: '${owner}', spaceId: '${space}' })); process.exit(0); }
if (a.includes('grant')) { if (!existsSync(signed)) process.exit(3); console.log('{"approved":true}'); process.exit(0); }
if (a.includes('kv')) process.exit(4);
if (a.includes('sql')) {
  const db = new DatabaseSync(join(home, 'healthlog.sqlite'));
  db.exec("CREATE TABLE IF NOT EXISTS meal (id INTEGER PRIMARY KEY, op_id TEXT, day TEXT, slot TEXT, name TEXT, kcal INTEGER, source TEXT, logged_at TEXT)");
  const i = a.indexOf('sql'), params = JSON.parse(a[a.indexOf('--params') + 1]);
  if (a[i+1] === 'execute') db.prepare(a[i+2]).run(...params);
  else console.log(JSON.stringify(db.prepare(a[i+2]).all(...params)));
  db.close(); process.exit(0);
}
process.exit(2);
`, { mode: 0o755 });
  const isolated = { HOME: home, TC_HOME: home, TC_APPS_STATE: state, TC_BIN: cli };
  assert.equal(existsSync(join(state, "owner-did.txt")), false);
  assert.equal(existsSync(join(home, "signed")), false);
  writeFileSync(join(state, "meal-request.json"), "{}");
  const approval = run("sh", [join(root, "skills/tc-apps/owner-grant.sh"), "healthlog"], isolated);
  assert.equal(approval.status, 0, approval.stderr);
  assert.equal(readFileSync(join(state, "owner-did.txt"), "utf8").trim(), owner);
  assert.equal(readFileSync(join(state, "owner-timezone.txt"), "utf8").trim(), "UTC");
  // Import's saved delegate space is metadata, never a source for the owner binding.
  writeFileSync(join(state, "meal-space.txt"), space);
  const doc = readFileSync(join(root, "skills/tc-apps/TINY-APPS.md"), "utf8");
  const block = [...doc.matchAll(/```sh\n([\s\S]*?)\n```/g)].map(m => m[1]).find(b => b.includes("INSERT INTO meal"));
  const replacements = { "<TC_BIN>": cli, "<STATE>": state, "<HEALTHLOG_CONTEXT>": helper,
    "<MARK>": "coldtest", "<OP_ID>": "cold-meal", "<SLOT>": "breakfast", "<KCAL>": "350",
    "<the owner's meal name, exactly as typed (line breaks allowed)>": "Eggs and toast" };
  let command = block;
  for (const [key, value] of Object.entries(replacements)) command = command.replaceAll(key, value);
  const write = run("sh", ["-c", command], isolated);
  assert.equal(write.status, 0, write.stderr);
  const read = run(cli, ["--profile", "agent-meal", "sql", "query", "SELECT name, kcal, source FROM meal WHERE op_id = ?", "--params", '["cold-meal"]'], isolated);
  assert.equal(read.status, 0, read.stderr);
  assert.deepEqual(JSON.parse(read.stdout), [{ name: "Eggs and toast", kcal: 350, source: "agent" }]);
});
