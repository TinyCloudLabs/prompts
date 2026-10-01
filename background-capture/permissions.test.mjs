import test from 'node:test';
import assert from 'node:assert/strict';
let verifyPermissions;
try { ({ verifyPermissions } = await import('./permissions.mjs')); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
const config = { profile: 'import', space: 'test-space', recordsPrefix: 'app/records/', contractKey: 'app/knowledge/import.json', intentionKey: 'app/intentions/import.json' };
const permissions = [
  { service: 'tinycloud.kv', space: config.space, path: config.recordsPrefix, actions: ['tinycloud.kv/get', 'tinycloud.kv/put'] },
  ...[config.contractKey, config.intentionKey].map(path => ({ service: 'tinycloud.kv', space: config.space, path, actions: ['tinycloud.kv/get'] })),
  { service: 'tinycloud.capabilities', space: config.space, path: '', actions: ['tinycloud.capabilities/read'] },
];
const status = () => ({ profiles: [{ name: config.profile, authenticated: true, session: { present: true, expired: false, permissions: structuredClone(permissions) }, activeDelegationCount: 0 }] });
test('job readiness requires exact current ordinary scope; missing, expired and broader grants fail', () => {
  assert.equal(typeof verifyPermissions, 'function', 'Permission readiness validator must exist');
  verifyPermissions(status(), config);
  const missing = status(); missing.profiles[0].session.permissions[0].actions.pop();
  assert.throws(() => verifyPermissions(missing, config), /permissions/i);
  const broad = status(); broad.profiles[0].session.permissions[1].actions.push('tinycloud.kv/put');
  assert.throws(() => verifyPermissions(broad, config), /permissions/i);
  const expired = status(); expired.profiles[0].session.expired = true;
  assert.throws(() => verifyPermissions(expired, config), /expired/i);
  assert.throws(() => verifyPermissions({ profiles: [] }, config), /profile/i);
});
