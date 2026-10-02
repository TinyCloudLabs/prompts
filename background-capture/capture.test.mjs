import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

let capture, withWriterGuard;
try { ({ capture } = await import('./capture.mjs')); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
try { ({ withWriterGuard } = await import('./writer-guard.mjs')); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
const event = (eventId = 'purchase-1', values = { amount_minor: 650, currency: 'EUR' }) => ({
  version: 1, sourceId: 'synthetic-import', eventId, itemId: '1', kind: 'create',
  occurrence_date: '2026-09-30', timezone: 'Europe/Lisbon', values,
  source_message: 'Synthetic imported lunch',
});
const target = { sourceId: 'synthetic-import', recordsPrefix: 'example/records/' };
function memoryStore() {
  const rows = new Map();
  return { rows, puts: 0, async get(k) { return rows.has(k) ? structuredClone(rows.get(k)) : null; },
    async put(k, v) { this.puts++; rows.set(k, structuredClone(v)); } };
}

test('stable imported item replay preserves a corrected record and history', async () => {
  assert.equal(typeof capture, 'function', 'source-to-record capture API must exist');
  const store = memoryStore();
  const first = await capture(store, target, event());
  const correction = { ...event('correction-1', { amount_minor: 700, currency: 'EUR' }), kind: 'correct',
    target: { eventId: 'purchase-1', itemId: '1' }, expectedRevision: 1 };
  await capture(store, target, correction);
  await capture(store, target, event());
  const row = await store.get(first.key);
  assert.equal(store.rows.size, 1);
  assert.equal(store.puts, 2);
  assert.equal(row.values.amount_minor, 700);
  assert.equal(row.revision, 2);
  assert.equal(row.history.length, 2);
  assert.equal(row.history[0].values.amount_minor, 650);
  assert.equal(row.occurrence_date, '2026-09-30');
  assert.equal(row.captured_at, first.record.captured_at);
});

test('distinct identical events and multiple items remain distinct', async () => {
  assert.equal(typeof capture, 'function', 'source-to-record capture API must exist');
  const store = memoryStore();
  await capture(store, target, event());
  await capture(store, target, event('purchase-2'));
  await capture(store, target, { ...event(), itemId: '2' });
  assert.equal(store.rows.size, 3);
});

test('retry after committed write with lost receipt reconciles by original operation', async () => {
  assert.equal(typeof capture, 'function', 'source-to-record capture API must exist');
  const store = memoryStore();
  const put = store.put.bind(store);
  store.put = async (k, v) => { await put(k, v); throw Error('receipt lost'); };
  await assert.rejects(capture(store, target, event()), /receipt lost/);
  const retry = await capture(store, target, event());
  assert.equal(retry.outcome, 'reconciled');
  assert.equal(store.puts, 1);
});

test('a durable dispatch plan retains its capture clock across pre-commit failure', async () => {
  const store = memoryStore();
  const capturedAt = '2026-09-30T23:59:00.000Z';
  const put = store.put.bind(store);
  let attempted;
  store.put = async (_key, value) => { attempted = value; throw Error('network unavailable'); };
  await assert.rejects(capture(store, target, event(), { capturedAt }), /network unavailable/);
  store.put = put;
  const retried = await capture(store, target, event(), { capturedAt });
  assert.equal(attempted.captured_at, capturedAt);
  assert.equal(retried.record.captured_at, capturedAt);
});

test('changed payload under same ID and stale corrections fail without overwrite', async () => {
  assert.equal(typeof capture, 'function', 'source-to-record capture API must exist');
  const store = memoryStore();
  await capture(store, target, event());
  await assert.rejects(capture(store, target, event('purchase-1', { amount_minor: 800 })), /identity.*changed/i);
  const correction = { ...event('correction-1'), kind: 'correct', target: { eventId: 'purchase-1', itemId: '1' }, expectedRevision: 0 };
  await assert.rejects(capture(store, target, correction), /revision/i);
  assert.equal(store.puts, 1);
});

test('unknown source and invalid date cannot create records', async () => {
  assert.equal(typeof capture, 'function', 'source-to-record capture API must exist');
  const store = memoryStore();
  await assert.rejects(capture(store, target, { ...event(), sourceId: 'other' }), /source/i);
  await assert.rejects(capture(store, target, { ...event(), occurrence_date: '2026-02-30' }), /date/i);
  assert.equal(store.puts, 0);
});

test('failed reads never authorize an insert', async () => {
  const store = memoryStore();
  store.get = async () => { throw Error('permission denied'); };
  await assert.rejects(capture(store, target, event()), /permission denied/);
  assert.equal(store.puts, 0);
});

test('cooperating background and interactive callers serialize whole transactions', async () => {
  assert.equal(typeof withWriterGuard, 'function', 'shared writer guard must exist');
  const directory = await mkdtemp(join(tmpdir(), 'tc-guard-test-'));
  try {
    const context = { directory, owner: 'did:example:test', host: 'http://localhost:1234', space: 'tinycloud:example:test' };
    let active = 0, maxActive = 0;
    await Promise.all(Array.from({ length: 5 }, () => withWriterGuard(context, async () => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 20)); active--;
    })));
    assert.equal(maxActive, 1);
    await assert.rejects(withWriterGuard(context, async () => { throw Error('write failed'); }), /write failed/);
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('separate local processes share the writer guard', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tc-multiprocess-guard-'));
  const counter = join(directory, 'counter.json');
  await writeFile(counter, '0');
  const script = `import {withWriterGuard} from ${JSON.stringify(new URL('./writer-guard.mjs', import.meta.url).href)};
    import {readFile,writeFile} from 'node:fs/promises';
    for(let i=0;i<4;i++) await withWriterGuard(${JSON.stringify({ directory: join(directory, 'guards'), owner: 'test-owner', space: 'test-space', host: 'http://localhost:1234' })},async()=>{
      const n=JSON.parse(await readFile(${JSON.stringify(counter)},'utf8'));
      await new Promise(r=>setTimeout(r,10));
      await writeFile(${JSON.stringify(counter)},JSON.stringify(n+1));
    });`;
  try {
    await Promise.all([1, 2, 3].map(() => promisify(execFile)(process.execPath, ['--input-type=module', '-e', script])));
    assert.equal(JSON.parse(await readFile(counter, 'utf8')), 12);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
