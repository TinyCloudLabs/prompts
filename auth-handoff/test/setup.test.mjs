import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const module = await import('../lib/setup.mjs').catch(() => ({}));
const owner = 'did:pkh:eip155:1:0x1111111111111111111111111111111111111111';
const host = 'https://node.tinycloud.xyz';
const app = { appId: 'notes', manifestHash: 'b'.repeat(16), name: 'Notes', description: 'Personal notes', manifests: [{ app_id: 'notes' }] };
const permissions = [{ service: 'tinycloud.sql', space: `tinycloud:${owner.slice(4)}:notes`, path: 'entries', actions: ['tinycloud.sql/read'] }];
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'tc-lean-setup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cli = join(root, 'tc'); await writeFile(cli, 'test-cli');
  const tcHome = join(root, 'home');
  await mkdir(join(tcHome, '.tinycloud/profiles/reader'), { recursive: true });
  await writeFile(join(tcHome, '.tinycloud/profiles/reader/key.json'), '{"synthetic":true}');
  let present = true, covered = true, apps = [app], unavailable = false, badRelease = false;
  const calls = [], launches = [];
  const release = { version: 'test-release', cliPath: cli, cliVersion: 'test-cli', manifestSha256: 'a'.repeat(64) };
  const options = { stateRoot: join(root, 'state'), env: { HOME: tcHome },
    verifyRelease: async () => { calls.push(['verify']); if (badRelease) throw Object.assign(new Error('Incompatible runtime'), { code: 'CLI_INCOMPATIBLE' }); return release; },
    runTc: async (args, opts) => {
      calls.push(args);
      assert.equal(opts.executable, cli);
      if (args.includes('profile') && args.includes('list')) return JSON.stringify({ profiles: [{ name: 'reader', host }], defaultProfile: 'reader' });
      if (args.includes('context')) return JSON.stringify({ schemaVersion: 1, profile: 'reader', host, ownerDid: present ? owner : null, sessionDid: 'did:key:synthetic', spaceId: null, session: present ? { state: 'present', expiresAt: '2099-01-01T00:00:00Z' } : { state: 'missing', expiresAt: null } });
      if (args.includes('apps') && args.includes('list')) { if (unavailable) throw Object.assign(new Error(), { code: 'PERMISSION_DENIED' }); return JSON.stringify({ applications: apps, complete: true, issues: [] }); }
      if (args.includes('read-scope')) return JSON.stringify({ appReadSelection: { schemaVersion: 1, protocolVersion: 1, appId: args.at(-1), ownerDid: owner, host, clientKeyDigest: 'a'.repeat(64), manifestHash: 'b'.repeat(16), selectionDigest: 'c'.repeat(64), permissions }, application: apps.find(a => a.appId === args.at(-1)), permissions, manifest: { app_id: args.at(-1), name: args.at(-1), defaults: false, includePublicSpace: false, permissions: permissions.map(p => ({ ...p, skipPrefix: true })) } });
      if (args.includes('caps')) return JSON.stringify({ covered });
      throw new Error(`Unexpected invocation ${args}`);
    },
    loginRunner: async (args, opts) => {
      calls.push(['login', ...args]);
      if (opts.input === undefined) return 'https://openkey.example.test/delegate';
      present = true; covered = true; unavailable = false;
      return { permissions, appReadSelection: { schemaVersion: 1, protocolVersion: 1, appId: 'notes', ownerDid: owner, host, clientKeyDigest: 'a'.repeat(64), manifestHash: 'b'.repeat(16), selectionDigest: 'c'.repeat(64), permissions } };
    },
    openApproval: async () => { launches.push('opened'); return { status: 'launch-requested' }; },
  };
  return { root, calls, launches, release, options, create: () => { assert.equal(typeof module.createSetup, 'function'); return module.createSetup(options); }, set: values => { if ('present' in values) present=values.present; if ('covered' in values) covered=values.covered; if ('apps' in values) apps=values.apps; if ('unavailable' in values) unavailable=values.unavailable; if ('badRelease' in values) badRelease=values.badRelease; } };
}
test('fresh conversation reuses live app authority without a previous receipt or discovery preflight', async t => {
  const f = await fixture(t);
  const result = await f.create().forSession('new-conversation').setup({ originalRequest: 'Find my latest note' });
  assert.equal(result.status, 'ready'); assert.equal(result.application.appId, 'notes');
  assert.equal(result.release.version, 'test-release'); assert.equal(result.cliContext.executable, f.release.cliPath);
  assert.equal(f.launches.length, 0); assert.equal(f.calls.filter(c => c[0] === 'login').length, 0);
  assert.ok(f.calls.some(c => c.includes('read-scope'))); assert.ok(f.calls.some(c => c.includes('caps')));
  const next = await f.create().forSession('another-conversation').setup({ originalRequest: 'Find my latest note', contextHandle: result.contextHandle });
  assert.equal(next.status, 'ready'); assert.equal(next.contextHandle, result.contextHandle);
});
test('release incompatibility fails before any profile command or state mutation', async t => {
  const f = await fixture(t); f.set({ badRelease: true });
  await assert.rejects(f.create().forSession('conversation').setup({ originalRequest: 'Find a note' }), { code: 'CLI_INCOMPATIBLE' });
  assert.deepEqual(f.calls, [['verify']]); assert.equal(f.launches.length, 0);
  await assert.rejects(readFile(join(f.root, 'state/last-context.json')), { code: 'ENOENT' });
});
test('cold setup opens one approval; native import returns app resources and original request', async t => {
  const f = await fixture(t); f.set({ present: false, covered: false, unavailable: true });
  const handoff = f.create().forSession('cold');
  const pending = await handoff.setup({ originalRequest: 'Find my latest note' });
  assert.equal(pending.status, 'awaiting-approval'); assert.equal(f.launches.length, 1);
  assert.ok(f.calls.find(c => c[0] === 'login').includes('--discover-app-read'));
  const result = await handoff.importResponse('{"signature":"synthetic"}', { conversationId: 'cold', messageId: 'm1' });
  assert.equal(result.status, 'ready'); assert.equal(result.application.appId, 'notes');
  assert.equal(result.task, 'Find my latest note'); assert.deepEqual(result.resources, permissions);
  assert.equal(f.launches.length, 1);
});
test('registry-only authority prepares a fixed app scope with additive login', async t => {
  const f = await fixture(t); f.set({ covered: false });
  const result = await f.create().forSession('partial').setup({ originalRequest: 'Find my latest note' });
  assert.equal(result.status, 'awaiting-approval');
  const login = f.calls.find(c => c[0] === 'login');
  assert.ok(login.includes('--additional')); assert.ok(!login.includes('--discover-app-read')); assert.ok(login.includes('--app-read-selection'));
  assert.equal(f.launches.length, 1);
});
test('saved app is only a hint for a different question and ambiguity returns descriptions', async t => {
  const f = await fixture(t);
  const first = await f.create().forSession('one').setup({ originalRequest: 'Find my latest note' });
  f.set({ apps: [app, { ...app, appId: 'tasks', name: 'Tasks', description: 'My tasks' }] });
  const result = await f.create().forSession('two').setup({ originalRequest: 'What is due today?', contextHandle: first.contextHandle });
  assert.equal(result.status, 'selection-required'); assert.equal(result.applications.length, 2); assert.equal(f.launches.length, 0);
  const chosen = await f.create().forSession('two').setup({ originalRequest: 'What is due today?', contextHandle: first.contextHandle, appId: 'tasks' });
  assert.equal(chosen.status, 'ready'); assert.equal(chosen.application.appId, 'tasks');
});
test('explicit host mismatch is preserved as an error, never silently overwritten', async t => {
  const f = await fixture(t);
  await assert.rejects(f.create().forSession('one').setup({ originalRequest: 'Find a note', profile: 'reader', host: 'https://other.example.test' }), { code: 'CONTEXT_MISMATCH' });
  assert.equal(f.launches.length, 0);
});

