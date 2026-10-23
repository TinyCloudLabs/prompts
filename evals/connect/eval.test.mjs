import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createRun, readRun, makePacket, importPacket, rejectSecrets, json, ENV_FIELDS } from './store.mjs';
import { compareRuns } from './report.mjs';
import { resourceMetadataUrl, validateResource, validateAuthorization } from './probes.mjs';
import { captureTerminal } from './terminal.mjs';

const catalog = {
  schemaVersion: 1,
  platforms: [{ id: 'chatgpt', title: 'ChatGPT', route: 'hosted-mcp' }, { id: 'codex', title: 'Codex', route: 'local-cli' }],
  scenarios: [{ id: 'save', title: 'Write and read back', category: 'First value', tier: 'smoke', platforms: ['*'], prompt: 'Save the synthetic record.', controlled: false, preconditions: ['Authorized synthetic account.'], steps: ['Save, then read the authoritative record.'], checks: [{ id: 'save', description: 'Record saved only after approval.' }, { id: 'readback', description: 'Authoritative read returns requested value.' }] }],
};
const candidate = { label: 'test candidate', revision: 'test revision', connectUrl: 'https://agents.example.test/connect', mcpUrl: 'https://mcp.example.test/mcp' };
const environment = Object.fromEntries(ENV_FIELDS.map(key => [key, `synthetic-${key}`]));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'connect-eval-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'run');
  const run = await createRun(directory, structuredClone(catalog), candidate);
  const packet = makePacket(run, 'chatgpt', 'save');
  packet.environment = environment;
  packet.reviewer = 'test operator';
  packet.observed = 'Synthetic record committed and read back; expected value observed.';
  packet.evidence = ['observation.txt'];
  packet.checks = packet.checks.map(check => ({ ...check, status: 'passed', observed: 'Confirmed from the recorded synthetic operation.', evidence: ['observation.txt'] }));
  await writeFile(join(root, 'observation.txt'), 'Synthetic fixture only: approval accepted; saved todo key read back with the requested title.');
  const packetPath = join(root, 'packet.json');
  const save = () => writeFile(packetPath, json(packet));
  await save();
  return { root, directory, run, packet, packetPath, save };
}

