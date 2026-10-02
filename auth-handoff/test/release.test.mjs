import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const version = '0.2.0-lean-auth.1';
const cliVersion = '0.10.1-lean-auth.1';
const cli = 'runtime/node_modules/@tinycloud/cli/bin/tc';
const source = new URL('../', import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');
async function verifier() {
  const module = await import('../lib/release.mjs').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
  assert.equal(typeof module.verifyRelease, 'function', 'release integrity validation must exist');
  return module.verifyRelease;
}
async function seal(root) {
  const files = {};
  async function walk(relative = '') {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (path === 'release-manifest.json') continue;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isSymbolicLink()) files[path] = { symlink: await readlink(join(root, path)) };
      else files[path] = { sha256: sha(await readFile(join(root, path))) };
    }
  }
  await walk();
  await writeFile(join(root, 'release-manifest.json'), JSON.stringify({ schemaVersion: 1, version, cli: { path: cli, version: cliVersion }, files }, null, 2));
}
async function fixture(t, { reportedVersion = cliVersion } = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'tc-release-')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'release');
  await mkdir(root);
  for (const directory of ['lib', 'scripts']) await cp(new URL(directory, source), join(root, directory), { recursive: true });
  const files = {
    'package.json': JSON.stringify({ name: '@tinycloud/auth-handoff', type: 'module', version }),
    [cli]: `#!/usr/bin/env node\nconsole.log(${JSON.stringify(reportedVersion)});\n`,
    'runtime/node_modules/@tinycloud/cli/package.json': JSON.stringify({ name: '@tinycloud/cli', version: cliVersion }),
    'runtime/node_modules/@opencode-ai/plugin/package.json': JSON.stringify({ name: '@opencode-ai/plugin', type: 'module', version: '1.18.31' }),
    'runtime/node_modules/@opencode-ai/plugin/dist/index.js': 'export const tool = { schema: { string: () => ({}) } };\n',
    'runtime/node_modules/example/index.js': 'export default 42;\n',
    'runtime/package.json': '{"private":true}',
    'runtime/package-lock.json': '{"lockfileVersion":3}',
    'quickstart/tinycloud-opencode-read.md': 'Read the original question.\n',
    'references/cli.md': 'CLI reference\n',
    'templates/registry-read.json': '{"defaults":false}',
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content, { mode: 0o700 });
  }
  await mkdir(join(root, 'runtime/node_modules/.bin'));
  await symlink('../@tinycloud/cli/bin/tc', join(root, 'runtime/node_modules/.bin/tc'));
  await seal(root);
  const bin = join(base, 'old-bin');
  await mkdir(bin);
  await writeFile(join(bin, 'tc'), '#!/bin/sh\necho 0.10.0\n', { mode: 0o700 });
  await writeFile(join(bin, 'opencode'), '#!/bin/sh\necho 1.18.31\n', { mode: 0o700 });
  const home = join(base, 'home');
  const loader = join(home, '.config/opencode/plugins/tinycloud-auth.js');
  await mkdir(join(loader, '..'), { recursive: true });
  const priorLoader = '// TinyCloud sign-in adapter; managed by install-opencode.mjs\n// known working release\n';
  await writeFile(loader, priorLoader);
  return { root, base, loader, priorLoader, env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), PATH: `${bin}:${process.env.PATH}` } };
}

test('selects bundled exact CLI even with an older CLI first on PATH', async t => {
  const f = await fixture(t);
  const result = await (await verifier())({ root: f.root, env: f.env });
  assert.equal(result.version, version);
  assert.equal(result.cliPath, join(f.root, cli));
  assert.equal(result.cliVersion, cliVersion);
  assert.equal(result.manifestSha256, sha(await readFile(join(f.root, 'release-manifest.json'))));
});

test('rejects incompatible explicit runtime before invoking it', async t => {
  const f = await fixture(t);
  const override = join(f.base, 'override');
  const marker = join(f.base, 'executed');
  await writeFile(override, `#!/bin/sh\ntouch '${marker}'\necho 0.10.0\n`, { mode: 0o700 });
  await assert.rejects((await verifier())({ root: f.root, cliOverride: override }), { code: 'CLI_INCOMPATIBLE' });
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});

