#!/usr/bin/env node
// Against a newly started docs/validation/app-creation-fixture.mjs --keep only.
// Supplies synthetic source IDs and synthetic consent; never a human onboarding test.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rename, access, mkdtemp } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { digest } from './capture.mjs';

const runner = join(dirname(fileURLToPath(import.meta.url)), 'runner.mjs');
assert.ok(await access(runner).then(() => true, () => false), 'Independent import worker must exist');
const fixture = JSON.parse(await readFile(resolve(process.argv[2]), 'utf8'));
assert.match(fixture.classification, /disposable synthetic fixture/);
const work = await mkdtemp(join(fixture.directory, 'background-acceptance-'));
const profile = `import-${work.split('-').at(-1).toLowerCase()}`;
async function run(command, args, env = {}) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
  const status = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  return { status, stdout, stderr };
}
const cli = (args, observer = false) => run(fixture.cli,
  ['--profile', observer ? 'observer' : profile, '--host', fixture.host, '--json', ...args],
  { TC_HOME: observer ? fixture.observer.tcHome : fixture.tcHome });
async function success(args, observer = false) {
  const r = await cli(args, observer); assert.equal(r.status, 0, r.stderr || r.stdout); return JSON.parse(r.stdout);
}
const prefix = `${profile}/records/`;
const contractKey = `${profile}/knowledge/import.json`;
const intentionKey = `${profile}/intentions/import.json`;
const sourceId = 'synthetic-import-feed';
const contract = { format: 'tinycloud-import-feed/v1', sourceId, recordsPrefix: prefix, intentionKey };
await success(['kv', 'put', contractKey, JSON.stringify(contract), '--space', fixture.appSpace], true);
await success(['kv', 'put', intentionKey, JSON.stringify({ id: 'import-intention', status: 'active' }), '--space', fixture.appSpace], true);
await success(['init', '--name', profile, '--key-only', '--host', fixture.host]);
const manifest = { manifest_version: 1, app_id: 'synthetic.background', space: fixture.appSpace, defaults: false, includePublicSpace: false, permissions: [
  { service: 'tinycloud.kv', path: prefix, actions: ['get', 'put'], skipPrefix: true },
  ...[contractKey, intentionKey].map(path => ({ service: 'tinycloud.kv', path, actions: ['get'], skipPrefix: true })),
  { service: 'tinycloud.capabilities', path: '', actions: ['read'], skipPrefix: true },
] };
await writeFile(join(work, 'manifest.json'), JSON.stringify(manifest));
await success(['auth', 'login', '--method', 'openkey', '--manifest', join(work, 'manifest.json'), '--owner', fixture.expectedOwnerDid, '--expiry', '6h', '--no-popup']);
const config = { format: 'tinycloud-import-job/v1', cliCommand: [fixture.cli], tcHome: fixture.tcHome, profile,
  host: fixture.host, owner: fixture.expectedOwnerDid, space: fixture.appSpace, sourceId, recordsPrefix: prefix, contractKey, intentionKey,
  sourceDirectory: join(work, 'feed'), stateDirectory: join(work, 'state'), guardDirectory: join(work, 'guards'), pollMs: 100, backlog: 'drain-on-resume' };
await mkdir(config.sourceDirectory, { recursive: true });
const configPath = join(work, 'job.json'); await writeFile(configPath, JSON.stringify(config));
async function command(name) {
  const result = await run(process.execPath, [runner, name, configPath]);
  assert.equal(result.status, 0, result.stderr || result.stdout); return JSON.parse(result.stdout);
}
const event = eventId => ({ version: 1, sourceId, eventId, itemId: '1', kind: 'create', occurrence_date: '2026-09-30',
  timezone: 'Europe/Lisbon', values: { amount_minor: 650, currency: 'EUR' }, source_message: 'Synthetic imported expense' });
