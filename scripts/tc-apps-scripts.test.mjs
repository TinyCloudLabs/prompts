import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// Every home and tool home lives in one /var/tmp directory; the process environment is pointed there
// before any file is written, and checked.
const base = mkdtempSync(join("/var/tmp", "TC-1943."));
for (const key of ["HOME", "TC_HOME", "COURIER_HOME", "BUN_INSTALL_CACHE_DIR"]) process.env[key] = base;
assert.ok(base.startsWith("/var/tmp/TC-1943."));
for (const key of ["HOME", "TC_HOME", "COURIER_HOME", "BUN_INSTALL_CACHE_DIR"]) assert.ok(process.env[key].startsWith("/var/tmp/TC-1943."), key);
after(() => rmSync(base, { recursive: true, force: true }));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = join(root, "skills/tc-apps");
let count = 0;
const fresh = () => {
  const dir = join(base, `h${++count}`);
  const work = join(dir, ".local/share/tinycloud/cli/node_modules/.bin");
  const state = join(dir, "state");
  mkdirSync(work, { recursive: true });
  mkdirSync(state, { recursive: true });
  return { dir, work, state };
};
const run = (args, env) => spawnSync(args[0], args.slice(1), {
  encoding: "utf8", input: "", timeout: 20000,
  env: { PATH: process.env.PATH, ...env },
});

const section = readFileSync(join(skill, "SKILL.md"), "utf8").split("## 1. Read the paths and the time")[1];
const firstBlock = section.match(/```sh\n([\s\S]*?)\n```/)[1];

test("SKILL §1 names the CLI that onboarding installs, then reports unset; TC_BIN wins", () => {
  const first = (setup, extra = {}) => {
    const h = fresh();
    setup(h);
    const out = run(["sh", "-c", firstBlock], { HOME: h.dir, ...extra });
    assert.equal(out.status, 0, out.stderr);
    return { line: out.stdout.split("\n")[0], h };
  };
  const installed = first(({ work }) => writeFileSync(join(work, "tinycloud"), ""));
  assert.equal(installed.line, join(installed.h.work, "tinycloud"));
  assert.equal(first(() => {}).line, "TC_BIN is unset");
  assert.equal(first(({ work }) => writeFileSync(join(work, "tinycloud"), ""), { TC_BIN: "/opt/own/cli" }).line, "/opt/own/cli");
  const empty = first(({ work }) => writeFileSync(join(work, "tinycloud"), ""), { TC_BIN: "" });
  assert.equal(empty.line, join(empty.h.work, "tinycloud"));
});

test("SKILL §1 prints TC_APPS_STATE if set, else the default state folder", () => {
  const second = (extra = {}) => {
    const h = fresh();
    const out = run(["sh", "-c", firstBlock], { HOME: h.dir, ...extra });
    assert.equal(out.status, 0, out.stderr);
    return { line: out.stdout.split("\n")[1], h };
  };
  const unset = second();
  assert.equal(unset.line, join(unset.h.dir, ".local/state/tc-apps"));
  const empty = second({ TC_APPS_STATE: "" });
  assert.equal(empty.line, join(empty.h.dir, ".local/state/tc-apps"));
  assert.equal(second({ TC_APPS_STATE: "/opt/own/state" }).line, "/opt/own/state");
});