test('rejects changed transitive dependency even when CLI entrypoint is unchanged', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'runtime/node_modules/example/index.js'), 'export default 99;\n');
  await assert.rejects((await verifier())({ root: f.root }), { code: 'RELEASE_INTEGRITY_FAILED' });
});

test('rejects extra unlisted executable code', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'runtime/node_modules/example/injected.js'), 'export default 99;\n');
  await assert.rejects((await verifier())({ root: f.root }), { code: 'RELEASE_INTEGRITY_FAILED' });
});

test('rejects exact-version mismatch with safe path and phase evidence', async t => {
  const f = await fixture(t, { reportedVersion: '0.10.0' });
  await assert.rejects((await verifier())({ root: f.root }), error => error.code === 'CLI_INCOMPATIBLE' && error.phase === 'cli-version' && error.cliPath === join(f.root, cli) && error.cliVersion === '0.10.0');
});

test('rejects manifest symlinks escaping the verified package tree', async t => {
  const f = await fixture(t);
  await symlink('/etc/hosts', join(f.root, 'external'));
  const manifest = JSON.parse(await readFile(join(f.root, 'release-manifest.json')));
  manifest.files.external = { symlink: '/etc/hosts' };
  await writeFile(join(f.root, 'release-manifest.json'), JSON.stringify(manifest));
  await assert.rejects((await verifier())({ root: f.root }), { code: 'RELEASE_INTEGRITY_FAILED' });
});

for (const corrupt of ['dependency', 'version']) test(`installer preserves previous managed loader on ${corrupt} validation failure`, async t => {
  const f = await fixture(t, corrupt === 'version' ? { reportedVersion: '0.10.0' } : {});
  if (corrupt === 'dependency') await writeFile(join(f.root, 'runtime/node_modules/example/index.js'), 'tampered');
  const child = spawnSync(process.execPath, [join(f.root, 'scripts/install-opencode.mjs')], { env: f.env, encoding: 'utf8' });
  assert.equal(child.status, 1, 'an invalid release cannot be installed');
  assert.equal(await readFile(f.loader, 'utf8'), f.priorLoader);
  assert.equal(JSON.parse(child.stdout).ok, false);
});

