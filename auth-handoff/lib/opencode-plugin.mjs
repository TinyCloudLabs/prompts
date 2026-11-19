// Native capture adapted from TinyCloudLabs/tinychat f67bf08417c8954fc0bab4379e99db13977f4d96,
// agent-skills/tinychat-retrieval/lib/opencode-plugin.mjs. No model-facing import tool.
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { messages as loginMessages } from './login.mjs';

const prompt = 'Complete sign-in in the browser, then paste the code here.';
const fail = code => ({ ok: false, status: 'login-failed', error: { code, message: 'Sign-in was not completed. Preserve the selected context and original request.' } });
const known = new Set(['APPROVAL_IN_ANOTHER_SESSION','INVALID_AUTH_RESPONSE','AUTH_RESPONSE_REJECTED','OPENKEY_PROOF_INVALID','OWNER_MISMATCH','OPENKEY_SCOPE_MISMATCH','OPENKEY_SCOPE_INCOMPLETE','OPENKEY_DISCOVERY_MISMATCH','OPENKEY_DISCOVERY_UNAVAILABLE','OPENKEY_GRANT_BROADENED','AUTH_EXPIRED','AUTH_TRANSPORT_TIMEOUT','CLI_UNAVAILABLE','APPROVAL_CONTEXT_CHANGED','BROWSER_OPEN_FAILED','CONVERSATION_MISMATCH','NO_PENDING_APPROVAL','DUPLICATE_AUTH_RESPONSE','AUTH_CAPTURE_IN_PROGRESS','ADDITIONAL_GRANT_UNSUPPORTED','CONTEXT_MISMATCH','CONFIG_INVALID','SETUP_CONFIG_INVALID','HANDOFF_NOT_PREPARED','SETUP_CONFIG_REQUIRED','SESSION_EXPIRY_UNKNOWN','AUTH_SCOPE_NOT_AVAILABLE','PRIMARY_SESSION_REQUIRED','HANDOFF_CANCELLED','PENDING_APPROVAL','AUTH_REQUIRED']);
for (const code of ['CLI_COMMAND_FAILED', 'CLI_ARGUMENT_INVALID', 'CLI_STARTUP_FAILED', 'CLI_INCOMPATIBLE', 'RELEASE_INVALID', 'RELEASE_INTEGRITY_FAILED', 'OPENKEY_DEPLOYMENT_INCOMPATIBLE', 'APP_READ_SCOPE_UNSUPPORTED', 'APP_NOT_FOUND', 'CONTEXT_NOT_FOUND', 'INVALID_RESPONSE', 'PRIVATE_STATE_REQUIRED', 'NETWORK_ERROR']) known.add(code);
const safeError = error => {
  const result = fail(known.has(error?.code) ? error.code : 'SIGNIN_FAILED');
  if (loginMessages[result.error.code]) result.error.message = loginMessages[result.error.code];
  if (known.has(error?.code)) {
    for (const field of ['cliPath', 'cliVersion', 'phase']) if (typeof error[field] === 'string') result.error[field] = error[field];
    if (/^error: unknown option '--[a-z][a-z0-9-]{0,80}'$/.test(error.diagnostic ?? '')) result.error.diagnostic = error.diagnostic;
  }
  return result;
};
known.add('AUTH_RECEIPT_INVALID');
const responseLike = (text, awaiting) => {
  const value = text.trimStart();
  if (awaiting) return value.startsWith('{') || /^eyJ|^[A-Za-z0-9+/_=-]{32}/.test(value);
  return /^eyJ[A-Za-z0-9+/_=-]{125}/.test(value) || (value.startsWith('{') && /"(?:delegationHeader|authorization|signature|siwe)"\s*:/.test(value));
};
const stringify = JSON.stringify;
const capturePrefix = 'TinyCloud sign-in receipt: ';

