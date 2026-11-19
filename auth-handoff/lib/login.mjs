// Adapted from TinyCloudLabs/tinychat, commit f67bf08417c8954fc0bab4379e99db13977f4d96
// agent-skills/tinychat-retrieval/lib/login.mjs; official CLI remains the verifier.
import { spawn } from 'node:child_process';

export const messages = {
  CLI_COMMAND_FAILED: 'The bound CLI command failed. Check the reported runtime and command phase before retrying setup.',
  CLI_INCOMPATIBLE: 'The selected runtime is incompatible. Use the complete pinned release and supported Node runtime.',
  RELEASE_INTEGRITY_FAILED: 'The complete release failed integrity validation. Reinstall the exact release archive; the previous installation is retained.',
  NETWORK_ERROR: 'The bound TinyCloud host could not be read. Restore connectivity before retrying the original request.',
  CLI_ARGUMENT_INVALID: "The bundled CLI rejected an option. Reinstall the matching TinyCloud release.",
  CLI_STARTUP_FAILED: "The CLI failed before authorization started. Check the bound runtime and installation.",
  OPENKEY_DEPLOYMENT_INCOMPATIBLE: "The OpenKey web/API deployment lacks the required app-read protocol. Update the matching deployment before approval.",
  APP_READ_SCOPE_UNSUPPORTED: "The selected app registration does not declare a supported narrow read scope.",
  INVALID_AUTH_RESPONSE: 'Supply the complete JSON or base64 JSON authorization response. Truncated or redacted values cannot be used.',
  AUTH_RESPONSE_REJECTED: 'The CLI rejected the authorization response. No successful login is claimed.',
  OPENKEY_PROOF_INVALID: 'The CLI could not verify the signed response for this profile. Supply the complete response for the same profile.',
  OWNER_MISMATCH: 'The approved signing identity differs from the expected owner. Keep the existing profile and choose the intended identity.',
  OPENKEY_SCOPE_MISMATCH: 'The approved space differs from the requested space.',
  OPENKEY_SCOPE_INCOMPLETE: 'The approved grant does not cover the complete requested scope.',
  OPENKEY_GRANT_BROADENED: 'The signed grant exceeds the installed permission manifest.',
  AUTH_EXPIRED: 'The signed authorization has expired. Browser approval is required again.',
  AUTH_TRANSPORT_TIMEOUT: 'The CLI did not finish the authorization transport within 30 seconds.',
  CLI_UNAVAILABLE: 'TinyCloud CLI could not be started.',
  AUTH_RECEIPT_INVALID: 'The CLI completed login without the expected selected-app receipt. No successful handoff is claimed.',
  OPENKEY_DISCOVERY_MISMATCH: 'The selected app does not match its canonical registry and requested scope.',
  OPENKEY_DISCOVERY_UNAVAILABLE: 'The CLI could not read the selected app from its canonical registry.',
};
const failure = code => Object.assign(new Error(messages[code]), { code });

/** Copy only public CLI receipt fields. The CLI has already verified the proof;
 * this validates the transport shape without carrying signed response material. */
export function safeDiscoveryResult(value) {
  const invalid = () => { throw failure('AUTH_RECEIPT_INVALID'); };
  const permissions = entries => {
    if (!Array.isArray(entries) || !entries.length || entries.length > 256) invalid();
    return entries.map(entry => {
      if (!entry || !['tinycloud.kv', 'tinycloud.sql', 'tinycloud.capabilities'].includes(entry.service) ||
          typeof entry.space !== 'string' || !/^tinycloud:pkh:eip155:[1-9][0-9]*:0x[a-fA-F0-9]{40}:[A-Za-z0-9_-]+$/.test(entry.space) ||
          typeof entry.path !== 'string' || entry.path.length > 4096 || entry.path.includes('\0') ||
          !Array.isArray(entry.actions) || !entry.actions.length || entry.actions.length > 16 ||
          entry.actions.some(action => typeof action !== 'string' || !new RegExp(`^${entry.service.replace('.', '\\.')}\\/[a-z]+$`).test(action))) invalid();
      return { service: entry.service, space: entry.space, path: entry.path, actions: [...entry.actions] };
    });
  };
  const selected = value?.appReadSelection;
  if (!selected || selected.schemaVersion !== 1 || selected.protocolVersion !== 1 || typeof selected.appId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(selected.appId) ||
      typeof selected.ownerDid !== 'string' || !/^did:pkh:eip155:[1-9][0-9]*:0x[a-fA-F0-9]{40}$/.test(selected.ownerDid) ||
      typeof selected.host !== 'string' || !['clientKeyDigest', 'selectionDigest'].every(key => /^[a-f0-9]{64}$/.test(selected[key] ?? '')) ||
      !/^[a-f0-9]{16}$/.test(selected.manifestHash ?? '')) invalid();
  let host;
  try { host = new URL(selected.host); } catch { invalid(); }
  if (!['http:', 'https:'].includes(host.protocol) || host.origin !== selected.host || host.username || host.password) invalid();
  const actual = permissions(value.permissions), claimed = permissions(selected.permissions);
  const normalizeSpace = space => space.replace(/(eip155:\d+:)(0x[a-fA-F0-9]{40})/, (_, prefix, address) => prefix + address.toLowerCase());
  const tuples = entries => [...new Set(entries.flatMap(p => p.actions.map(action => JSON.stringify([p.service, normalizeSpace(p.space), p.path, action]))))].sort();
  if (JSON.stringify(tuples(actual)) !== JSON.stringify(tuples(claimed)) || actual.some(p => !p.space.toLowerCase().startsWith(`tinycloud:${selected.ownerDid.slice(4).toLowerCase()}:`))) invalid();
  return { appReadSelection: { schemaVersion: 1, protocolVersion: 1, ownerDid: selected.ownerDid, host: selected.host, clientKeyDigest: selected.clientKeyDigest,
    appId: selected.appId, manifestHash: selected.manifestHash, permissions: claimed, selectionDigest: selected.selectionDigest }, permissions: actual };
}

