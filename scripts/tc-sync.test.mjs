import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { appName, chunks, HEALTHLOG_DB, main, MAX_PARAMS_BYTES, weightRows, loadSnapshot } from "../skills/tc-sync/sync.mjs";

const dir = mkdtempSync(join(tmpdir(), "tc-sync-test-"));
after(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;
const file = (snapshot) => {
  const path = join(dir, `snap-${n++}.json`);
  writeFileSync(path, JSON.stringify(snapshot));
  return path;
};
const snapshot = (collections, extra = {}) => ({ v: 1, connector: "wabi", app: { id: "app_1", title: "Weight log" }, collections, ...extra });
const entries = (records, more = {}) => ({ name: "entries", complete: true, id: "id", records, ...more });
const WEIGHT_MAP = [{ to: "healthlog.weight", day: "date", lb: "pounds", at: "createdAt" }];

/**
 * A stand-in for the CLI process that answers only reads: the grant check, the stored records and
 * the stored Health Log rows. Writes are recorded and refused, so `plan` is proven to write nothing.
 */
function cliStub({ covered = true, stored = [], weights = null } = {}) {
  const calls = [];
  const run = (_tc, args) => {
    calls.push(args);
    const [, cmd, sub] = args;
    const ok = (value) => ({ status: 0, stdout: JSON.stringify(value), stderr: "" });
    if (cmd === "auth" && sub === "caps") return ok({ covered });
    if (cmd === "sql" && sub === "query") {
      const db = args[args.indexOf("--db") + 1];
      if (db === HEALTHLOG_DB) {
        return weights === null
          ? { status: 7, stdout: "", stderr: JSON.stringify({ error: { code: "SQL_ERROR", message: "no such table: weight" } }) }
          : ok({ columns: [], rows: weights, rowCount: weights.length });
      }
      return stored === null
        ? { status: 4, stdout: "", stderr: JSON.stringify({ error: { code: "SQL_DATABASE_NOT_FOUND", message: "database not found" } }) }
        : ok({ columns: [], rows: stored, rowCount: stored.length });
    }
    return { status: 1, stdout: "", stderr: JSON.stringify({ error: { code: "UNEXPECTED_WRITE", message: args.join(" ") } }) };
  };
  return { run, calls };
}

function runMain(command, snap, stub) {
  let out = "";
  const status = main(["tc", command, file(snap)], { run: stub.run, out: (s) => { out += s; } });
  return { status, out, json: command === "caps" ? null : JSON.parse(out) };
}

const hashOf = (rec) => {
  const snap = loadSnapshot(file(snapshot([entries([rec])])));
  return snap.collections[0].records[0].hash;
};

test("a bad snapshot is refused with BAD_SNAPSHOT and exit 2, before any CLI call", () => {
  const cases = [
    snapshot([entries([{ id: "a" }, { id: "a" }])]),
    snapshot([entries([{ date: "2026-10-01" }])]),
    snapshot([entries([{ id: "a" }], { complete: "yes" })]),
    snapshot([entries([{ id: "a" }], { map: [{ to: "healthlog.weight", day: "date", lb: "pounds", kg: "kilos" }] })]),
    snapshot([entries([{ id: "a" }], { map: [{ to: "somewhere.else", day: "date", lb: "pounds" }] })]),
    snapshot([entries([{ id: "a" }]), entries([{ id: "b" }])]),
    { ...snapshot([entries([{ id: "a" }])]), connector: "Wabi App" },
  ];
  for (const snap of cases) {
    const stub = cliStub();
    const result = runMain("plan", snap, stub);
    assert.equal(result.status, 2, JSON.stringify(snap));
    assert.equal(result.json.code, "BAD_SNAPSHOT");
    assert.equal(stub.calls.length, 0);
  }
});

test("the database name follows the app's id, not its title, and ids that differ only in case don't share one", () => {
  const a = loadSnapshot(file(snapshot([entries([])], { app: { id: "App_1", title: "Weight log" } })));
  const renamed = loadSnapshot(file(snapshot([entries([])], { app: { id: "App_1", title: "My weights" } })));
  assert.equal(a.db, renamed.db);
  assert.match(a.db, /^xyz\.tinycloud\.sync\.wabi\/[a-z][a-z0-9-]*$/);
  assert.notEqual(appName("App_1"), appName("app_1"));
  assert.equal(appName("weight-log"), "weight-log");
});

test("weigh-ins: pounds become kilograms; bad dates, non-numbers and impossible weights are skipped with a reason", () => {
  const snap = loadSnapshot(file(snapshot([entries([
    { id: "ok", date: "2026-10-25", pounds: 182.4, createdAt: 1793001600000 },
    { id: "text", date: "2026-10-25", pounds: "181.9" },
    { id: "feb30", date: "2026-02-30", pounds: 180 },
    { id: "tiny", date: "2026-10-25", pounds: 2 },
    { id: "word", date: "2026-10-25", pounds: "heavy" },
  ], { map: WEIGHT_MAP })])));
  const { rows, skipped } = weightRows(snap, snap.collections[0], WEIGHT_MAP[0]);
  assert.deepEqual(rows.map((r) => [r.op_id.split(":").at(-1), r.day, r.weight_kg, r.at]), [
    ["ok", "2026-10-25", 82.735, new Date(1793001600000).toISOString()],
    ["text", "2026-10-25", 82.508, null],
  ]);
  assert.deepEqual(skipped.map((s) => s.id), ["feb30", "tiny", "word"]);
  assert.ok(rows.every((r) => r.op_id.startsWith(`sync:wabi:${snap.app.name}:entries:`)));
});

test("chunks keep every --params value under the argument limit and refuse a record that can't fit", () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ c: "entries", i: String(i), r: "x".repeat(5000) }));
  const parts = chunks(items, ["2026-10-28T00:00:00.000Z", "2026-10-28T00:00:00.000Z"]);
  assert.ok(parts.length > 1);
  assert.deepEqual(parts.flat(), items);
  for (const part of parts) {
    const params = JSON.stringify(["2026-10-28T00:00:00.000Z", "2026-10-28T00:00:00.000Z", JSON.stringify(part)]);
    assert.ok(Buffer.byteLength(params) <= MAX_PARAMS_BYTES);
  }
  assert.throws(() => chunks([{ r: "x".repeat(MAX_PARAMS_BYTES) }]), { code: "RECORD_TOO_LARGE" });
});

