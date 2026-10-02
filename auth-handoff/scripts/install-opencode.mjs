#!/usr/bin/env node
// Adapted from TinyCloudLabs/tinychat f67bf08417c8954fc0bab4379e99db13977f4d96.
import { mkdir, readFile, writeFile, rename, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { prepareActivation, writeActivation } from '../lib/opencode-activation.mjs';
import { verifyRelease } from '../lib/release.mjs';

const marker = '// TinyCloud sign-in adapter; managed by install-opencode.mjs\n';
try {
  const { values } = parseArgs({ options: { activate: { type: 'boolean', default: false } } });
  const release = await verifyRelease({ cliOverride: process.env.TINYCLOUD_AUTH_CLI, nodeExecutable: process.execPath });
  if (!process.env.HOME) throw new Error('HOME is required.');
  if (values.activate && process.env.OPENCODE !== '1') throw new Error('--activate must run inside the supported OpenCode conversation.');
  const checked = spawnSync('opencode', ['--version'], { encoding: 'utf8' });
  if (checked.status !== 0 || checked.stdout.trim() !== '1.18.31') throw new Error('This adapter requires OpenCode 1.18.31.');
  const plugin = new URL('../lib/opencode-plugin.mjs', import.meta.url);
  const schemaPlugin = new URL('../runtime/node_modules/@opencode-ai/plugin/dist/index.js', import.meta.url);
  // A fresh process detects a broken dependency tree without poisoning the host loader.
  const probe = `const m=await import(${JSON.stringify(schemaPlugin.href)}); if(typeof m.tool?.schema?.string!=='function')process.exit(1); await import(${JSON.stringify(plugin.href)});`;
  const ready = spawnSync(release.nodePath, ['--input-type=module', '--eval', probe], { encoding: 'utf8', timeout: 10000 });
  if (ready.status !== 0) throw Object.assign(new Error('Bundled OpenCode plugin dependencies could not load; reinstall the complete release.'), { phase: 'plugin-import', cliPath: release.cliPath, cliVersion: release.cliVersion });
  const bytes = await readFile(plugin);
  const pack = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const directory = join(process.env.XDG_CONFIG_HOME || join(process.env.HOME, '.config'), 'opencode/plugins');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'tinycloud-auth.js');
  const existing = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing && (!existing.isFile() || !(await readFile(path, 'utf8')).startsWith(marker))) throw new Error('An unmanaged tinycloud-auth.js already exists; keep it intact and resolve the name conflict.');
  const alreadyLoaded = process.env.TINYCLOUD_AUTH_OPENCODE_PLUGIN === pack.version;
  // Complete validation and activation preparation before replacing a working loader.
  let activation;
  if (values.activate && !alreadyLoaded) {
    activation = await prepareActivation({ integrationVersion: pack.version });
  }
  // Export only the initializer: OpenCode invokes every exported function as a plugin.
  const content = marker + `import { tool } from ${JSON.stringify(schemaPlugin.href)};\nimport TinyCloud from ${JSON.stringify(plugin.href)};\nexport default input => TinyCloud(input, { schema: tool.schema, nodeExecutable: ${JSON.stringify(release.nodePath)} });\n`;
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, { mode: 0o600, flag: 'wx' });
  if (activation) await writeActivation(activation);
  await rename(temporary, path);
  console.log(JSON.stringify({ ok: true, version: pack.version, opencodeVersion: '1.18.31', pluginPath: path, pluginSha256: createHash('sha256').update(bytes).digest('hex'), releaseManifestSha256: release.manifestSha256, cliPath: release.cliPath, cliVersion: release.cliVersion, nodePath: release.nodePath, nodeVersion: release.nodeVersion, restartRequired: !values.activate,
    ...(values.activate ? { activation: activation ? 'reloading' : 'already-loaded' } : {}) }));
  if (activation) {
    process.kill(activation.hostPID, 'SIGUSR2');
    // Native disposal cancels this tool. Keep it running until that happens so
    // the old model loop cannot race the new plugin's continuation.
    await new Promise(resolve => setTimeout(resolve, 15000));
    throw new Error('OpenCode did not complete activation; preserve the activation receipt for diagnosis.');
  }
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: { code: error.code?.startsWith('OPENCODE_ACTIVATION_') || ['RELEASE_INTEGRITY_FAILED', 'CLI_INCOMPATIBLE'].includes(error.code) ? error.code : 'OPENCODE_INSTALL_FAILED', message: error.message, ...(error.phase ? { phase: error.phase } : {}), ...(error.cliPath ? { cliPath: error.cliPath, cliVersion: error.cliVersion } : {}) } }));
  process.exitCode = 1;
}
