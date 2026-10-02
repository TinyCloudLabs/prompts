import assert from 'node:assert/strict';
import { canonical } from './capture.mjs';

export function verifyPermissions(status, config) {
  const profile = status.profiles?.find(profile => profile.name === config.profile);
  assert.ok(profile, 'Selected profile missing');
  assert.ok(profile.authenticated && profile.session?.present && !profile.session.expired, 'Session missing or expired');
  assert.equal(profile.activeDelegationCount, 0, 'Use a dedicated import profile with one exact scoped session');
  const expected = [
    { service: 'tinycloud.kv', space: config.space, path: config.recordsPrefix, actions: ['tinycloud.kv/get', 'tinycloud.kv/put'] },
    ...[config.contractKey, config.intentionKey].map(path => ({ service: 'tinycloud.kv', space: config.space, path, actions: ['tinycloud.kv/get'] })),
    { service: 'tinycloud.capabilities', space: config.space, path: '', actions: ['tinycloud.capabilities/read'] },
  ];
  const normalize = entries => entries.map(entry => canonical({ service: entry.service, space: entry.space, path: entry.path, actions: [...entry.actions].sort() })).sort();
  assert.deepEqual(normalize(profile.session.permissions), normalize(expected), 'Import session permissions must match the exact ordinary scope');
}
