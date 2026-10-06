import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
let listFeed;
try { ({ listFeed } = await import('./feed.mjs')); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }

test('a removed pending source stays blocked even when the feed directory is empty', async () => {
  assert.equal(typeof listFeed, 'function', 'Pending-aware feed reader must exist');
  const directory = await mkdtemp(join(tmpdir(), 'tc-pending-source-'));
  const pending = { name: '01-event.json', fingerprint: 'bound-payload', capturedAt: '2026-09-30T23:59:00.000Z' };
  try {
    await writeFile(join(directory, pending.name), '{}');
    assert.deepEqual(await listFeed(directory, pending), [pending.name]);
    await rm(join(directory, pending.name));
    await assert.rejects(listFeed(directory, pending), /pending source.*missing/i);
    assert.deepEqual(await listFeed(directory, null), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