export function createSigninHooks({ forSession, legacy = false, readConfig = async path => JSON.parse(await readFile(path, 'utf8')) }) {
  const messages = new Set(), busy = new Set(), receipts = new Map(), armed = new Set(), claims = new Map();
  const release = id => { for (const [key, holder] of claims) if (holder === id) claims.delete(key); };
  function claim(value, id) {
    if (!value.host || !value.sessionDid) return;
    const key = JSON.stringify([value.host, value.sessionDid]);
    if (claims.has(key) && claims.get(key) !== id) throw Object.assign(new Error(), { code: 'APPROVAL_IN_ANOTHER_SESSION' });
    claims.set(key, id);
  }
  const safe = callback => async (args, context) => {
    if (!context?.sessionID) return stringify(fail('CONVERSATION_REQUIRED'));
    try {
      const result = await callback(args, context.sessionID);
      if (result.status === 'awaiting-approval') { claim(result, context.sessionID); armed.add(context.sessionID); }
      else if (['ready', 'cancelled', 'expired'].includes(result.status)) { armed.delete(context.sessionID); release(context.sessionID); }
      return stringify({ ok: true, ...result });
    } catch (error) {
      if (error.code === 'BROWSER_OPEN_FAILED' && error.delivery?.artifactPath) {
        armed.add(context.sessionID);
        return stringify({ ...safeError(error), delivery: { artifactPath: error.delivery.artifactPath }, instructions: 'Open this pending approval artifact, then paste the response here.' });
      }
      return stringify(safeError(error));
    }
  };
  function redact(parts, result) {
    let first = true;
    for (const part of parts) if (part.type === 'text' && !part.synthetic) {
      part.text = first ? capturePrefix + stringify(result) : '[Additional authorization input withheld.]'; first = false;
    }
  }
  const hooks = {
    tool: {
      tinycloud_setup: {
        description: "Set up TinyCloud app reads for the original request. Selects the bundled runtime and saved account, reads the app registry, reuses sufficient authority or opens one approval. No JSON files, CLI path, manifest or signed response. If selection-required, choose using returned app descriptions and call again with appId. Status/cancel are recovery controls.", args: {},
        execute: safe(async (args, conversationId) => {
          let result, acquiredClaim = false;
          try { result = await forSession(conversationId).setup(args, { beforeAuthorize: value => { claim(value, conversationId); acquiredClaim = true; } }); }
          catch (error) { if (acquiredClaim && error.code !== 'BROWSER_OPEN_FAILED') release(conversationId); throw error; }
          return { ...result, ...(result.status === 'awaiting-approval' ? { instructions: prompt } : {}) };
        }),
      },
      tinycloud_auth_prepare: {
        description: 'Prepare scoped TinyCloud login from a private nonsecret config file: selected cli,tcHome,profile,host,manifestPath,discovery,expectedOwner,expiry,task. Generic app reads require discovery=app-read so registry and app reads are approved together. Only after required live reads fail for missing authority. The client binds this conversation. Never supply a signed response. If ready, verify live reads and resume task; otherwise use tinycloud_authorize.', args: {},
        execute: safe(async ({ configPath }, conversationId) => {
          if (!isAbsolute(configPath ?? '')) throw Object.assign(new Error(), { code: 'CONFIG_INVALID' });
          return forSession(conversationId).prepare({ ...await readConfig(configPath), client: 'opencode', conversationId });
        }),
      },
      tinycloud_authorize: {
        description: 'Open the prepared exact TinyCloud approval, capture the next original chat paste privately, and retain the original task. No code arguments. Reuses a pending approval. retry=true only after classified expiry/cancellation when the human wants another attempt.', args: {},
        execute: safe(async ({ retry = false }, conversationId) => {
          const handoff = forSession(conversationId);
          const before = await handoff.status({ conversationId });
          if (before.status !== 'ready') claim(before, conversationId);
          let result;
          try { result = await handoff.authorize({ conversationId, retry }); }
          catch (error) { if (error.code !== 'BROWSER_OPEN_FAILED') release(conversationId); throw error; }
          if (result.status === 'awaiting-approval') armed.add(conversationId);
          return { ...result, ...(result.status === 'awaiting-approval' ? { instructions: prompt } : {}) };
        }),
      },
      tinycloud_signin_status: {
        description: 'Read safe TinyCloud sign-in status in this conversation. Ready means CLI verified, not data read. Resume the saved original request by running required live reads.', args: {},
        execute: safe(async (_args, conversationId) => ({ ...await forSession(conversationId).status({ conversationId }), ...(receipts.has(conversationId) ? { lastReceipt: receipts.get(conversationId) } : {}) })),
      },
      tinycloud_auth_cancel: {
        description: 'Cancel this conversation’s pending TinyCloud approval. Keep the selected profile and original request.', args: {},
        execute: safe(async (_args, conversationId) => forSession(conversationId).cancel({ conversationId })),
      },
    },
    async 'chat.message'(input, output) {
      const texts = output.parts.filter(part => part.type === 'text' && !part.synthetic && part.text.trim());
      if (!texts.some(part => responseLike(part.text, armed.has(input.sessionID)))) return;
      // Capture original reference and redact BEFORE the first await, just as the pinned native hook.
      const raw = texts.length === 1 ? texts[0].text : undefined;
      const { sessionID } = input;
      const messageID = output.message.id;
      const messageKey = `${sessionID}:${messageID}`;
      let result;
      if (!messageID || output.message.sessionID !== sessionID) result = fail('CONVERSATION_MISMATCH');
      else if (messages.has(messageKey)) result = fail('DUPLICATE_AUTH_RESPONSE');
      else if (texts.length !== 1 || output.parts.some(part => part.type !== 'text')) result = fail('AMBIGUOUS_AUTH_RESPONSE');
      else if (busy.has(sessionID)) result = fail('AUTH_CAPTURE_IN_PROGRESS');
      redact(output.parts, result ?? { ok: true, status: 'verifying' });
      messages.add(messageKey);
      if (!result) {
        busy.add(sessionID);
        try {
          const handoff = forSession(sessionID);
          const context = await handoff.status({ conversationId: sessionID });
          if (context.status !== 'awaiting-approval') result = fail('NO_PENDING_APPROVAL');
          else {
            const verified = await handoff.importResponse(raw, { conversationId: sessionID, messageId: messageID });
            armed.delete(sessionID); release(sessionID);
            result = { ok: true, ...verified, nextAction: verified.appReadSelection ? 'The selected app and registry reads are approved together. Read the selected app’s knowledge and catalog, query its existing data, and answer the saved original request now in this conversation. Do not stop at sign-in confirmation or ask for another sign-in.' : 'Verify the required live resource read, then resume the saved original request in this conversation.' };
          }
        } catch (error) { result = safeError(error); if (error.code === 'AUTH_EXPIRED') { armed.delete(sessionID); release(sessionID); } }
        finally { busy.delete(sessionID); }
      }
      receipts.set(sessionID, result);
      redact(output.parts, result);
    },
  };
  if (!legacy) { delete hooks.tool.tinycloud_auth_prepare; delete hooks.tool.tinycloud_authorize; }
  return hooks;
}

