import assert from "node:assert/strict";
import { test } from "node:test";
import { appContext, appPermissions, missingPermissions } from "../skills/tc-apps/app-context.mjs";

const owner = "did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const space = `tinycloud:${owner.slice(4)}:applications`;
const host = "https://node.example.test";
const now = Date.parse("2026-10-30T12:00:00Z");
const expiry = "2099-01-01T00:00:00Z";
const cap = (path = "", actions = ["get", "list", "put", "del"], service = "tinycloud.kv") => ({ service, space, path, actions: actions.map((action) => `${service}/${action}`) });
const profile = (name = "owner", permissions = [cap()]) => ({
  name, ownerDid: owner, host, authenticated: true,
  session: { present: true, expired: false, expiresAt: expiry, permissions }, delegations: [],
});
const world = (profiles, { selected = "owner", failure, contextSpace, catalog = { keys: [], truncated: false, nextCursor: null } } = {}) => {
  const writes = [];
  const reads = [];
  const run = (_cli, args) => {
    const json = (data, status = 0) => ({ status, stdout: status === 0 ? JSON.stringify(data) : "", stderr: status === 0 ? "" : JSON.stringify(data) });
    const name = args.includes("--profile") ? args[args.indexOf("--profile") + 1] : selected;
    const current = profiles.find((entry) => entry.name === name);
    if (args.includes("status")) return json({ activeProfile: name, profiles });
    if (args.includes("context")) {
      if (!current?.ownerDid && !contextSpace && !current?.spaceId) return json({ error: { code: "ADDRESS_UNKNOWN" } }, 3);
      return json({ profile: name, ownerDid: current?.ownerDid, host: current?.host, spaceId: contextSpace || current?.spaceId || (current?.ownerDid ? `tinycloud:${current.ownerDid.slice(4)}:applications` : null), session: { state: current?.authenticated ? "present" : "expired" } });
    }
    if (args.includes("list") || args.includes("query")) {
      reads.push({ name, args });
      return failure ? json({ error: { code: failure } }, 5) : json(args.includes("query") ? { rows: [[1]], rowCount: 1 } : catalog);
    }
    writes.push(args);
    throw new Error("unexpected mutating command");
  };
  return { run, writes, reads };
};

test("onboarding access is reused without a new profile or approval, after a real read boundary", () => {
  const w = world([profile()]);
  const context = appContext("/cli", "notes", { env: {}, run: w.run, write: true });
  assert.deepEqual(context, { status: "ready", profile: "owner", ownerDid: owner, host, spaceId: space, catalogKeys: [] });
  assert.deepEqual(w.writes, []);
  assert.equal(w.reads[0].name, "owner");
});

test("a fresh key-only profile reaches sign-in without requiring an unknown owner address", () => {
  const p = profile("fresh", []);
  p.ownerDid = null;
  p.authenticated = false;
  p.session.present = false;
  const w = world([p], { selected: "fresh" });
  assert.deepEqual(appContext("/cli", "todos", { env: { TC_PROFILE: "fresh" }, run: w.run }), {
    status: "sign-in-required", profile: "fresh", missing: appPermissions("todos"),
  });
  assert.deepEqual(w.writes, []);
});

test("checksummed owner metadata reuses the same owner's lowercase applications grant", () => {
  const p = profile();
  p.ownerDid = owner.replace(/a{40}$/, "aA".repeat(20));
  const w = world([p], { contextSpace: space });
  assert.equal(appContext("/cli", "todos", { env: {}, run: w.run, write: true }).status, "ready");
  const upperGrant = { ...cap(), space: space.replace(/a{40}/, "aA".repeat(20)) };
  assert.deepEqual(missingPermissions(profile("owner", [upperGrant]), space, appPermissions("todos", { write: true }), now), []);
});

test("a two-hour delegated reader needs neither an owner key nor catalog-wide discovery", () => {
  const p = profile("reader", []);
  p.ownerDid = null;
  p.spaceId = space;
  p.session = { present: true, expired: null, expiresAt: null, permissions: [] };
  p.delegations = [{ active: true, expired: false, expiresAt: expiry, permissions: [cap("xyz.tinycloud.tinyapps.todos/", ["get", "list"])] }];
  const w = world([p], { selected: "reader", contextSpace: space });
  const selected = appContext("/cli", "todos", { env: { TC_PROFILE: "reader" }, run: w.run });
  assert.equal(selected.status, "ready");
  assert.equal(selected.ownerDid, owner);
  assert.deepEqual(w.writes, []);
  const write = appContext("/cli", "todos", { env: { TC_PROFILE: "reader" }, run: w.run, write: true });
  assert.equal(write.status, "grant-required");
  assert.ok(write.missing.some((entry) => entry.actions.includes("put")));
});

