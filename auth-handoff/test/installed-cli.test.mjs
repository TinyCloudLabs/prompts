import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHandoff } from '../lib/handoff.mjs';

test('installed CLI creates the requested key, supplies a detached paste URL and preserves fresh-process state', { skip: !process.env.TINYCLOUD_TEST_CLI }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tc-handoff-installed-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifestPath = join(directory, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({ app_id: 'registry-reader', space: 'account', defaults: false, includePublicSpace: false,
    permissions: [{ service: 'tinycloud.kv', path: 'applications/', skipPrefix: true, actions: ['get', 'list'] }, { service: 'tinycloud.capabilities', path: '', skipPrefix: true, actions: ['read'] }] }));
  const statePath = join(directory, 'state', 'pending.json');
  const config = { cli: process.env.TINYCLOUD_TEST_CLI, tcHome: join(directory, 'home'), profile: 'smoke-reader', host: 'https://node.tinycloud.xyz', manifestPath,
    conversationId: 'smoke-native-session', task: { originalRequest: 'Read my latest weigh-in', requestedAt: '2026-10-01T12:00:00Z', timezone: 'Europe/Lisbon' } };
  const handoff = createHandoff({ statePath });
  const prepared = await handoff.prepare(config);
  assert.equal(prepared.status, 'login-required');
  const keyBefore = await readFile(join(config.tcHome, '.tinycloud', 'profiles', config.profile, 'key.json'));
  const pending = await handoff.authorize({ conversationId: config.conversationId, deliveryMode: 'file' });
  assert.equal(pending.status, 'awaiting-approval');
  assert.equal(pending.delivery.status, 'file-created');
  const command = new URL('../scripts/auth.mjs', import.meta.url);
  const child = spawnSync(process.execPath, [command.pathname, 'status', '--state', statePath, '--conversation-id', config.conversationId], { encoding: 'utf8' });
  assert.equal(child.status, 0);
  const observed = JSON.parse(child.stdout);
  assert.equal(observed.status, 'awaiting-approval');
  assert.equal(observed.sessionDid, prepared.sessionDid);
  assert.deepEqual(await readFile(join(config.tcHome, '.tinycloud', 'profiles', config.profile, 'key.json')), keyBefore);
  await handoff.cancel({ conversationId: config.conversationId });
});
