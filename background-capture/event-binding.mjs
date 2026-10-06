import assert from 'node:assert/strict';
import { digest } from './capture.mjs';

// Persist bindings with the dispatch plan before sending any mutation.
export function bindEvent(bindings, event) {
  const key = digest([event.sourceId, event.eventId, event.itemId]);
  const fingerprint = digest(event);
  if (bindings[key]) assert.equal(bindings[key], fingerprint, 'Operation identity payload or target changed');
  else bindings[key] = fingerprint;
}