test("without the grant, plan stops with needs_grant (exit 3) and lists every cap, Health Log's only when weigh-ins are mapped", () => {
  const plain = runMain("plan", snapshot([entries([{ id: "a" }])]), cliStub({ covered: false }));
  assert.equal(plain.status, 3);
  assert.equal(plain.json.status, "needs_grant");
  assert.deepEqual(plain.json.caps, [
    "tinycloud.sql:applications:xyz.tinycloud.sync.wabi/:read,write,schema",
    "tinycloud.kv:applications:xyz.tinycloud.sync.wabi/knowledge/:get,list,put",
  ]);
  const stub = cliStub({ covered: false });
  const weighed = runMain("plan", snapshot([entries([{ id: "a", date: "2026-10-01", pounds: 180 }], { map: WEIGHT_MAP })]), stub);
  assert.ok(weighed.json.caps.includes(`tinycloud.sql:applications:${HEALTHLOG_DB}:read,write`));
  assert.ok(stub.calls.every((args) => args[1] === "auth"), "no data is read before the grant is there");
});

test("a first plan on an empty TinyCloud counts every record as new and writes nothing", () => {
  const stub = cliStub({ stored: null });
  const result = runMain("plan", snapshot([entries([{ id: "a" }, { id: "b" }])]), stub);
  assert.equal(result.status, 0);
  assert.deepEqual(result.json.collections[0], { name: "entries", complete: true, records: 2, new: 2, changed: 0, unchanged: 0, removed: 0 });
  assert.ok(stub.calls.every((args) => args[1] !== "sql" || args[2] === "query"));
});

test("plan sorts records into new, changed, unchanged and removed; only a complete collection marks removals", () => {
  const a = { id: "a", v: 1 };
  const stored = [
    ["entries", "a", hashOf(a), null], // unchanged
    ["entries", "b", hashOf({ id: "b", v: 1 }), null], // changed below
    ["entries", "c", hashOf({ id: "c", v: 1 }), "2026-10-01T00:00:00.000Z"], // removed earlier, back now
    ["entries", "gone", hashOf({ id: "gone" }), null], // no longer in the source
    ["other", "x", "h", null], // another collection: never touched
  ];
  const records = [a, { id: "b", v: 2 }, { id: "c", v: 1 }, { id: "new" }];
  const complete = runMain("plan", snapshot([entries(records)]), cliStub({ stored }));
  assert.deepEqual(complete.json.collections[0], { name: "entries", complete: true, records: 4, new: 1, changed: 2, unchanged: 1, removed: 1 });
  const partial = runMain("plan", snapshot([entries(records, { complete: false })]), cliStub({ stored }));
  assert.equal(partial.json.collections[0].removed, 0);
});

test("weigh-ins: Health Log not set up is reported, and rows someone else wrote under a sync id are never planned as ours", () => {
  const records = [{ id: "a", date: "2026-10-01", pounds: 180 }, { id: "b", date: "2026-10-02", pounds: 181 }];
  const notSetUp = runMain("plan", snapshot([entries(records, { map: WEIGHT_MAP })]), cliStub({ stored: null, weights: null }));
  assert.equal(notSetUp.status, 0);
  assert.equal(notSetUp.json.targets[0].status, "not_set_up");
  assert.equal(notSetUp.json.collections[0].new, 2);

  const snap = loadSnapshot(file(snapshot([entries(records, { map: WEIGHT_MAP })])));
  const prefix = `sync:wabi:${snap.app.name}:entries:`;
  const weights = [
    [`${prefix}a`, "2026-10-01", 81.647, "2026-10-01T08:00:00.000Z", "app"],
    [`${prefix}gone`, "2026-09-01", 80, "2026-09-01T08:00:00.000Z", "import"],
  ];
  const ready = runMain("plan", snapshot([entries(records, { map: WEIGHT_MAP })]), cliStub({ stored: null, weights }));
  assert.deepEqual(
    { ...ready.json.targets[0], skipped: ready.json.targets[0].skipped.length },
    { collection: "entries", to: "healthlog.weight", status: "ready", new: 1, changed: 0, unchanged: 0, skipped: 0, not_ours: 1, kept_after_removal: 1 },
  );
});
