import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, chmod, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const module = await import('../lib/handoff.mjs').catch(() => ({}));
const owner = 'did:pkh:eip155:1:0x1111111111111111111111111111111111111111';
const failure = code => Object.assign(new Error('private CLI rejection'), { code });

async function fixture(t) {
  assert.equal(typeof module.createHandoff, 'function', 'generic durable handoff is implemented');
  const dir = await mkdtemp(join(tmpdir(), 'tc-handoff-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const manifestPath = join(dir, 'manifest.json');
  const manifest = { app_id: 'registry-reader', space: 'account', defaults: false, includePublicSpace: false, permissions: [{ service: 'tinycloud.kv', path: 'applications/', skipPrefix: true, actions: ['get', 'list'] }] };
  await writeFile(manifestPath, JSON.stringify(manifest));
  const cli = join(dir, 'tc');
  await writeFile(cli, '#!/usr/bin/env node\n');
  const tcHome = join(dir, 'home');
  await mkdir(join(tcHome, '.tinycloud', 'profiles', 'reader'), { recursive: true });
  const keyPath = join(tcHome, '.tinycloud', 'profiles', 'reader', 'key.json');
  await writeFile(keyPath, '{"test":"key-only-fixture"}', { mode: 0o600 });
  let present = false, covered = false, rejection, loginResult;
  const calls = [], launches = [];
  const context = { schemaVersion: 1, profile: 'reader', host: 'https://node.tinycloud.xyz', sessionDid: 'did:key:zTest#zTest', ownerDid: null, spaceId: null, session: { state: 'missing', expiresAt: null } };
  const dependencies = {
    statePath: join(dir, 'private', 'pending.json'),
    runTc: async (args, options) => {
      calls.push({ args, options });
      if (args.includes('--version')) return '0.10.0';
      if (args.includes('list')) return JSON.stringify({ profiles: [{ name: 'reader', host: context.host }] });
      if (args.includes('context')) return JSON.stringify({ ...context, ownerDid: present ? owner : context.ownerDid, session: present ? { state: 'present', expiresAt: '2099-01-01T00:00:00Z' } : context.session });
      if (args.includes('caps')) return JSON.stringify({ covered, changed: !covered, missing: covered ? [] : manifest.permissions });
      throw new Error('Unexpected CLI operation');
    },
    loginRunner: async (args, options) => {
      calls.push({ login: true, args, options: { ...options, input: options.input === undefined ? undefined : '<withheld>' } });
      if (options.input === undefined) return 'https://openkey.so/authorize?request=opaque';
      if (rejection) throw failure(rejection);
      assert.deepEqual(JSON.parse(options.input), { signature: 'synthetic-response' });
      present = true; covered = true;
      return loginResult;
    },
    openApproval: async (url, options) => { launches.push({ url, options }); return { mode: 'file', artifactPath: join(dir, 'approval.html'), status: 'file-created' }; },
  };
  const config = { cli, tcHome, profile: 'reader', host: context.host, manifestPath, expectedOwner: owner, expiry: '7d', client: 'opencode', conversationId: 'native-session-1', task: 'when was my last recorded weight-in?' };
  return { config, dependencies, create: () => module.createHandoff(dependencies), calls, launches, context, keyPath, manifestPath, dir, setPresent: value => { present = value; }, setCovered: value => { covered = value; }, setLoginResult: value => { loginResult = value; }, reject: code => { rejection = code; } };
}

function discoveryResult() {
  const account = `tinycloud:${owner.slice(4)}:account`, app = `tinycloud:${owner.slice(4)}:applications`;
  const permissions = [
    { service: 'tinycloud.kv', space: account, path: 'applications/', actions: ['tinycloud.kv/get', 'tinycloud.kv/list'] },
    { service: 'tinycloud.sql', space: app, path: 'recorded-health', actions: ['tinycloud.sql/read'] },
  ];
  return { permissions, appReadSelection: { schemaVersion: 1, protocolVersion: 1, ownerDid: owner, host: 'https://node.tinycloud.xyz', clientKeyDigest: 'a'.repeat(64), appId: 'health-records', manifestHash: 'b'.repeat(16), permissions, selectionDigest: 'c'.repeat(64) } };
}

test('app discovery does not treat existing registry coverage as ready and sends the original request', async t => {
  const f = await fixture(t); f.setPresent(true); f.setCovered(true);
  const task = { originalRequest: f.config.task, timezone: 'Europe/Lisbon' };
  const result = await f.create().prepare({ ...f.config, task, discovery: 'app-read' });
  assert.equal(result.status, 'login-required');
  assert.equal(result.loginArgs.includes('--additional'), true);
  assert.equal(result.loginArgs.includes('--discover-app-read'), true);
  assert.equal(result.loginArgs[result.loginArgs.indexOf('--reason') + 1], task.originalRequest);
  assert.equal(f.calls.filter(c => c.args.includes('caps')).length, 0);
});

test('one discovery import persists exact selected scope privately and checks it after restart', async t => {
  const f = await fixture(t), h = f.create(), selected = discoveryResult();
  f.setLoginResult(selected);
  const originalManifest = await readFile(f.manifestPath, 'utf8');
  await h.prepare({ ...f.config, discovery: 'app-read' });
  await h.authorize({ conversationId: f.config.conversationId });
  const ready = await h.importResponse('{"signature":"synthetic-response"}', { conversationId: f.config.conversationId });
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.appReadSelection, selected.appReadSelection);
  const check = f.calls.filter(c => c.args.includes('caps')).at(-1);
  const scopePath = check.args[check.args.indexOf('--manifest') + 1];
  assert.notEqual(scopePath, f.manifestPath);
  const saved = JSON.parse(await readFile(scopePath, 'utf8'));
  assert.equal(saved.name, selected.appReadSelection.appId);
  assert.deepEqual(saved.permissions, selected.permissions.map(p => ({ ...p, skipPrefix: true })));
  assert.equal(saved.defaults, false); assert.equal(saved.includePublicSpace, false);
  assert.equal((await stat(scopePath)).mode & 0o777, 0o600);
  assert.equal(await readFile(f.manifestPath, 'utf8'), originalManifest);
  const fresh = await f.create().status({ conversationId: f.config.conversationId });
  assert.equal(fresh.status, 'ready'); assert.deepEqual(fresh.appReadSelection, selected.appReadSelection);
  f.setCovered(false);
  assert.notEqual((await f.create().status({ conversationId: f.config.conversationId })).status, 'ready');
  assert.equal(f.launches.length, 1);
  assert.equal(f.calls.filter(c => c.login && c.options.input).length, 1);
  assert.equal((await readFile(f.dependencies.statePath, 'utf8')).includes('synthetic-response'), false);
  await writeFile(scopePath, '{}', { mode: 0o600 });
  await assert.rejects(() => f.create().status({ conversationId: f.config.conversationId }), { code: 'APPROVAL_CONTEXT_CHANGED' });
});

test('discovery keeps its original registry manifest immutable after successful import', async t => {
  const f = await fixture(t), h = f.create(); f.setLoginResult(discoveryResult());
  const config = { ...f.config, discovery: 'app-read' };
  await h.prepare(config); await h.authorize({ conversationId: config.conversationId });
  await h.importResponse('{"signature":"synthetic-response"}', { conversationId: config.conversationId });
  await writeFile(f.manifestPath, '{"app_id":"replaced"}');
  await assert.rejects(() => h.prepare(config), { code: 'APPROVAL_CONTEXT_CHANGED' });
});

test('discovery saves verified selected scope before a transient coverage failure and never replays import', async t => {
  const f = await fixture(t); f.setLoginResult(discoveryResult());
  const original = f.dependencies.runTc;
  let failCaps = true;
  f.dependencies.runTc = (args, options) => args.includes('caps') && failCaps ? Promise.reject(failure('NETWORK_ERROR')) : original(args, options);
  const h = f.create(); await h.prepare({ ...f.config, discovery: 'app-read' });
  await h.authorize({ conversationId: f.config.conversationId });
  await assert.rejects(() => h.importResponse('{"signature":"synthetic-response"}', { conversationId: f.config.conversationId }), { code: 'NETWORK_ERROR' });
  failCaps = false;
  const ready = await f.create().status({ conversationId: f.config.conversationId });
  assert.equal(ready.status, 'ready'); assert.equal(ready.appReadSelection.appId, 'health-records');
  assert.equal(f.calls.filter(c => c.login && c.options.input).length, 1);
  assert.equal(f.launches.length, 1);
});

test('missing safe discovery receipt after CLI success cannot replay the proof or start another approval', async t => {
  const f = await fixture(t), h = f.create();
  await h.prepare({ ...f.config, discovery: 'app-read' }); await h.authorize({ conversationId: f.config.conversationId });
  await assert.rejects(() => h.importResponse('{"signature":"synthetic-response"}', { conversationId: f.config.conversationId }), { code: 'AUTH_RECEIPT_INVALID' });
  await assert.rejects(() => f.create().status({ conversationId: f.config.conversationId }), { code: 'AUTH_RECEIPT_INVALID' });
  await assert.rejects(() => f.create().authorize({ conversationId: f.config.conversationId, retry: true }), { code: 'AUTH_RECEIPT_INVALID' });
  await assert.rejects(() => f.create().importResponse('{"signature":"synthetic-response"}', { conversationId: f.config.conversationId }), { code: 'DUPLICATE_AUTH_RESPONSE' });
  assert.equal(f.calls.filter(c => c.login && c.options.input).length, 1);
  assert.equal(f.launches.length, 1);
});

for (const altered of [false, true]) test(`restart completes a saved discovery receipt only when its derived manifest was not replaced (altered=${altered})`, async t => {
  const f = await fixture(t), h = f.create(); f.setLoginResult(discoveryResult());
  await h.prepare({ ...f.config, discovery: 'app-read' }); await h.authorize({ conversationId: f.config.conversationId });
  await h.importResponse('{"signature":"synthetic-response"}', { conversationId: f.config.conversationId });
  // Recreate the durable checkpoint immediately after successful CLI import
  // but before the derived manifest is committed.
  const state = JSON.parse(await readFile(f.dependencies.statePath, 'utf8'));
  state.approval.status = 'verifying'; state.approvedScope.manifestPending = true;
  await writeFile(f.dependencies.statePath, JSON.stringify(state), { mode: 0o600 });
  const path = `${f.dependencies.statePath}.approved.json`;
  if (altered) await writeFile(path, '{}'); else await rm(path);
  const finish = () => f.create().status({ conversationId: f.config.conversationId });
  if (altered) {
    await assert.rejects(finish, { code: 'APPROVAL_CONTEXT_CHANGED' });
    assert.equal(await readFile(path, 'utf8'), '{}');
  } else {
    assert.equal((await finish()).status, 'ready');
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  }
  assert.equal(f.calls.filter(c => c.login && c.options.input).length, 1);
  assert.equal(f.launches.length, 1);
});

test('authorization persists exact context and is idempotent across helper restarts', async t => {
  const f = await fixture(t), handoff = f.create();
  const prepared = await handoff.prepare(f.config);
  assert.equal(prepared.status, 'login-required');
  assert.equal(prepared.task, f.config.task);
  assert.equal(prepared.loginArgs.includes('--additional'), false);
  const pending = await handoff.authorize({ conversationId: f.config.conversationId });
  const repeated = await f.create().authorize({ conversationId: f.config.conversationId });
  assert.equal(pending.status, 'awaiting-approval');
  assert.equal(repeated.approvalId, pending.approvalId);
  assert.equal(f.launches.length, 1);
  assert.equal(f.calls.filter(c => c.login).length, 1);
  assert.equal((await stat(f.dependencies.statePath)).mode & 0o777, 0o600);
  assert.equal((await stat(join(f.dir, 'private'))).mode & 0o777, 0o700);
  assert.equal((await readFile(f.dependencies.statePath, 'utf8')).includes('opaque'), false);
});

test('private import verifies through same CLI arguments and retains task in receipt', async t => {
  const f = await fixture(t), h = f.create();
  await h.prepare(f.config);
  await h.authorize({ conversationId: f.config.conversationId });
  const result = await h.importResponse('{"signature":"synthetic-response"}', { conversationId: f.config.conversationId, messageId: 'msg-1' });
  assert.equal(result.status, 'ready');
  assert.equal(result.access, 'not-tested');
  assert.equal(result.task, f.config.task);
  const invocations = f.calls.filter(c => c.login);
  assert.deepEqual(invocations[0].args, invocations[1].args);
  assert.equal(invocations[1].options.env.TC_HOME, f.config.tcHome);
  assert.equal((await readFile(f.dependencies.statePath, 'utf8')).includes('synthetic-response'), false);
  await assert.rejects(() => f.create().importResponse('{"signature":"synthetic-response"}', { conversationId: f.config.conversationId, messageId: 'msg-1' }), { code: 'DUPLICATE_AUTH_RESPONSE' });
  assert.equal((await f.create().status({ conversationId: f.config.conversationId })).status, 'ready');
});

test('covered primary skips approval; missing scope selects additional grant without replacing primary', async t => {
  const f = await fixture(t); f.setPresent(true); f.setCovered(true);
  const h = f.create();
  assert.equal((await h.prepare(f.config)).status, 'ready');
  assert.equal((await h.authorize({ conversationId: f.config.conversationId })).status, 'ready');
  assert.equal(f.launches.length, 0);
  f.setCovered(false);
  const needed = await h.authorize({ conversationId: f.config.conversationId });
  assert.equal(needed.loginArgs.includes('--additional'), true);
  assert.equal(f.calls.filter(c => c.args.includes('caps')).every(c => c.args.includes('--manifest')), true);
});

for (const mutation of ['key', 'manifest', 'cli', 'owner', 'sessionDid', 'profileHost', 'conversation', 'config']) test(`rejects ${mutation} drift before importing`, async t => {
  const f = await fixture(t), h = f.create();
  await h.prepare(f.config); await h.authorize({ conversationId: f.config.conversationId });
  if (mutation === 'key') await writeFile(f.keyPath, '{"test":"changed"}');
  if (mutation === 'manifest') await writeFile(f.manifestPath, '{"app_id":"different"}');
  if (mutation === 'cli') await writeFile(f.config.cli, '#!/different');
  if (mutation === 'owner') f.context.ownerDid = 'did:pkh:eip155:1:0x2222222222222222222222222222222222222222';
  if (mutation === 'sessionDid') f.context.sessionDid = 'did:key:zDifferent';
  if (mutation === 'profileHost') f.context.host = 'https://elsewhere.example';
  const operation = mutation === 'config' ? () => h.prepare({ ...f.config, expiry: '1h' }) : () => h.importResponse('{"signature":"synthetic-response"}', { conversationId: mutation === 'conversation' ? 'other' : f.config.conversationId });
  await assert.rejects(operation, error => ['APPROVAL_CONTEXT_CHANGED', 'OWNER_MISMATCH', 'CONVERSATION_MISMATCH', 'CONTEXT_MISMATCH'].includes(error.code));
  assert.equal(f.calls.filter(c => c.login && c.options.input).length, 0);
  assert.equal(JSON.parse(await readFile(f.dependencies.statePath, 'utf8')).config.task, f.config.task);
});

for (const code of ['OPENKEY_PROOF_INVALID', 'OPENKEY_SCOPE_MISMATCH', 'OPENKEY_GRANT_BROADENED', 'OWNER_MISMATCH', 'AUTH_EXPIRED']) test(`CLI rejection ${code} retains task and requires explicit expiry retry`, async t => {
  const f = await fixture(t), h = f.create();
  await h.prepare(f.config); await h.authorize({ conversationId: f.config.conversationId });
  f.reject(code);
  await assert.rejects(() => h.importResponse('{"signature":"synthetic-response"}', { conversationId: f.config.conversationId }), { code });
  const result = await h.status({ conversationId: f.config.conversationId });
  assert.equal(result.task, f.config.task);
  await h.authorize({ conversationId: f.config.conversationId });
  assert.equal(f.launches.length, 1);
  if (code === 'AUTH_EXPIRED') {
    await h.authorize({ conversationId: f.config.conversationId, retry: true });
    assert.equal(f.launches.length, 2);
    assert.equal((await h.status({ conversationId: f.config.conversationId })).task, f.config.task);
  }
});

test('malformed responses never reach CLI and cancellation retains the original task', async t => {
  const f = await fixture(t), h = f.create();
  await h.prepare(f.config); await h.authorize({ conversationId: f.config.conversationId });
  await assert.rejects(() => h.importResponse('not-a-response', { conversationId: f.config.conversationId }), { code: 'INVALID_AUTH_RESPONSE' });
  assert.equal(f.calls.filter(c => c.login && c.options.input).length, 0);
  assert.equal((await h.cancel({ conversationId: f.config.conversationId })).task, f.config.task);
  await assert.rejects(() => h.importResponse('{"signature":"synthetic-response"}', { conversationId: f.config.conversationId }), { code: 'NO_PENDING_APPROVAL' });
});

test('file import accepts only an existing private regular file', async t => {
  const f = await fixture(t), h = f.create();
  await h.prepare(f.config); await h.authorize({ conversationId: f.config.conversationId });
  const codeFile = join(f.dir, 'response');
  await writeFile(codeFile, '{"signature":"synthetic-response"}', { mode: 0o644 });
  await assert.rejects(() => h.importCodeFile({ conversationId: f.config.conversationId, codeFile }), { code: 'PRIVATE_FILE_REQUIRED' });
  await chmod(codeFile, 0o600);
  assert.equal((await h.importCodeFile({ conversationId: f.config.conversationId, codeFile })).status, 'ready');
});

test('retains a structured original task and adds app scope after verified registry login', async t => {
  const f = await fixture(t), h = f.create();
  const task = { originalRequest: f.config.task, requestedAt: '2026-10-01T12:00:00Z', timezone: 'Europe/Lisbon', returnHeading: 'last recorded weigh-in', guide: 'local-test' };
  const config = { ...f.config, task };
  await h.prepare(config); await h.authorize({ conversationId: config.conversationId });
  await h.importResponse('{"signature":"synthetic-response"}', { conversationId: config.conversationId });
  const appManifest = join(f.dir, 'app-manifest.json');
  await writeFile(appManifest, JSON.stringify({ app_id: 'actual-discovered-app', space: 'applications', permissions: [{ service: 'tinycloud.sql', path: 'actual_database', skipPrefix: true, actions: ['read'] }] }));
  f.setCovered(false);
  const next = await h.prepare({ ...config, manifestPath: appManifest });
  assert.equal(next.status, 'login-required');
  assert.equal(next.loginArgs.includes('--additional'), true);
  assert.deepEqual(next.task, task);
  assert.equal((await h.authorize({ conversationId: config.conversationId })).status, 'awaiting-approval');
  assert.equal(f.launches.length, 2);
});

test('cancel works after the selected key changes and preserves the original request', async t => {
  const f = await fixture(t), h = f.create();
  await h.prepare(f.config); await h.authorize({ conversationId: f.config.conversationId });
  await writeFile(f.keyPath, 'changed-key-fixture');
  const result = await h.cancel({ conversationId: f.config.conversationId });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.task, f.config.task);
});