// Hermes installs a skill from its SKILL.md URL only if its skills guard passes the file. The guard
// blocks `printenv` (dump_all_env) and a curl command piped into a shell (curl_pipe_shell), even in prose.
test("SKILL.md has no line that Hermes' skills guard blocks: no printenv, no curl piped into a shell", () => {
  const dumpEnv = /printenv|(?<![A-Za-z0-9_])env\s*\|(?!\|)(?!\s*[{(])/;
  const curlShell = /curl\s+[^|\s][^\n]*\|\s*(?:sudo\s+(?:-\S+\s+)*)?(?:ba|z|da|k|c|tc|fi)?sh\b/;
  const lines = readFileSync(join(skill, "SKILL.md"), "utf8").split("\n");
  const flagged = lines.flatMap((line, i) => (dumpEnv.test(line) || curlShell.test(line) ? [`${i + 1}: ${line}`] : []));
  assert.deepEqual(flagged, []);
});

import { readdirSync } from "node:fs";
// ---- migrate.sh: agent-run copy of one generic tiny app from `default` to its own `applications` root ----
// A stand-in CLI keeps both spaces in one JSON file under the test home, records every call, and can be told to
// misbehave (changed read-back, partial failure, late edits on the source).
const standInCli = String.raw`#!/usr/bin/env node
const fs = require("fs");
const home = process.env.HOME;
const kvPath = home + "/kv-state.json", ctlPath = home + "/control.json", putsPath = home + "/put-count";
const argv = process.argv.slice(2);
const opts = {}, pos = [];
const withValue = new Set(["--profile", "--space", "--prefix", "--file", "--if-none-match", "--limit", "--cursor", "-o", "--output"]);
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (withValue.has(a)) opts[a] = argv[++i]; else if (a.startsWith("--")) opts[a] = true; else pos.push(a); }
fs.appendFileSync(home + "/calls.log", JSON.stringify({ profile: opts["--profile"], argv }) + "\n");
const fail = (code, status) => { process.stderr.write(JSON.stringify({ error: { code } }) + "\n"); process.exit(status); };
const ctl = fs.existsSync(ctlPath) ? JSON.parse(fs.readFileSync(ctlPath, "utf8")) : {};
const kv = JSON.parse(fs.readFileSync(kvPath, "utf8"));
const save = () => fs.writeFileSync(kvPath, JSON.stringify(kv));
// The skill never passes --profile: the CLI's default profile, or TC_PROFILE, is the onboarded one.
const profile = opts["--profile"] || process.env.TC_PROFILE || "default", space = opts["--space"] || "default";
if ((ctl.missingProfiles || []).includes(profile)) fail("PROFILE_NOT_FOUND", 3);
const allowed = () => !(ctl.deniedSpaces || []).includes(space);
if (pos[0] !== "kv") fail("USAGE_ERROR", 2);
const op = pos[1], s = kv[space] || (kv[space] = {});
if (op === "list") {
  const prefix = opts["--prefix"] || "";
  if (!allowed("list", prefix)) fail("PERMISSION_DENIED", 5);
  const keys = Object.keys(s).filter((k) => k.startsWith(prefix)).sort();
  console.log(JSON.stringify({ keys, count: keys.length, prefix }));
} else if (op === "get") {
  const key = pos[2];
  if (!allowed("get", key)) fail("PERMISSION_DENIED", 5);
  if (!(key in s)) fail("NOT_FOUND", 4);
  const value = space === "applications" && ctl.corruptRead && ctl.corruptRead[key] !== undefined ? ctl.corruptRead[key] : s[key];
  if (opts["--raw"]) process.stdout.write(value); else console.log(JSON.stringify({ key, data: value }));
} else if (op === "put") {
  const key = pos[2];
  if (!allowed("put", key)) fail("PERMISSION_DENIED", 5);
  if (ctl.failPut === key) fail("NETWORK_ERROR", 7);
  if (opts["--if-none-match"] === "*" && key in s) fail("KV_ALREADY_EXISTS", 5);
  s[key] = fs.readFileSync(opts["--file"], "utf8");
  const n = (fs.existsSync(putsPath) ? Number(fs.readFileSync(putsPath, "utf8")) : 0) + 1;
  fs.writeFileSync(putsPath, String(n));
  if (ctl.late && n === ctl.late.afterPuts) kv.default[ctl.late.key] = ctl.late.value;
  save();
  console.log(JSON.stringify({ key, written: true }));
} else if (op === "delete") {
  delete s[pos[2]];
  save();
  console.log(JSON.stringify({ key: pos[2], deleted: true }));
} else fail("USAGE_ERROR", 2);
`;

const migrate = join(skill, "migrate.sh");
const OLD = "xyz.tinycloud.agent-data";
const NEW = (slug) => `xyz.tinycloud.tinyapps.${slug}`;
const weight = (kg) => JSON.stringify({ v: 1, at: "2026-10-06", data: { kg }, by: "codex" });
const sourceRecords = () => ({
  [`${OLD}/catalog/fitness`]: JSON.stringify({ app: "fitness", title: "Fitness", about: "Body weight.", created: "2026-10-06", by: "codex" }),
  [`${OLD}/catalog/fitness/weight`]: JSON.stringify({ app: "fitness", kind: "weight", shape: "log", per: "day", v: 1, fields: { kg: "number" } }),
  [`${OLD}/catalog/fitness-extra`]: JSON.stringify({ app: "fitness-extra", title: "Other" }),
  [`${OLD}/catalog/todos`]: JSON.stringify({ app: "todos", title: "Todos" }),
  [`${OLD}/fitness/weight/2026-10/2026-10-06`]: weight(80.5),
  [`${OLD}/fitness/weight/2026-10/2026-10-07`]: weight(80.1),
  [`${OLD}/fitness-extra/x/2026-10/a`]: "{}",
});
const FITNESS_KEYS = [
  `${NEW("fitness")}/catalog`,
  `${NEW("fitness")}/catalog/weight`,
  `${NEW("fitness")}/weight/2026-10/2026-10-06`,
  `${NEW("fitness")}/weight/2026-10/2026-10-07`,
];
const world = (applications = {}) => {
  const h = fresh();
  h.bin = join(h.dir, "stand-in-tinycloud");
  writeFileSync(h.bin, standInCli, { mode: 0o755 });
  writeFileSync(join(h.dir, "kv-state.json"), JSON.stringify({ default: sourceRecords(), applications }));
  return h;
};
const store = (h) => JSON.parse(readFileSync(join(h.dir, "kv-state.json"), "utf8"));
const control = (h, c) => writeFileSync(join(h.dir, "control.json"), JSON.stringify(c));
const cliCalls = (h) => (existsSync(join(h.dir, "calls.log")) ? readFileSync(join(h.dir, "calls.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
const runMigrate = (h, args, env = {}) => run(["sh", migrate, ...args], { HOME: h.dir, TC_BIN: h.bin, TC_APPS_STATE: h.state, ...env });
const receiptPath = (h, slug) => join(h.state, "migration", `${slug}.receipt.json`);
const newKeys = (h, slug) => Object.keys(store(h).applications).filter((k) => k.startsWith(`${NEW(slug)}/`)).sort();
const notSwitched = (h, out) => {
  assert.notEqual(out.status, 0, out.stdout);
  assert.match(out.stderr + out.stdout, /NOT SWITCHED/);
  assert.equal(existsSync(receiptPath(h, "fitness")), false);
  assert.equal(`xyz.tinycloud.tinyapps.catalog/fitness/entry` in store(h).applications, false);
  assert.deepEqual(Object.keys(store(h).default).sort(), Object.keys(sourceRecords()).sort(), "the old records are untouched");
};

test("migrate.sh --dry-run prints the plan and writes nothing, locally or remotely", () => {
  const h = world();
  const before = readFileSync(join(h.dir, "kv-state.json"), "utf8");
  const out = runMigrate(h, ["--dry-run", "fitness"]);
  assert.equal(out.status, 0, out.stderr + out.stdout);
  assert.match(out.stdout, /xyz\.tinycloud\.tinyapps\.fitness/);
  assert.match(out.stdout, /4 records/);
  assert.match(out.stdout, /nothing was written/i);
  assert.equal(readFileSync(join(h.dir, "kv-state.json"), "utf8"), before);
  assert.deepEqual(cliCalls(h).filter((c) => c.argv[1] !== "list"), []);
  assert.deepEqual(readdirSync(h.state), []);
});

test("migrate.sh --dry-run without an app lists the old catalog's apps", () => {
  const h = world();
  const out = runMigrate(h, ["--dry-run"]);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(out.stdout.split("\n").filter((l) => /^app: /.test(l)), ["app: fitness", "app: fitness-extra", "app: todos"]);
});

test("migrate.sh copies one app, reads it back, re-checks the source and only then records the move", () => {
  const h = world({ "xyz.tinycloud.sample.healthlog/knowledge/index.md": "# pinned app" });
  const sourceBefore = JSON.stringify(store(h).default);
  const out = runMigrate(h, ["fitness"]);
  assert.equal(out.status, 0, out.stderr + out.stdout);
  const after = store(h);
  assert.deepEqual(newKeys(h, "fitness"), [...FITNESS_KEYS].sort());
  const from = {
    [FITNESS_KEYS[0]]: `${OLD}/catalog/fitness`,
    [FITNESS_KEYS[1]]: `${OLD}/catalog/fitness/weight`,
    [FITNESS_KEYS[2]]: `${OLD}/fitness/weight/2026-10/2026-10-06`,
    [FITNESS_KEYS[3]]: `${OLD}/fitness/weight/2026-10/2026-10-07`,
  };
  for (const key of FITNESS_KEYS) assert.equal(after.applications[key], after.default[from[key]], key);
  assert.deepEqual(JSON.parse(after.applications["xyz.tinycloud.tinyapps.catalog/fitness/entry"]), { v: 1, app: "fitness", id: NEW("fitness"), title: "Fitness" });
  assert.equal(after.applications["xyz.tinycloud.sample.healthlog/knowledge/index.md"], "# pinned app");
  assert.equal(JSON.stringify(after.default), sourceBefore, "the old records are untouched");
  assert.equal(Object.keys(after.applications).some((k) => k.includes("fitness-extra") || k.includes("todos")), false);
  const receipt = JSON.parse(readFileSync(receiptPath(h, "fitness"), "utf8"));
  assert.equal(receipt.verified, true);
  assert.equal(receipt.id, NEW("fitness"));
  assert.equal(receipt.counts.total, 4);
  assert.match(receipt.digest, /^[0-9a-f]{64}$/);
});

test("migrate.sh never deletes or writes the old place and every new key is created, never overwritten", () => {
  const h = world();
  assert.equal(runMigrate(h, ["fitness"]).status, 0);
  const calls = cliCalls(h);
  assert.equal(calls.some((c) => c.argv.includes("delete") || c.argv.includes("del")), false);
  const puts = calls.filter((c) => c.argv[1] === "put");
  assert.equal(puts.length, FITNESS_KEYS.length + 1);
  for (const c of puts) {
    assert.equal(c.profile, undefined, "never passes --profile");
    assert.equal(c.argv[c.argv.indexOf("--space") + 1], "applications");
    assert.equal(c.argv[c.argv.indexOf("--if-none-match") + 1], "*", c.argv.join(" "));
  }
  for (const c of calls) assert.equal(c.profile, undefined, c.argv.join(" "));
  for (const c of calls.filter((c) => c.argv[c.argv.indexOf("--space") + 1] === "default")) assert.equal(c.argv[1] === "list" || c.argv[1] === "get", true, c.argv.join(" "));
});

test("migrate.sh refuses to switch when a record reads back different from what was sent", () => {
  const h = world();
  control(h, { corruptRead: { [`${NEW("fitness")}/weight/2026-10/2026-10-07`]: weight(99) } });
  notSwitched(h, runMigrate(h, ["fitness"]));
});

test("migrate.sh refuses to switch when the new place already holds a different record, and does not overwrite it", () => {
  const key = `${NEW("fitness")}/weight/2026-10/2026-10-06`;
  const h = world({ [key]: weight(70) });
  notSwitched(h, runMigrate(h, ["fitness"]));
  assert.equal(store(h).applications[key], weight(70));
});

test("migrate.sh refuses to switch when the new place holds a record the old place lacks", () => {
  const h = world({ [`${NEW("fitness")}/weight/2026-10/2026-10-09`]: weight(79) });
  notSwitched(h, runMigrate(h, ["fitness"]));
});

test("migrate.sh refuses to switch when a record is added to the old place during the copy", () => {
  const h = world();
  control(h, { late: { afterPuts: 2, key: `${OLD}/fitness/weight/2026-10/2026-10-08`, value: weight(79.9) } });
  const out = runMigrate(h, ["fitness"]);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr + out.stdout, /NOT SWITCHED/);
  assert.equal(existsSync(receiptPath(h, "fitness")), false);
  assert.equal("xyz.tinycloud.tinyapps.catalog/fitness/entry" in store(h).applications, false);
});

test("migrate.sh refuses to switch when a record in the old place changes during the copy", () => {
  const h = world();
  control(h, { late: { afterPuts: 2, key: `${OLD}/fitness/weight/2026-10/2026-10-06`, value: weight(81) } });
  const out = runMigrate(h, ["fitness"]);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr + out.stdout, /NOT SWITCHED/);
  assert.equal(existsSync(receiptPath(h, "fitness")), false);
  assert.equal("xyz.tinycloud.tinyapps.catalog/fitness/entry" in store(h).applications, false);
});

test("migrate.sh resumes after a failed write: copied records are recognised, nothing is overwritten, and it then switches", () => {
  const h = world();
  control(h, { failPut: FITNESS_KEYS[2] });
  notSwitched(h, runMigrate(h, ["fitness"]));
  assert.deepEqual(newKeys(h, "fitness"), FITNESS_KEYS.slice(0, 2));
  control(h, {});
  const again = runMigrate(h, ["fitness"]);
  assert.equal(again.status, 0, again.stderr + again.stdout);
  assert.deepEqual(newKeys(h, "fitness"), [...FITNESS_KEYS].sort());
  const first = JSON.parse(readFileSync(receiptPath(h, "fitness"), "utf8"));
  const third = runMigrate(h, ["fitness"]);
  assert.equal(third.status, 0, third.stderr + third.stdout);
  assert.equal(JSON.parse(readFileSync(receiptPath(h, "fitness"), "utf8")).digest, first.digest);
});

test("migrate.sh stops before writing when this computer has no sign-in for the new place", () => {
  const h = world();
  control(h, { deniedSpaces: ["applications"] });
  const out = runMigrate(h, ["fitness"]);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr + out.stdout, /NOT SWITCHED/);
  assert.match(out.stderr + out.stdout, /agents\.tinycloud\.xyz\/onboarding/);
  assert.equal(cliCalls(h).some((c) => c.argv[1] === "put"), false);
  assert.deepEqual(newKeys(h, "fitness"), []);
});

test("migrate.sh refuses a kind whose name would collide with the app's catalog folder", () => {
  const h = world();
  const data = store(h);
  data.default[`${OLD}/fitness/catalog/2026-10/x`] = "{}";
  writeFileSync(join(h.dir, "kv-state.json"), JSON.stringify(data));
  const out = runMigrate(h, ["fitness"]);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr + out.stdout, /NOT SWITCHED/);
  assert.equal(cliCalls(h).some((c) => c.argv[1] === "put"), false);
});

test("migrate.sh with no old records for the app records nothing and switches nothing", () => {
  const h = world();
  const out = runMigrate(h, ["books"]);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /nothing to migrate/i);
  assert.equal(cliCalls(h).some((c) => c.argv[1] === "put"), false);
  assert.equal(existsSync(receiptPath(h, "books")), false);
});

