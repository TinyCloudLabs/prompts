// Generic durable context around TinyChat's pinned paste transport. Signing,
// permission resolution and proof verification remain exclusively in the CLI.
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, readFile, realpath, rename, rm, rmdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { runLogin, responseInput, safeDiscoveryResult } from './login.mjs';
import { deliverApproval } from './approval.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const ownerDid = value => typeof value === 'string' && /^did:pkh:eip155:[1-9][0-9]*:0x[a-fA-F0-9]{40}$/.test(value);
const sameOwner = (a, b) => a.toLowerCase() === b.toLowerCase();
const fail = code => { throw Object.assign(new Error(`TinyCloud authorization was not completed (${code}).`), { code }); };
const acceptedCodes = new Set(['AUTH_UNAUTHORIZED', 'AUTH_FORBIDDEN', 'OPENKEY_DEPLOYMENT_INCOMPATIBLE', 'CLI_ARGUMENT_INVALID', 'CLI_STARTUP_FAILED', 'APP_READ_SCOPE_UNSUPPORTED', 'INVALID_AUTH_RESPONSE', 'AUTH_RESPONSE_REJECTED', 'AUTH_RECEIPT_INVALID', 'OPENKEY_DISCOVERY_MISMATCH', 'OPENKEY_DISCOVERY_UNAVAILABLE', 'OPENKEY_PROOF_INVALID', 'OPENKEY_SCOPE_MISMATCH', 'OPENKEY_SCOPE_INCOMPLETE', 'OPENKEY_GRANT_BROADENED', 'OWNER_MISMATCH', 'AUTH_EXPIRED', 'AUTH_REQUIRED', 'CLI_UNAVAILABLE', 'AUTH_TRANSPORT_TIMEOUT', 'PERMISSION_DENIED', 'NETWORK_ERROR', 'INVALID_LOGIN_SCOPE', 'PRIMARY_SESSION_REQUIRED', 'AUTH_SCOPE_NOT_AVAILABLE']);

function host(value) {
  let url;
  try { url = new URL(value); } catch { fail('SETUP_CONFIG_INVALID'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) fail('SETUP_CONFIG_INVALID');
  return url.origin;
}

function config(value) {
  const task = typeof value?.task === 'string' ? value.task : value?.task?.originalRequest;
  if (!value || (value.appReadSelectionPath !== undefined && (!isAbsolute(value.appReadSelectionPath) || value.discovery)) || (value.nodePath !== undefined && !isAbsolute(value.nodePath)) || !['cli', 'tcHome', 'manifestPath'].every(key => typeof value[key] === 'string' && isAbsolute(value[key])) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.profile ?? '') || value.profile.includes('..') ||
      typeof value.conversationId !== 'string' || !value.conversationId.trim() || value.conversationId.length > 20000 ||
      typeof task !== 'string' || !task.trim() || JSON.stringify(value.task).length > 40000 ||
      (value.expectedOwner !== undefined && !ownerDid(value.expectedOwner)) ||
      (value.discovery !== undefined && value.discovery !== 'app-read') ||
      !/^[1-9][0-9]*(s|m|h|d|w)$/.test(value.expiry ?? '7d') ||
      !/^[A-Za-z0-9_-]+$/.test(value.client ?? 'opencode')) fail('SETUP_CONFIG_INVALID');
  return { cli: value.cli, ...(value.nodePath ? { nodePath: value.nodePath } : {}), tcHome: value.tcHome, profile: value.profile, host: host(value.host), manifestPath: value.manifestPath,
    ...(value.expectedOwner ? { expectedOwner: value.expectedOwner } : {}), ...(value.discovery ? { discovery: value.discovery } : {}), ...(value.appReadSelectionPath ? { appReadSelectionPath: value.appReadSelectionPath } : {}), expiry: value.expiry ?? '7d', client: value.client ?? 'opencode', conversationId: value.conversationId, task: value.task };
}

async function privateFile(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail('PRIVATE_FILE_REQUIRED');
  let file;
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { fail('PRIVATE_FILE_REQUIRED'); }
  try {
    const info = await file.stat();
    if (!info.isFile() || (info.mode & 0o077) || (process.getuid && info.uid !== process.getuid()) || info.size > 1024 * 1024) fail('PRIVATE_FILE_REQUIRED');
    return await file.readFile('utf8');
  } finally { await file.close(); }
}