test('Packet instructions target configured endpoints without changing catalog provenance', async t => {
  const root = await mkdtemp(join(tmpdir(), 'connect-routing-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const production = { connectUrl: 'https://agents.tinycloud.xyz/connect', mcpUrl: 'https://mcp.tinycloud.xyz/mcp' };
  const routingCatalog = structuredClone(catalog);
  const scenario = routingCatalog.scenarios[0];
  scenario.prompt = `Open ${production.connectUrl} and connect to ${production.mcpUrl}.`;
  scenario.preconditions = [`Allow ${production.connectUrl}.`];
  scenario.steps = [`Read ${production.connectUrl}.`, `Use ${production.mcpUrl}.`];
  scenario.checks[0].description = `Connected to ${production.mcpUrl}.`;
  scenario.sources = [production.connectUrl, `${production.connectUrl}.md`, production.mcpUrl];
  const catalogPath = join(root, 'catalog.json');
  await writeFile(catalogPath, json(routingCatalog));
  const execute = promisify(execFile);
  const cli = (...args) => execute(process.execPath, [fileURLToPath(new URL('./runner.mjs', import.meta.url)), ...args]);
  for (const [name, overrides] of [
    ['production', {}],
    ['preview-connect', { connectUrl: 'https://preview.example.test/setup' }],
    ['preview-both', { connectUrl: 'https://preview.example.test/setup', mcpUrl: 'https://preview.example.test/rpc' }],
  ]) {
    await t.test(name, async () => {
      const directory = join(root, name);
      const expected = { ...production, ...overrides };
      const flags = Object.entries(overrides).flatMap(([key, value]) => [key === 'connectUrl' ? '--connect-url' : '--mcp-url', value]);
      await cli('init', '--out', directory, '--candidate', name, '--catalog', catalogPath, ...flags);
      const before = await readFile(join(directory, 'run.json'), 'utf8');
      const packetPath = join(directory, 'packet.json');
      const { stdout } = await cli('packet', '--run', directory, '--platform', 'codex', '--scenario', 'save', '--out', packetPath);
      const presented = JSON.parse(stdout).scenario;
      const urls = text => text.match(/https:\/\/[a-z0-9./-]+[a-z0-9/]/g) || [];
      assert.deepEqual(urls(presented.prompt), [expected.connectUrl, expected.mcpUrl]);
      assert.deepEqual(presented.preconditions.flatMap(urls), [expected.connectUrl]);
      assert.deepEqual(presented.steps.flatMap(urls), [expected.connectUrl, expected.mcpUrl]);
      assert.deepEqual(urls(presented.checks[0].description), [expected.mcpUrl]);
      assert.deepEqual(presented.sources, scenario.sources);
      assert.equal(presented.id, scenario.id);
      assert.deepEqual(presented.checks.map(check => check.id), scenario.checks.map(check => check.id));
      assert.equal(await readFile(join(directory, 'run.json'), 'utf8'), before);
      const loaded = await readRun(directory);
      assert.deepEqual(loaded.catalog, routingCatalog);
      assert.equal(JSON.parse(await readFile(packetPath, 'utf8')).catalogHash, loaded.catalogHash);
      const baseline = { ...loaded, candidate: { ...loaded.candidate, ...production }, results: [{ platform: 'codex', scenario: 'save', status: 'passed' }] };
      assert.deepEqual(compareRuns({ ...loaded, results: baseline.results }, baseline), []);
    });
  }
});

test('A successful write cannot pass without authoritative read-back evidence', async t => {
  const f = await fixture(t);
  f.packet.checks[1].evidence = [];
  await f.save();
  await assert.rejects(importPacket(f.directory, f.packetPath, true), /passing\/failing needs evidence/);
  assert.equal((await readRun(f.directory)).results.length, 0);
});

test('Partial observations remain review-needed, and a later failed readback supersedes a pass', async t => {
  const f = await fixture(t);
  f.packet.checks[1] = { id: 'readback', status: 'not_run', observed: '', evidence: [] };
  await f.save();
  assert.equal((await importPacket(f.directory, f.packetPath, true)).status, 'needs_review');
  f.packet.checks[1] = { id: 'readback', status: 'passed', observed: 'Readback matched.', evidence: ['observation.txt'] };
  await f.save();
  assert.equal((await importPacket(f.directory, f.packetPath, true)).status, 'passed');
  const baseline = await readRun(f.directory);
  f.packet.checks[1] = { ...f.packet.checks[1], status: 'failed', observed: 'Readback returned a different title.' };
  await f.save();
  assert.equal((await importPacket(f.directory, f.packetPath, true)).status, 'failed');
  const current = await readRun(f.directory);
  assert.deepEqual(current.results.map(r => r.status), ['needs_review', 'passed', 'failed']);
  assert.equal(compareRuns(current, baseline)[0].kind, 'regression');
});

test('Review attestation, unique checks and candidate identity cannot be skipped', async t => {
  const f = await fixture(t);
  await assert.rejects(importPacket(f.directory, f.packetPath, false), /--redacted/);
  f.packet.checks[1].id = 'save';
  await f.save();
  await assert.rejects(importPacket(f.directory, f.packetPath, true), /duplicate/);
  f.packet.runId = 'another-run';
  await f.save();
  await assert.rejects(importPacket(f.directory, f.packetPath, true), /another run/);
});

test('Evidence snapshots cannot silently change after recording', async t => {
  const f = await fixture(t);
  const result = await importPacket(f.directory, f.packetPath, true);
  await writeFile(join(f.root, 'observation.txt'), 'Operator source changed after import.');
  assert.equal((await readRun(f.directory)).results[0].status, 'passed');
  await writeFile(join(f.directory, result.evidence[0].path), 'Tampered stored evidence.');
  await assert.rejects(readRun(f.directory), /Evidence changed/);
});

test('Evidence symlinks cannot exfiltrate a file outside the review packet directory', async t => {
  const f = await fixture(t);
  const external = await mkdtemp(join(tmpdir(), 'connect-external-'));
  t.after(() => rm(external, { recursive: true, force: true }));
  await writeFile(join(external, 'outside.txt'), 'Private unrelated document.');
  await rm(join(f.root, 'observation.txt'));
  await symlink(join(external, 'outside.txt'), join(f.root, 'observation.txt'));
  await assert.rejects(importPacket(f.directory, f.packetPath, true), /escapes/);
});

test('Controlled fault scenarios require an authorized fixture acknowledgement', async t => {
  const f = await fixture(t);
  const controlledCatalog = structuredClone(catalog);
  controlledCatalog.scenarios[0].controlled = true;
  const controlled = join(f.root, 'controlled');
  const run = await createRun(controlled, controlledCatalog, candidate);
  f.packet.runId = run.id;
  f.packet.catalogHash = run.catalogHash;
  await f.save();
  await assert.rejects(importPacket(controlled, f.packetPath, true), /controlled fixture/);
  f.packet.controlledFixture = true;
  await f.save();
  assert.equal((await importPacket(controlled, f.packetPath, true)).status, 'passed');
});

function recordedRun(status = 'passed', variant = 'default') {
  return { schemaVersion: 1, catalog: structuredClone(catalog), candidate, results: [{ platform: 'chatgpt', scenario: 'save', variant, status, environment: { ...environment }, checks: [], evidence: [] }] };
}

test('Changed model/account/scenario is incomparable, not a spurious regression', () => {
  const baseline = recordedRun();
  const current = recordedRun('failed');
  current.results[0].environment.model = 'different model';
  assert.equal(compareRuns(current, baseline)[0].kind, 'context_changed');
  current.results[0].environment = { ...environment };
  current.catalog.scenarios[0].checks[1].description = 'A changed acceptance criterion.';
  assert.equal(compareRuns(current, baseline)[0].kind, 'context_changed');
});

test('Missing attempts and removed catalog coverage cannot inherit old green outcomes', () => {
  const baseline = recordedRun();
  const current = recordedRun();
  current.results = [];
  assert.equal(compareRuns(current, baseline)[0].kind, 'coverage_lost');
  current.catalog.scenarios = [];
  const changes = compareRuns(current, baseline);
  assert.equal(changes.find(change => change.platform === 'chatgpt').kind, 'coverage_lost');
  assert.equal(changes.find(change => change.platform === 'codex').kind, 'coverage_lost');
});

test('Different client variants never replace each other in comparisons', () => {
  const baseline = recordedRun('passed', 'free-browser');
  const current = recordedRun('passed', 'team-browser');
  const changes = compareRuns(current, baseline);
  assert.equal(changes.find(change => change.variant === 'free-browser').kind, 'coverage_lost');
  assert.equal(changes.find(change => change.variant === 'team-browser').kind, 'improvement');
});

test('Credential guard rejects encoded approval URLs, email addresses, and token material', () => {
  for (const value of ['https://openkey.example.test/approve?state=secret', 'https://openkey.example.test/approve%3Fstate%3Dsecret', 'someone@example.test', 'Bearer abcdefghijklmnopqrstuvwxyz', '-----BEGIN PRIVATE KEY-----', '{"refresh_token":"sensitive-value"}']) {
    assert.throws(() => rejectSecrets(value), /Possible credential/);
  }
});

test('OAuth discovery cannot pass with an insecure resource, wrong issuer or missing PKCE', () => {
  assert.equal(resourceMetadataUrl('Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource"'), 'https://mcp.example.test/.well-known/oauth-protected-resource');
  assert.throws(() => resourceMetadataUrl('Bearer resource_metadata="http://mcp.example.test/metadata"'), /HTTPS/);
  assert.throws(() => validateResource({ resource: 'https://other.example.test/mcp', authorization_servers: ['https://auth.example.test'] }, candidate.mcpUrl), /differs/);
  const metadata = { issuer: 'https://auth.example.test', authorization_endpoint: 'https://auth.example.test/authorize', token_endpoint: 'https://auth.example.test/token', response_types_supported: ['code'], code_challenge_methods_supported: ['S256'] };
  assert.throws(() => validateAuthorization(metadata, 'https://wrong.example.test'), /issuer/);
  metadata.code_challenge_methods_supported = ['plain'];
  assert.throws(() => validateAuthorization(metadata, metadata.issuer), /S256/);
});

test('Terminal synchronization cannot inject tape commands or shell syntax', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t);
  const options = {
    platform: 'codex', scenario: 'save', model: 'test-model', clientVersion: 'test-client',
    fixture: 'synthetic terminal fixture', session: 'test-session', wait: 'Ready', timeout: 1,
  };
  for (const wait of ['Ready/\nType "accept"', 'Ready\nEnter', 'Ready\u0000']) {
    await assert.rejects(captureTerminal(f.directory, f.run, { ...options, wait }), /single-line Go regexp/);
  }
  for (const session of ['test;touch unexpected', 'test$(whoami)', '-other-session']) {
    await assert.rejects(captureTerminal(f.directory, f.run, { ...options, session }), /tmux socket\/session names/);
  }
  await assert.rejects(captureTerminal(f.directory, f.run, { ...options, socket: 'default;sh' }), /tmux socket\/session names/);
  assert.deepEqual((await readRun(f.directory)).results, []);
});
