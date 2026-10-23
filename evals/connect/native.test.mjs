import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRun, readRun } from './store.mjs';

const execute = promisify(execFile);
const candidate = { label: 'synthetic', revision: 'synthetic', connectUrl: 'https://preview.example.test/connect', mcpUrl: 'https://preview.example.test/mcp' };
const catalog = {
  schemaVersion: 1,
  platforms: [{ id: 'codex', title: 'Codex', route: 'local-cli' }],
  scenarios: [{ id: 'startup', title: 'Startup', category: 'Startup', tier: 'smoke', platforms: ['*'], prompt: 'Read https://agents.tinycloud.xyz/connect and use https://mcp.tinycloud.xyz/mcp.', controlled: false, preconditions: ['Synthetic local adapter only.'], steps: ['Capture local output.'], checks: [{ id: 'executed', description: 'Synthetic operation reviewed.' }] }],
};

async function captureFixture(t, versionScript) {
  const root = await mkdtemp(join(tmpdir(), 'connect-native-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'run');
  const marker = join(root, 'main-prompt.txt');
  await createRun(directory, structuredClone(catalog), candidate);
  const adapter = {
    platform: 'codex', model: 'synthetic-local', surface: 'local synthetic adapter', passEnv: [],
    versionCommand: [process.execPath, '-e', versionScript],
    command: [process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, process.argv[1]);`, '{prompt}'],
  };
  // Signals target a disposable runner, never the node:test process. The version
  // child starts only after capture installs its handlers; it waits to be killed.
  const worker = `
    import { readRun } from ${JSON.stringify(new URL('./store.mjs', import.meta.url).href)};
    import { captureNative } from ${JSON.stringify(new URL('./native.mjs', import.meta.url).href)};
    const directory = ${JSON.stringify(directory)};
    const captured = await captureNative(directory, await readRun(directory), ${JSON.stringify({ platform: 'codex', scenario: 'startup', adapter, timeout: 5 })});
    console.log(JSON.stringify(captured));
  `;
  const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', worker], { timeout: 20000 });
  const captured = JSON.parse(stdout);
  const metadata = JSON.parse(await readFile(join(captured.captureDir, 'capture.json'), 'utf8'));
  const saved = await readRun(directory);
  assert.equal(saved.results.length, 1);
  const result = saved.results[0];
  assert.deepEqual(result.checks, [{ id: 'executed', status: 'not_run', observed: '', evidence: [] }]);
  assert.deepEqual(result.evidence, []);
  return { marker, result, metadata };
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`${signal} during version lookup blocks capture without launching the main command`, { skip: process.platform === 'win32' }, async t => {
    const { marker, result, metadata } = await captureFixture(t, `process.kill(process.ppid, ${JSON.stringify(signal)}); setInterval(() => {}, 1000);`);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
    assert.equal(result.status, 'blocked');
    assert.equal(metadata.phase, 'version');
    assert.equal(metadata.outcome.forced, 'interrupted');
  });
}

test('Failed version lookup still executes the main command with resolved candidate instructions', { skip: process.platform === 'win32' }, async t => {
  const { marker, result, metadata } = await captureFixture(t, 'process.exit(7)');
  assert.equal(await readFile(marker, 'utf8'), 'Read https://preview.example.test/connect and use https://preview.example.test/mcp.');
  assert.equal(result.status, 'needs_review');
  assert.equal(metadata.phase, 'main');
  assert.equal(metadata.outcome.code, 0);
  assert.equal(metadata.outcome.forced, '');
});