const key = eventId => `${prefix}${digest([sourceId, eventId, '1'])}.json`;
async function emit(filename, value) {
  const temporary = join(config.sourceDirectory, `${filename}.tmp`);
  await writeFile(temporary, JSON.stringify(value)); await rename(temporary, join(config.sourceDirectory, `${filename}.json`));
}
async function observe(eventId) {
  const result = await cli(['kv', 'get', key(eventId), '--space', fixture.appSpace], true);
  if (result.status !== 0) { assert.match(result.stdout + result.stderr, /NOT_FOUND/); return null; }
  const envelope = JSON.parse(result.stdout); return typeof envelope.data === 'string' ? JSON.parse(envelope.data) : envelope.data;
}
async function until(fn) {
  const end = Date.now() + 20000;
  while (Date.now() < end) { const result = await fn(); if (result) return result; await new Promise(r => setTimeout(r, 150)); }
  throw Error('Independent observer deadline');
}
const checks = [];
try {
  // The interactive submitter exits before an independent producer emits anything.
  await command('start');
  checks.push('start returned and its process exited before producer emitted an event');
  await emit('01-first', event('purchase-1'));
  const first = await until(() => observe('purchase-1'));
  assert.equal(first.values.amount_minor, 650);
  checks.push('independent observer read a real TinyCloud record while no interactive client was open');
  await emit('02-replay', event('purchase-1'));
  await emit('03-distinct-identical', event('purchase-2'));
  await until(() => observe('purchase-2'));
  assert.equal((await observe('purchase-1')).revision, 1);
  checks.push('source replay reconciled and distinct identical source event created a second record');
  await command('stop');
  await emit('04-while-stopped', event('purchase-3'));
  await new Promise(r => setTimeout(r, 350)); assert.equal(await observe('purchase-3'), null);
  checks.push('stop returned after in-flight work drained; subsequent source event did not write');
  await command('resume'); await until(() => observe('purchase-3'));
  checks.push('resume drained declared stopped backlog');
  const correction = { ...event('correction-1'), kind: 'correct', target: { eventId: 'purchase-1', itemId: '1' }, expectedRevision: 1,
    values: { amount_minor: 700, currency: 'EUR' } };
  await emit('05-correction', correction);
  await until(async () => (await observe('purchase-1'))?.revision === 2);
  await command('stop'); await command('resume');
  await emit('06-replay-after-correction', event('purchase-1'));
  await emit('07-replayed-correction', correction);
  await until(async () => Object.keys((await command('status')).receipts).length === 7);
  const corrected = await observe('purchase-1');
  assert.equal(corrected.revision, 2); assert.equal(corrected.values.amount_minor, 700); assert.equal(corrected.history.length, 2);
  assert.equal(corrected.captured_at, first.captured_at);
  checks.push('fresh worker reconciled original event and correction without reverting corrected data/history');
  await writeFile(fixture.interruptControl, JSON.stringify({ profile, contains: ['kv', 'put', key('purchase-4')] }));
  await emit('08-lost-receipt', event('purchase-4'));
  await until(() => observe('purchase-4'));
  await until(async () => Object.keys((await command('status')).receipts).length === 8);
  assert.equal((await observe('purchase-4')).revision, 1);
  checks.push('lost CLI write receipt retried by original source identity with one stored record');
  const denied = await cli(['kv', 'put', fixture.siblingKey, '{}', '--space', fixture.appSpace]);
  assert.notEqual(denied.status, 0); assert.match(denied.stdout + denied.stderr, /AUTH_UNAUTHORIZED/);
  checks.push('ordinary import credential denied sibling mutation');
  const guidanceDenied = await cli(['kv', 'put', contractKey, '{}', '--space', fixture.appSpace]);
  assert.notEqual(guidanceDenied.status, 0); assert.match(guidanceDenied.stdout + guidanceDenied.stderr, /AUTH_UNAUTHORIZED/);
  checks.push('ordinary import credential denied protected guidance mutation');
  const listed = await success(['kv', 'list', '--prefix', prefix, '--space', fixture.appSpace], true);
  assert.equal(listed.count, 4);
  assert.deepEqual(listed.keys.sort(), [1, 2, 3, 4].map(n => key(`purchase-${n}`)).sort());
  checks.push('independent observer listed exactly the four expected records and no duplicates');
  await command('stop');
  console.log(JSON.stringify({ classification: 'real independent local worker + CLI 0.10.0 + disposable TinyCloud node; synthetic feed and scoped synthetic consent',
    sourceChoicePending: true, checks, config, finalStatus: await command('status'), recordCount: listed.count }, null, 2));
} finally { await command('stop'); }