/** Normalize only encoding/whitespace; the CLI remains the signed-proof verifier. */
export function responseInput(code) {
  if (typeof code !== 'string' || Buffer.byteLength(code) > 1024 * 1024) throw failure('INVALID_AUTH_RESPONSE');
  const text = code.trim();
  let value;
  try {
    value = text.startsWith('{') ? JSON.parse(text) : /^[A-Za-z0-9+/=_-]+$/.test(text) ? JSON.parse(Buffer.from(text, 'base64').toString('utf8')) : null;
  } catch { throw failure('INVALID_AUTH_RESPONSE'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('INVALID_AUTH_RESPONSE');
  return JSON.stringify(value) + '\n';
}

/** Published CLI --paste supplies both the URL and the verification path; no protocol/key reimplementation. */
export function runLogin(args, { executable = 'tc', nodePath, env = process.env, input, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodePath ?? executable, [...(nodePath ? [executable] : []), ...args, '--paste'], { env, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let stdout = '', stderr = '', authorizationUrl, settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) { child.kill(); reject(error); } else resolve(result);
    };
    const timer = setTimeout(() => finish(failure('AUTH_TRANSPORT_TIMEOUT')), timeoutMs);
    child.on('error', () => finish(Object.assign(failure('CLI_UNAVAILABLE'), { cliPath: executable, phase: input === undefined ? 'acquire' : 'verify' })));
    child.stdin.on('error', () => {}); // An early CLI rejection may close stdin; its exit below is authoritative.
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 1024 * 1024) finish(failure('AUTH_RESPONSE_REJECTED')); });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      if (stderr.length > 1024 * 1024) { finish(failure('AUTH_RESPONSE_REJECTED')); return; }
      if (input === undefined && !authorizationUrl) {
        const match = stderr.match(/Open this URL in a browser to authenticate:\s*\n\s*(https?:\/\/[^\s]+)\s*\n/);
        if (match) {
          authorizationUrl = match[1];
          // URL generation is complete. Paste-mode acquisition has no callback server or saved grant.
          // Stop the waiting process; a later invocation uses the same profile key to verify the response.
          child.kill();
        }
      }
    });
    child.on('close', code => {
      if (authorizationUrl) { finish(null, authorizationUrl); return; }
      if (code === 0 && input !== undefined) {
        if (!args.includes('--discover-app-read') && !args.includes('--app-read-selection')) { finish(null); return; }
        try { finish(null, safeDiscoveryResult(JSON.parse(stdout))); }
        catch { finish(Object.assign(failure('AUTH_RECEIPT_INVALID'), { installed: true })); }
        return;
      }
      let detail;
      for (const output of [stdout, stderr]) {
        const start = output.search(/\{\s*"error"\s*:/);
        if (start >= 0) try { detail = JSON.parse(output.slice(start)).error; } catch { /* Never return raw CLI output. */ }
      }
      const resultCode = detail?.code === 'OPENKEY_OWNER_MISMATCH' ? 'OWNER_MISMATCH' : detail?.code;
      // Retain only a recognized parser line; never copy arbitrary stderr.
      const parser = stderr.match(/^error: unknown option '(--[a-z][a-z0-9-]{0,80})'$/m);
      const classified = parser ? 'CLI_ARGUMENT_INVALID' : Object.hasOwn(messages, resultCode) ? resultCode : input === undefined ? 'CLI_STARTUP_FAILED' : 'AUTH_RESPONSE_REJECTED';
      const error = Object.assign(failure(classified), { cliPath: executable, phase: input === undefined ? 'acquire' : 'verify' });
      if (parser) { error.diagnostic = parser[0]; error.message += ` ${parser[0]}`; }
      finish(error);
    });
    if (input !== undefined) child.stdin.end(input);
  });
}
