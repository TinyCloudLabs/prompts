import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, readlink, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const releaseVersion = '0.2.0-lean-auth.1';
export const supportedCliVersion = '0.10.1-lean-auth.1';
export const bundledCli = 'runtime/node_modules/@tinycloud/cli/bin/tc';
export const installationRoot = () => fileURLToPath(new URL('../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, message, detail = {}) => { throw Object.assign(new Error(message), { code, ...detail }); };
const inside = (root, path) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)); };

/** Inventory every installed file, including dependency code, locks and links. */
export async function releaseInventory(root) {
  root = await realpath(root);
  const files = Object.create(null);
  async function walk(path = '') {
    const entries = await readdir(join(root, path), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const name = path ? `${path}/${entry.name}` : entry.name;
      if (name === 'release-manifest.json') continue;
      const absolute = join(root, name);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) files[name] = { sha256: sha256(await readFile(absolute)) };
      else if (entry.isSymbolicLink()) {
        const target = await readlink(absolute);
        if (isAbsolute(target) || !inside(root, resolve(dirname(absolute), target)) || !inside(root, await realpath(absolute))) {
          fail('RELEASE_INTEGRITY_FAILED', `Release link escapes its installation: ${name}.`, { phase: 'release-integrity' });
        }
        files[name] = { symlink: target };
      } else fail('RELEASE_INTEGRITY_FAILED', `Unsupported release entry: ${name}.`, { phase: 'release-integrity' });
    }
  }
  await walk();
  return files;
}

/** Check the release before profile mutation, browser launch or loader changes. */
export async function verifyRelease({ root = installationRoot(), cliOverride, nodeExecutable = 'node', env = process.env } = {}) {
  let manifest, bytes, actual;
  try {
    root = await realpath(root);
    const path = join(root, 'release-manifest.json');
    if (!(await lstat(path)).isFile()) throw new Error('manifest is not a regular file');
    bytes = await readFile(path);
    manifest = JSON.parse(bytes);
    if (manifest.schemaVersion !== 1 || manifest.version !== releaseVersion || manifest.cli?.version !== supportedCliVersion || manifest.cli.path !== bundledCli || !manifest.files || Array.isArray(manifest.files)) throw new Error('unsupported release contract');
    actual = await releaseInventory(root);
    const names = Object.keys(actual).sort();
    if (JSON.stringify(names) !== JSON.stringify(Object.keys(manifest.files).sort())) throw new Error('package file list changed');
    for (const name of names) {
      const entry = manifest.files[name];
      if (actual[name].sha256 ? entry?.sha256 !== actual[name].sha256 || Object.keys(entry).length !== 1 : entry?.symlink !== actual[name].symlink || Object.keys(entry).length !== 1) throw new Error(`package entry changed: ${name}`);
    }
    for (const name of ['package.json', bundledCli, 'runtime/package.json', 'runtime/package-lock.json', 'runtime/node_modules/@tinycloud/cli/package.json', 'lib/opencode-plugin.mjs', 'lib/release.mjs', 'scripts/install-opencode.mjs', 'quickstart/tinycloud-opencode-read.md', 'templates/registry-read.json', 'references/cli.md', 'runtime/node_modules/@opencode-ai/plugin/package.json', 'runtime/node_modules/@opencode-ai/plugin/dist/index.js']) {
      if (!actual[name]?.sha256) throw new Error(`missing release file: ${name}`);
    }
    const pkg = JSON.parse(await readFile(join(root, 'package.json')));
    const cliPackage = JSON.parse(await readFile(join(root, 'runtime/node_modules/@tinycloud/cli/package.json')));
    const pluginPackage = JSON.parse(await readFile(join(root, 'runtime/node_modules/@opencode-ai/plugin/package.json')));
    if (pluginPackage.version !== '1.18.31') throw new Error('unsupported OpenCode plugin dependency');
    if (pkg.version !== releaseVersion || cliPackage.version !== supportedCliVersion) throw new Error('package version changed');
  } catch (error) {
    if (error.code === 'RELEASE_INTEGRITY_FAILED') throw error;
    fail('RELEASE_INTEGRITY_FAILED', `TinyCloud release at ${root} failed integrity validation: ${error.code === 'ENOENT' ? 'required release file missing' : error.message}. Reinstall the complete pinned release.`, { phase: 'release-integrity' });
  }
  const cliPath = join(root, bundledCli);
  if (cliOverride !== undefined) {
    const override = isAbsolute(cliOverride) ? await realpath(cliOverride).catch(() => null) : null;
    if (override !== await realpath(cliPath)) fail('CLI_INCOMPATIBLE', `Explicit CLI override ${cliOverride} is outside the verified release. Use bundled ${cliPath} (${supportedCliVersion}).`, { phase: 'cli-selection', cliPath, cliVersion: supportedCliVersion });
  }
  const nodeProbe = spawnSync(nodeExecutable, ['--input-type=module', '--eval', "console.log(JSON.stringify({path:process.execPath,version:process.versions.node,isNode:process.release.name==='node'&&!process.versions.bun}))"], { env, encoding: 'utf8', timeout: 10000, maxBuffer: 4096 });
  let node;
  try { node = JSON.parse(nodeProbe.stdout); } catch { /* Only expose validated runtime metadata. */ }
  if (nodeProbe.status !== 0 || !node?.isNode || !isAbsolute(node.path ?? '') || !/^\d+\.\d+\.\d+$/.test(node.version ?? '')) fail('CLI_INCOMPATIBLE', 'A supported Node executable is required; launch the release installer using Node.', { phase: 'node-version', cliPath, cliVersion: supportedCliVersion });
  const [major, minor] = node.version.split('.').map(Number);
  if (!(major > 22 || (major === 22 && minor >= 20))) fail('CLI_INCOMPATIBLE', 'This release requires Node 22.20 or newer.', { phase: 'node-version', cliPath, cliVersion: supportedCliVersion });
  const result = spawnSync(node.path, [cliPath, '--version'], { env, encoding: 'utf8', timeout: 10000, maxBuffer: 16384 });
  const output = result.stdout?.trim();
  // Only a plain version string is safe to surface from arbitrary startup output.
  const observed = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(output ?? '') ? output : 'unavailable';
  if (result.status !== 0 || output !== supportedCliVersion) fail('CLI_INCOMPATIBLE', `Bundled CLI ${cliPath} reported ${observed}; expected ${supportedCliVersion}. Reinstall the complete release.`, { phase: 'cli-version', cliPath, cliVersion: observed });
  return { root, version: releaseVersion, nodePath: node.path, nodeVersion: node.version, cliPath, cliVersion: supportedCliVersion, manifestSha256: sha256(bytes),
    guidePath: join(root, 'quickstart/tinycloud-opencode-read.md'), registryTemplatePath: join(root, 'templates/registry-read.json'), referencePath: join(root, 'references/cli.md') };
}
