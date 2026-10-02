#!/usr/bin/env node
// Synthetic loopback acceptance only. Never reads a user's TinyCloud profile.
// node general-operations-fixture.mjs CLI_PACKAGE NODE_BINARY [--keep]
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, symlink, rm, open } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";

const packageDir = resolve(process.argv[2]);
const binary = resolve(process.argv[3]);
const keep = process.argv.includes("--keep");
const modulesDir = dirname(dirname(packageDir));
const temp = await mkdtemp(join(tmpdir(), "tc-general-operations-"));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(TC_|TINYCLOUD_|ROCKET_)/.test(key)));
env.TC_HOME = join(temp, "synthetic-cli-home");
process.env.TC_HOME = env.TC_HOME;
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const host = `http://127.0.0.1:${port}`;
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  assert.equal(new URL(typeof input === "string" ? input : input.url ?? String(input)).origin, host, "External request blocked");
  return originalFetch(input, options);
};
let server;
let succeeded = false;
const checks = [];
function cli(args, profile = "operator", expectSuccess = true) {
  const result = spawnSync(process.execPath, [join(packageDir, "dist/index.js"), "--profile", profile, "--host", host, "--json", ...args], { env, encoding: "utf8", timeout: 20000 });
  if (expectSuccess === true) assert.equal(result.status, 0, result.stderr || result.stdout);
  else if (expectSuccess === false) assert.notEqual(result.status, 0, "Expected CLI failure");
  return { ...result, json: result.stdout.trim() ? JSON.parse(result.stdout) : undefined };
}
function ok(result, label) {
  if (!result.ok) throw new Error(`${label}: ${result.error.code}: ${result.error.message}`);
  return result.data;
}
function canonical(envelope, appId) {
  const record = typeof envelope.data === "string" ? JSON.parse(envelope.data) : envelope.data;
  assert.equal(record.app_id, appId);
  assert.ok(Array.isArray(record.manifests) && record.manifests.length === 1);
  return record;
}
function root(appId, space, prefix, body) {
  return `---\nformat: tinycloud-kv-knowledge/2\napp_id: ${appId}\nspace: ${JSON.stringify(space)}\nprefix: ${prefix}\n---\n\n${body}\n`;
}

