import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import plugin from "../skills/tc-apps/diagnostics/opencode-v1.mjs";
import { UUID } from "../skills/tc-apps/diagnostics/contract.mjs";

const exec = promisify(execFile);
const optional = join(dirname(fileURLToPath(import.meta.url)), "../skills/tc-apps/diagnostics");
const variable = "TC_DIAGNOSTICS_CONTEXT";
const canary = "PRIVATE_COMMAND_TOKEN_TRANSCRIPT";

async function home(t) {
  const path = await mkdtemp(join(tmpdir(), "tc-adapter-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
function attributionOnly(context, adapter, version) {
  assert(UUID.test(context.run_id));
  if (context.workflow_id) assert(UUID.test(context.workflow_id));
  assert.deepEqual(Object.keys(context).sort(), ["version", "run_id", ...(context.workflow_id ? ["workflow_id"] : []), "adapter", "adapter_revision", "client_version"].sort());
  assert.equal(context.version, 1);
  assert.equal(context.adapter, adapter);
  assert.equal(context.adapter_revision, 1);
  assert.equal(context.client_version, version);
  assert(!JSON.stringify(context).includes(canary));
}

async function server(t, mode = "valid") {
  const requests = [];
  const http = createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization, cookie: req.headers.cookie });
    if (mode === "hung") return;
    if (mode === "redirect") { res.writeHead(302, { location: "/history" }); res.end(); return; }
    if (mode === "unauthorized") { res.writeHead(401); res.end(canary); return; }
    res.setHeader("Content-Type", "application/json");
    if (mode === "oversized") res.end("x".repeat(4097));
    else if (mode === "deep") res.end("[".repeat(9) + "0" + "]".repeat(9));
    else if (mode === "malformed") res.end(canary);
    else res.end(JSON.stringify({ healthy: true, ...(mode !== "missing" ? { version: mode === "mismatch" ? "2.0.0" : "1.18.31" } : {}), private_metadata: canary }));
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  t.after(() => { http.closeAllConnections(); return new Promise((resolve) => http.close(resolve)); });
  return { url: new URL(`http://127.0.0.1:${http.address().port}/`), requests };
}
async function shell(hooks, sessionID, callID, env = {}) {
  await hooks["shell.env"]({ sessionID, callID, get cwd() { throw new Error(canary); } }, { env });
  return env[variable] ? JSON.parse(env[variable]) : undefined;
}

test("OpenCode concurrent exact calls isolate sessions, reuse only exact workflow links, discard content and clean completed mappings", async (t) => {
  const s = await server(t);
  const hooks = await plugin({ serverUrl: s.url, get client() { throw new Error("must not use SDK/history"); } });
  const ignored = new Proxy({}, { get() { throw new Error(canary); } });
  await Promise.all([
    hooks["tool.execute.before"]({ tool: "bash", sessionID: "sessionA", callID: "sameCall" }, ignored),
    hooks["tool.execute.before"]({ tool: "bash", sessionID: "sessionB", callID: "sameCall" }, ignored),
    hooks["tool.execute.before"]({ tool: "bash", sessionID: "sessionA", callID: "otherCall" }, ignored),
  ]);
  const [a, b, other] = await Promise.all([shell(hooks, "sessionA", "sameCall"), shell(hooks, "sessionB", "sameCall"), shell(hooks, "sessionA", "otherCall")]);
  [a, b, other].forEach((value) => attributionOnly(value, "opencode_v1", "1.18.31"));
  assert.notEqual(a.run_id, b.run_id);
  assert.equal(a.run_id, other.run_id);
  assert.notEqual(a.workflow_id, b.workflow_id);
  assert.notEqual(a.workflow_id, other.workflow_id);
  await hooks["tool.execute.before"]({ tool: "bash", sessionID: "sessionA", callID: "sameCall" }, ignored);
  assert.deepEqual(await shell(hooks, "sessionA", "sameCall"), a);
  await hooks["tool.execute.after"]({ tool: "bash", sessionID: "sessionA", callID: "sameCall", get args() { throw new Error(canary); } }, ignored);
  assert.equal(await shell(hooks, "sessionA", "sameCall"), undefined);
  assert.deepEqual(await shell(hooks, "sessionB", "sameCall"), b);
  assert.deepEqual(s.requests, [{ url: "/global/health", authorization: undefined, cookie: undefined }]);
  await hooks.dispose();
  assert.equal(await shell(hooks, "sessionB", "sameCall"), undefined);
});

test("OpenCode missing/mismatched IDs, non-shell tools and stripped context never infer a current task", async (t) => {
  const s = await server(t);
  const hooks = await plugin({ serverUrl: s.url });
  await hooks["tool.execute.before"]({ tool: "bash", sessionID: "one", callID: "call" });
  await hooks["tool.execute.before"]({ tool: "read", sessionID: "one", callID: "read" });
  await hooks["tool.execute.before"]({ tool: "bash", sessionID: canary + "/bad", callID: "bad" });
  for (const [session, call] of [[undefined, "call"], ["one", undefined], ["other", "call"], ["one", "other"], ["one", "read"], [canary + "/bad", "bad"]]) {
    const env = { UNRELATED: "keep", [variable]: JSON.stringify({ version: 1, scope: "tc-apps", run_id: randomUUID() }) };
    assert.equal(await shell(hooks, session, call, env), undefined);
    assert.deepEqual(env, { UNRELATED: "keep" });
  }
  const env = {};
  await shell(hooks, "one", "call", env);
  delete env[variable]; // Executor policy can strip an injected context.
  const result = await exec(process.execPath, ["-e", 'process.stdout.write(Object.hasOwn(process.env,"TC_DIAGNOSTICS_CONTEXT") ? "linked" : "unknown")'], { env });
  assert.equal(result.stdout, "unknown");
  assert.equal(hooks.event, undefined);
  await hooks.dispose();
});

test("OpenCode bounded maps evict rather than joining old calls or sessions", async (t) => {
  const s = await server(t);
  const hooks = await plugin({ serverUrl: s.url });
  for (let i = 0; i < 257; i++) await hooks["tool.execute.before"]({ tool: "bash", sessionID: "one", callID: `call${i}` });
  assert.equal(await shell(hooks, "one", "call0"), undefined);
  assert(UUID.test((await shell(hooks, "one", "call256")).workflow_id));
  for (let i = 0; i < 64; i++) await hooks["tool.execute.before"]({ tool: "bash", sessionID: `session${i}`, callID: "call" });
  assert.equal(await shell(hooks, "one", "call256"), undefined);
  assert(UUID.test((await shell(hooks, "session63", "call")).run_id));
  await hooks.dispose();
});

for (const mode of ["missing", "mismatch", "unauthorized", "redirect", "oversized", "deep", "malformed", "hung"]) {
  test(`OpenCode ${mode} server health is bounded unsupported fallback without history or credential requests`, { timeout: 4000 }, async (t) => {
    const s = await server(t, mode);
    assert.deepEqual(await plugin({ serverUrl: s.url }), {});
    assert.deepEqual(s.requests, [{ url: "/global/health", authorization: undefined, cookie: undefined }]);
  });
}

test("OpenCode rejects credential-bearing and prefixed URLs before any request", async (t) => {
  const s = await server(t);
  for (const suffix of ["prefix/", "?token=private", "#private"]) assert.deepEqual(await plugin({ serverUrl: new URL(suffix, s.url) }), {});
  const credentials = new URL(s.url);
  credentials.username = "private";
  credentials.password = "secret";
  assert.deepEqual(await plugin({ serverUrl: credentials }), {});
  assert.deepEqual(await plugin({ serverUrl: "file:///tmp/never-read" }), {});
  assert.deepEqual(s.requests, []);
});

test("OpenCode generated local entry loads the actual optional plugin without activation or executable permissions", async (t) => {
  const path = await home(t);
  const { stdout, stderr } = await exec(process.execPath, [join(optional, "opencode-config.mjs"), "--print-module"], { env: { HOME: path, TC_HOME: join(path, "profiles") } });
  assert.equal(stderr, "");
  const entry = join(path, "reviewed-plugin.mjs");
  await writeFile(entry, stdout, { mode: 0o600 });
  const generated = await import(new URL(`file://${entry}`).href);
  const s = await server(t);
  const hooks = await generated.default({ serverUrl: s.url });
  await hooks["tool.execute.before"]({ tool: "bash", sessionID: "generated", callID: "call" });
  attributionOnly(await shell(hooks, "generated", "call"), "opencode_v1", "1.18.31");
  assert.deepEqual(await readdir(path), ["reviewed-plugin.mjs"]);
  await hooks.dispose();
});

test("OpenCode attribution reaches actual scoped CLI evidence without admitting unrelated commands", {
  skip: !process.env.TC_DIAGNOSTICS_TEST_CLI, timeout: 20000,
}, async (t) => {
  const path = await home(t), cli = process.env.TC_DIAGNOSTICS_TEST_CLI;
  const s = await server(t);
  const hooks = await plugin({ serverUrl: s.url });
  t.after(() => hooks.dispose());
  await hooks["tool.execute.before"]({ tool: "bash", sessionID: "native-session-canary", callID: "native-call-canary" });
  const injected = {};
  const context = await shell(hooks, "native-session-canary", "native-call-canary", injected);
  const env = { PATH: process.env.PATH, HOME: path, TC_HOME: join(path, "profiles"),
    TC_DIAGNOSTICS_HOME: join(path, "diagnostics"), XDG_STATE_HOME: join(path, "state"), NO_COLOR: "1", ...injected };
  const run = (args) => exec(process.execPath, [cli, ...args], { env, timeout: 8000 })
    .then((result) => ({ code: 0, ...result }), (error) => ({ code: error.code, stdout: error.stdout, stderr: error.stderr }));
  assert.equal((await run(["diagnostics", "enable", "--scope", "tc-apps"])).code, 0);
  const unrelated = await run(["kv", "get"]);
  assert.notEqual(unrelated.code, 0);
  const selected = await run(["diagnostics", "run", "--scope", "tc-apps", "--", process.execPath, cli, "kv", "get"]);
  assert.deepEqual(selected, unrelated);
  const selection = join(path, "selection.json");
  await writeFile(selection, JSON.stringify({ all: true }), { mode: 0o600 });
  const result = await run(["diagnostics", "review", "--selection", selection]);
  assert.equal(result.code, 0, result.stderr);
  const review = JSON.parse(result.stdout);
  assert.equal(review.invocations.length, 1);
  assert.equal(review.invocations[0].start, "observed");
  assert.equal(review.invocations[0].finish, "observed");
  assert.equal(review.invocations[0].task_linkage, "unknown");
  assert(review.timeline.every((item) => item.event.run_id === context.run_id && item.event.workflow_id === context.workflow_id));
  assert(review.timeline.every((item) => item.provenance.adapter === "opencode_v1" && item.provenance.client_trust === "client_reported"));
  assert(!result.stdout.includes("native-session-canary") && !result.stdout.includes("native-call-canary"));
});