export function runTc(args, { executable, nodePath, env }) {
  return new Promise((resolve, reject) => execFile(nodePath ?? executable, nodePath ? [executable, ...args] : args, { env, timeout: 30000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
    if (!error) return resolve(stdout);
    let code = error.code === 'ENOENT' ? 'CLI_UNAVAILABLE' : 'CLI_COMMAND_FAILED';
    for (const output of [stdout, stderr]) {
      try { const candidate = JSON.parse(output).error?.code; if (acceptedCodes.has(candidate)) code = candidate; } catch { /* Never expose CLI output. */ }
    }
    const parser = stderr.match(/^error: unknown option '(--[a-z][a-z0-9-]{0,80})'$/m);
    if (parser) code = 'CLI_ARGUMENT_INVALID';
    reject(Object.assign(new Error(`TinyCloud command failed (${code}).`), { code, cliPath: executable, phase: 'command', ...(parser ? { diagnostic: parser[0] } : {}) }));
  }));
}

export function createHandoff({ statePath, runTc: command = runTc, loginRunner = runLogin, openApproval = deliverApproval, env = process.env }) {
  if (!isAbsolute(statePath ?? '')) fail('SETUP_CONFIG_INVALID');
  const directory = dirname(statePath);
  const environment = state => {
    const isolated = { ...env, TC_HOME: state.config.tcHome };
    delete isolated.TC_HOST; delete isolated.TC_PROFILE;
    return isolated;
  };
  const options = state => ({ executable: state.config.cli, ...(state.config.nodePath ? { nodePath: state.config.nodePath } : {}), env: environment(state) });
  async function ensurePrivateDirectory() {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await stat(directory);
    if ((info.mode & 0o077) || (process.getuid && info.uid !== process.getuid())) fail('PRIVATE_STATE_REQUIRED');
  }
  async function locked(action) {
    await ensurePrivateDirectory();
    const lock = `${statePath}.lock`;
    try { await mkdir(lock, { mode: 0o700 }); } catch (error) { if (error.code === 'EEXIST') fail('AUTHORIZATION_IN_PROGRESS'); throw error; }
    try { return await action(); } finally { await rmdir(lock); }
  }
  async function load() {
    try { await stat(statePath); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    let state;
    try { state = JSON.parse(await privateFile(statePath)); } catch { fail('SETUP_CONFIG_INVALID'); }
    if (state.schemaVersion !== 1 || !same(config(state.config), state.config)) fail('SETUP_CONFIG_INVALID');
    return state;
  }
  async function writePrivate(path, content, exclusive = false) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(content); await file.sync(); } finally { await file.close(); }
    if (exclusive) {
      try { await link(temporary, path); } finally { await rm(temporary); }
    } else await rename(temporary, path);
  }
  const save = state => writePrivate(statePath, JSON.stringify(state, null, 2) + '\n');
  const approvedManifestPath = `${statePath}.approved.json`;
  function approvedManifestContent(safe) {
    const manifest = { app_id: safe.appReadSelection.appId, name: safe.appReadSelection.appId, defaults: false, includePublicSpace: false,
      permissions: safe.permissions.map(entry => ({ ...entry, skipPrefix: true })) };
    return JSON.stringify(manifest, null, 2) + '\n';
  }
  function prepareApprovedScope(state, value) {
    const safe = safeDiscoveryResult(value);
    const expectedOwner = state.owner ?? state.config.expectedOwner;
    if (safe.appReadSelection.host !== state.config.host || (expectedOwner && !sameOwner(safe.appReadSelection.ownerDid, expectedOwner))) fail('AUTH_RECEIPT_INVALID');
    return { ...safe, manifestDigest: digest(approvedManifestContent(safe)), manifestPending: true };
  }
  async function finishApprovedManifest(state) {
    if (!state.approvedScope?.manifestPending) return;
    const safe = safeDiscoveryResult(state.approvedScope);
    const content = approvedManifestContent(safe);
    if (digest(content) !== state.approvedScope.manifestDigest) fail('APPROVAL_CONTEXT_CHANGED');
    let exists = true;
    try { await lstat(approvedManifestPath); } catch (error) { if (error.code === 'ENOENT') exists = false; else throw error; }
    if (!exists) {
      // Publish without replacing a file that appeared after our existence
      // check. A changed existing manifest is never repaired over silently.
      try { await writePrivate(approvedManifestPath, content, true); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    if (digest(await privateFile(approvedManifestPath)) !== state.approvedScope.manifestDigest) fail('APPROVAL_CONTEXT_CHANGED');
    delete state.approvedScope.manifestPending;
    await save(state);
  }
  function conversation(state, conversationId) {
    if (!state) fail('SETUP_CONFIG_REQUIRED');
    if (typeof conversationId !== 'string' || conversationId !== state.config.conversationId) fail('CONVERSATION_MISMATCH');
  }
  async function json(state, args) {
    const output = await command(args, options(state));
    try { return JSON.parse(output); } catch { fail('INVALID_RESPONSE'); }
  }
  async function fingerprints(state) {
    try {
      return { ...(state.config.appReadSelectionPath ? { selectionDigest: digest(await privateFile(state.config.appReadSelectionPath)) } : {}), manifestDigest: digest(await readFile(state.config.manifestPath)), cliDigest: digest(await readFile(await realpath(state.config.cli))),
        keyDigest: digest(await readFile(join(state.config.tcHome, '.tinycloud', 'profiles', state.config.profile, 'key.json'))) };
    } catch { fail('APPROVAL_CONTEXT_CHANGED'); }
  }
  async function inspect(state, { afterImport = false } = {}) {
    const c = state.config;
    const listed = await json(state, ['--json', 'profile', 'list']);
    const profile = listed.profiles?.find(p => p.name === c.profile);
    if (!profile || host(profile.host) !== c.host) fail('CONTEXT_MISMATCH');
    const value = await json(state, ['--profile', c.profile, '--host', c.host, '--json', 'context']);
    if (value.schemaVersion !== 1 || value.profile !== c.profile || typeof value.sessionDid !== 'string' || !value.sessionDid.startsWith('did:key:') ||
        !['missing', 'expired', 'present', 'unknown-expiry'].includes(value.session?.state) || (value.ownerDid !== null && !ownerDid(value.ownerDid))) fail('INVALID_RESPONSE');
    if (host(value.host) !== c.host) fail('CONTEXT_MISMATCH');
    for (const expected of [c.expectedOwner, state.owner]) if (expected && value.ownerDid && !sameOwner(expected, value.ownerDid)) fail('OWNER_MISMATCH');
    const fingerprintsNow = await fingerprints(state);
    if (state.binding && (!same(fingerprintsNow, state.binding.files) || state.binding.sessionDid !== value.sessionDid)) fail('APPROVAL_CONTEXT_CHANGED');
    const primaryValid = value.session.state === 'present' && Number.isFinite(Date.parse(value.session.expiresAt)) && Date.parse(value.session.expiresAt) > Date.now();
    if (value.session.state === 'present' && !primaryValid) fail('AUTH_EXPIRED');
    // Unknown expiry is not permission to replace an existing primary session.
    if (value.session.state === 'unknown-expiry') fail('SESSION_EXPIRY_UNKNOWN');
    if (primaryValid && !ownerDid(value.ownerDid)) fail('INVALID_RESPONSE');
    let coverageManifest = c.manifestPath;
    if (c.discovery) {
      coverageManifest = null;
      if (state.approvedScope) {
        safeDiscoveryResult(state.approvedScope);
        if (digest(await privateFile(approvedManifestPath)) !== state.approvedScope.manifestDigest) fail('APPROVAL_CONTEXT_CHANGED');
        coverageManifest = approvedManifestPath;
      }
    }
    let covered = false;
    if (primaryValid && coverageManifest) {
      const caps = await json(state, ['--profile', c.profile, '--host', c.host, '--json', 'auth', 'caps', '--manifest', coverageManifest]);
      if (typeof caps.covered !== 'boolean') fail('INVALID_RESPONSE');
      covered = caps.covered;
    }
    const expectedOwner = state.owner ?? c.expectedOwner ?? value.ownerDid;
    const loginArgs = ['--profile', c.profile, '--host', c.host, '--json', 'auth', 'login', '--method', 'openkey', '--manifest', c.manifestPath, '--expiry', c.expiry,
      ...(c.appReadSelectionPath ? ['--app-read-selection', c.appReadSelectionPath] : []),
      ...(c.discovery ? ['--discover-app-read', '--reason', typeof c.task === 'string' ? c.task : c.task.originalRequest] : []),
      ...(expectedOwner ? ['--owner', expectedOwner] : []), ...(primaryValid ? ['--additional'] : [])];
    if (!afterImport && !covered && state.approval?.status === 'pending' && !same(loginArgs, state.approval.loginArgs)) fail('APPROVAL_CONTEXT_CHANGED');
    return { schemaVersion: 1, status: covered ? 'ready' : 'login-required', profile: c.profile, host: c.host, sessionDid: value.sessionDid,
      owner: value.ownerDid, space: value.spaceId, session: value.session, manifestDigest: fingerprintsNow.manifestDigest, loginArgs, access: 'not-tested',
      ...(state.approvedScope ? { appReadSelection: state.approvedScope.appReadSelection } : {}),
      client: c.client, conversationId: c.conversationId, task: c.task, files: fingerprintsNow };
  }
  function receipt(state, current) {
    const { files, ...safe } = current;
    const approval = state.approval;
    return { ...safe, ...(approval ? { approvalId: approval.id, ...(approval.delivery ? { delivery: approval.delivery } : {}) } : {}),
      ...(current.status !== 'ready' && approval ? { status: ({ pending: 'awaiting-approval', verifying: 'verification-pending', expired: 'expired', cancelled: 'cancelled', opening: 'authorization-interrupted' })[approval.status] ?? current.status } : {}),
      ...(state.lastError ? { lastError: state.lastError } : {}) };
  }
  async function cleanup(approval) {
    if (!approval?.delivery?.artifactPath) return;
    try { await rm(approval.delivery.artifactPath); await rmdir(dirname(approval.delivery.artifactPath)); } catch { /* Cleanup does not alter proof verification. */ }
  }
  async function finishVerification(state) {
    if ((state.config.discovery || state.config.appReadSelectionPath) && !state.approvedScope) fail('AUTH_RECEIPT_INVALID');
    if (state.config.discovery) await finishApprovedManifest(state);
    const verified = await inspect(state, { afterImport: true });
    if (verified.status !== 'ready') fail('AUTH_SCOPE_NOT_AVAILABLE');
    state.owner = verified.owner;
    state.approval.status = 'completed';
    delete state.lastError;
    await save(state); await cleanup(state.approval);
    return receipt(state, verified);
  }
  async function importResponse(raw, { conversationId, messageId } = {}) {
    return locked(async () => {
      const state = await load(); conversation(state, conversationId);
      const input = responseInput(raw);
      const responseDigest = digest(input);
      if (state.completed?.some(item => item.digest === responseDigest || (messageId && item.messageId === messageId))) fail('DUPLICATE_AUTH_RESPONSE');
      if (state.approval?.status !== 'pending') fail('NO_PENDING_APPROVAL');
      const current = await inspect(state);
      if (current.status === 'ready') fail('NO_PENDING_APPROVAL');
      try {
        const result = await loginRunner(state.approval.loginArgs, { ...options(state), input });
        // CLI installation already committed. A failing follow-up read must never
        // send the user through another approval or replay the signed response.
        state.approval.status = 'verifying';
        state.completed = [...(state.completed ?? []), { digest: responseDigest, ...(messageId ? { messageId } : {}) }];
        if (state.config.discovery || state.config.appReadSelectionPath) state.approvedScope = prepareApprovedScope(state, result);
        await save(state);
        return await finishVerification(state);
      } catch (error) {
        const code = acceptedCodes.has(error.code) ? error.code : 'AUTH_RESPONSE_REJECTED';
        if (error.installed) {
          state.approval.status = 'verifying';
          state.completed = [...(state.completed ?? []), { digest: responseDigest, ...(messageId ? { messageId } : {}) }];
        }
        state.lastError = code;
        if (code === 'AUTH_EXPIRED') state.approval.status = 'expired';
        await save(state); fail(code);
      }
    });
  }
  return {
    prepare: supplied => locked(async () => {
      const chosen = config(supplied);
      let state = await load();
      if (state) {
        conversation(state, chosen.conversationId);
        const fixed = ({ manifestPath, expectedOwner, ...rest }) => rest;
        if (!same(fixed(state.config), fixed(chosen)) || (chosen.expectedOwner && state.owner && !sameOwner(chosen.expectedOwner, state.owner)) ||
            (state.config.expectedOwner && (!chosen.expectedOwner || !sameOwner(chosen.expectedOwner, state.config.expectedOwner)))) fail('CONTEXT_MISMATCH');
        const scopeChanged = chosen.manifestPath !== state.config.manifestPath || digest(await readFile(chosen.manifestPath)) !== state.binding.files.manifestDigest;
        if (scopeChanged) {
          if (state.config.discovery) fail('APPROVAL_CONTEXT_CHANGED');
          if (!state.owner || (state.approval && !['completed', 'cancelled'].includes(state.approval.status))) fail('APPROVAL_CONTEXT_CHANGED');
          const files = await fingerprints({ ...state, config: chosen });
          if (files.keyDigest !== state.binding.files.keyDigest || files.cliDigest !== state.binding.files.cliDigest) fail('APPROVAL_CONTEXT_CHANGED');
          state.binding.files = files;
          delete state.approval; delete state.lastError;
        } else if (!same(state.config, chosen)) fail('CONTEXT_MISMATCH');
        state.config = chosen;
      }
      if (!state) {
        state = { schemaVersion: 1, config: chosen, createdAt: new Date().toISOString() };
        const listed = await json(state, ['--json', 'profile', 'list']);
        if (!Array.isArray(listed.profiles)) fail('INVALID_RESPONSE');
        if (!listed.profiles.some(p => p.name === chosen.profile)) await json(state, ['--json', 'profile', 'create', chosen.profile, '--host', chosen.host]);
      }
      const current = await inspect(state);
      state.binding ??= { sessionDid: current.sessionDid, files: current.files };
      if (current.owner) state.owner ??= current.owner;
      await save(state);
      return receipt(state, current);
    }),
    status: ({ conversationId } = {}) => locked(async () => {
      const state = await load(); conversation(state, conversationId);
      if (state.approval?.status === 'verifying') return finishVerification(state);
      return receipt(state, await inspect(state));
    }),
    authorize: ({ conversationId, retry = false, deliveryMode = 'browser' } = {}) => locked(async () => {
      const state = await load(); conversation(state, conversationId);
      if (state.approval?.status === 'verifying') return finishVerification(state);
      const current = await inspect(state);
      if (current.status === 'ready') return receipt(state, current);
      if (state.approval?.status === 'pending' || (state.approval && state.approval.status !== 'completed' && !retry)) return receipt(state, current);
      await cleanup(state.approval);
      state.approval = { id: randomUUID(), status: 'opening', loginArgs: current.loginArgs, createdAt: new Date().toISOString() };
      delete state.lastError;
      await save(state);
      const url = await loginRunner(current.loginArgs, options(state));
      try {
        state.approval.delivery = await openApproval(url, { mode: deliveryMode, env: environment(state) });
        state.approval.status = 'pending'; await save(state);
      } catch (error) {
        if (error.code === 'BROWSER_OPEN_FAILED' && error.delivery) {
          state.approval.delivery = error.delivery; state.approval.status = 'pending'; state.lastError = 'BROWSER_OPEN_FAILED'; await save(state);
        }
        throw error;
      }
      return receipt(state, current);
    }),
    importResponse,
    importCodeFile: async ({ conversationId, codeFile } = {}) => importResponse(await privateFile(codeFile), { conversationId }),
    cancel: ({ conversationId } = {}) => locked(async () => {
      const state = await load(); conversation(state, conversationId);
      if (state.approval) { state.approval.status = 'cancelled'; await save(state); await cleanup(state.approval); }
      return { schemaVersion: 1, status: 'cancelled', profile: state.config.profile, host: state.config.host, sessionDid: state.binding.sessionDid,
        manifestDigest: state.binding.files.manifestDigest, loginArgs: state.approval?.loginArgs, access: 'not-tested',
        client: state.config.client, conversationId, task: state.config.task };
    }),
  };
}