export default async function TinyCloudAuth({ client, directory } = {}, { schema, nodeExecutable } = {}) {
  if (!process.env.HOME || !schema) throw new Error('TinyCloud auth adapter needs its installed OpenCode loader.');
  const { createSetup } = await import('./setup.mjs');
  const { resumeActivation } = await import('./opencode-continuation.mjs');
  const pack = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const root = join(process.env.XDG_STATE_HOME || join(process.env.HOME, '.local/state'), 'tinycloud-auth-handoff');
  const setup = createSetup({ stateRoot: root, nodeExecutable });
  const hooks = createSigninHooks({ forSession: setup.forSession });
  hooks.tool.tinycloud_setup.args = {
    originalRequest: schema.string(), contextHandle: schema.string().optional(), appId: schema.string().optional(),
    profile: schema.string().optional(), host: schema.string().optional(), owner: schema.string().optional(),
    tcHome: schema.string().optional(), retry: schema.boolean().optional(),
  };
  setTimeout(() => {
    void resumeActivation({ client, directory, version: pack.version }).then(async result => {
      if (result.status === 'failed') await client.tui.showToast({ body: { title: 'TinyCloud setup paused', message: `Automatic continuation failed (${result.code}).`, variant: 'error' } });
    }).catch(() => { console.error('TinyCloud auth continuation failed.'); });
  }, 0);
  return { ...hooks,
    config: async config => { config.tool_output = { ...config.tool_output, max_bytes: Math.max(config.tool_output?.max_bytes ?? 0, 96 * 1024), max_lines: Math.max(config.tool_output?.max_lines ?? 0, 2000) }; },
    'shell.env': async (_input, output) => { output.env.TINYCLOUD_AUTH_OPENCODE_PLUGIN = pack.version; },
  };
}
