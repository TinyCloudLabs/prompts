// Deterministic entry around the existing native handoff. Account selection is
// durable; pending approvals remain bound to one OpenCode conversation.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, lstat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { createHandoff, runTc } from './handoff.mjs';
import { safeDiscoveryResult } from './login.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const authMissing = new Set(['AUTH_REQUIRED', 'AUTH_EXPIRED', 'AUTH_UNAUTHORIZED', 'AUTH_FORBIDDEN', 'PERMISSION_DENIED']);
const profileName = name => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes('..');
const ownerDid = value => typeof value === 'string' && /^did:pkh:eip155:[1-9][0-9]*:0x[a-fA-F0-9]{40}$/.test(value);
function nodeHost(value) {
  let url; try { url = new URL(value); } catch { fail('SETUP_CONFIG_INVALID'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) fail('SETUP_CONFIG_INVALID');
  return url.origin;
}
async function readState(path) {
  const info = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || (process.getuid && info.uid !== process.getuid())) fail('PRIVATE_STATE_REQUIRED');
  return JSON.parse(await readFile(path, 'utf8'));
}
async function writeState(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const info = await lstat(dirname(path));
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) fail('PRIVATE_STATE_REQUIRED');
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path);
}
export function createSetup({ stateRoot, nodeExecutable, env = process.env, verifyRelease = async options => (await import('./release.mjs')).verifyRelease(options), runTc: command = runTc, loginRunner, openApproval } = {}) {
  if (!isAbsolute(stateRoot ?? '')) fail('SETUP_CONFIG_INVALID');
  const sessions = new Map();
  const boundEnv = tcHome => { const value = { ...env, TC_HOME: tcHome }; delete value.TC_PROFILE; delete value.TC_HOST; return value; };
  async function json(release, tcHome, args) {
    let output;
    try { output = await command(args, { executable: release.cliPath, nodePath: release.nodePath, env: boundEnv(tcHome) }); }
    catch (error) { error.cliPath ??= release.cliPath; error.cliVersion ??= release.cliVersion; error.phase ??= 'setup-command'; throw error; }
    try { return JSON.parse(output); } catch { fail('INVALID_RESPONSE'); }
  }
  const globalArgs = c => ['--profile', c.profile, '--host', c.host, '--json'];
  const safeRelease = r => ({ version: r.version, cliVersion: r.cliVersion, cliPath: r.cliPath, nodePath: r.nodePath, nodeVersion: r.nodeVersion, manifestSha256: r.manifestSha256 });
  function forSession(conversationId) {
    if (typeof conversationId !== 'string' || !conversationId.trim()) fail('CONVERSATION_REQUIRED');
    if (sessions.has(conversationId)) return sessions.get(conversationId);
    const directory = join(stateRoot, 'sessions', digest(conversationId));
    const metadataPath = join(directory, 'setup.json');
    const handoffFor = metadata => {
      if (!/^[a-f0-9-]{36}$/.test(metadata.attempt ?? '')) fail('SETUP_CONFIG_INVALID');
      return createHandoff({ statePath: join(directory, `${metadata.attempt}.json`), runTc: command, loginRunner, openApproval, env });
    };
    const contextPath = handle => join(stateRoot, 'contexts', `${handle}.json`);
    async function verified() { return verifyRelease({ cliOverride: env.TINYCLOUD_AUTH_CLI, nodeExecutable, env }); }
    async function restore() {
      const release = await verified();
      const metadata = await readState(metadataPath);
      if (!metadata) fail('SETUP_CONFIG_REQUIRED');
      if (metadata.release.manifestSha256 !== release.manifestSha256) fail('APPROVAL_CONTEXT_CHANGED');
      return { metadata, release };
    }
    async function enrich(result, metadata, release) {
      let application = metadata.application, resources = metadata.resources;
      const selected = result.appReadSelection?.appId;
      if (result.status === 'ready' && selected) {
        const scope = await json(release, metadata.context.tcHome, [...globalArgs(metadata.context), 'account', 'apps', 'read-scope', selected]);
        if (scope.application?.manifestHash !== result.appReadSelection.manifestHash || JSON.stringify(scope.permissions) !== JSON.stringify(result.appReadSelection.permissions)) fail('OPENKEY_DISCOVERY_MISMATCH');
        application = scope.application; resources = scope.permissions;
      }
      if (result.status === 'ready') {
        await writeState(contextPath(metadata.contextHandle), { ...metadata.context, owner: result.owner, appId: application?.appId, originalRequest: metadata.originalRequest });
      }
      return { ...result, contextHandle: metadata.contextHandle, release: safeRelease(release),
        cliContext: { executable: release.cliPath, ...(release.nodePath ? { nodePath: release.nodePath } : {}), env: { TC_HOME: metadata.context.tcHome }, args: globalArgs(metadata.context) },
        ...(application ? { application, resources } : {}),
        ...(release.referencePath ? { cliReference: release.referencePath } : {}),
        nextAction: result.status === 'ready' ? 'Read the selected app guidance and catalog, inspect its relevant schema, query real records and answer the original request in this conversation.' : result.status === 'awaiting-approval' ? 'Complete the one browser approval and paste once in this conversation.' : 'Resolve the reported failure, then retry setup explicitly or cancel the pending attempt.' };
    }
    const api = {
      async setup(args = {}, { beforeAuthorize } = {}) {
        const release = await verified(); // Before profile reads, creation, or state writes.
        const { originalRequest, contextHandle, appId } = args;
        if (typeof originalRequest !== 'string' || !originalRequest.trim() || originalRequest.length > 20000 ||
            (contextHandle !== undefined && !/^[a-f0-9]{64}$/.test(contextHandle)) ||
            (appId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(appId)) ||
            (args.owner !== undefined && !ownerDid(args.owner))) fail('SETUP_CONFIG_INVALID');
        const previous = await readState(metadataPath);
        if (previous) {
          let pending = await handoffFor(previous).status({ conversationId });
          if (['awaiting-approval', 'verification-pending', 'authorization-interrupted'].includes(pending.status) || (previous.originalRequest === originalRequest && ['cancelled', 'expired'].includes(pending.status))) {
            if (previous.originalRequest !== originalRequest || (contextHandle && contextHandle !== previous.contextHandle) ||
                (args.profile && args.profile !== previous.context.profile) || (args.host && nodeHost(args.host) !== previous.context.host) ||
                (args.tcHome && args.tcHome !== previous.context.tcHome) || (args.owner && args.owner.toLowerCase() !== previous.context.owner?.toLowerCase()) ||
                (appId && appId !== previous.application?.appId) || previous.release.manifestSha256 !== release.manifestSha256) fail('APPROVAL_CONTEXT_CHANGED');
            if (['authorization-interrupted', 'cancelled', 'expired'].includes(pending.status) && args.retry === true) {
              beforeAuthorize?.(pending);
              try { pending = await handoffFor(previous).authorize({ conversationId, retry: true }); }
              catch (error) { error.cliPath ??= release.cliPath; error.cliVersion ??= release.cliVersion; throw error; }
            }
            return enrich(pending, previous, release);
          }
        }
        const explicit = args.profile || args.host || args.owner || args.tcHome || env.TC_PROFILE || env.TC_HOST || env.TC_HOME;
        const last = !contextHandle && !explicit ? await readState(join(stateRoot, 'last-context.json')) : null;
        const handle = contextHandle ?? last?.contextHandle;
        const saved = handle ? await readState(contextPath(handle)) : null;
        if (contextHandle && !saved) fail('CONTEXT_NOT_FOUND');
        const tcHome = args.tcHome ?? env.TC_HOME ?? saved?.tcHome ?? env.HOME;
        if (!isAbsolute(tcHome ?? '')) fail('SETUP_CONFIG_INVALID');
        const listed = await json(release, tcHome, ['--json', 'profile', 'list']);
        if (!Array.isArray(listed.profiles)) fail('INVALID_RESPONSE');
        let profile = args.profile ?? env.TC_PROFILE ?? saved?.profile;
        const hostOverride = args.host ?? env.TC_HOST ?? saved?.host;
        const expectedOwner = args.owner ?? saved?.owner;
        let choices = listed.profiles.filter(p => !hostOverride || p.host && nodeHost(p.host) === nodeHost(hostOverride));
        if (!profile && expectedOwner) {
          const matches = [];
          for (const candidate of choices) {
            const current = await json(release, tcHome, ['--profile', candidate.name, '--host', candidate.host, '--json', 'context']);
            if (current.ownerDid?.toLowerCase() === expectedOwner.toLowerCase()) matches.push(candidate);
          }
          choices = matches;
        }
        if (!profile) {
          if (choices.length === 1) profile = choices[0].name;
          else if (!hostOverride && !expectedOwner && choices.some(p => p.name === listed.defaultProfile)) profile = listed.defaultProfile;
          else if (choices.length > 1 || (listed.profiles.length && choices.length === 0)) return { status: 'context-required', task: originalRequest, profiles: choices.map(p => ({ profile: p.name, host: p.host })), release: safeRelease(release) };
          else profile = 'tinycloud-reader';
        }
        if (!profileName(profile)) fail('SETUP_CONFIG_INVALID');
        const existing = listed.profiles.find(p => p.name === profile);
        const host = nodeHost(hostOverride ?? existing?.host ?? 'https://node.tinycloud.xyz');
        if (existing && nodeHost(existing.host) !== host) fail('CONTEXT_MISMATCH');
        if (!existing) await json(release, tcHome, ['--json', 'profile', 'create', profile, '--host', host]);
        const context = { tcHome, profile, host, ...(expectedOwner ? { owner: expectedOwner } : {}) };
        const current = await json(release, tcHome, [...globalArgs(context), 'context']);
        if (expectedOwner && current.ownerDid && expectedOwner.toLowerCase() !== current.ownerDid.toLowerCase()) fail('OWNER_MISMATCH');
        if (current.ownerDid) context.owner = current.ownerDid;
        const selectedHandle = digest(JSON.stringify([tcHome, profile, host]));
        let application, resources, manifest, discovery, appReadSelection;
        try {
          const registry = await json(release, tcHome, [...globalArgs(context), 'account', 'apps', 'list', '--live']);
          if (!Array.isArray(registry.applications) || typeof registry.complete !== 'boolean') fail('INVALID_RESPONSE');
          // A remembered app never selects a different question's scope.
          const selectedId = appId ?? (saved?.originalRequest === originalRequest ? saved.appId : undefined) ?? (registry.complete && registry.applications.length === 1 ? registry.applications[0].appId : undefined);
          if (!selectedId) {
            await writeState(contextPath(selectedHandle), context);
            return { status: 'selection-required', task: originalRequest, contextHandle: selectedHandle, applications: registry.applications, issues: registry.issues, complete: registry.complete, release: safeRelease(release) };
          }
          if (!registry.applications.some(app => app.appId === selectedId)) fail('APP_NOT_FOUND');
          const scope = await json(release, tcHome, [...globalArgs(context), 'account', 'apps', 'read-scope', selectedId]);
          if (scope.application?.appId !== selectedId || !Array.isArray(scope.permissions) || !scope.manifest) fail('INVALID_RESPONSE');
          application = scope.application; resources = scope.permissions; manifest = scope.manifest; appReadSelection = safeDiscoveryResult(scope).appReadSelection;
        } catch (error) {
          if (!authMissing.has(error.code)) throw error;
          discovery = 'app-read';
          manifest = JSON.parse(await readFile(release.registryTemplatePath ?? new URL('../templates/registry-read.json', import.meta.url), 'utf8'));
        }
        const manifestPath = join(directory, `scope-${digest(JSON.stringify(manifest))}.json`);
        await writeState(manifestPath, manifest);
        const appReadSelectionPath = appReadSelection ? join(directory, `selection-${digest(JSON.stringify(appReadSelection))}.json`) : undefined;
        if (appReadSelectionPath) await writeState(appReadSelectionPath, appReadSelection);
        const metadata = { attempt: randomUUID(), context, contextHandle: selectedHandle, originalRequest, release: safeRelease(release), application, resources };
        await writeState(metadataPath, metadata);
        await writeState(contextPath(selectedHandle), { ...context, appId: application?.appId, originalRequest });
        await writeState(join(stateRoot, 'last-context.json'), { contextHandle: selectedHandle });
        const handoff = handoffFor(metadata);
        let result = await handoff.prepare({ cli: release.cliPath, ...(release.nodePath ? { nodePath: release.nodePath } : {}), tcHome, profile, host, manifestPath, ...(appReadSelectionPath ? { appReadSelectionPath } : {}), ...(context.owner ? { expectedOwner: context.owner } : {}), ...(discovery ? { discovery } : {}), task: originalRequest, conversationId, client: 'opencode' });
        if (result.status !== 'ready') {
          beforeAuthorize?.(result);
          try { result = await handoff.authorize({ conversationId, retry: args.retry === true }); }
          catch (error) { error.cliPath ??= release.cliPath; error.cliVersion ??= release.cliVersion; throw error; }
        }
        return enrich(result, metadata, release);
      },
      async status(options = {}) { const { metadata, release } = await restore(); return enrich(await handoffFor(metadata).status({ ...options, conversationId }), metadata, release); },
      async importResponse(input, options = {}) { const { metadata, release } = await restore(); return enrich(await handoffFor(metadata).importResponse(input, { ...options, conversationId }), metadata, release); },
      async cancel() { const { metadata } = await restore(); return handoffFor(metadata).cancel({ conversationId }); },
    };
    sessions.set(conversationId, api); return api;
  }
  return { forSession };
}
