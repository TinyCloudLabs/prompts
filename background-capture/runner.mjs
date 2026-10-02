#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rename, lstat, open, rm } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { capture, digest } from './capture.mjs';
import { withWriterGuard } from './writer-guard.mjs';
import { verifyPermissions } from './permissions.mjs';
import { listFeed } from './feed.mjs';
import { bindEvent } from './event-binding.mjs';

process.umask(0o077);
const [command, configArg, ...interactive] = process.argv.slice(2);
assert.ok(['start', 'stop', 'resume', 'status', 'run', 'guard'].includes(command) && configArg,
  'Usage: node runner.mjs start|stop|resume|status|run|guard PRIVATE_JOB.json [-- command args...]');
const configPath = resolve(configArg);
const config = JSON.parse(await readFile(configPath, 'utf8'));
assert.equal(config.format, 'tinycloud-import-job/v1');
assert.equal(config.backlog, 'drain-on-resume', 'Backlog policy must be explicitly chosen');
for (const key of ['tcHome', 'sourceDirectory', 'stateDirectory', 'guardDirectory']) assert.ok(isAbsolute(config[key]), `${key} must be absolute`);
for (const key of ['sourceId', 'profile', 'owner', 'space', 'recordsPrefix', 'contractKey', 'intentionKey']) assert.ok(typeof config[key] === 'string' && config[key], `${key} required`);
assert.ok(config.recordsPrefix.endsWith('/') && !config.contractKey.startsWith(config.recordsPrefix) && !config.intentionKey.startsWith(config.recordsPrefix));
assert.ok(Array.isArray(config.cliCommand) && config.cliCommand.length > 0 && isAbsolute(config.cliCommand[0]), 'Exact absolute CLI command required');
assert.ok(Number.isInteger(config.pollMs) && config.pollMs >= 100 && config.pollMs <= 3600000, 'pollMs must be between 100 and 3600000');
assert.equal(new URL(config.host).origin, config.host, 'Use canonical host origin');
await mkdir(config.stateDirectory, { recursive: true, mode: 0o700 });
const statePath = join(config.stateDirectory, 'state.json');
const runLock = join(config.stateDirectory, 'run.lock');
const guard = { directory: config.guardDirectory, owner: config.owner, host: config.host, space: config.space };
const binding = digest(config);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function state() {
  let value;
  try { value = JSON.parse(await readFile(statePath, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; value = { binding, desired: 'stopped', receipts: {}, attempts: 0 }; }
  assert.equal(value.binding, binding, 'Job configuration changed; restore its original binding before resuming');
  return value;
}
async function save(value) {
  const temporary = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temporary, statePath);
}
async function cli(args) {
  const child = spawn(config.cliCommand[0], [...config.cliCommand.slice(1), '--profile', config.profile, '--host', config.host, '--json', ...args],
    { env: { ...process.env, TC_HOME: config.tcHome }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
  const timer = setTimeout(() => child.kill('SIGTERM'), 20000);
  let code;
  try { code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }); }
  finally { clearTimeout(timer); }
  let value;
  try { value = JSON.parse(stdout.trim() || stderr.trim()); } catch { throw Error(`CLI returned no structured result (exit ${code}): ${stderr.trim().slice(0, 1000)}`); }
  if (code !== 0 || value.error) {
    const error = Error(`CLI ${value.error?.code ?? code}: ${value.error?.message ?? 'operation failed'}`);
    error.code = value.error?.code; throw error;
  }
  return value;
}
const store = {
  async get(key) {
    let result;
    try { result = await cli(['kv', 'get', '--space', config.space, '--', key]); }
    catch (e) { if (e.code === 'KV_NOT_FOUND' || e.code === 'NOT_FOUND') return null; throw e; }
    return typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
  },
  async put(key, value) { await cli(['kv', 'put', '--space', config.space, '--', key, JSON.stringify(value)]); },
};
const normalizeSpace = value => value.replace(/^(tinycloud:pkh:eip155:\d+:)(0x[\da-fA-F]{40})(:)/, (_, a, address, b) => a + address.toLowerCase() + b);
async function ready() {
  verifyPermissions(await cli(['status']), config);
  const context = await cli(['context', '--space', config.space]);
  assert.equal(context.ownerDid, config.owner, 'CLI owner differs from approved job');
  assert.equal(context.host, config.host, 'CLI host differs from approved job');
  assert.equal(normalizeSpace(context.spaceId), normalizeSpace(config.space), 'CLI space differs from approved job');
  assert.deepEqual(await store.get(config.contractKey), {
    format: 'tinycloud-import-feed/v1', sourceId: config.sourceId, recordsPrefix: config.recordsPrefix, intentionKey: config.intentionKey,
  }, 'Stored app import contract differs from approved job');
  assert.equal((await store.get(config.intentionKey))?.status, 'active', 'Remote intention is not active; capture remains pending');
}
async function status() {
  const result = await state();
  let holder;
  try { holder = JSON.parse(await readFile(join(runLock, 'holder.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  let running = false;
  if (holder?.pid) { try { process.kill(holder.pid, 0); running = true; } catch (e) { if (e.code !== 'ESRCH') throw e; } }
  const phase = result.desired === 'stopped' ? (running ? 'stopping' : 'stopped') : !running ? 'interrupted' : result.lastError ? 'blocked' : 'running';
  return { ...result, phase, running, workerPid: holder?.pid ?? null, staleRunLock: !!holder && !running, backlog: config.backlog };
}
async function worker() {
  await mkdir(runLock, { mode: 0o700 }); // no stealing even after an unclean crash
  await writeFile(join(runLock, 'holder.json'), JSON.stringify({ pid: process.pid, configPath }), { mode: 0o600 });
  let shutdown = false;
  process.on('SIGTERM', () => { shutdown = true; }); process.on('SIGINT', () => { shutdown = true; });
  try {
    while (!shutdown) {
      let keepRunning;
      await withWriterGuard(guard, async () => {
        const current = await state();
        keepRunning = current.desired === 'running';
        if (!keepRunning) return;
        current.heartbeat = new Date().toISOString();
        try {
          await ready();
          const names = await listFeed(config.sourceDirectory, current.pending);
          // One event per guard acquisition lets interactive writers and stop interleave.
          for (const name of names) {
            const path = join(config.sourceDirectory, name);
            const info = await lstat(path);
            assert.ok(info.isFile() && info.size <= 1024 * 1024, 'Feed events must be regular JSON files at most 1 MiB');
            const event = JSON.parse(await readFile(path, 'utf8'));
            const fingerprint = digest(event);
            if (current.receipts[name]) {
              assert.equal(current.receipts[name].fingerprint, fingerprint, `Consumed feed file changed: ${name}`);
              continue;
            }
            current.attempts++;
            bindEvent(current.bindings ??= {}, event);
            if (current.pending) {
              assert.equal(current.pending.name, name, 'An earlier pending event must reconcile first; preserve feed ordering');
              assert.equal(current.pending.fingerprint, fingerprint, 'Pending event payload changed');
            } else current.pending = { name, fingerprint, capturedAt: new Date().toISOString() };
            await save(current); // persist first dispatch clock before any remote mutation
            const result = await capture(store, config, event, { capturedAt: current.pending.capturedAt });
            current.receipts[name] = { fingerprint, key: result.key, outcome: result.outcome, at: new Date().toISOString() };
            current.pending = null;
            break;
          }
          current.lastError = null;
          current.lastSuccess = new Date().toISOString();
        } catch (e) {
          // Failed reads are never absence. No receipt is saved for uncertain writes.
          current.lastError = { message: e.message, at: new Date().toISOString() };
        }
        await save(current);
      });
      if (!keepRunning) break;
      const nextPoll = Date.now() + config.pollMs;
      while (!shutdown && Date.now() < nextPoll) {
        if ((await state()).desired !== 'running') break;
        await sleep(Math.min(250, nextPoll - Date.now()));
      }
    }
  } finally { await rm(runLock, { recursive: true }); }
}

if (command === 'run') await worker();
else if (command === 'status') console.log(JSON.stringify(await status()));
else if (command === 'guard') {
  assert.equal(interactive.shift(), '--'); assert.ok(interactive.length, 'Provide one whole read/reconcile/write/readback command');
  await withWriterGuard(guard, async () => {
    const child = spawn(interactive[0], interactive.slice(1), { stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    process.exitCode = code ?? 1;
  });
} else {
  await withWriterGuard(guard, async () => {
    const current = await state();
    if (command !== 'stop') await ready();
    current.desired = command === 'stop' ? 'stopped' : 'running';
    await save(current);
  });
  if (command !== 'stop') {
    const current = await status();
    assert.ok(!current.staleRunLock, 'Stale run lock requires verified operator recovery; do not steal a live lock');
    if (!current.running) {
      const log = await open(join(config.stateDirectory, 'worker.log'), 'a', 0o600);
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'run', configPath], { detached: true, stdio: ['ignore', log.fd, log.fd] });
      child.unref(); await log.close();
    }
  }
  const deadline = Date.now() + 35000;
  while (true) {
    const current = await status();
    if (command === 'stop' ? !current.running : current.running && current.heartbeat) { console.log(JSON.stringify(current)); break; }
    assert.ok(Date.now() < deadline, 'Worker lifecycle deadline; inspect status and private log');
    await sleep(50);
  }
}