test("migrate.sh rejects app names that are not a plain slug or are reserved, before any CLI call", () => {
  const h = world();
  for (const slug of ["Fitness", "../x", "a b", "-x", "1x", "catalog", "index-stale", "healthlog", "recipes"]) {
    const out = runMigrate(h, [slug]);
    assert.equal(out.status, 2, `${slug}: ${out.stderr}`);
  }
  assert.equal(runMigrate(h, []).status, 2);
  assert.equal(cliCalls(h).length, 0);
});

test("migrate.sh has one write command, it creates only, and it has no delete command", () => {
  const text = readFileSync(migrate, "utf8");
  const writes = text.split("\n").filter((l) => /\bkv put\b/.test(l));
  assert.equal(writes.length, 1);
  assert.match(writes[0], /--if-none-match '\*'/);
  assert.equal(/\bkv (delete|del)\b|delegation revoke|\bsql\b/.test(text), false);
});

// ---- layout.sh: an app with old records and no verified move stays in the old layout ----
const layout = join(skill, "layout.sh");
const runLayout = (h, slug, env = {}) => run(["sh", layout, slug], { HOME: h.dir, TC_BIN: h.bin, TC_APPS_STATE: h.state, ...env });
const writeReceipt = (h, slug, receipt) => {
  mkdirSync(join(h.state, "migration"), { recursive: true });
  writeFileSync(receiptPath(h, slug), JSON.stringify(receipt));
};

