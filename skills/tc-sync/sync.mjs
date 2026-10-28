#!/usr/bin/env node
// tc-sync: copy a snapshot of another app's data into the owner's TinyCloud.
//
//   node sync.mjs <TC> caps  <snapshot.json>   the --cap specs the sync needs, one per line
//   node sync.mjs <TC> plan  <snapshot.json>   what a sync would change; writes nothing
//   node sync.mjs <TC> apply <snapshot.json>   sync, read back, and record the run
//
// <TC> is the TinyCloud CLI binary. Every command prints one JSON object on stdout.
// Exit codes: 0 done, 2 bad snapshot or usage, 3 the grant is missing (see `caps`), 1 any other error.
//
// One-way and idempotent: records are upserted by (collection, id) and unchanged ones are
// left alone, so running `apply` again after any failure converges. Nothing is ever deleted:
// a record missing from a complete collection is marked `removed_at`.

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SPACE = "applications";
export const ROOT = "xyz.tinycloud.sync";
export const HEALTHLOG_DB = "xyz.tinycloud.sample.healthlog/healthlog";
const LB_TO_KG = 0.45359237;
// One --params value is one argv string; Linux caps a single argument at 128 KiB.
export const MAX_PARAMS_BYTES = 100_000;
const CONNECTOR = /^[a-z][a-z0-9-]{0,31}$/;
const COLLECTION = /^[A-Za-z0-9_.-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class SyncError extends Error {
  constructor(code, message, exit = 1) {
    super(message);
    this.code = code;
    this.exit = exit;
  }
}

/** JSON with object keys sorted, so equal data always gives equal text and hash. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** The database name for a source app: derived from its id, never its title, so a rename keeps the same database. */
export function appName(id) {
  const text = String(id);
  const slug = text.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const base = /^[a-z]/.test(slug) ? slug : `app-${slug}`;
  if (base === text && base.length <= 48) return base;
  return `${base.slice(0, 39).replace(/-+$/, "")}-${sha256(text).slice(0, 8)}`;
}

const TARGETS = {
  "healthlog.weight": {
    validate(map, where) {
      if (typeof map.day !== "string" || !map.day) throw new SyncError("BAD_SNAPSHOT", `${where}: "day" names the field with the date (YYYY-MM-DD)`, 2);
      if ((typeof map.kg === "string") === (typeof map.lb === "string")) throw new SyncError("BAD_SNAPSHOT", `${where}: give exactly one of "kg" or "lb"`, 2);
      if (map.at !== undefined && typeof map.at !== "string") throw new SyncError("BAD_SNAPSHOT", `${where}: "at" must name a field`, 2);
    },
  },
};

/** Read and check a snapshot file; returns it normalised, with each record's canonical text and hash. */
export function loadSnapshot(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new SyncError("BAD_SNAPSHOT", `Can't read ${path} as JSON: ${error.message}`, 2);
  }
  const bad = (message) => new SyncError("BAD_SNAPSHOT", message, 2);
  if (!raw || typeof raw !== "object" || raw.v !== 1) throw bad('"v" must be 1');
  if (typeof raw.connector !== "string" || !CONNECTOR.test(raw.connector)) throw bad('"connector": lowercase a-z, 0-9 and -, starting with a letter');
  const app = raw.app;
  if (!app || typeof app !== "object" || (typeof app.id !== "string" && typeof app.id !== "number") || String(app.id) === "") throw bad('"app.id" is required');
  if (app.title !== undefined && typeof app.title !== "string") throw bad('"app.title" must be a string');
  if (raw.revision !== undefined && raw.revision !== null && typeof raw.revision !== "string") throw bad('"revision" must be a string');
  if (raw.captured_at !== undefined && (typeof raw.captured_at !== "string" || Number.isNaN(Date.parse(raw.captured_at)))) throw bad('"captured_at" must be an ISO time');
  if (!Array.isArray(raw.collections) || raw.collections.length === 0) throw bad('"collections" must list at least one collection');

  const names = new Set();
  const collections = raw.collections.map((c, index) => {
    const where = `collections[${index}]`;
    if (!c || typeof c !== "object") throw bad(`${where} must be an object`);
    if (typeof c.name !== "string" || !COLLECTION.test(c.name)) throw bad(`${where}.name: 1-64 of A-Z a-z 0-9 _ . -`);
    if (names.has(c.name)) throw bad(`collection "${c.name}" is listed twice`);
    names.add(c.name);
    if (typeof c.complete !== "boolean") throw bad(`${where}.complete must be true or false`);
    if (typeof c.id !== "string" || !c.id) throw bad(`${where}.id names the field that holds each record's id`);
    if (!Array.isArray(c.records)) throw bad(`${where}.records must be an array`);
    const ids = new Set();
    const records = c.records.map((rec, i) => {
      if (!rec || typeof rec !== "object" || Array.isArray(rec)) throw bad(`${where}.records[${i}] must be an object`);
      const value = rec[c.id];
      if (!((typeof value === "string" && value !== "") || (typeof value === "number" && Number.isFinite(value)))) {
        throw bad(`${where}.records[${i}] has no "${c.id}"`);
      }
      const id = String(value);
      if (ids.has(id)) throw bad(`${where}: id "${id}" appears twice`);
      ids.add(id);
      const text = canonical(rec);
      return { id, rec, text, hash: sha256(text) };
    });
    const map = c.map ?? [];
    if (!Array.isArray(map)) throw bad(`${where}.map must be an array`);
    map.forEach((m, i) => {
      if (!m || typeof m !== "object" || !TARGETS[m.to]) throw bad(`${where}.map[${i}].to must be one of: ${Object.keys(TARGETS).join(", ")}`);
      TARGETS[m.to].validate(m, `${where}.map[${i}]`);
    });
    return { name: c.name, complete: c.complete, idField: c.id, records, map };
  });

  const name = appName(app.id);
  return {
    connector: raw.connector,
    app: { id: String(app.id), title: app.title ?? String(app.id), name },
    db: `${ROOT}.${raw.connector}/${name}`,
    revision: raw.revision ?? null,
    capturedAt: raw.captured_at ?? null,
    collections,
  };
}

