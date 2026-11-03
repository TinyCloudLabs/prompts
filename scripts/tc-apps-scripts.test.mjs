import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// Every home and tool home lives in one /var/tmp directory; the process environment is pointed there
// before any file is written, and checked.
// macOS /var is a symlink to /private/var; the /agent helper refuses linked paths.
const base = realpathSync(mkdtempSync(join("/var/tmp", "TC-1943.")));
for (const key of ["HOME", "TC_HOME", "COURIER_HOME", "BUN_INSTALL_CACHE_DIR"]) process.env[key] = base;
const underTestRoot = (path) => /^(\/private)?\/var\/tmp\/TC-1943\./.test(path);
assert.ok(underTestRoot(base));
for (const key of ["HOME", "TC_HOME", "COURIER_HOME", "BUN_INSTALL_CACHE_DIR"]) assert.ok(underTestRoot(process.env[key]), key);
after(() => rmSync(base, { recursive: true, force: true }));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = join(root, "skills/tc-apps");
let count = 0;
const fresh = () => {
  const dir = join(base, `h${++count}`);
  const work = join(dir, ".local/share/tc-apps");
  const state = join(dir, "state");
  mkdirSync(work, { recursive: true });
  mkdirSync(state, { recursive: true });
  return { dir, work, state };
};
const run = (args, env) => spawnSync(args[0], args.slice(1), {
  encoding: "utf8", input: "", timeout: 20000,
  env: { PATH: process.env.PATH, ...env },
});
test("owner-grant uses an explicit owner profile when the CLI default is an unsigned agent profile", () => {
  const h = fresh();
  const cliHome = join(h.dir, ".tinycloud");
  mkdirSync(cliHome, { recursive: true });
  writeFileSync(join(cliHome, "config.json"), JSON.stringify({ defaultProfile: "linear-agent" }));
  writeFileSync(join(cliHome, "owner-grant-state.json"), JSON.stringify({ profiles: ["linear-agent"], sessions: [] }));
  writeFileSync(join(h.state, "meal-request.json"), "{}");
  const cli = join(h.dir, "tinycloud");
  writeFileSync(cli, String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const home = process.env.TC_HOME || process.env.HOME;
const config = JSON.parse(fs.readFileSync(path.join(home, ".tinycloud/config.json"), "utf8"));
const statePath = path.join(home, ".tinycloud/owner-grant-state.json");
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const argv = process.argv.slice(2);
const explicitProfile = argv[0] === "--profile" ? argv[1] : undefined;
const profile = explicitProfile || config.defaultProfile || "default";
const args = explicitProfile ? argv.slice(2) : argv;
fs.appendFileSync(path.join(home, "owner-grant-calls.jsonl"), JSON.stringify({ argv, profile }) + "\n");
const fail = (code, status) => { process.stderr.write(JSON.stringify({ error: { code } }) + "\n"); process.exit(status); };
if (args[0] === "profile" && args[1] === "show") {
  if (!state.profiles.includes(profile)) fail("PROFILE_NOT_FOUND", 4);
  console.log(JSON.stringify({ profile }));
} else if (args[0] === "init") {
  const name = args[args.indexOf("--name") + 1];
  if (name !== "owner" || !args.includes("--paste")) fail("UNEXPECTED_INIT", 2);
  state.profiles.push(name);
  state.sessions.push(name);
  fs.writeFileSync(statePath, JSON.stringify(state));
} else if (args[0] === "context") {
  if (!state.sessions.includes(profile)) fail("AUTH_REQUIRED", 3);
  console.log(JSON.stringify({ ownerDid: "did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }));
} else if (args[0] === "auth" && args[1] === "grant") {
  if (!state.sessions.includes(profile)) fail("AUTH_REQUIRED", 3);
  process.stdout.write("{\"ok\":true}\n");
} else fail("UNEXPECTED_COMMAND", 2);
`, { mode: 0o755 });
  chmodSync(cli, 0o755);

  const out = run(["sh", join(skill, "owner-grant.sh"), "healthlog"], {
    HOME: h.dir,
    TC_HOME: h.dir,
    TC_APPS_STATE: h.state,
    TC_BIN: cli,
  });
  assert.equal(out.status, 0, out.stderr + out.stdout);
  const calls = readFileSync(join(h.dir, "owner-grant-calls.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(calls, [
    { argv: ["--profile", "owner", "profile", "show"], profile: "owner" },
    { argv: ["init", "--name", "owner", "--paste"], profile: "linear-agent" },
    { argv: ["--profile", "owner", "context", "--json"], profile: "owner" },
    { argv: ["--profile", "owner", "auth", "grant", join(h.state, "meal-request.json")], profile: "owner" },
  ]);
  assert.equal(JSON.parse(readFileSync(join(cliHome, "config.json"), "utf8")).defaultProfile, "linear-agent");

  const statePath = join(cliHome, "owner-grant-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.sessions = [];
  writeFileSync(statePath, JSON.stringify(state));
  const renewal = run(["sh", join(skill, "owner-grant.sh"), "healthlog"], {
    HOME: h.dir,
    TC_HOME: h.dir,
    TC_APPS_STATE: h.state,
    TC_BIN: cli,
  });
  assert.equal(renewal.status, 1);
  assert.ok(renewal.stderr.includes("The agent must run owner auth login --method openkey --paste in an interactive session"), renewal.stderr);
  assert.doesNotMatch(renewal.stderr, /linear-agent/);
  assert.ok(!renewal.stderr.includes(`${cli} auth login --paste`), renewal.stderr);
});


import { readdirSync } from "node:fs";
// ---- migrate.sh: owner-device copy of one generic tiny app from `default` to its own `applications` root ----
// A stand-in CLI keeps both spaces in one JSON file under the test home, records every call, and can be told to
// misbehave (changed read-back, partial failure, late edits on the source). Its `status` and `context` describe one
// onboarded owner profile, `owner`, that can read the owner's `applications` space, as app-context.mjs expects.
const standInCli = String.raw`#!/usr/bin/env node
const fs = require("fs");
const home = process.env.HOME;
const kvPath = home + "/kv-state.json", ctlPath = home + "/control.json", putsPath = home + "/put-count";
const OWNER = "did:pkh:eip155:1:0x" + "a".repeat(40), HOST = "https://node.test", APPS = "tinycloud:" + OWNER.slice(4) + ":applications";
const argv = process.argv.slice(2);
const opts = {}, pos = [];
const withValue = new Set(["--profile", "--host", "--space", "--prefix", "--file", "--if-none-match", "--limit", "--cursor", "-o", "--output"]);
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (withValue.has(a)) opts[a] = argv[++i]; else if (a.startsWith("--")) opts[a] = true; else pos.push(a); }
fs.appendFileSync(home + "/calls.log", JSON.stringify({ profile: opts["--profile"], argv }) + "\n");
const fail = (code, status, message) => { process.stderr.write(JSON.stringify({ error: { code, ...(message ? { message } : {}) } }, null, 2) + "\n"); process.exit(status); };
const ctl = fs.existsSync(ctlPath) ? JSON.parse(fs.readFileSync(ctlPath, "utf8")) : {};
const ownerProfile = { name: "owner", ownerDid: OWNER, host: HOST, authenticated: true, delegations: [],
  session: { present: true, expired: false, expiresAt: "2099-01-01T00:00:00Z", permissions: [{ service: "tinycloud.kv", space: APPS, path: "", actions: ["tinycloud.kv/get", "tinycloud.kv/list"] }] } };
if (pos[0] === "status") {
  console.log(JSON.stringify(ctl.status || { activeProfile: "owner", profiles: [ownerProfile] }));
  process.exit(0);
}
if (pos[0] === "context") {
  if (ctl.contextError) fail(ctl.contextError.code, ctl.contextError.status);
  console.log(JSON.stringify({ profile: opts["--profile"], ownerDid: OWNER, host: HOST, spaceId: APPS, session: { state: "present" } }));
  process.exit(0);
}
const kv = JSON.parse(fs.readFileSync(kvPath, "utf8"));
const save = () => fs.writeFileSync(kvPath, JSON.stringify(kv));
const profile = opts["--profile"] || "", space = opts["--space"] === APPS ? "applications" : opts["--space"] || "default";
if ((ctl.missingProfiles || []).includes(profile) || !/^(agent-data|default|owner|tinyapp-[a-z0-9-]+)$/.test(profile)) fail("PROFILE_NOT_FOUND", 3);
const slug = (profile.match(/^tinyapp-(.*)$/) || [])[1];
const allowed = (op, key) => {
  if (profile === "owner") return space === "applications" && (op === "get" || op === "list");
  if (!slug) return space === "default";
  if (space !== "applications") return false;
  const own = "xyz.tinycloud.tinyapps." + slug + "/", cat = "xyz.tinycloud.tinyapps.catalog/";
  if (key.startsWith(own)) return true;
  if (op === "get" || op === "list") return key.startsWith(cat);
  return op === "put" && key.startsWith(cat + slug + "/");
};
if (pos[0] !== "kv") fail("USAGE_ERROR", 2);
const op = pos[1], s = kv[space] || (kv[space] = {});
if (op === "list") {
  const prefix = opts["--prefix"] || "";
  if (!allowed("list", prefix)) fail("PERMISSION_DENIED", 5);
  const keys = Object.keys(s).filter((k) => k.startsWith(prefix)).sort();
  console.log(JSON.stringify({ keys, count: keys.length, prefix }));
} else if (op === "get") {
  const key = pos[2];
  if (ctl.getError && ctl.getError.key === key) fail(ctl.getError.code, ctl.getError.status, ctl.getError.message);
  if (!allowed("get", key)) fail("PERMISSION_DENIED", 5);
  // The real CLI 1.6.0 turns the node's KV_NOT_FOUND into this exact error.
  if (!(key in s)) fail("NOT_FOUND", 4, 'Key "' + key + '" not found');
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
    assert.equal(c.profile, "tinyapp-fitness");
    assert.equal(c.argv[c.argv.indexOf("--space") + 1], "applications");
    assert.equal(c.argv[c.argv.indexOf("--if-none-match") + 1], "*", c.argv.join(" "));
  }
  for (const c of calls.filter((c) => c.profile === "agent-data")) assert.equal(c.argv[1] === "list" || c.argv[1] === "get", true, c.argv.join(" "));
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

test("migrate.sh stops before writing when the app's profile has no approval yet", () => {
  const h = world();
  control(h, { missingProfiles: ["tinyapp-fitness"] });
  const out = runMigrate(h, ["fitness"]);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr + out.stdout, /NOT SWITCHED/);
  assert.match(out.stderr + out.stdout, /approv/i);
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

// ---- layout.sh: receipt, then the discovery entry in `applications`, then the old catalog ----
const layout = join(skill, "layout.sh");
const runLayout = (h, slug, env = {}) => run(["sh", layout, slug], { HOME: h.dir, TC_BIN: h.bin, TC_APPS_STATE: h.state, ...env });
const writeReceipt = (h, slug, receipt) => {
  mkdirSync(join(h.state, "migration"), { recursive: true });
  writeFileSync(receiptPath(h, slug), JSON.stringify(receipt));
};
const OWNER_DID = `did:pkh:eip155:1:0x${"a".repeat(40)}`;
const APPS_SPACE = `tinycloud:${OWNER_DID.slice(4)}:applications`;
const ENTRY = (slug) => `xyz.tinycloud.tinyapps.catalog/${slug}/entry`;
const entryJson = (slug, title) => JSON.stringify({ v: 1, app: slug, id: NEW(slug), title });
const op = (c) => {
  const i = c.argv.findIndex((a) => ["status", "context", "kv"].includes(a));
  return c.argv[i] === "kv" ? `kv ${c.argv[i + 1]}` : c.argv[i];
};
const ops = (h) => cliCalls(h).map(op);
const entryReads = (h, slug) => cliCalls(h).filter((c) => op(c) === "kv get" && c.argv.includes(ENTRY(slug)));
const legacyLists = (h) => cliCalls(h).filter((c) => op(c) === "kv list" && c.argv[c.argv.indexOf("--space") + 1] === "default");

test("layout.sh (c): no receipt, no discovery entry and an old catalog record stay in the old layout, with no grant, profile or write", () => {
  const h = world();
  const out = runLayout(h, "fitness");
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), "legacy");
  assert.deepEqual(ops(h), ["status", "context", "kv list", "kv get", "kv list"]);
  // The entry is read with the profile, host and full space app-context.mjs selected, and found absent (KV_NOT_FOUND).
  const [get] = entryReads(h, "fitness");
  assert.equal(get.profile, "owner");
  assert.equal(get.argv[get.argv.indexOf("--host") + 1], "https://node.test");
  assert.equal(get.argv[get.argv.indexOf("--space") + 1], APPS_SPACE);
  const [list] = legacyLists(h);
  assert.equal(list.profile, "agent-data");
  assert.deepEqual(readdirSync(h.state), []);
  assert.deepEqual(store(h).applications, {});
});

test("layout.sh (a): a verified receipt for the app switches it to the new layout without reading the entry or the network", () => {
  const h = world();
  writeReceipt(h, "fitness", { v: 1, app: "fitness", id: NEW("fitness"), verified: true });
  const out = runLayout(h, "fitness");
  assert.equal(out.stdout.trim(), "new");
  assert.deepEqual(entryReads(h, "fitness"), []);
  assert.equal(cliCalls(h).length, 0);
});

test("layout.sh (b): no receipt but the app's discovery entry exists (moved by the hosted MCP): new, even with the old catalog record", () => {
  const h = world({ [ENTRY("fitness")]: entryJson("fitness", "Fitness") });
  const out = runLayout(h, "fitness");
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), "new");
  assert.equal(entryReads(h, "fitness").length, 1);
  assert.deepEqual(legacyLists(h), [], "the old catalog is not consulted once the entry decides");
  assert.equal(existsSync(receiptPath(h, "fitness")), false);
});

test("layout.sh (d): an app with no receipt, no discovery entry and no old records starts in the new layout", () => {
  const h = world();
  const out = runLayout(h, "books");
  assert.equal(out.stdout.trim(), "new");
  assert.deepEqual(ops(h), ["status", "context", "kv list", "kv get", "kv list"]);
  assert.equal(entryReads(h, "books").length, 1);
});

test("layout.sh: migrate.sh's entry alone switches the app; deleting the entry and the receipt goes back to the old layout", () => {
  const h = world();
  assert.equal(runMigrate(h, ["fitness"]).status, 0);
  assert.equal(runLayout(h, "fitness").stdout.trim(), "new");
  const receipt = readFileSync(receiptPath(h, "fitness"), "utf8");
  rmSync(receiptPath(h, "fitness"));
  assert.equal(runLayout(h, "fitness").stdout.trim(), "new", "another computer without the receipt sees the entry");
  const kv = store(h);
  delete kv.applications[ENTRY("fitness")];
  writeFileSync(join(h.dir, "kv-state.json"), JSON.stringify(kv));
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

test("layout.sh (e): when the entry can't be read for want of a sign-in or grant it says ask, never legacy or new", () => {
  const cases = [
    { getError: { key: ENTRY("fitness"), code: "PERMISSION_DENIED", status: 5 } },
    { getError: { key: ENTRY("fitness"), code: "AUTH_REQUIRED", status: 3 } },
    // An earlier agent-data sign-in only: app-context selects it, and it has no grant in `applications`.
    { status: { activeProfile: "agent-data", profiles: [{ name: "agent-data", authenticated: true }] } },
    // No applications profile at all: app-context says onboard-first, and the entry is not read.
    { status: { activeProfile: null, profiles: [] } },
  ];
  for (const c of cases) {
    const h = world();
    control(h, c);
    assert.equal(runLayout(h, "fitness").stdout.trim(), "ask", JSON.stringify(c));
    assert.deepEqual(legacyLists(h), [], JSON.stringify(c));
  }
});

test("layout.sh (f): when the entry check fails for another reason it says check-failed, never legacy or new", () => {
  const cases = [
    { getError: { key: ENTRY("fitness"), code: "NETWORK_ERROR", status: 6 } },
    // CLI 1.6.0 with the node unreachable.
    { getError: { key: ENTRY("fitness"), code: "ERROR", status: 1, message: "Failed to fetch node info at https://node.test." } },
    { getError: { key: ENTRY("fitness"), code: "SPACE_NOT_HOSTED", status: 1 } },
    // Exit 4 that is not the CLI's translation of KV_NOT_FOUND for this key.
    { getError: { key: ENTRY("fitness"), code: "NOT_FOUND", status: 4, message: "share not found" } },
    { contextError: { code: "NETWORK_ERROR", status: 6 } },
  ];
  for (const c of cases) {
    const h = world();
    control(h, c);
    assert.equal(runLayout(h, "fitness").stdout.trim(), "check-failed", JSON.stringify(c));
    assert.deepEqual(legacyLists(h), [], JSON.stringify(c));
  }
});

test("layout.sh: with no usable earlier sign-in for the old place it says ask, and with another failure it says check-failed", () => {
  const h = world();
  control(h, { missingProfiles: ["agent-data"] });
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

test("tc-apps scripts find the CLI like every skill: agent.env, then the shared private install; there is no cli-path", () => {
  const saved = world();
  const config = join(saved.dir, ".config/tinycloud");
  mkdirSync(config, { recursive: true, mode: 0o700 });
  const helperPath = join(config, "agent-env.mjs");
  writeFileSync(helperPath, readFileSync(join(root, "scripts/agent-env.mjs")), { mode: 0o600 });
  assert.equal(run(["node", helperPath, "set", "TC_BIN", saved.bin], { HOME: saved.dir }).status, 0);
  writeFileSync(join(saved.work, "cli-path"), "/nonexistent/tinycloud\n");
  const fromSaved = runLayout(saved, "fitness", { TC_BIN: "" });
  assert.equal(fromSaved.stdout.trim(), "legacy", fromSaved.stderr);
  assert.deepEqual(ops(saved), ["status", "context", "kv list", "kv get", "kv list"]);
  const own = world();
  const privateBin = join(own.dir, ".local/share/tinycloud/cli/node_modules/.bin/tinycloud");
  mkdirSync(dirname(privateBin), { recursive: true });
  writeFileSync(privateBin, standInCli, { mode: 0o755 });
  const fromPrivate = runLayout(own, "fitness", { TC_BIN: "" });
  assert.equal(fromPrivate.stdout.trim(), "legacy", fromPrivate.stderr);
  assert.deepEqual(ops(own), ["status", "context", "kv list", "kv get", "kv list"]);
  for (const script of ["layout.sh", "migrate.sh", "owner-grant.sh", "owner-undo.sh", "SKILL.md"]) {
    assert.doesNotMatch(readFileSync(join(skill, script), "utf8"), /cli-path/, script);
  }
});

// ---- layout.sh and migrate.sh: paged catalog, missing jq, local work copy, tab in a key ----
test("layout.sh follows the old catalog's pages: an app whose key is on a later page is legacy", () => {
  const h = world();
  const paged = join(h.dir, "paged-tinycloud");
  // Only the old catalog's listing is paged; every other call goes to the stand-in CLI.
  writeFileSync(paged, `#!/bin/sh
case " $* " in
  *" kv list "*" --space default "*)
    case " $* " in
      *" --all "*) echo '{"keys":["${OLD}/catalog/fitness","${OLD}/catalog/todos"],"count":2}' ;;
      *) echo '{"keys":["${OLD}/catalog/fitness"],"count":1,"truncated":true,"nextCursor":"c1"}' ;;
    esac ;;
  *) exec "${h.bin}" "$@" ;;
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
