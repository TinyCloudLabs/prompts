#!/usr/bin/env node
// Standalone entry: fetch a pinned delivery, check it, then run its installer.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';

const version = '0.2.0-lean-auth.1';
const name = `tinycloud-opencode-${version}`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw Object.assign(new Error(message), { code: 'RELEASE_INTEGRITY_FAILED' }); };
let staging;
try {
  const { values } = parseArgs({ options: { 'delivery-url': { type: 'string' }, delivery: { type: 'string' }, activate: { type: 'boolean', default: false } } });
  if (Boolean(values['delivery-url']) === Boolean(values.delivery)) throw new Error('Supply exactly one --delivery-url <immutable HTTPS URL> or --delivery <local delivery.json>.');
  const remote = values['delivery-url'] ? new URL(values['delivery-url']) : null;
  if (remote && (remote.protocol !== 'https:' || remote.username || remote.password || remote.hash || remote.search)) fail('Delivery must be an immutable HTTPS URL without credentials, query or fragment.');
  async function download(url) {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Release download failed (${response.status}); publication may be incomplete.`);
    return Buffer.from(await response.arrayBuffer());
  }
  const deliveryPath = values.delivery ? resolve(values.delivery) : null;
  const delivery = JSON.parse(remote ? await download(remote) : await readFile(deliveryPath));
  if (delivery.schemaVersion !== 1 || delivery.version !== version || delivery.artifact?.filename !== `${name}.tar.gz` || !/^[a-f0-9]{64}$/.test(delivery.artifact.sha256 ?? '') || !/^[a-f0-9]{64}$/.test(delivery.releaseManifestSha256 ?? '')) fail('Delivery does not identify the supported release and complete artifact hashes.');
  const archiveBytes = remote ? await download(new URL(delivery.artifact.filename, remote)) : await readFile(join(dirname(deliveryPath), delivery.artifact.filename));
  if (sha256(archiveBytes) !== delivery.artifact.sha256) fail('Downloaded archive checksum does not match the pinned delivery.');
  const dataHome = process.env.XDG_DATA_HOME || (process.env.HOME && join(process.env.HOME, '.local/share'));
  if (!dataHome || !isAbsolute(dataHome)) throw new Error('An absolute HOME or XDG_DATA_HOME is required.');
  const releases = join(dataHome, 'tinycloud/releases');
  await mkdir(releases, { recursive: true, mode: 0o700 });
  staging = await mkdtemp(join(releases, '.installing-'));
  const archive = join(staging, delivery.artifact.filename);
  await writeFile(archive, archiveBytes, { mode: 0o600, flag: 'wx' });
  const tar = args => {
    const result = spawnSync('tar', args, { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    if (result.status !== 0) fail('Release archive could not be inspected or extracted.');
    return result.stdout;
  };
  const inside = path => path === name || path.startsWith(name + '/');
  for (const path of tar(['-tzf', archive]).trim().split('\n')) {
    if (!inside(path) || !inside(posix.normalize(path)) || path.split('/').includes('..')) fail('Release archive contains a path outside its installation.');
  }
  // Verify link destinations before extraction. Only regular files, directories
  // and relative in-tree symbolic links occur in the packaged npm installation.
  for (const line of tar(['-tvzf', archive]).trim().split('\n')) {
    if (line.startsWith('-') || line.startsWith('d')) continue;
    const link = line.startsWith('l') && line.match(/ (\S+) -> (\S+)$/);
    if (!link || posix.isAbsolute(link[2]) || !inside(posix.normalize(posix.join(posix.dirname(link[1]), link[2])))) fail('Release archive contains an unsupported or escaping link.');
  }
  tar(['-xzf', archive, '--no-same-owner', '--no-same-permissions', '-C', staging]);
  const extracted = join(staging, name);
  if (sha256(await readFile(join(extracted, 'release-manifest.json'))) !== delivery.releaseManifestSha256) fail('Release manifest checksum does not match the pinned delivery.');
  const { verifyRelease } = await import(pathToFileURL(join(extracted, 'lib/release.mjs')));
  const checked = await verifyRelease({ root: extracted, nodeExecutable: process.execPath });
  const installed = join(releases, `${name}-${delivery.releaseManifestSha256.slice(0, 12)}`);
  try { await rename(extracted, installed); }
  catch (error) {
    if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
    const existing = await verifyRelease({ root: installed, nodeExecutable: checked.nodePath });
    if (existing.manifestSha256 !== checked.manifestSha256) fail('An existing version directory differs from the pinned release.');
  }
  // Native activation cancels this process; remove staging before that signal.
  await rm(staging, { recursive: true, force: true });
  staging = undefined;
  // Inherit native stdout so --activate can bind its marker to this exact tool.
  const result = spawnSync(checked.nodePath, [join(installed, 'scripts/install-opencode.mjs'), ...(values.activate ? ['--activate'] : [])], { env: process.env, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: { code: error.code ?? 'RELEASE_INSTALL_FAILED', message: error.message } }));
  process.exitCode = 1;
} finally {
  if (staging) await rm(staging, { recursive: true, force: true });
}