/** The capabilities a sync of this snapshot needs, as `auth request --cap` specs. */
export function capsFor(snap) {
  const caps = [
    `tinycloud.sql:${SPACE}:${ROOT}.${snap.connector}/:read,write,schema`,
    `tinycloud.kv:${SPACE}:${ROOT}.${snap.connector}/knowledge/:get,list,put`,
  ];
  if (snap.collections.some((c) => c.map.some((m) => m.to === "healthlog.weight"))) {
    caps.push(`tinycloud.sql:${SPACE}:${HEALTHLOG_DB}:read,write`);
  }
  return caps;
}

const validDay = (day) => typeof day === "string" && DAY.test(day) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;

function instant(value) {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

/** Health Log weight rows for one collection: `{ rows, skipped }`. Each row's op_id is fixed by its source record. */
export function weightRows(snap, collection, map) {
  const prefix = opPrefix(snap, collection.name);
  const rows = [];
  const skipped = [];
  for (const { id, rec } of collection.records) {
    const day = rec[map.day];
    const raw = rec[map.kg ?? map.lb];
    const weight = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
    if (!validDay(day)) {
      skipped.push({ id, reason: `"${map.day}" is not a YYYY-MM-DD date` });
      continue;
    }
    if (typeof weight !== "number" || !Number.isFinite(weight)) {
      skipped.push({ id, reason: `"${map.kg ?? map.lb}" is not a number` });
      continue;
    }
    const kg = Math.round((map.kg ? weight : weight * LB_TO_KG) * 1000) / 1000;
    if (kg < 20 || kg > 500) {
      skipped.push({ id, reason: `${kg} kg is outside Health Log's 20-500 kg` });
      continue;
    }
    rows.push({ op_id: `${prefix}${id}`, day, weight_kg: kg, at: map.at ? instant(rec[map.at]) : null });
  }
  return { rows, skipped };
}

export const opPrefix = (snap, collection) => `sync:${snap.connector}:${snap.app.name}:${collection}:`;

// ---- The CLI -------------------------------------------------------------

/** Run the CLI; resolve to parsed stdout JSON, or throw a SyncError carrying the CLI's error code. */
export function makeCli(tc, run = spawnSync) {
  return (args, input) => {
    const result = run(tc, ["--json", ...args], { input, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    if (result.error) throw new SyncError("CLI_NOT_RUNNABLE", `${tc}: ${result.error.message}`);
    const stdout = result.stdout ?? "";
    if (result.status === 0) {
      try {
        return stdout.trim() ? JSON.parse(stdout) : {};
      } catch {
        return { text: stdout };
      }
    }
    const text = `${result.stderr ?? ""}\n${stdout}`;
    let code = null;
    let message = text.trim();
    for (const chunk of [result.stderr, stdout]) {
      try {
        const parsed = JSON.parse(chunk ?? "");
        const error = parsed.error ?? parsed;
        if (typeof error.code === "string") {
          code = error.code;
          message = typeof error.message === "string" ? error.message : message;
          break;
        }
      } catch {
        // not JSON
      }
    }
    code ??= /\b([A-Z][A-Z0-9_]{3,})\b/.exec(text)?.[1] ?? "CLI_FAILED";
    const error = new SyncError(code, message);
    error.status = result.status;
    error.text = text;
    throw error;
  };
}

const missingTable = (error) => /no such table|SQL_DATABASE_NOT_FOUND|database.*not found/i.test(`${error.code} ${error.message} ${error.text ?? ""}`);

function sqlQuery(cli, db, sql, params) {
  const args = ["sql", "query", "--db", db, "--space", SPACE];
  if (params) args.push("--params", JSON.stringify(params));
  return cli([...args, "--", sql]);
}

function sqlExecute(cli, db, sql, params) {
  const args = ["sql", "execute", "--db", db, "--space", SPACE];
  if (params) args.push("--params", JSON.stringify(params));
  return cli([...args, "--", sql]);
}

/** Split items into JSON arrays whose --params text stays under MAX_PARAMS_BYTES. */
export function chunks(items, fixed = []) {
  const out = [];
  let current = [];
  const size = (list) => Buffer.byteLength(JSON.stringify([...fixed, JSON.stringify(list)]));
  for (const item of items) {
    if (size([item]) > MAX_PARAMS_BYTES) throw new SyncError("RECORD_TOO_LARGE", `One record is over ${MAX_PARAMS_BYTES} bytes; tc-sync can't copy it`);
    if (current.length && size([...current, item]) > MAX_PARAMS_BYTES) {
      out.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length) out.push(current);
  return out;
}

// ---- Reading what TinyCloud holds ----------------------------------------

export function grantStatus(cli, caps) {
  const missing = [];
  for (const spec of caps) {
    const result = cli(["auth", "caps", "--diff", spec]);
    if (result.covered !== true) missing.push(spec);
  }
  return missing;
}

function readRecords(cli, snap) {
  try {
    const out = sqlQuery(cli, snap.db, "SELECT collection, id, hash, removed_at FROM records");
    const map = new Map();
    for (const [collection, id, hash, removedAt] of out.rows ?? []) map.set(`${collection}\u0000${id}`, { hash, removedAt });
    return { exists: true, map };
  } catch (error) {
    if (missingTable(error)) return { exists: false, map: new Map() };
    throw error;
  }
}

function readWeights(cli, snap, collection) {
  const prefix = opPrefix(snap, collection);
  // A range, not LIKE: `_` in an id would be a LIKE wildcard. `;` sorts right after `:`.
  const upper = `${prefix.slice(0, -1)};`;
  try {
    const out = sqlQuery(cli, HEALTHLOG_DB, "SELECT op_id, day, weight_kg, logged_at, source FROM weight WHERE op_id >= ? AND op_id < ?", [prefix, upper]);
    const map = new Map();
    for (const [opId, day, kg, loggedAt, source] of out.rows ?? []) map.set(opId, { day, weight_kg: Number(kg), logged_at: loggedAt, source });
    return { status: "ready", map };
  } catch (error) {
    if (missingTable(error)) return { status: "not_set_up", map: new Map() };
    throw error;
  }
}

/** Compare the snapshot with TinyCloud: what `apply` would write. */
function diff(cli, snap) {
  const stored = readRecords(cli, snap);
  const collections = snap.collections.map((c) => {
    const upserts = [];
    let unchanged = 0;
    let added = 0;
    for (const r of c.records) {
      const have = stored.map.get(`${c.name}\u0000${r.id}`);
      if (!have) {
        added++;
        upserts.push(r);
      } else if (have.hash !== r.hash || have.removedAt) upserts.push(r);
      else unchanged++;
    }
    const present = new Set(c.records.map((r) => r.id));
    const removals = [];
    if (c.complete) {
      for (const [key, have] of stored.map) {
        const [name, id] = key.split("\u0000");
        if (name === c.name && !have.removedAt && !present.has(id)) removals.push(id);
      }
    }
    const targets = c.map.map((m) => {
      const { rows, skipped } = weightRows(snap, c, m);
      const state = readWeights(cli, snap, c.name);
      const writes = [];
      let unchangedRows = 0;
      let addedRows = 0;
      const keep = [];
      for (const row of rows) {
        const have = state.map.get(row.op_id);
        // No time in the source: keep the time already stored, else the time of this write.
        const loggedAt = row.at ?? have?.logged_at ?? null;
        const want = { op_id: row.op_id, day: row.day, weight_kg: row.weight_kg, logged_at: loggedAt };
        if (!have) {
          addedRows++;
          writes.push(want);
        } else if (have.source !== "import") keep.push(row.op_id);
        else if (have.day !== want.day || have.weight_kg !== want.weight_kg || have.logged_at !== want.logged_at) writes.push(want);
        else unchangedRows++;
      }
      const sourceIds = new Set(rows.map((r) => r.op_id));
      const orphaned = [...state.map.keys()].filter((op) => !sourceIds.has(op)).length;
      return {
        to: m.to,
        status: state.status,
        rows,
        writes,
        summary: {
          to: m.to,
          status: state.status,
          new: addedRows,
          changed: writes.length - addedRows,
          unchanged: unchangedRows,
          skipped,
          ...(keep.length ? { not_ours: keep.length } : {}),
          ...(orphaned ? { kept_after_removal: orphaned } : {}),
        },
      };
    });
    return {
      collection: c,
      upserts,
      removals,
      targets,
      summary: {
        name: c.name,
        complete: c.complete,
        records: c.records.length,
        new: added,
        changed: upserts.length - added,
        unchanged,
        removed: removals.length,
      },
    };
  });
  return { tableExists: stored.exists, collections };
}

// ---- Writing ---------------------------------------------------------------

const RECORDS_DDL = [
  "CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, rec TEXT NOT NULL, hash TEXT NOT NULL, first_synced_at TEXT NOT NULL, synced_at TEXT NOT NULL, removed_at TEXT, PRIMARY KEY (collection, id))",
  "CREATE TABLE IF NOT EXISTS runs (run_id TEXT PRIMARY KEY, finished_at TEXT NOT NULL, captured_at TEXT, revision TEXT, summary TEXT NOT NULL)",
];
const UPSERT_RECORDS = "INSERT INTO records (collection, id, rec, hash, first_synced_at, synced_at) SELECT json_extract(value, '$.c'), json_extract(value, '$.i'), json_extract(value, '$.r'), json_extract(value, '$.h'), ?, ? FROM json_each(?) WHERE true ON CONFLICT (collection, id) DO UPDATE SET rec = excluded.rec, hash = excluded.hash, synced_at = excluded.synced_at, removed_at = NULL";
const MARK_REMOVED = "UPDATE records SET removed_at = ? WHERE removed_at IS NULL AND collection = ? AND id IN (SELECT value FROM json_each(?))";
const UPSERT_WEIGHT = "INSERT INTO weight (op_id, day, weight_kg, note, source, logged_at) SELECT json_extract(value, '$.o'), json_extract(value, '$.d'), json_extract(value, '$.k'), NULL, 'import', json_extract(value, '$.t') FROM json_each(?) WHERE true ON CONFLICT (op_id) DO UPDATE SET day = excluded.day, weight_kg = excluded.weight_kg, logged_at = excluded.logged_at WHERE weight.source = 'import'";

function verifyRecords(cli, snap) {
  const stored = readRecords(cli, snap).map;
  const wrong = [];
  for (const c of snap.collections) {
    for (const r of c.records) {
      const have = stored.get(`${c.name}\u0000${r.id}`);
      if (!have || have.hash !== r.hash || have.removedAt) wrong.push(`${c.name}/${r.id}`);
    }
  }
  return wrong;
}

function knowledgePage(snap, plan, now) {
  const fields = (c) => {
    const types = new Map();
    for (const { rec } of c.records) {
      for (const [k, v] of Object.entries(rec)) {
        const t = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
        types.set(k, new Set([...(types.get(k) ?? []), t]));
      }
    }
    return [...types].map(([k, t]) => `\`${k}\` (${[...t].join(" or ")})`).join(", ") || "none yet";
  };
  const copies = plan.collections.flatMap(({ collection, targets }) => targets.map((t) => `* \`${collection.name}\` is also in Health Log's \`weight\` table (database \`${HEALTHLOG_DB}\`): rows with \`source = 'import'\` and \`op_id\` starting \`${opPrefix(snap, collection.name)}\`, then the record id.`));
  return [
    "---",
    'type: "SQLite Table"',
    "title: records",
    `description: ${JSON.stringify(`Records copied from ${snap.connector} app "${snap.app.title}".`)}`,
    `resource: tinycloud.sql:${SPACE}:${snap.db}`,
    "table: records",
    "tinycloud:",
    `  app: ${ROOT}.${snap.connector}`,
    "  service: sql",
    "  profile: tinycloud.app.v1",
    "  containsSecretValue: false",
    "---",
    "",
    `Copied one way from the ${snap.connector} app "${snap.app.title}" (source id \`${snap.app.id}\`) by the tc-sync skill. The source app is the source of truth: the next sync overwrites changes made here.`,
    "",
    `Table \`records\` in SQLite database \`${snap.db}\` (space \`${SPACE}\`). One row per source record.`,
    "",
    "| Column | Holds |",
    "| --- | --- |",
    "| `collection` | Which list in the source app the record came from. |",
    "| `id` | The record's id in the source app. |",
    "| `rec` | The record as JSON. Read a field with `json_extract(rec, '$.<field>')`. |",
    "| `hash` | SHA-256 of `rec`. |",
    "| `first_synced_at`, `synced_at` | When the record was first copied, and last changed here (UTC). |",
    "| `removed_at` | Set when the record was no longer in the source app; the row is kept. |",
    "",
    "Table `runs` has one row per sync: `run_id`, `finished_at`, `captured_at`, `revision` and a JSON `summary`.",
    "",
    "# Collections",
    "",
    "| Collection | Records | Fields |",
    "| --- | --- | --- |",
    ...snap.collections.map((c) => `| \`${c.name}\` | ${c.records.length} | ${fields(c)} |`),
    ...(copies.length ? ["", "# Also copied to", "", ...copies] : []),
    "",
    `Last sync: ${now}${snap.revision ? `, source revision \`${snap.revision}\`` : ""}.`,
    "",
  ].join("\n");
}

function writeKnowledge(cli, snap, plan, now) {
  const base = `${ROOT}.${snap.connector}/knowledge/`;
  cli(["kv", "put", `${base}apps/${snap.app.name}.md`, "--stdin", "--space", SPACE], knowledgePage(snap, plan, now));
  const listed = cli(["kv", "list", "--prefix", `${base}apps/`, "--space", SPACE, "--all"]);
  const names = (listed.keys ?? [])
    .map((k) => (typeof k === "string" ? k : k?.key))
    .filter((k) => typeof k === "string" && k.endsWith(".md"))
    .map((k) => k.slice(k.lastIndexOf("/") + 1, -3))
    .sort();
  const index = [
    "---",
    'okf_version: "0.2"',
    "---",
    "",
    "# Tables",
    "",
    ...names.map((n) => `* [${n}](apps/${n}.md) - Records copied from a ${snap.connector} app, in database \`${ROOT}.${snap.connector}/${n}\`.`),
    "",
  ].join("\n");
  cli(["kv", "put", `${base}index.md`, "--stdin", "--space", SPACE], index);
}

export function apply(cli, snap, now = new Date().toISOString(), runId = randomUUID()) {
  const plan = diff(cli, snap);
  if (!plan.tableExists) for (const ddl of RECORDS_DDL) sqlExecute(cli, snap.db, ddl);

  for (const { collection, upserts, removals } of plan.collections) {
    const items = upserts.map((r) => ({ c: collection.name, i: r.id, r: r.text, h: r.hash }));
    for (const part of chunks(items, [now, now])) sqlExecute(cli, snap.db, UPSERT_RECORDS, [now, now, JSON.stringify(part)]);
    for (const part of chunks(removals, [now, collection.name])) sqlExecute(cli, snap.db, MARK_REMOVED, [now, collection.name, JSON.stringify(part)]);
  }
  const wrong = verifyRecords(cli, snap);
  if (wrong.length) throw new SyncError("VERIFY_FAILED", `${wrong.length} record(s) didn't read back as written, e.g. ${wrong.slice(0, 3).join(", ")}. Run apply again.`);

  const targetErrors = [];
  for (const { collection, targets } of plan.collections) {
    for (const t of targets) {
      if (t.status !== "ready") continue;
      const items = t.writes.map((w) => ({ o: w.op_id, d: w.day, k: w.weight_kg, t: w.logged_at ?? now }));
      for (const part of chunks(items)) sqlExecute(cli, HEALTHLOG_DB, UPSERT_WEIGHT, [JSON.stringify(part)]);
      const after = readWeights(cli, snap, collection.name).map;
      const mismatched = t.rows.filter((row) => {
        const have = after.get(row.op_id);
        if (!have) return true;
        if (have.source !== "import") return false;
        return have.day !== row.day || have.weight_kg !== row.weight_kg || (row.at !== null && have.logged_at !== row.at);
      });
      if (mismatched.length) targetErrors.push(`${t.to}: ${mismatched.length} row(s) didn't read back as written`);
    }
  }

  const summary = {
    run_id: runId,
    connector: snap.connector,
    app: snap.app,
    db: snap.db,
    revision: snap.revision,
    collections: plan.collections.map((c) => c.summary),
    targets: plan.collections.flatMap((c) => c.targets.map((t) => ({ collection: c.collection.name, ...t.summary }))),
  };
  sqlExecute(cli, snap.db, "INSERT INTO runs (run_id, finished_at, captured_at, revision, summary) VALUES (?, ?, ?, ?, ?)", [runId, now, snap.capturedAt, snap.revision, JSON.stringify(summary)]);
  if (targetErrors.length) throw new SyncError("VERIFY_FAILED", `${targetErrors.join("; ")}. Run apply again.`);

  let knowledge = "written";
  try {
    writeKnowledge(cli, snap, plan, now);
  } catch (error) {
    knowledge = `not written: ${error.code}`;
  }
  const partial = summary.targets.some((t) => t.status !== "ready" || t.skipped.length);
  return { status: partial ? "partial" : "synced", verified: true, knowledge, ...summary };
}

export function plan(cli, snap) {
  const p = diff(cli, snap);
  return {
    status: "planned",
    connector: snap.connector,
    app: snap.app,
    db: snap.db,
    revision: snap.revision,
    collections: p.collections.map((c) => c.summary),
    targets: p.collections.flatMap((c) => c.targets.map((t) => ({ collection: c.collection.name, ...t.summary }))),
  };
}

export function main(argv, { run = spawnSync, out = (s) => process.stdout.write(s) } = {}) {
  const [tc, command, file] = argv;
  const print = (value) => out(`${JSON.stringify(value)}\n`);
  try {
    if (!tc || !["caps", "plan", "apply"].includes(command) || !file) {
      throw new SyncError("USAGE", "usage: node sync.mjs <TC> <caps|plan|apply> <snapshot.json>", 2);
    }
    const snap = loadSnapshot(file);
    const caps = capsFor(snap);
    if (command === "caps") {
      out(`${caps.join("\n")}\n`);
      return 0;
    }
    const cli = makeCli(tc, run);
    const missing = grantStatus(cli, caps);
    if (missing.length) {
      print({ status: "needs_grant", missing, caps });
      return 3;
    }
    print(command === "plan" ? plan(cli, snap) : apply(cli, snap));
    return 0;
  } catch (error) {
    if (!(error instanceof SyncError)) throw error;
    print({ status: "error", code: error.code, message: error.message });
    return error.exit;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