test("layout.sh: old records and no receipt stay in the old layout, with no new grant, profile or write", () => {
  const h = world();
  const out = runLayout(h, "fitness");
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), "legacy");
  const calls = cliCalls(h);
  assert.deepEqual(calls.map((c) => c.argv.slice(0, 2).join(" ")), ["kv list"]);
  assert.equal(calls[0].profile, undefined);
  assert.equal(calls[0].argv[calls[0].argv.indexOf("--space") + 1], "default");
  assert.deepEqual(readdirSync(h.state), []);
});

test("layout.sh: a verified receipt for the app switches it to the new layout without asking the network", () => {
  const h = world();
  writeReceipt(h, "fitness", { v: 1, app: "fitness", id: NEW("fitness"), verified: true });
  const out = runLayout(h, "fitness");
  assert.equal(out.stdout.trim(), "new");
  assert.equal(cliCalls(h).length, 0);
});

test("layout.sh: an app with no old records starts in the new layout", () => {
  const h = world();
  const out = runLayout(h, "books");
  assert.equal(out.stdout.trim(), "new");
  assert.deepEqual(cliCalls(h).map((c) => c.argv.slice(0, 2).join(" ")), ["kv list"]);
});

test("layout.sh: a successful migrate.sh without its receipt is still the old layout, and the receipt switches it", () => {
  const h = world();
  assert.equal(runMigrate(h, ["fitness"]).status, 0);
  assert.equal(runLayout(h, "fitness").stdout.trim(), "new");
  const receipt = readFileSync(receiptPath(h, "fitness"), "utf8");
  rmSync(receiptPath(h, "fitness"));
  assert.equal(runLayout(h, "fitness").stdout.trim(), "legacy");
  writeFileSync(receiptPath(h, "fitness"), receipt);
  assert.equal(runLayout(h, "fitness").stdout.trim(), "new");
});