test('new ambiguity provides a durable context handle for explicit selection', async t => {
  const f = await fixture(t); f.set({ apps: [app, { ...app, appId: 'tasks' }] });
  const h = f.create().forSession('ambiguous');
  const choice = await h.setup({ originalRequest: 'Find my tasks' });
  assert.equal(choice.status, 'selection-required');
  const ready = await h.setup({ originalRequest: 'Find my tasks', contextHandle: choice.contextHandle, appId: 'tasks' });
  assert.equal(ready.status, 'ready');
});
test('another request in the same conversation rechecks scope with retained account context', async t => {
  const f = await fixture(t); const h = f.create().forSession('same');
  const first = await h.setup({ originalRequest: 'Find my latest note' });
  const second = await h.setup({ originalRequest: 'Find notes about travel' });
  assert.equal(second.status, 'ready'); assert.equal(second.contextHandle, first.contextHandle);
  assert.equal(second.task, 'Find notes about travel'); assert.equal(f.launches.length, 0);
});
test('setup claims the native account before launching its approval', async t => {
  const f = await fixture(t); f.set({ covered: false });
  await assert.rejects(f.create().forSession('claimed').setup({ originalRequest: 'Read my note' }, { beforeAuthorize: () => { throw Object.assign(new Error(), { code: 'APPROVAL_IN_ANOTHER_SESSION' }); } }), { code: 'APPROVAL_IN_ANOTHER_SESSION' });
  assert.equal(f.launches.length, 0);
});

