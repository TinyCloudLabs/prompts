import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const entry = fileURLToPath(new URL('../scripts/auth.mjs', import.meta.url));
function invoke(args) { return spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' }); }
test('CLI refuses inline response arguments without echoing them', () => {
  const result = invoke(['import', '--state', '/tmp/unused-private-state.json', '--conversation-id', 'test', '--code', 'PRIVATE_SYNTHETIC_RESPONSE']);
  let receipt; try { receipt = JSON.parse(result.stdout); } catch {}
  assert.equal(receipt?.error?.code, 'INVALID_ARGUMENT');
  assert.equal(result.status, 1);
  assert.equal((result.stdout + result.stderr).includes('PRIVATE_SYNTHETIC_RESPONSE'), false);
});
test('CLI help advertises only existing private-file imports', () => {
  const result = invoke(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--code-file/);
  assert.doesNotMatch(result.stdout, /--code </);
});
