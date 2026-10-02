#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { installationRoot, releaseInventory, releaseVersion, supportedCliVersion, bundledCli, verifyRelease } from '../lib/release.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
let staging;
try {
  const { values } = parseArgs({ options: { runtime: { type: 'string' }, output: { type: 'string' }, guide: { type: 'string' }, reference: { type: 'string' } } });
  if (!values.runtime || !values.output) throw new Error('Usage: node scripts/build-release.mjs --runtime <complete locked npm installation> --output <new output directory> [--guide <file>] [--reference <file>]');
  const source = installationRoot();
  const runtime = resolve(values.runtime);
  const output = resolve(values.output);
  const withinSource = relative(source, output);
  if (!withinSource.startsWith('..') || output === runtime || runtime.startsWith(output + '/')) throw new Error('Output must be outside the source and runtime trees.');
  // A new directory is deliberate: an existing release is never rewritten in place.
  await mkdir(output, { recursive: false, mode: 0o700 });
  staging = await mkdtemp(join(output, '.building-'));
  const name = `tinycloud-opencode-${releaseVersion}`;
  const root = join(staging, name);
  await mkdir(root);
  for (const path of ['lib', 'scripts', 'templates', 'README.md', 'package.json']) await cp(join(source, path), join(root, path), { recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE });
  // Node's COPYFILE_FICLONE falls back to physical copies on this macOS runtime.
  // The native clone avoids duplicating hundreds of MB during staging.
  if (process.platform === 'darwin') {
    const copied = spawnSync('/bin/cp', ['-cR', runtime, join(root, 'runtime')], { encoding: 'utf8', timeout: 120000, maxBuffer: 16384 });
    if (copied.status !== 0) throw new Error('Runtime staging failed; check available disk space.');
  } else await cp(runtime, join(root, 'runtime'), { recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE });
  await mkdir(join(root, 'quickstart'));
  await mkdir(join(root, 'references'));
  await cp(resolve(values.guide ?? join(source, '../quickstart/tinycloud-opencode-read.md')), join(root, 'quickstart/tinycloud-opencode-read.md'));
  await cp(resolve(values.reference ?? join(source, 'references/cli.md')), join(root, 'references/cli.md'));
  const manifest = { schemaVersion: 1, version: releaseVersion, cli: { path: bundledCli, version: supportedCliVersion }, files: await releaseInventory(root) };
  await writeFile(join(root, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const verified = await verifyRelease({ root });
  const artifact = join(staging, `${name}.tar.gz`);
  const packed = spawnSync('tar', ['-czf', artifact, '-C', staging, name], { encoding: 'utf8', maxBuffer: 16384 });
  if (packed.status !== 0) throw new Error('Release archive creation failed.');
  const receipt = { schemaVersion: 1, runtimePlatform: process.platform, runtimeArch: process.arch, nodeVersion: verified.nodeVersion, status: 'local-candidate', version: releaseVersion, cliVersion: supportedCliVersion,
    releaseDirectory: join(output, name), releaseManifestSha256: verified.manifestSha256,
    artifact: { filename: basename(artifact), path: join(output, basename(artifact)), sha256: sha256(await readFile(artifact)) },
    bootstrap: { filename: 'bootstrap-opencode.mjs', sha256: manifest.files['scripts/bootstrap-opencode.mjs'].sha256 },
    guide: { path: 'quickstart/tinycloud-opencode-read.md', sha256: manifest.files['quickstart/tinycloud-opencode-read.md'].sha256 },
    runtimeLockSha256: manifest.files['runtime/package-lock.json'].sha256,
    immutableGuideUrl: null, publicationRequired: true };
  await rename(root, receipt.releaseDirectory);
  await rename(artifact, receipt.artifact.path);
  await cp(join(receipt.releaseDirectory, 'scripts/bootstrap-opencode.mjs'), join(output, receipt.bootstrap.filename));
  await writeFile(join(output, 'delivery.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: { code: error.code ?? 'RELEASE_BUILD_FAILED', message: error.message } }));
  process.exitCode = 1;
} finally {
  if (staging) await rm(staging, { recursive: true, force: true });
}