test('installer switches to fully validated release and reports its exact manifest identity', async t => {
  const f = await fixture(t);
  const child = spawnSync(process.execPath, [join(f.root, 'scripts/install-opencode.mjs')], { env: f.env, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stdout + child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.releaseManifestSha256, sha(await readFile(join(f.root, 'release-manifest.json'))));
  assert.equal(result.cliVersion, cliVersion);
  assert.equal(result.cliPath, join(f.root, cli));
  assert.match(await readFile(f.loader, 'utf8'), /lib\/opencode-plugin.mjs/);
});

test('release builder produces an independently relocatable complete tree and matching artifact receipt', async t => {
  const f = await fixture(t);
  const builder = join(new URL('../scripts', import.meta.url).pathname, 'build-release.mjs');
  const output = join(f.base, 'built');
  const child = spawnSync(process.execPath, [builder, '--runtime', join(f.root, 'runtime'), '--output', output, '--guide', join(f.root, 'quickstart/tinycloud-opencode-read.md')], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stdout + child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.status, 'local-candidate');
  assert.ok(result.bootstrap, 'standalone bootstrap must accompany delivery');
  assert.equal(result.bootstrap.sha256, sha(await readFile(join(output, result.bootstrap.filename))));
  assert.equal(result.version, version);
  assert.equal(result.artifact.sha256, sha(await readFile(result.artifact.path)));
  const installed = join(f.base, 'relocated');
  await mkdir(installed);
  const unpacked = spawnSync('tar', ['-xzf', result.artifact.path, '-C', installed], { encoding: 'utf8' });
  assert.equal(unpacked.status, 0, unpacked.stderr);
  const root = join(installed, `tinycloud-opencode-${version}`);
  assert.equal(await readFile(join(root, 'references/cli.md'), 'utf8'), await readFile(new URL('../references/cli.md', import.meta.url), 'utf8'));
  const verified = await (await verifier())({ root });
  assert.equal(verified.manifestSha256, result.releaseManifestSha256);
  assert.equal(verified.cliVersion, cliVersion);
  assert.equal(result.immutableGuideUrl, null, 'a local build cannot invent a published guide URL');
});


test('managed loader uses bundled OpenCode schema dependency without global config packages', async t => {
  const f = await fixture(t);
  const child = spawnSync(process.execPath, [join(f.root, 'scripts/install-opencode.mjs')], { env: f.env, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stdout + child.stderr);
  const loader = await readFile(f.loader, 'utf8');
  assert.match(loader, /runtime\/node_modules\/@opencode-ai\/plugin\/dist\/index.js/);
  assert.doesNotMatch(loader, /from "@opencode-ai\/plugin"/);
});

test('installer refuses broken bundled plugin imports before replacing prior loader', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'runtime/node_modules/@opencode-ai/plugin/dist/index.js'), "import './missing.js';");
  await seal(f.root);
  const child = spawnSync(process.execPath, [join(f.root, 'scripts/install-opencode.mjs')], { env: f.env, encoding: 'utf8' });
  assert.equal(child.status, 1);
  assert.equal(await readFile(f.loader, 'utf8'), f.priorLoader);
  const error = JSON.parse(child.stdout).error;
  assert.match(error.message, /plugin dependencies/);
  assert.equal(error.phase, 'plugin-import');
  assert.equal(error.cliPath, join(f.root, cli));
  assert.equal(error.cliVersion, cliVersion);
});

test('verifier inside a compiled OpenCode host runs CLI with Node rather than process.execPath', async t => {
  const f = await fixture(t);
  const script = `Object.defineProperty(process, 'execPath', { value: '/not-a-node-runtime/opencode' }); const {verifyRelease}=await import(${JSON.stringify(new URL('../lib/release.mjs', import.meta.url).href)}); console.log(JSON.stringify(await verifyRelease({root:${JSON.stringify(f.root)}})));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stdout + child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.cliVersion, cliVersion);
  assert.match(result.nodeVersion, /^\d+\./);
  assert.ok(result.nodePath.startsWith('/'));
});

for (const corrupt of [false, true]) test(`bootstrap ${corrupt ? 'rejects a changed archive without switching' : 'installs one complete local delivery in one invocation'}`, async t => {
  const f = await fixture(t);
  const output = join(f.base, 'built');
  const built = spawnSync(process.execPath, [new URL('../scripts/build-release.mjs', import.meta.url).pathname, '--runtime', join(f.root, 'runtime'), '--output', output, '--guide', join(f.root, 'quickstart/tinycloud-opencode-read.md'), '--reference', join(f.root, 'references/cli.md')], { encoding: 'utf8' });
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const delivery = JSON.parse(built.stdout);
  if (corrupt) await writeFile(delivery.artifact.path, 'damaged archive');
  const child = spawnSync(process.execPath, [new URL('../scripts/bootstrap-opencode.mjs', import.meta.url).pathname, '--delivery', join(output, 'delivery.json')], { env: { ...f.env, XDG_DATA_HOME: join(f.base, 'data') }, encoding: 'utf8' });
  if (corrupt) {
    assert.equal(child.status, 1);
    assert.equal(JSON.parse(child.stdout).error.code, 'RELEASE_INTEGRITY_FAILED');
    assert.equal(await readFile(f.loader, 'utf8'), f.priorLoader);
  } else {
    assert.equal(child.status, 0, child.stdout + child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.version, version);
    assert.equal(result.releaseManifestSha256, delivery.releaseManifestSha256);
    assert.match(await readFile(f.loader, 'utf8'), /tinycloud\/releases/);
  }
});