test("primary and active additional grants combine, but expired grants do not", () => {
  const p = profile("owner", [cap("", ["get", "list"])]);
  p.delegations = [{ active: true, expired: false, expiresAt: expiry, permissions: [cap("", ["put"])] }];
  assert.deepEqual(missingPermissions(p, space, appPermissions("notes", { write: true }), now), []);
  p.delegations[0].expiresAt = "2026-10-29T12:00:00Z";
  assert.deepEqual(missingPermissions(p, space, appPermissions("notes", { write: true }), now).map((entry) => entry.actions), [["put"], ["put"]]);
  p.session.expiresAt = "2026-10-29T12:00:00Z";
  assert.deepEqual(missingPermissions(p, space, appPermissions("notes"), now), [{ service: "tinycloud.kv", space, path: "xyz.tinycloud.tinyapps.notes/", actions: ["get", "list"] }]);
});

test("temporary read-only access never requests write permission for a read", () => {
  const w = world([profile("owner", [cap("", ["get", "list"])])]);
  assert.equal(appContext("/cli", "notes", { env: {}, run: w.run }).status, "ready");
  const write = appContext("/cli", "notes", { env: {}, run: w.run, write: true });
  assert.equal(write.status, "grant-required");
  assert.deepEqual(write.missing.map((entry) => entry.actions), [["put"], ["put"]]);
});

test("another app or space grant cannot satisfy the requested app", () => {
  const p = profile("owner", [cap("xyz.tinycloud.tinyapps.notebook/"), { ...cap(), space: space.replace(":applications", ":default") }]);
  const w = world([p]);
  assert.equal(appContext("/cli", "notes", { env: {}, run: w.run, write: true }).status, "grant-required");
  assert.deepEqual(w.reads, []);
});

test("explicit profile selection cannot fall through to another profile", () => {
  const w = world([profile("owner", []), profile("tinyapp-notes")]);
  const selected = appContext("/cli", "notes", { env: { TC_PROFILE: "owner" }, run: w.run, write: true });
  assert.equal(selected.status, "grant-required");
  assert.equal(selected.profile, "owner");
  assert.deepEqual(w.reads, []);
});

test("an existing app profile for the same owner and host can be reused", () => {
  const w = world([profile("owner", []), profile("tinyapp-notes")]);
  const selected = appContext("/cli", "notes", { env: {}, run: w.run, write: true });
  assert.equal(selected.status, "ready");
  assert.equal(selected.profile, "tinyapp-notes");
  assert.deepEqual(w.writes, []);
});

for (const mismatch of ["owner", "host"]) test(`a ${mismatch} mismatch never switches the app account`, () => {
  const other = profile("tinyapp-notes");
  if (mismatch === "owner") other.ownerDid = owner.replace(/a/g, "b");
  else other.host = "https://another.example.test";
  const w = world([profile("owner", []), other]);
  assert.throws(() => appContext("/cli", "notes", { env: {}, run: w.run }), new RegExp(`APP_${mismatch.toUpperCase()}_MISMATCH`));
  assert.deepEqual(w.reads, []);
});

for (const failure of ["PERMISSION_DENIED", "NETWORK_ERROR"]) test(`${failure} is reported, not converted into another approval`, () => {
  const w = world([profile(), profile("tinyapp-notes")], { failure });
  assert.throws(() => appContext("/cli", "notes", { env: {}, run: w.run }), new RegExp(failure));
  assert.equal(w.reads.length, 1);
  assert.deepEqual(w.writes, []);
});

test("an incomplete catalog cannot be treated as an empty new app", () => {
  const w = world([profile()], { catalog: { keys: [], truncated: true, nextCursor: "next" } });
  assert.throws(() => appContext("/cli", "notes", { env: {}, run: w.run }), /incomplete app catalog/);
});

test("SQL reuses existing grants but asks separately for absent schema authority", () => {
  const w = world([profile("owner", [cap("", ["read", "write"], "tinycloud.sql")])]);
  assert.equal(appContext("/cli", "notes", { env: {}, run: w.run, sql: true, write: true }).status, "ready");
  const context = appContext("/cli", "notes", { env: {}, run: w.run, sql: true, write: true, schema: true });
  assert.equal(context.status, "grant-required");
  assert.deepEqual(context.missing.map((entry) => entry.actions), [["schema"]]);
});

test("catalog apps reuse onboarding access without creating a second owner grant", () => {
  const w = world([profile("owner", [cap(), cap("", ["read", "write"], "tinycloud.sql")])]);
  const result = appContext("/cli", "healthlog", { env: {}, run: w.run, catalog: true, write: true });
  assert.equal(result.status, "ready");
  assert.equal(result.profile, "owner");
  assert.deepEqual(w.writes, []);
});

test("catalog fallback never asks for a broader grant than a narrow existing app setup", () => {
  const w = world([profile("owner", [cap("xyz.tinycloud.sample.healthlog/")])]);
  assert.deepEqual(appContext("/cli", "healthlog", { env: {}, run: w.run, catalog: true, write: true }), { status: "use-scoped-catalog-flow" });
  assert.deepEqual(w.writes, []);
  assert.deepEqual(w.reads, []);
});
