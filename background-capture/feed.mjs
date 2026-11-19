import { readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function listFeed(directory, pending) {
  const names = (await readdir(directory)).filter(name => name.endsWith('.json')).sort();
  if (pending) assert.ok(names.includes(pending.name), `Pending source file missing: ${pending.name}; restore its immutable payload before resuming`);
  return names;
}