test("layout.sh: a receipt that is unverified, damaged or for another app does not switch the app", () => {
  for (const receipt of [{ app: "fitness", verified: false }, { app: "todos", verified: true }, { app: "fitness" }]) {
    const h = world();
    writeReceipt(h, "fitness", receipt);
    assert.equal(runLayout(h, "fitness").stdout.trim(), "legacy", JSON.stringify(receipt));
  }
  const h = world();
  mkdirSync(join(h.state, "migration"), { recursive: true });
  writeFileSync(receiptPath(h, "fitness"), "{not json");
  assert.equal(runLayout(h, "fitness").stdout.trim(), "legacy");
});

test("layout.sh: with no usable earlier sign-in it says ask, and with another failure it says check-failed", () => {
  const h = world();
  control(h, { deniedSpaces: ["default"] });
  assert.equal(runLayout(h, "fitness").stdout.trim(), "ask");
  const g = world();
  const broken = join(g.dir, "broken-tinycloud");
  writeFileSync(broken, "#!/bin/sh\necho '{\"error\":{\"code\":\"NETWORK_ERROR\"}}' >&2\nexit 7\n", { mode: 0o755 });
  assert.equal(runLayout(g, "fitness", { TC_BIN: broken }).stdout.trim(), "check-failed");
});