try {
  await writeFile(join(temp, "tinycloud.toml"), `[global]\naddress = "127.0.0.1"\nport = ${port}\nlog_level = "critical"\n[global.storage]\ndatadir = "./data"\nstaging = "Memory"\n[global.storage.blocks]\ntype = "Local"\n[global.keys]\ntype = "Static"\nsecret = "${randomBytes(48).toString("base64url")}"\n[global.telemetry]\nenabled = false\n`);
  const log = await open(join(temp, "node.log"), "a", 0o600);
  server = spawn(binary, [], { cwd: temp, env, detached: true, stdio: ["ignore", log.fd, log.fd] });
  server.unref();
  await log.close();
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Local node exited: ${(await readFile(join(temp, "node.log"), "utf8")).slice(-3000)}`);
    try { await fetch(`${host}/health`); ready = true; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, "Local node startup deadline");
  checks.push("isolated loopback node started");
  await symlink(modulesDir, join(temp, "node_modules"));
  const { TinyCloudNode, NodeWasmBindings, PrivateKeySigner } = await import(pathToFileURL(join(modulesDir, "@tinycloud/node-sdk/dist/index.js")));
  const privateKey = randomBytes(32).toString("hex");
  const owner = new TinyCloudNode({ host, privateKey, autoCreateSpace: true });
  await owner.signIn();
  const accountSpace = await owner.ensureOwnedSpaceHosted("account");
  const appSpace = owner.spaceId;
  const database = "fixture_measurements";
  const weightsApp = "fixture.measurements";
  const notesApp = "fixture.notes";
  const weightsPrefix = "fixture/measurements";
  const notesPrefix = "fixture/notes";
  ok(await owner.sql.db(database).execute("CREATE TABLE measurements (id TEXT PRIMARY KEY NOT NULL, metric TEXT NOT NULL, occurrence_date TEXT NOT NULL, value REAL NOT NULL CHECK(value > 0), unit TEXT NOT NULL)"), "create schema");
  for (const row of [["baseline-march", "weight", "2026-03-03", 80, "kg"], ["baseline-august", "weight", "2026-08-02", 78, "kg"]]) {
    ok(await owner.sql.db(database).execute("INSERT INTO measurements(id,metric,occurrence_date,value,unit) VALUES (?,?,?,?,?)", row), "seed measurement");
  }
  ok(await owner.kv.put(`${weightsPrefix}/knowledge/index.md`, root(weightsApp, appSpace, weightsPrefix,
    `# Synthetic measurement records\n\nThis app stores body-weight observations in SQL database \`${database}\`, table \`measurements\`. This is disposable synthetic test data. Supported operations are reading, creating, correcting and deleting weight records.\n\nColumns: \`id\` is a stable text primary key; \`metric\` is \`weight\`; \`occurrence_date\` is the calendar date YYYY-MM-DD supplied by the user (interpret today in Europe/Lisbon); \`value\` is positive numeric; \`unit\` is \`kg\`. Do not derive dates from the SQL insertion time. Inspect sqlite_master before writing.\n\nFor create, generate one UUID and retain it for this logical operation. Insert with SQL placeholders. Read the exact ID back, compare every field, then report its ID. On uncertain delivery, query that same ID first: identical fields mean success, absent means retry the same ID, conflicting fields mean stop. A new UUID is a new observation; equal weight/date values are not automatically duplicates.\n\nCorrect/delete only a uniquely selected ID after reading its current row. If a user identifies several matching records, clarify. Correction uses a conditional UPDATE matching ID and original values, then reads the ID back. Deletion uses a conditional DELETE matching ID and original values, then verifies absence; never delete by date alone. Do not create or migrate schema during these operations. For averages, count readings, group units separately and use half-open date ranges.`)), "write measurement knowledge");
  ok(await owner.kv.put(`${notesPrefix}/knowledge/index.md`, root(notesApp, appSpace, notesPrefix,
    `# Synthetic named notes\n\nThis app stores named notes as JSON values in KV only. A note named \`NAME\` uses exact key \`${notesPrefix}/records/NAME.json\`. NAME is a user-supplied lowercase ASCII slug matching [a-z0-9-]+. Ask for a name if absent. The value is exactly {"name":"NAME","text":"user's note text"}. Supported operations are create, read, edit and delete a named note. This is disposable synthetic test data.\n\nFor create, GET the exact key first. NOT_FOUND means it may be created with PUT. An identical existing value means the requested state is already satisfied; different text is a conflict requiring the user to request replacement. After PUT, GET the exact key and compare name/text. On uncertain delivery, GET before retrying the same key/value.\n\nFor edit, GET the named key, retain name, replace only the requested text, PUT the updated object and GET to verify. KV has no compare-and-swap exposed here; concurrent edits cannot be protected, so disclose this limit when relevant. Do not overwrite any other note. For delete, GET the named key, delete exactly it and confirm GET returns NOT_FOUND. A missing note is already absent, not a permission failure. List only \`${notesPrefix}/records/\` when identifying a named note. Knowledge keys are read-only and are never note records.`)), "write notes knowledge");
  ok(await owner.kv.put("fixture/sibling/private", "synthetic sibling data"), "write sibling");
  const manifests = [
    { manifest_version: 1, app_id: weightsApp, name: "Measurements", description: "Body weight observations and weigh-ins", space: "default", prefix: weightsPrefix, defaults: false, includePublicSpace: false, knowledge: true, permissions: [
      { service: "tinycloud.kv", path: `${weightsPrefix}/knowledge/`, skipPrefix: true, actions: ["get"] },
      { service: "tinycloud.sql", path: database, skipPrefix: true, actions: ["read", "write"] }
    ] },
    { manifest_version: 1, app_id: notesApp, name: "Notes", description: "Named personal text notes stored in KV", space: "default", prefix: notesPrefix, defaults: false, includePublicSpace: false, knowledge: true, permissions: [
      { service: "tinycloud.kv", path: `${notesPrefix}/knowledge/`, skipPrefix: true, actions: ["get"] },
      { service: "tinycloud.kv", path: `${notesPrefix}/records/`, skipPrefix: true, actions: ["get", "put", "del", "list"] }
    ] }
  ];
  for (const manifest of manifests) ok(await owner.account.applications.register(manifest, { assumeUnregistered: true }), "register fixture app");
  checks.push("two distinct apps registered with v2 knowledge and different storage contracts");
  const bundle = await readFile(join(packageDir, "dist/legacy-entry.js"), "utf8");
  await writeFile(join(temp, "cli-probe.mjs"), `${bundle}\nexport { ProfileManager, refreshOpenKeySession, registerAuthCommand };\nexport function setConsent(acquire, output) { startAuthFlow = acquire; outputJson = output; }\n`);
  const shipped = await import(pathToFileURL(join(temp, "cli-probe.mjs")));
  const { Command } = await import(pathToFileURL(join(modulesDir, "commander/esm.mjs")));
  const signer = new PrivateKeySigner(privateKey);
  const address = await signer.getAddress();
  const wasm = new NodeWasmBindings();
  const registryPermissions = [
    { service: "tinycloud.kv", space: accountSpace, path: "applications/", actions: ["tinycloud.kv/list", "tinycloud.kv/get"] },
    { service: "tinycloud.capabilities", space: accountSpace, path: "", actions: ["tinycloud.capabilities/read"] }
  ];
  for (const profileName of ["setup", "operator", "reader"]) {
    cli(["init", "--name", profileName, "--key-only", "--host", host], profileName);
    const key = await shipped.ProfileManager.getKey(profileName);
    const profile = await shipped.ProfileManager.getProfile(profileName);
    async function consent(space, permissions) {
      const abilities = {};
      for (const permission of permissions) (abilities[permission.service.replace(/^tinycloud\./, "")] ??= {})[permission.path] = permission.actions;
      const prepared = wasm.prepareSession({ abilities, address, chainId: 1, domain: `127.0.0.1:${port}`, spaceId: space, jwk: key,
        issuedAt: new Date(Date.now() - 60_000).toISOString(), expirationTime: new Date(Date.now() + 6 * 3600_000).toISOString() });
      const signature = await signer.signMessage(prepared.siwe);
      const session = wasm.completeSessionSetup({ ...prepared, signature });
      const activated = await fetch(`${host}/delegate`, { method: "POST", headers: session.delegationHeader });
      assert.equal(activated.status, 200, await activated.text());
      return { ...session, verificationMethod: profile.did, address, chainId: 1, spaceId: space, siwe: prepared.siwe, signature,
        permissions: permissions.map(permission => ({ ...permission, space })) };
    }
    const primaryPermissions = [{ service: "tinycloud.capabilities", space: appSpace, path: "", actions: ["tinycloud.capabilities/read"] }];
    await shipped.refreshOpenKeySession(profileName, host, { permissions: primaryPermissions, expectedOwner: owner.did, openKeyAcquisition: async () => consent(appSpace, primaryPermissions) });
    const permissions = [
      { service: "tinycloud.kv", path: `${weightsPrefix}/knowledge/`, skipPrefix: true, actions: profileName === "setup" ? ["get", "put"] : ["get"] },
      { service: "tinycloud.kv", path: `${notesPrefix}/knowledge/`, skipPrefix: true, actions: profileName === "setup" ? ["get", "put"] : ["get"] },
      { service: "tinycloud.kv", path: `${notesPrefix}/records/`, skipPrefix: true, actions: profileName === "reader" ? ["get", "list"] : ["get", "put", "del", "list"] },
      { service: "tinycloud.sql", path: database, skipPrefix: true, actions: profileName === "setup" ? ["read", "write", "schema", "admin"] : profileName === "operator" ? ["read", "write"] : ["read"] },
      { service: "tinycloud.capabilities", path: "", skipPrefix: true, actions: ["read"] }
    ];
    const profileRegistry = profileName === "setup" ? registryPermissions.map(p => p.service === "tinycloud.kv" ? { ...p, actions: [...p.actions, "tinycloud.kv/put"] } : p) : registryPermissions;
    for (const [scopeName, space, entries] of [["registry", accountSpace, profileRegistry], ["app", appSpace, permissions]]) {
      const manifestFile = join(temp, `${profileName}-${scopeName}-grant.json`);
      await writeFile(manifestFile, JSON.stringify({ manifest_version: 1, app_id: `fixture.${profileName}`, space, defaults: false, includePublicSpace: false, permissions: entries.map(entry => ({ ...entry, skipPrefix: true })) }));
      shipped.setConsent(async (_did, options) => consent(space, options.permissions), () => {});
      const program = new Command().exitOverride().option("--profile <profile>").option("--host <host>").option("--json");
      shipped.registerAuthCommand(program);
      await program.parseAsync(["--profile", profileName, "--host", host, "--json", "auth", "request", "--manifest", manifestFile, "--grant", "--expiry", "6h", "--no-popup"], { from: "user" });
    }
  }
  // Seed via a separate setup CLI too: older local node binaries distinguish
  // SDK and CLI address casing on canonical record reads. Test profiles retain
  // only their declared operation authority, never setup's registration rights.
  for (const manifest of manifests) {
    const source = join(temp, `${manifest.app_id}.json`);
    await writeFile(source, JSON.stringify(manifest));
    cli(["account", "apps", "register", source], "setup");
    const key = `${manifest.prefix}/knowledge/index.md`;
    const body = ok(await owner.kv.get(key), "synthetic owner knowledge readback").data;
    cli(["kv", "put", "--space", appSpace, "--", key, body], "setup");
  }
  cli(["sql", "execute", "CREATE TABLE IF NOT EXISTS measurements (id TEXT PRIMARY KEY NOT NULL, metric TEXT NOT NULL, occurrence_date TEXT NOT NULL, value REAL NOT NULL CHECK(value > 0), unit TEXT NOT NULL)", "--db", database, "--space", appSpace], "setup");
  for (const row of [["baseline-march", "weight", "2026-03-03", 80, "kg"], ["baseline-august", "weight", "2026-08-02", 78, "kg"]]) {
    cli(["sql", "execute", "INSERT OR IGNORE INTO measurements(id,metric,occurrence_date,value,unit) VALUES (?,?,?,?,?)", "--params", JSON.stringify(row), "--db", database, "--space", appSpace], "setup");
  }
  const listed = cli(["account", "apps", "list", "--live"]).json;
  const diagnosticGet = cli(["kv", "get", `applications/${weightsApp}`, "--space", accountSpace], "operator", null);
  await writeFile(join(temp, "diagnostic-discovery.json"), JSON.stringify({ listed, accountSpace, appSpace, ownerAccountSpace: owner.accountSpaceId, context: cli(["context", "--space", "account"]).json, ownerListed: ok(await owner.account.applications.list(), "owner list"), directList: cli(["kv", "list", "--prefix", "applications/", "--space", accountSpace]).json, directGet: { status: diagnosticGet.status, stdout: diagnosticGet.stdout, stderr: diagnosticGet.stderr } }, null, 2));
  assert.equal(listed.count, 2, `Live discovery must find both apps. Diagnostics: ${temp}/diagnostic-discovery.json`);
  for (const app of listed.applications) {
    const record = canonical(cli(["kv", "get", `applications/${app.appId}`, "--space", accountSpace]).json, app.appId);
    const manifest = record.manifests[0];
    const knowledge = cli(["kv", "get", `${manifest.prefix}/knowledge/index.md`, "--space", appSpace]).json;
    assert.match(knowledge.data, /format: tinycloud-kv-knowledge\/2/);
  }
  checks.push("actual CLI live registry discovery and canonical normalization recovered both app manifests and v2 roots");
  const id = randomUUID();
  const params = JSON.stringify([id, "weight", "2026-09-30", 75.5, "kg"]);
  cli(["sql", "query", "SELECT sql FROM sqlite_master WHERE type = ? AND name = ?", "--params", '["table","measurements"]', "--db", database, "--space", appSpace]);
  cli(["sql", "execute", "INSERT INTO measurements(id,metric,occurrence_date,value,unit) VALUES (?,?,?,?,?)", "--params", params, "--db", database, "--space", appSpace]);
  const readId = () => cli(["sql", "query", "SELECT id,metric,occurrence_date,value,unit FROM measurements WHERE id = ?", "--params", JSON.stringify([id]), "--db", database, "--space", appSpace]).json;
  assert.deepEqual(readId().rows, [[id, "weight", "2026-09-30", 75.5, "kg"]]);
  assert.equal(readId().rowCount, 1, "uncertain-delivery reconciliation uses the original ID");
  cli(["sql", "execute", "UPDATE measurements SET value = ? WHERE id = ? AND value = ?", "--params", JSON.stringify([75.6, id, 75.5]), "--db", database, "--space", appSpace]);
  assert.equal(readId().rows[0][3], 75.6);
  cli(["sql", "execute", "DELETE FROM measurements WHERE id = ? AND value = ?", "--params", JSON.stringify([id, 75.6]), "--db", database, "--space", appSpace]);
  assert.equal(readId().rowCount, 0);
  checks.push("SQL create, ID-based reconciliation, conditional correction, deletion and exact readback passed");
  const key = `${notesPrefix}/records/probe.json`;
  const initialNote = JSON.stringify({ name: "probe", text: "Synthetic first text" });
  cli(["kv", "put", "--space", appSpace, "--", key, initialNote]);
  assert.equal(cli(["kv", "get", key, "--space", appSpace]).json.data, initialNote);
  const changedNote = JSON.stringify({ name: "probe", text: "Synthetic updated text" });
  cli(["kv", "put", "--space", appSpace, "--", key, changedNote]);
  assert.equal(cli(["kv", "get", key, "--space", appSpace]).json.data, changedNote);
  cli(["kv", "delete", key, "--space", appSpace]);
  const missingNote = cli(["kv", "get", key, "--space", appSpace], "operator", false);
  assert.match(missingNote.stdout + missingNote.stderr, /NOT_FOUND/);
  checks.push("KV create, edit, exact readback, delete and verified absence passed");
  const denied = [
    cli(["kv", "get", "fixture/sibling/private", "--space", appSpace], "operator", false),
    cli(["sql", "execute", "INSERT INTO measurements(id,metric,occurrence_date,value,unit) VALUES (?,?,?,?,?)", "--params", params, "--db", database, "--space", appSpace], "reader", false),
    cli(["kv", "put", "--space", appSpace, "--", key, initialNote], "reader", false),
    cli(["sql", "execute", "CREATE TABLE fixture_forbidden (id TEXT)", "--db", database, "--space", appSpace], "operator", false)
  ];
  for (const deniedResult of denied) assert.match(deniedResult.stdout + deniedResult.stderr, /AUTH_UNAUTHORIZED|Unauthorized|unauthorized|PERMISSION_DENIED/);
  checks.push("server denied sibling access, reader SQL and KV writes, and operator schema creation");
  const remaining = cli(["sql", "query", "SELECT id FROM measurements ORDER BY id", "--db", database, "--space", appSpace]).json;
  assert.deepEqual(remaining.rows, [["baseline-august"], ["baseline-march"]]);
  cli(["profile", "switch", "operator"]);
  cli(["profile", "delete", "setup"]);
  const cliBin = join(modulesDir, ".bin/tc");
  const connection = { cli: cliBin, readerHome: env.TC_HOME, profile: "operator", host, expectedOwnerDid: owner.did };
  await writeFile(join(temp, "connection.json"), JSON.stringify(connection, null, 2));
  const context = { classification: "disposable synthetic fixture; no user credentials", directory: temp, host, serverPid: server.pid, cli: cliBin, cliHome: env.TC_HOME, profiles: ["operator", "reader"], accountSpace, appSpace, database, applications: manifests.map(m => m.app_id), connection: join(temp, "connection.json"), cleanup: `kill ${server.pid}; rm -rf -- '${temp}'` };
  await writeFile(join(temp, "fixture-context.json"), JSON.stringify(context, null, 2), { mode: 0o600 });
  const results = { classification: "actual CLI and local node; synthetic proof consent; not human OpenKey acceptance", cliVersion: "0.10.0", binarySha256: createHash("sha256").update(await readFile(binary)).digest("hex"), checks, baselineRowsPreserved: true, retained: keep };
  await writeFile(join(temp, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ results, ...(keep ? { context } : {}) }, null, 2));
  succeeded = true;
} finally {
  globalThis.fetch = originalFetch;
  if (!(keep && succeeded)) {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([new Promise(resolve => server.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
      if (server.exitCode === null) server.kill("SIGKILL");
    }
    if (succeeded) await rm(temp, { recursive: true, force: true });
    else console.error(`Failed fixture retained for synthetic diagnostics: ${temp}`);
  }
}
