import test from 'node:test';
import assert from 'node:assert/strict';
let bindEvent;
try { ({ bindEvent } = await import('./event-binding.mjs')); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }

test('persisted event binding rejects a correction retargeted under the same operation identity', () => {
  assert.equal(typeof bindEvent, 'function', 'Job-wide event binding must exist');
  const event = { sourceId: 'feed', eventId: 'edit-1', itemId: '1', kind: 'correct', target: { eventId: 'purchase-1', itemId: '1' }, values: { amount_minor: 700 } };
  const state = { bindings: {} };
  bindEvent(state.bindings, event);
  const restarted = JSON.parse(JSON.stringify(state));
  bindEvent(restarted.bindings, event);
  assert.throws(() => bindEvent(restarted.bindings, { ...event, target: { eventId: 'purchase-2', itemId: '1' } }), /identity.*changed/i);
  assert.equal(Object.keys(restarted.bindings).length, 1);
});