test("layout.sh rejects a name that is not a plain slug or is reserved, before any CLI call", () => {
  const h = world();
  for (const slug of ["Fitness", "../x", "-x", "healthlog", "catalog", ""]) assert.equal(runLayout(h, slug).status, 2, slug);
  assert.equal(cliCalls(h).length, 0);
});

// ---- layout.sh and migrate.sh: paged catalog, missing jq, local work copy, tab in a key ----
test("layout.sh follows the old catalog's pages: an app whose key is on a later page is legacy", () => {
  const h = world();
  const paged = join(h.dir, "paged-tinycloud");
  writeFileSync(paged, `#!/bin/sh
case " $* " in
  *" --all "*) echo '{"keys":["${OLD}/catalog/fitness","${OLD}/catalog/todos"],"count":2}' ;;
  *) echo '{"keys":["${OLD}/catalog/fitness"],"count":1,"truncated":true,"nextCursor":"c1"}' ;;
esac
`, { mode: 0o755 });
  assert.equal(runLayout(h, "todos", { TC_BIN: paged }).stdout.trim(), "legacy");
  assert.equal(runLayout(h, "books", { TC_BIN: paged }).stdout.trim(), "new");
});

test("layout.sh and migrate.sh without jq say so and exit 3 before any CLI call or write", () => {
  const h = world();
  const empty = join(h.dir, "empty-bin");
  mkdirSync(empty);
  for (const args of [[layout, "fitness"], [migrate, "--dry-run", "fitness"], [migrate, "fitness"]]) {
    const out = spawnSync("/bin/sh", args, { encoding: "utf8", timeout: 20000, env: { PATH: empty, HOME: h.dir, TC_BIN: h.bin, TC_APPS_STATE: h.state } });
    assert.equal(out.status, 3, args.join(" "));
    assert.match(out.stderr, /jq is needed/);
    assert.equal(out.stdout, "");
  }
  assert.equal(cliCalls(h).length, 0);
  assert.deepEqual(readdirSync(h.state), []);
});

