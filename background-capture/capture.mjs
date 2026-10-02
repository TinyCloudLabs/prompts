import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const identity = (sourceId, eventId, itemId) => `import:${digest([sourceId, eventId, itemId])}`;
const nonempty = value => typeof value === 'string' && value.length > 0 && value.length <= 512;

// Caller must hold the shared writer guard across this entire operation.
export async function capture(store, target, event, { capturedAt = new Date().toISOString() } = {}) {
  assert.equal(event.version, 1, 'Unsupported import version');
  assert.equal(event.sourceId, target.sourceId, 'Unexpected source');
  assert.ok(nonempty(event.sourceId) && nonempty(event.eventId) && nonempty(event.itemId), 'Stable source/event/item identity required');
  assert.ok(['create', 'correct'].includes(event.kind), 'Unsupported event kind');
  assert.match(event.occurrence_date, /^\d{4}-\d{2}-\d{2}$/, 'Occurrence date required');
  assert.equal(new Date(`${event.occurrence_date}T00:00:00Z`).toISOString().slice(0, 10), event.occurrence_date, 'Invalid occurrence date');
  new Intl.DateTimeFormat('en', { timeZone: event.timezone }).format();
  assert.ok(nonempty(event.timezone), 'Timezone required');
  assert.ok(event.values && typeof event.values === 'object' && !Array.isArray(event.values), 'Structured values required');
  assert.equal(typeof event.source_message, 'string', 'Source description required');
  assert.ok(target.recordsPrefix.endsWith('/'), 'Records prefix must end with /');
  if (event.kind === 'correct') {
    assert.ok(nonempty(event.target?.eventId) && nonempty(event.target?.itemId), 'Correction target required');
    assert.ok(Number.isInteger(event.expectedRevision) && event.expectedRevision >= 1, 'Expected revision required');
  }
  const original = event.kind === 'correct' ? event.target : event;
  const id = digest([event.sourceId, original.eventId, original.itemId]);
  const key = `${target.recordsPrefix}${id}.json`;
  const operationId = identity(event.sourceId, event.eventId, event.itemId);
  const fingerprint = digest(event);
  const previous = await store.get(key);
  if (previous) {
    assert.equal(previous.format, 'tinycloud-import-record/v1', 'Existing record has incompatible format');
    assert.equal(previous.id, id, 'Existing record identity mismatch');
    const applied = previous.history.find(entry => entry.operation_id === operationId);
    if (applied) {
      assert.equal(applied.fingerprint, fingerprint, 'Operation identity payload changed');
      return { key, record: previous, outcome: 'reconciled' };
    }
  }
  if (event.kind === 'create') assert.equal(previous, null, 'Existing record conflicts with import');
  else {
    assert.ok(previous, 'Correction target not found');
    assert.equal(previous.revision, event.expectedRevision, 'Correction revision conflict');
  }
  const now = capturedAt;
  assert.equal(new Date(now).toISOString(), now, 'Durable dispatch timestamp must be UTC ISO');
  const record = {
    ...(previous ?? { format: 'tinycloud-import-record/v1', id, source_key: identity(event.sourceId, event.eventId, event.itemId),
      source: { sourceId: event.sourceId, eventId: event.eventId, itemId: event.itemId }, captured_at: now,
      source_message: event.source_message }),
    occurrence_date: event.occurrence_date, timezone: event.timezone, values: event.values,
    revision: (previous?.revision ?? 0) + 1, last_operation_id: operationId,
    history: [...(previous?.history ?? []), { operation_id: operationId, fingerprint, kind: event.kind, applied_at: now,
      values: event.values, occurrence_date: event.occurrence_date, timezone: event.timezone, source_message: event.source_message }],
  };
  await store.put(key, record);
  assert.deepEqual(await store.get(key), record, 'Write readback mismatch; outcome unknown');
  return { key, record, outcome: 'applied' };
}