test('recovers CLI-installed auth after transient post-import coverage error without another approval', async t => {
  const f = await fixture(t);
  const originalRunner = f.dependencies.runTc;
  let failCoverage = true;
  f.dependencies.runTc = async (args, options) => {
    if (args.includes('caps') && failCoverage) throw failure('NETWORK_ERROR');
    return originalRunner(args, options);
  };
  const h = f.create();
  await h.prepare(f.config); await h.authorize({ conversationId: f.config.conversationId });
  await assert.rejects(() => h.importResponse('{"signature":"synthetic-response"}', { conversationId: f.config.conversationId }), { code: 'NETWORK_ERROR' });
  failCoverage = false;
  assert.equal((await f.create().status({ conversationId: f.config.conversationId })).status, 'ready');
  assert.equal((await f.create().authorize({ conversationId: f.config.conversationId })).status, 'ready');
  assert.equal(f.launches.length, 1);
  assert.equal(f.calls.filter(c => c.login && c.options.input).length, 1);
});

test('fixed app selection is bound to its private file and checked before import', async t => {
  const f = await fixture(t), h = f.create();
  const appReadSelectionPath = join(f.dir, 'selected.json');
  await writeFile(appReadSelectionPath, JSON.stringify(discoveryResult().appReadSelection), { mode: 0o600 });
  f.setLoginResult(discoveryResult());
  await h.prepare({ ...f.config, appReadSelectionPath });
  await h.authorize({ conversationId: f.config.conversationId });
  const login = f.calls.find(c => c.login);
  assert.equal(login.args[login.args.indexOf('--app-read-selection') + 1], appReadSelectionPath);
  assert.equal(login.args.includes('--discover-app-read'), false);
  await writeFile(appReadSelectionPath, '{}', { mode: 0o600 });
  await assert.rejects(h.importResponse('{"signature":"synthetic-response"}', { conversationId: f.config.conversationId }), { code: 'APPROVAL_CONTEXT_CHANGED' });
  assert.equal(f.calls.filter(c => c.login && c.options.input).length, 0);
});
test('fixed selected app import returns the CLI canonical-verification receipt', async t => {
  const f = await fixture(t), h = f.create(), selected = discoveryResult();
  const appReadSelectionPath = join(f.dir, 'selected.json');
  await writeFile(appReadSelectionPath, JSON.stringify(selected.appReadSelection), { mode: 0o600 });
  f.setLoginResult(selected);
  await h.prepare({ ...f.config, appReadSelectionPath }); await h.authorize({ conversationId: f.config.conversationId });
  const result = await h.importResponse('{"signature":"synthetic-response"}', { conversationId: f.config.conversationId });
  assert.deepEqual(result.appReadSelection, selected.appReadSelection);
});
