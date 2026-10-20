import { randomUUID } from "node:crypto";
import { boundedJson, CONTEXT_VARIABLE, nativeIdentity } from "./contract.mjs";

const VERSION = "1.18.31";
const SESSION_LIMIT = 64;
const CALL_LIMIT = 256;
const TTL_MS = 300000;

async function supportedServer(serverUrl) {
  let timer, reader;
  const controller = new AbortController();
  try {
    const url = new URL(serverUrl);
    // The public API documents an origin-root route, not reverse-proxy prefixes.
    if (!/^(https?:)$/.test(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return false;
    url.pathname = "/global/health";
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(false); }, 500);
    });
    const request = (async () => {
      const response = await fetch(url, { signal: controller.signal, redirect: "error", credentials: "omit", headers: { Accept: "application/json" } });
      if (!response.ok || !response.body) { controller.abort(); return false; }
      reader = response.body.getReader();
      let size = 0;
      const chunks = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) { controller.abort(); return false; }
        chunks.push(value);
      }
      const payload = boundedJson(Buffer.concat(chunks).toString("utf8"), 4096, 8);
      return payload?.healthy === true && payload.version === VERSION;
    })().catch(() => false);
    return await Promise.race([request, timeout]);
  } catch { return false; }
  finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
}

// Root v1 Plugin API. No event/history hooks, disk spool, SDK credentials or logs.
export default async function tcDiagnostics({ serverUrl }) {
  if (!await supportedServer(serverUrl)) return {};
  const sessions = new Map();
  const calls = new Map();
  const removeSession = (id) => {
    sessions.delete(id);
    for (const [key, call] of calls) if (call.session === id) calls.delete(key);
  };
  const expire = () => {
    const now = performance.now();
    for (const [key, call] of calls) if (now - call.created > TTL_MS) calls.delete(key);
    for (const [id, session] of sessions) if (now - session.used > TTL_MS) removeSession(id);
    return now;
  };
  return {
    "tool.execute.before": async (input) => {
      try {
        if (input.tool !== "bash" || !nativeIdentity(input.sessionID) || !nativeIdentity(input.callID)) return;
        const now = expire();
        const key = `${input.sessionID}:${input.callID}`;
        if (calls.has(key)) return;
        let session = sessions.get(input.sessionID);
        if (!session) {
          if (sessions.size >= SESSION_LIMIT) removeSession(sessions.keys().next().value);
          session = { run: randomUUID(), used: now };
          sessions.set(input.sessionID, session);
        }
        session.used = now;
        if (calls.size >= CALL_LIMIT) calls.delete(calls.keys().next().value);
        calls.set(key, { session: input.sessionID, created: now,
          context: JSON.stringify({ version: 1, run_id: session.run, workflow_id: randomUUID(),
            adapter: "opencode_v1", adapter_revision: 1, client_version: VERSION }) });
      } catch { /* Attribution is optional, not permission or execution state. */ }
    },
    "shell.env": async (input, output) => {
      try {
        expire();
        // Do not pass stale per-call attribution or inherited scope to an unmatched shell.
        delete output.env[CONTEXT_VARIABLE];
        if (!nativeIdentity(input.sessionID) || !nativeIdentity(input.callID)) return;
        const call = calls.get(`${input.sessionID}:${input.callID}`);
        if (call) output.env[CONTEXT_VARIABLE] = call.context;
      } catch { /* Frozen/missing environments leave linkage unavailable. */ }
    },
    "tool.execute.after": async (input) => {
      try {
        expire();
        if (input.tool === "bash" && nativeIdentity(input.sessionID) && nativeIdentity(input.callID)) calls.delete(`${input.sessionID}:${input.callID}`);
      } catch { /* No output, arguments, title or metadata are read. */ }
    },
    dispose: async () => { calls.clear(); sessions.clear(); },
  };
}
