#!/usr/bin/env node
// Disposable acceptance fixture. Never reads an existing user's profile.
// node app-creation-fixture.mjs CLI_PACKAGE NODE_BINARY [--keep]
// With --keep, retain this process: it serves synthetic OpenKey consent.
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, mkdir, open, chmod } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

assert.ok(process.argv[2] && process.argv[3], "Provide CLI package directory and local node binary");
process.umask(0o077);
const packageDir = resolve(process.argv[2]);
const binary = resolve(process.argv[3]);
const keep = process.argv.includes("--keep");
const modulesDir = dirname(dirname(packageDir));
const directory = await mkdtemp("/private/tmp/tc-app-creation-");
const privateDirectory = join(directory, "private");
const agentDirectory = join(directory, "agent");
await mkdir(privateDirectory);
await mkdir(agentDirectory);
const tcHome = join(agentDirectory, "tc-home");
const observerHome = join(privateDirectory, "observer-home");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(TC_|TINYCLOUD_|ROCKET_)/.test(key)));
const nodeLog = await open(join(privateDirectory, "node.log"), "a", 0o600);
let node;
let consentServer;
let succeeded = false;
const checks = [];
const grants = [];
const protectedReaders = new Set();
const internalIdentities = new Set();
let shuttingDown = false;
async function stop() {
  if (shuttingDown) return;
  shuttingDown = true;
  consentServer?.close();
  if (node && node.exitCode === null) node.kill("SIGTERM");
}
process.on("SIGTERM", async () => { await stop(); process.exit(0); });
process.on("SIGINT", async () => { await stop(); process.exit(0); });
async function listen(server) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}
async function run(executable, args, home = tcHome, expected = true) {
  const child = spawn(executable, args, { env: { ...env, TC_HOME: home }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill("SIGTERM"), 30000);
  const status = await new Promise(resolve => child.on("exit", resolve));
  clearTimeout(timer);
  if (expected === true) assert.equal(status, 0, stderr || stdout);
  if (expected === false) assert.notEqual(status, 0, "Expected denial");
  return { status, stdout, stderr, json: stdout.trim() ? JSON.parse(stdout) : undefined };
}
try {
  const reservation = createServer();
  const nodePort = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const host = `http://127.0.0.1:${nodePort}`;
  await writeFile(join(privateDirectory, "tinycloud.toml"), `[global]\naddress = "127.0.0.1"\nport = ${nodePort}\nlog_level = "critical"\n[global.storage]\ndatadir = "./data"\nstaging = "Memory"\n[global.storage.blocks]\ntype = "Local"\n[global.keys]\ntype = "Static"\nsecret = "${randomBytes(48).toString("base64url")}"\n[global.telemetry]\nenabled = false\n`);
  node = spawn(binary, [], { cwd: privateDirectory, env, stdio: ["ignore", nodeLog.fd, nodeLog.fd] });
  await nodeLog.close();
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (node.exitCode !== null) throw new Error(`Disposable node exited (${node.exitCode}); see private log`);
    try { await fetch(`${host}/health`); ready = true; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, "Disposable node startup deadline");
  const { TinyCloudNode, NodeWasmBindings, PrivateKeySigner } = await import(pathToFileURL(join(modulesDir, "@tinycloud/node-sdk/dist/index.js")));
  const secret = randomBytes(32).toString("hex");
  const owner = new TinyCloudNode({ host, privateKey: secret, autoCreateSpace: true });
  await owner.signIn();
  const accountSpace = await owner.ensureOwnedSpaceHosted("account");
  const appSpace = owner.spaceId;
  const signer = new PrivateKeySigner(secret);
  const address = await signer.getAddress();
  const wasm = new NodeWasmBindings();
  const ownerDid = owner.did;
  const allowedSpaces = new Set([appSpace.toLowerCase(), accountSpace.toLowerCase()]);
  const knownProfiles = async (home) => {
    const { readdir } = await import("node:fs/promises");
    let names;
    try { names = await readdir(join(home, ".tinycloud", "profiles")); } catch { return []; }
    return Promise.all(names.map(async name => {
      try { return JSON.parse(await readFile(join(home, ".tinycloud", "profiles", name, "profile.json"), "utf8")); } catch { return {}; }
    }));
  };
  consentServer = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      assert.equal(request.method, "GET");
      assert.equal(url.pathname, "/delegate");
      assert.equal(url.searchParams.get("host"), host, "Consent restricted to disposable node");
      const callback = new URL(url.searchParams.get("callback"));
      assert.equal(callback.hostname, "127.0.0.1");
      assert.equal(callback.protocol, "http:");
      assert.equal(callback.pathname, "/callback");
      const did = url.searchParams.get("did");
      const jwk = JSON.parse(Buffer.from(url.searchParams.get("jwk"), "base64url"));
      assert.equal(jwk.d, undefined, "Only public key crosses consent URL");
      const profiles = await knownProfiles(tcHome);
      assert.ok(internalIdentities.has(did) || profiles.some(profile => profile.did === did), "Unknown session identity");
      const permissions = JSON.parse(Buffer.from(url.searchParams.get("permissions"), "base64url")).permissions;
      assert.ok(permissions.length > 0);
      const spaces = new Set(permissions.map(permission => permission.space));
      assert.equal(spaces.size, 1, "One consent space at a time");
      const spaceId = [...spaces][0];
      assert.ok(allowedSpaces.has(spaceId.toLowerCase()), "Only fixture-owned spaces");
      const internal = internalIdentities.has(did);
      for (const permission of permissions) {
        assert.ok(["tinycloud.kv", "tinycloud.sql", "tinycloud.capabilities"].includes(permission.service));
        assert.ok(permission.actions.length > 0);
        for (const action of permission.actions) {
          assert.ok(action.startsWith(`${permission.service}/`));
          const verb = action.split("/")[1];
          assert.ok(["get", "list", "put", "del", "read", "write", "schema", "admin"].includes(verb));
          if (!internal && protectedReaders.has(did)) assert.ok(["get", "list", "read"].includes(verb), "Protected reader cannot acquire writes");
          if (!internal) {
            assert.ok(!permission.path.includes("*"), "No wildcard resource requests");
            if (permission.service === "tinycloud.capabilities") assert.equal(verb, "read");
            else assert.ok(permission.path.length > 0, "No entire-space data authority");
            if (spaceId.toLowerCase() === accountSpace.toLowerCase()) {
              assert.equal(permission.service === "tinycloud.sql", false, "No account SQL index grants");
              if (!["read", "get", "list"].includes(verb)) {
                assert.equal(permission.service, "tinycloud.kv");
                assert.equal(verb, "put");
                assert.match(permission.path, /^applications\/[^/]+$/, "Registry put must target one canonical key");
              }
            }
          }
        }
      }
      const abilities = {};
      for (const permission of permissions) (abilities[permission.service.replace(/^tinycloud\./, "")] ??= {})[permission.path] = permission.actions;
      const requestedExpiry = url.searchParams.get("expiry") ?? "6h";
      const duration = requestedExpiry.match(/^(\d+)(s|m|h|d|w)$/);
      assert.ok(duration, "Synthetic transport requires a duration expiry");
      const expiryMs = Math.min(Number(duration[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 }[duration[2]], 6 * 3600000);
      assert.ok(expiryMs > 0);
      const prepared = wasm.prepareSession({ abilities, address, chainId: 1, domain: `127.0.0.1:${nodePort}`, spaceId, jwk,
        issuedAt: new Date(Date.now() - 60000).toISOString(), expirationTime: new Date(Date.now() + expiryMs).toISOString() });
      const signature = await signer.signMessage(prepared.siwe);
      const session = wasm.completeSessionSetup({ ...prepared, signature });
      const activated = await fetch(`${host}/delegate`, { method: "POST", headers: session.delegationHeader });
      assert.equal(activated.status, 200, "Synthetic delegation activation failed");
      const payload = { ...session, verificationMethod: did, address, chainId: 1, spaceId, siwe: prepared.siwe, signature, permissions };
      const delivered = await fetch(callback, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      assert.equal(delivered.status, 200, "CLI callback rejected synthetic proof");
      grants.push({ at: new Date().toISOString(), did, internal, requestedExpiry, expiryMs, permissions });
      await writeFile(join(privateDirectory, "grants.json"), JSON.stringify(grants, null, 2));
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ approved: true, synthetic: true }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  const consentPort = await listen(consentServer);
  const openkeyHost = `http://127.0.0.1:${consentPort}`;
  const cli = join(agentDirectory, "tc");
  // This launcher does not modify CLI implementation or transport signed proof.
  // It opens only the synthetic consent URL; the server delivers proof straight
  // to the CLI's actual supported loopback callback.
  await writeFile(cli, `#!${process.execPath}\nimport { spawn } from 'node:child_process';\nimport { appendFileSync, readFileSync, unlinkSync } from 'node:fs';\nconst args = process.argv.slice(2);\nconst child = spawn(${JSON.stringify(process.execPath)}, [${JSON.stringify(join(packageDir, "dist/index.js"))}, ...args], { env: {...process.env, TC_OPENKEY_HOST: ${JSON.stringify(openkeyHost)}, TC_AUTH_NO_POPUP: '1'}, stdio: ['inherit', 'pipe', 'pipe'] });\nlet stderr = '', stdout = '';\nconst requests = new Set();\nchild.stdout.on('data', chunk => { stdout += chunk; });\nchild.stderr.on('data', chunk => { stderr += chunk; const urls = stderr.match(/http:\\/\\/127\\.0\\.0\\.1:${consentPort}\\/delegate\\?[^\\s]+/g) || []; for (const url of urls) if (!requests.has(url)) { requests.add(url); fetch(url).then(async response => { if (!response.ok) { process.stderr.write('Synthetic consent denied: ' + await response.text() + '\\n'); child.kill('SIGTERM'); } }).catch(error => { process.stderr.write('Synthetic transport: ' + error.message + '\\n'); child.kill('SIGTERM'); }); } });\nchild.on('exit', (code, signal) => {\n  appendFileSync(${JSON.stringify(join(privateDirectory, "commands.jsonl"))}, JSON.stringify({ at: new Date().toISOString(), home: process.env.TC_HOME, args, code, signal }) + '\\n');\n  let lose = false;\n  try { const rule = JSON.parse(readFileSync(${JSON.stringify(join(privateDirectory, "interrupt-next.json"))}, 'utf8')); if (code === 0 && !args.includes('--help') && (!rule.profile || args.includes(rule.profile)) && rule.contains.every(value => args.includes(value))) { lose = true; unlinkSync(${JSON.stringify(join(privateDirectory, "interrupt-next.json"))}); } } catch {}\n  if (lose) { process.stderr.write('Synthetic interruption: operation completed, receipt intentionally lost. Reconcile saved plan.\\n'); process.exitCode = 86; return; }\n  process.stdout.write(stdout);\n  process.stderr.write(stderr.replace(/Open this URL in a browser to authenticate: [^\\n]+/g, 'Synthetic loopback consent delivered.'));\n  process.exitCode = code ?? 1;\n});\n`);
  await chmod(cli, 0o700);
  const call = (args, profile = "reader", home = tcHome, expected = true) => run(cli, ["--profile", profile, "--host", host, "--json", ...args], home, expected);
  const capabilityRead = { service: "tinycloud.capabilities", path: "", skipPrefix: true, actions: ["read"] };
  const grant = async (profile, permissions, space, { login = false, home = tcHome } = {}) => {
    const path = join(privateDirectory, `grant-${randomBytes(6).toString("hex")}.json`);
    await writeFile(path, JSON.stringify({ manifest_version: 1, app_id: `fixture.${profile}`, space, defaults: false, includePublicSpace: false, permissions: permissions.map(permission => ({ ...permission, skipPrefix: true })) }));
    return call(login ? ["auth", "login", "--method", "openkey", "--manifest", path, "--owner", ownerDid, "--expiry", "6h", "--no-popup"] : ["auth", "request", "--manifest", path, "--grant", "--expiry", "6h", "--no-popup"], profile, home);
  };
  const initialize = async (profile, home, internal = false) => {
    await call(["init", "--name", profile, "--key-only", "--host", host], profile, home);
    const identity = JSON.parse(await readFile(join(home, ".tinycloud", "profiles", profile, "profile.json"), "utf8"));
    if (internal) internalIdentities.add(identity.did);
    if (profile === "reader" && home === tcHome) protectedReaders.add(identity.did);
    await grant(profile, [capabilityRead], appSpace, { login: true, home });
  };
  await initialize("observer", observerHome, true);
  await grant("observer", [{ service: "tinycloud.kv", path: "", actions: ["get", "list", "put", "del"] }, { service: "tinycloud.sql", path: "", actions: ["read", "write", "schema", "admin"] }, capabilityRead], appSpace, { home: observerHome });
  await grant("observer", [{ service: "tinycloud.kv", path: "applications/", actions: ["get", "list"] }, capabilityRead], accountSpace, { home: observerHome });
  // Seed real siblings but deliberately never register any application.
  const siblingKey = "fixture-sibling/private.json";
  const siblingDb = "fixture_sibling";
  await call(["kv", "put", siblingKey, '{"synthetic":"preserve"}', "--space", appSpace], "observer", observerHome);
  await call(["sql", "execute", "CREATE TABLE sibling (id TEXT PRIMARY KEY, value TEXT NOT NULL)", "--db", siblingDb, "--space", appSpace], "observer", observerHome);
  await call(["sql", "execute", "INSERT INTO sibling VALUES (?,?)", "--params", '["sentinel","preserve"]', "--db", siblingDb, "--space", appSpace], "observer", observerHome);
  await initialize("reader", tcHome);
  await grant("reader", [{ service: "tinycloud.kv", path: "applications/", actions: ["get", "list"] }, capabilityRead], accountSpace);
  assert.equal((await call(["account", "apps", "list", "--live"])).json.count, 0);
  checks.push("actual CLI scoped login and additional grant accepted synthetic callback proof; initial live application registry is empty");
  // Separate exact database grants establish the server's actual SQL boundary.
  for (const [profile, actions] of [["probe-writer", ["read", "write"]], ["probe-schema", ["read", "schema"]]]) {
    await initialize(profile, observerHome, true);
    await grant(profile, [{ service: "tinycloud.sql", path: "fixture_schema_probe", actions }, capabilityRead], appSpace, { home: observerHome });
  }
  const ddl = ["sql", "execute", "CREATE TABLE probe (id TEXT PRIMARY KEY, value TEXT)", "--db", "fixture_schema_probe", "--space", appSpace];
  const deniedSchema = await call(ddl, "probe-writer", observerHome, false);
  assert.match(deniedSchema.stdout + deniedSchema.stderr, /AUTH_UNAUTHORIZED|Unauthorized|unauthorized|PERMISSION_DENIED/);
  await call(ddl, "probe-schema", observerHome);
  await call(["sql", "execute", "INSERT INTO probe VALUES (?,?)", "--params", '["row","value"]', "--db", "fixture_schema_probe", "--space", appSpace], "probe-writer", observerHome);
  assert.equal((await call(["sql", "query", "SELECT * FROM probe", "--db", "fixture_schema_probe", "--space", appSpace], "probe-writer", observerHome)).json.rowCount, 1);
  const deniedSibling = await call(["kv", "get", siblingKey, "--space", appSpace], "probe-writer", observerHome, false);
  assert.match(deniedSibling.stdout + deniedSibling.stderr, /AUTH_UNAUTHORIZED|Unauthorized|unauthorized|PERMISSION_DENIED/);
  const deniedRegistry = await call(["kv", "put", "applications/forbidden", "{}", "--space", accountSpace], "probe-writer", observerHome, false);
  assert.match(deniedRegistry.stdout + deniedRegistry.stderr, /AUTH_UNAUTHORIZED|Unauthorized|unauthorized|PERMISSION_DENIED/);
  checks.push("exact SQL read+schema permits CREATE; read+write permits INSERT but server denies CREATE; sibling KV and registry writes denied");
  assert.equal((await call(["account", "apps", "list", "--live"])).json.count, 0);
  const connection = { cli, tcHome, readerHome: tcHome, profile: "reader", host, expectedOwnerDid: ownerDid, accountSpace, appSpace, openkeyHost,
    installedSkill: resolve(packageDir, "../../../..", ".agents/skills/tc-cli/SKILL.md") };
  const connectionFile = join(agentDirectory, "connection.json");
  await writeFile(connectionFile, JSON.stringify(connection, null, 2));
  const context = { classification: "disposable synthetic fixture; no user credentials", directory, agentDirectory, connectionFile, cli, tcHome, profile: "reader", host, expectedOwnerDid: ownerDid, accountSpace, appSpace, openkeyHost, fixturePid: process.pid, nodePid: node.pid,
    observer: { tcHome: observerHome, profile: "observer" }, siblingKey, siblingDb, commandLog: join(privateDirectory, "commands.jsonl"), grantLog: join(privateDirectory, "grants.json"), interruptControl: join(privateDirectory, "interrupt-next.json") };
  await writeFile(join(directory, "fixture-context.json"), JSON.stringify(context, null, 2));
  const results = { classification: "actual CLI and disposable node; synthetic OpenKey callback signing, not human onboarding", cliVersion: "0.10.0", binarySha256: createHash("sha256").update(await readFile(binary)).digest("hex"), checks, initialApplicationCount: 0 };
  await writeFile(join(directory, "fixture-results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ results, context }, null, 2));
  succeeded = true;
  if (keep) await new Promise(() => {});
} finally {
  if (!keep || !succeeded) await stop();
  if (!succeeded) console.error(`Failed synthetic fixture retained: ${directory}`);
}
