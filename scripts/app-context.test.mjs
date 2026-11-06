import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("a new app write never requests catalog-wide access for other apps", () => {
  const permissions = appPermissions("notes", { write: true });
  assert.deepEqual(permissions, [
    { service: "tinycloud.kv", path: "xyz.tinycloud.tinyapps.notes/", actions: ["get", "list", "put"] },
    { service: "tinycloud.kv", path: "xyz.tinycloud.tinyapps.catalog/notes/entry", actions: ["get", "put"] },
  ]);
});

test("context reuses the onboarding profile when no dedicated context profile exists", () => {
  const w = world([profile()]);
  const context = appContext("/cli", "context", { env: {}, run: w.run });
  assert.equal(context.status, "ready");
  assert.equal(context.profile, "owner");
  const writeWorld = world([profile()]);
  const notes = appContext("/cli", "notes", { env: {}, run: writeWorld.run, write: true });
  assert.deepEqual(notes, { status: "ready", profile: "owner", ownerDid: owner, host, spaceId: space, catalogKeys: [], appEntries: [] });
  assert.deepEqual(writeWorld.writes, []);
  assert.equal(writeWorld.reads[0].name, "owner");
  assert.deepEqual(w.writes, []);
  assert.equal(w.reads[0].name, "owner");
});
test("an onboarded default profile is the context profile used by the read guide", () => {
  const w = world([profile("default")], { selected: "default" });
  const context = appContext("/cli", "context", { env: {}, run: w.run });
  const guide = readFileSync(new URL("../skills/tc-apps/CONTEXT.md", import.meta.url), "utf8");
  assert.equal(context.status, "ready");
  assert.equal(context.profile, "default");
  assert.deepEqual(w.writes, []);
  assert.equal(w.reads[0].name, "default");
  assert.match(guide, /When it returns `ready`, use its `profile` as `<CONTEXT_PROFILE>`/);
  assert.match(guide, /--profile '<CONTEXT_PROFILE>'/);
  assert.doesNotMatch(guide, /--profile tinyapp-context\b/);
});

test("the context key list uses the host selected by the helper", () => {
  const w = world([profile("default")], { selected: "default" });
  const context = appContext("/cli", "context", { env: {}, run: w.run });
  const guide = readFileSync(new URL("../skills/tc-apps/CONTEXT.md", import.meta.url), "utf8");
  assert.equal(context.host, host);
  assert.match(guide, /and its `host` as `<CONTEXT_HOST>`/);
  assert.match(guide, /--host '<CONTEXT_HOST>' kv list --prefix 'xyz\.tinycloud\.tinyapps\.context\/' --space applications/);
});