test("migrate.sh removes its private copy of the records after a verified move and keeps it after a refusal", () => {
  const ok = world();
  const out = runMigrate(ok, ["fitness"]);
  assert.equal(out.status, 0, out.stderr + out.stdout);
  assert.equal(existsSync(join(ok.state, "migration", "fitness.work")), false);
  assert.equal(existsSync(receiptPath(ok, "fitness")), true);
  assert.ok(out.stdout.includes(`Receipt: ${receiptPath(ok, "fitness")}`), out.stdout);
  const bad = world();
  control(bad, { corruptRead: { [`${NEW("fitness")}/weight/2026-10/2026-10-07`]: weight(99) } });
  assert.notEqual(runMigrate(bad, ["fitness"]).status, 0);
  assert.equal(existsSync(join(bad.state, "migration", "fitness.work", "src")), true);
});

test("migrate.sh says plainly that a key contains a tab and changes nothing", () => {
  const h = world();
  const data = store(h);
  data.default[`${OLD}/fitness/weight/2026-10/a\tb`] = "{}";
  writeFileSync(join(h.dir, "kv-state.json"), JSON.stringify(data));
  for (const args of [["fitness"], ["--dry-run", "fitness"]]) {
    const out = runMigrate(h, args);
    assert.notEqual(out.status, 0, args.join(" "));
    assert.match(out.stderr, /a key contains a tab; nothing was changed/);
  }
  assert.equal(cliCalls(h).some((c) => c.argv[1] === "put"), false);
  assert.deepEqual(readdirSync(h.state), []);
});
