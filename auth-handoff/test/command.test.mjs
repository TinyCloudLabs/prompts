import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runTc } from '../lib/handoff.mjs';
test('command runner preserves SDK unauthorized codes without exposing subprocess details', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'tc-command-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = join(dir, 'tc');
  await writeFile(executable, `#!${process.execPath}\nconsole.log(JSON.stringify({error:{code:'AUTH_UNAUTHORIZED',message:'PRIVATE'}}));process.exitCode=1;`, { mode: 0o700 });
  await assert.rejects(runTc(['account', 'apps', 'list'], { executable, env: {} }), error => { assert.equal(error.code, 'AUTH_UNAUTHORIZED'); assert.doesNotMatch(error.message, /PRIVATE/); return true; });
});
test('CLI executes with the bound Node even when the entrypoint has no shebang', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'tc-command-node-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = join(dir, 'tc'); await writeFile(executable, 'console.log(JSON.stringify({ok:true}));', { mode: 0o600 });
  assert.equal(JSON.parse(await runTc(['context'], { executable, nodePath: process.execPath, env: { PATH: '/missing' } })).ok, true);
});
test('setup command parser failure reports safe phase and option instead of sign-in rejection', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'tc-command-error-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = join(dir, 'tc');
  await writeFile(executable, `#!${process.execPath}\nconsole.error("error: unknown option '--manifest'");console.error('PRIVATE');process.exitCode=1;`, { mode: 0o700 });
  await assert.rejects(runTc(['auth', 'caps', '--manifest', '/scope'], { executable, env: {} }), error => { assert.equal(error.code, 'CLI_ARGUMENT_INVALID'); assert.equal(error.phase, 'command'); assert.equal(error.cliPath, executable); assert.match(error.diagnostic, /--manifest/); assert.doesNotMatch(error.message, /PRIVATE/); return true; });
});