test('actual registry unauthorized code selects discovery instead of collapsing to command failure', async t => {
  const f = await fixture(t); const original = f.options.runTc;
  f.options.runTc = (args, options) => args.includes('apps') && args.includes('list') ? Promise.reject(Object.assign(new Error(), { code: 'AUTH_UNAUTHORIZED' })) : original(args, options);
  const result = await f.create().forSession('unauthorized').setup({ originalRequest: 'Read a note' });
  assert.equal(result.status, 'awaiting-approval'); assert.ok(f.calls.find(c => c[0] === 'login').includes('--discover-app-read'));
});
test('classified interrupted acquisition can retry explicitly without replacing its bound task', async t => {
  const f = await fixture(t); f.set({ covered: false }); const login = f.options.loginRunner; let failed = false;
  f.options.loginRunner = (args, options) => { if (!failed) { failed = true; throw Object.assign(new Error(), { code: 'OPENKEY_DEPLOYMENT_INCOMPATIBLE' }); } return login(args, options); };
  const h = f.create().forSession('retry');
  await assert.rejects(h.setup({ originalRequest: 'Read a note' }), { code: 'OPENKEY_DEPLOYMENT_INCOMPATIBLE' });
  assert.equal((await h.setup({ originalRequest: 'Read a note', retry: true })).status, 'awaiting-approval');
  assert.equal(f.launches.length, 1);
});
test('discovered app registration drift after import cannot be reported as ready', async t => {
  const f = await fixture(t); f.set({ present: false, covered: false, unavailable: true });
  const original = f.options.runTc;
  f.options.runTc = async (args, options) => {
    const result = JSON.parse(await original(args, options));
    if (args.includes('read-scope')) result.application = { ...result.application, manifestHash: 'd'.repeat(16) };
    return JSON.stringify(result);
  };
  const h = f.create().forSession('drift'); await h.setup({ originalRequest: 'Read a note' });
  await assert.rejects(h.importResponse('{"signature":"synthetic"}', { messageId: 'm' }), { code: 'OPENKEY_DISCOVERY_MISMATCH' });
  assert.equal(f.launches.length, 1);
});

test('fixed selected app requires a canonical CLI selection receipt before requesting consent', async t => {
  const f = await fixture(t); f.set({ covered: false }); const original = f.options.runTc;
  f.options.runTc = async (args, options) => { const result = JSON.parse(await original(args, options)); if (args.includes('read-scope')) delete result.appReadSelection; return JSON.stringify(result); };
  await assert.rejects(f.create().forSession('invalid').setup({ originalRequest: 'Read my note' }), { code: 'AUTH_RECEIPT_INVALID' });
  assert.equal(f.launches.length, 0);
});

test('cancelled same-question approval stays cancelled until an explicit retry', async t => {
  const f = await fixture(t); f.set({ covered: false }); const h = f.create().forSession('cancelled');
  await h.setup({ originalRequest: 'Read my note' }); await h.cancel();
  assert.equal((await h.setup({ originalRequest: 'Read my note' })).status, 'cancelled');
  assert.equal(f.launches.length, 1);
  assert.equal((await h.setup({ originalRequest: 'Read my note', retry: true })).status, 'awaiting-approval');
  assert.equal(f.launches.length, 2);
});