test("context write approval asks only for its data root and exact discovery entry", () => {
  assert.deepEqual(appPermissions("context", { write: true }), [
    { service: "tinycloud.kv", path: "xyz.tinycloud.tinyapps.context/", actions: ["get", "list", "put"] },
    { service: "tinycloud.kv", path: "xyz.tinycloud.tinyapps.catalog/context/entry", actions: ["get", "put"] },
  ]);
  const guide = readFileSync(new URL("../skills/tc-apps/CONTEXT.md", import.meta.url), "utf8");
  assert.match(guide, /scoped approval grants only `<C>\/` and this app's exact discovery entry/);
});

test("a context-scoped write succeeds without catalog-wide discovery access", () => {
  const permissions = [
    cap("xyz.tinycloud.tinyapps.context/", ["get", "list", "put"]),
    cap("xyz.tinycloud.tinyapps.catalog/context/entry", ["get", "put"]),
  ];
  const w = world([profile("tinyapp-context", permissions)], { selected: "tinyapp-context" });
  const run = (cli, args, options) => {
    const prefix = args[args.indexOf("--prefix") + 1];
    if (args.includes("list") && prefix === "xyz.tinycloud.tinyapps.catalog/") {
      return { status: 1, stdout: "", stderr: JSON.stringify({ error: { code: "PERMISSION_DENIED" } }) };
    }
    return w.run(cli, args, options);
  };
  const result = appContext("/cli", "context", { env: {}, run, write: true });
  assert.equal(result.status, "ready");
  assert.equal("appEntries" in result, false);
  assert.deepEqual(w.reads.map(({ args }) => args[args.indexOf("--prefix") + 1]), [
    "xyz.tinycloud.tinyapps.context/catalog/",
  ]);
});

test("the SQL helper reports index presence separately from session state", () => {
  const permissions = [cap("xyz.tinycloud.tinyapps.context/index", ["read"], "tinycloud.sql")];
  for (const [rows, expected] of [[[["records"]], true], [[], false]]) {
    const w = world([profile("default", permissions)], { selected: "default" });
    const run = (cli, args, options) => args.includes("query")
      ? { status: 0, stdout: JSON.stringify({ rows }), stderr: "" }
      : w.run(cli, args, options);
    const result = appContext("/cli", "context", { env: {}, run, sql: true });
    assert.equal(result.status, "ready");
    assert.equal(result.indexPresent, expected);
  }
  const contextGuide = readFileSync(new URL("../skills/tc-apps/CONTEXT.md", import.meta.url), "utf8");
  const sqlGuide = readFileSync(new URL("../skills/tc-apps/SQL.md", import.meta.url), "utf8");
  assert.match(contextGuide, /returned `ready` with `indexPresent: true`/);
  assert.match(sqlGuide, /If the block still fails, or `SKILL\.md` §3 showed the index's session `"expired"`, mark the kind as behind/);
});

test("app-context helper commands search Claude's active plugin skill before user skill installs", () => {
  for (const path of ["SKILL.md", "CONTEXT.md", "SQL.md", "TINY-APPS.md"]) {
    const guide = readFileSync(new URL(`../skills/tc-apps/${path}`, import.meta.url), "utf8");
    for (const line of guide.split("\n").filter((value) => value.includes('"$d/app-context.mjs"'))) {
      assert.match(line, /for d in "\$\{CLAUDE_SKILL_DIR:-\}" "\$\{CLAUDE_CONFIG_DIR:-\$HOME\/\.claude\}\/skills\/tc-apps" "\$HOME\/\.agents\/skills\/tc-apps"/, path);
    }
  }
});


test("a write lists every app's discovery entry, so the agent reuses an app instead of naming a second one", () => {
  const w = world([profile()], { catalog: { keys: ["xyz.tinycloud.tinyapps.catalog/gene-keys/entry", "xyz.tinycloud.tinyapps.catalog/todos/entry"], truncated: false, nextCursor: null } });
  const context = appContext("/cli", "genekeys", { env: {}, run: w.run, write: true });
  assert.deepEqual(context.appEntries, ["gene-keys", "todos"]);
  const prefixes = w.reads.map((r) => r.args[r.args.indexOf("--prefix") + 1]);
  assert.deepEqual(prefixes, ["xyz.tinycloud.tinyapps.genekeys/catalog/", "xyz.tinycloud.tinyapps.catalog/"]);
  assert.deepEqual(w.writes, []);
  const read = world([profile()]);
  const readOnly = appContext("/cli", "genekeys", { env: {}, run: read.run });
  assert.equal("appEntries" in readOnly, false);
  assert.equal(read.reads.length, 1);
  const partial = world([profile()], { catalog: { keys: [], truncated: true, nextCursor: "c" } });
  assert.throws(() => appContext("/cli", "genekeys", { env: {}, run: partial.run, write: true }), /incomplete/);
});
test("a scoped app write skips catalog-wide discovery without requesting broader access", () => {
  const p = profile("owner", [
    cap("xyz.tinycloud.tinyapps.notes/", ["get", "list", "put"]),
    cap("xyz.tinycloud.tinyapps.catalog/notes/entry", ["get", "put"]),
  ]);
  const w = world([p]);
  const context = appContext("/cli", "notes", { env: {}, run: w.run, write: true });
  assert.equal(context.status, "ready");
  assert.equal("appEntries" in context, false);
  const prefixes = w.reads.map((r) => r.args[r.args.indexOf("--prefix") + 1]);
  assert.deepEqual(prefixes, ["xyz.tinycloud.tinyapps.notes/catalog/"]);
});

test("a fresh key-only profile is sent to onboarding first, keeping the scoped sign-in details", () => {
  const p = profile("fresh", []);
  p.ownerDid = null;
  p.authenticated = false;
  p.session.present = false;
  const w = world([p], { selected: "fresh" });
  assert.deepEqual(appContext("/cli", "todos", { env: { TC_PROFILE: "fresh" }, run: w.run }), {
    status: "onboard-first", profile: "fresh", missing: appPermissions("todos"),
  });
  assert.deepEqual(w.writes, []);
  assert.deepEqual(w.reads, []);
});

test("no profile at all sends generic and catalog apps to onboarding first", () => {
  const w = world([], { selected: "default" });
  assert.deepEqual(appContext("/cli", "todos", { env: {}, run: w.run, write: true }), {
    status: "onboard-first", profile: "tinyapp-todos", missing: appPermissions("todos", { write: true }),
  });
  for (const app of ["healthlog", "recipes"]) {
    assert.deepEqual(appContext("/cli", app, { env: {}, run: w.run, catalog: true, write: true }), { status: "onboard-first" });
    assert.deepEqual(appContext("/cli", app, { env: {}, run: w.run, catalog: true }), { status: "onboard-first" });
  }
  assert.deepEqual(w.writes, []);
  assert.deepEqual(w.reads, []);
});

test("a key-only default profile without an owner is not onboarded for a catalog app", () => {
  const p = profile("default", []);
  p.ownerDid = null;
  p.authenticated = false;
  p.session.present = false;
  const w = world([p], { selected: "default" });
  assert.deepEqual(appContext("/cli", "healthlog", { env: {}, run: w.run, catalog: true, write: true }), { status: "onboard-first" });
});

test("a signed-out onboarded profile signs in again instead of onboarding", () => {
  const p = profile("owner", []);
  p.authenticated = false;
  const w = world([p]);
  const result = appContext("/cli", "todos", { env: {}, run: w.run, write: true });
  assert.equal(result.status, "sign-in-required");
  assert.equal(result.ownerDid, owner);
});

test("the informational SQL index check never sends the agent to onboarding", () => {
  const w = world([], { selected: "default" });
  assert.equal(appContext("/cli", "todos", { env: {}, run: w.run, sql: true, write: true }).status, "sign-in-required");
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

test("going back on an app-scoped profile reports only the app's exact discovery-entry delete as missing", () => {
  const scoped = profile("tinyapp-notes", [cap("xyz.tinycloud.tinyapps.notes/"), cap("xyz.tinycloud.tinyapps.catalog/notes/entry", ["get", "put"])]);
  const w = world([scoped], { selected: "tinyapp-notes" });
  assert.equal(appContext("/cli", "notes", { env: {}, run: w.run, write: true, remove: true }).status, "ready", "--delete alone never asks for the catalog");
  const back = appContext("/cli", "notes", { env: {}, run: w.run, removeEntry: true });
  assert.equal(back.status, "grant-required");
  assert.equal(back.profile, "tinyapp-notes");
  assert.deepEqual(back.missing, [{ service: "tinycloud.kv", path: "xyz.tinycloud.tinyapps.catalog/notes/entry", actions: ["del"], space }]);
  scoped.session.permissions.push(cap("xyz.tinycloud.tinyapps.catalog/notes/entry", ["del"]));
  assert.equal(appContext("/cli", "notes", { env: {}, run: w.run, removeEntry: true }).status, "ready");
  // Another app's catalog del does not count.
  assert.deepEqual(missingPermissions(profile("o", [cap("xyz.tinycloud.tinyapps.catalog/notebook/entry", ["del"])]), space, appPermissions("notes", { removeEntry: true }), now).map((entry) => entry.path), ["xyz.tinycloud.tinyapps.notes/", "xyz.tinycloud.tinyapps.catalog/notes/entry"]);
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
