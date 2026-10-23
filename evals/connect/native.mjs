import { spawn } from 'node:child_process';
import { mkdir, open, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { appendResult, assert, caseFor, saveNew, rejectSecrets, resolveScenarioInstructions } from './store.mjs';

const PROTECTED_ENV = /^(HOME|USERPROFILE|XDG_.*|TC_.*|CLAUDE_CONFIG_DIR|CODEX_HOME|PI_CODING_AGENT_DIR|OMP_PROFILE|NODE_OPTIONS|BASH_ENV|ENV)$/;

export function builtInAdapter(platform, model) {
  assert(typeof model === 'string' && model.trim(), 'Native capture requires an explicit --model');
  const commands = {
    'claude-code': ['claude', '-p', '--safe-mode', '--no-session-persistence', '--permission-mode', 'dontAsk', '--output-format', 'json', '--model', model, '{prompt}'],
    codex: ['codex', 'exec', '--json', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check', '--sandbox', 'read-only', '--model', model, '{prompt}'],
    omp: ['omp', '--print', '--mode', 'json', '--no-session', '--no-extensions', '--no-skills', '--no-rules', '--no-lsp', '--tools', 'read,web_search', '--model', model, '{prompt}'],
    opencode: ['opencode', 'run', '--pure', '--format', 'json', '--model', model, '{prompt}'],
  };
  assert(commands[platform], 'This platform needs an operator packet or an explicit native adapter JSON');
  return { platform, command: commands[platform], versionCommand: [commands[platform][0], '--version'], passEnv: [], model, surface: 'native noninteractive capture (not TUI certification)' };
}

export async function capture(command, env, cwd, directory, timeoutSeconds) {
  const stdout = await open(join(directory, 'stdout.txt'), 'wx', 0o600);
  const stderr = await open(join(directory, 'stderr.txt'), 'wx', 0o600);
  let child;
  let timer;
  let forced = '';
  let launchError = '';
  const stop = reason => {
    if (!forced) forced = reason;
    if (child?.pid) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  };
  const interrupted = () => stop('interrupted');
  try {
    child = spawn(command[0], command.slice(1), { cwd, env, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = new Promise(resolveExit => {
      child.once('error', error => { launchError = error.code ?? 'spawn error'; });
      child.once('close', (code, signal) => resolveExit({ code, signal }));
    });
    process.once('SIGINT', interrupted);
    process.once('SIGTERM', interrupted);
    timer = setTimeout(() => stop('timeout'), timeoutSeconds * 1000);
    const copy = async (stream, destination) => {
      let size = 0;
      for await (const chunk of stream) {
        size += chunk.length;
        if (size > 10 * 1024 * 1024) { stop('output limit'); break; }
        await destination.write(chunk);
      }
    };
    await Promise.all([copy(child.stdout, stdout), copy(child.stderr, stderr)]);
    const status = await exited;
    // No orphaned sign-in waiter or agent subprocess may outlive this capture.
    if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    return { ...status, forced, launchError };
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGINT', interrupted);
    process.removeListener('SIGTERM', interrupted);
    await stdout.close();
    await stderr.close();
  }
}

export async function captureNative(directory, run, options) {
  assert(process.platform !== 'win32', 'Native process-group capture requires POSIX. Use operator packets for Windows native sessions.');
  const { scenario } = caseFor(run, options.platform, options.scenario);
  assert(options.platform !== 'public-web', 'Use probe for HTTP checks');
  assert(!scenario.controlled || options.controlled === true, 'Controlled scenario: provision an authorized fault fixture and pass --controlled');
  const adapter = options.adapter ?? builtInAdapter(options.platform, options.model);
  assert(adapter.platform === options.platform, 'Adapter/platform mismatch');
  rejectSecrets(adapter);
  assert(typeof adapter.model === 'string' && adapter.model.trim() && typeof adapter.surface === 'string' && adapter.surface.trim(), 'Adapter needs exact model and surface');
  assert(Array.isArray(adapter.command) && adapter.command.length && adapter.command.every(a => typeof a === 'string' && a.length), 'Adapter command must be an argv array');
  assert(adapter.command.filter(arg => arg === '{prompt}').length === 1, 'Adapter command must contain exactly one standalone {prompt} argument');
  assert(options.clientVersion || (Array.isArray(adapter.versionCommand) && adapter.versionCommand.length && adapter.versionCommand.every(arg => typeof arg === 'string' && arg.length)), 'Adapter needs versionCommand or --client-version');
  const passEnv = [...(adapter.passEnv ?? []), ...(options.passEnv ?? [])];
  assert(passEnv.every(name => /^[A-Z][A-Z0-9_]*$/.test(name) && !PROTECTED_ENV.test(name)), 'Only explicit provider environment names may be inherited; isolated home/state cannot be overridden');
  assert(Number.isFinite(options.timeout) && options.timeout >= 1 && options.timeout <= 3600, 'Native timeout must be 1..3600 seconds');
  const variant = options.variant ?? 'default';
  assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(variant), 'Invalid variant');
  const state = options.state ?? randomUUID();
  assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(state), 'Invalid isolated state name');
  const root = resolve(directory, 'private', 'states', state);
  const captureDir = resolve(directory, 'private', 'captures', randomUUID());
  for (const name of ['home', 'workspace', 'config', 'data', 'cache', 'state', 'tmp']) await mkdir(join(root, name), { recursive: true, mode: 0o700 });
  await mkdir(captureDir, { recursive: true, mode: 0o700 });
  const env = {
    PATH: process.env.PATH, HOME: join(root, 'home'), XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'), XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'), TMPDIR: join(root, 'tmp'),
    TC_HOME: join(root, 'home'), TC_APPS_STATE: join(root, 'state', 'tc-apps'),
    LANG: 'C.UTF-8', TERM: 'dumb', NO_COLOR: '1', DISABLE_AUTOUPDATER: '1', OPENCODE_DISABLE_AUTOUPDATE: '1', OPENCODE_DISABLE_SHARE: '1', OPENCODE_DISABLE_LSP_DOWNLOAD: '1',
  };
  for (const name of passEnv) if (process.env[name] !== undefined) env[name] = process.env[name];
  const prompt = resolveScenarioInstructions(run, scenario).prompt;
  const replacements = { '{prompt}': prompt, '{workspace}': join(root, 'workspace'), '{home}': join(root, 'home'), '{state}': join(root, 'state') };
  const command = adapter.command.map(arg => replacements[arg] ?? arg);
  let clientVersion = options.clientVersion;
  const started = Date.now();
  let outcome;
  let phase = 'main';
  if (!clientVersion) {
    const versionDir = join(captureDir, 'version');
    await mkdir(versionDir, { mode: 0o700 });
    const versionOutcome = await capture(adapter.versionCommand, env, join(root, 'workspace'), versionDir, 15);
    const versionText = (await readFile(join(versionDir, 'stdout.txt'), 'utf8')).trim();
    if (versionOutcome.forced === 'interrupted') {
      outcome = versionOutcome;
      phase = 'version';
      clientVersion = 'interrupted; main command not launched';
    } else {
      clientVersion = versionOutcome.code === 0 && versionText && versionText.length <= 200 ? versionText : 'unavailable; review private version capture';
    }
    rejectSecrets(clientVersion);
  }
  if (!outcome) outcome = await capture(command, env, join(root, 'workspace'), captureDir, options.timeout);
  await saveNew(join(captureDir, 'capture.json'), { platform: options.platform, scenario: options.scenario, model: adapter.model, command, passEnv, state, startedAt: new Date(started).toISOString(), phase, outcome });
  const status = outcome.code === 0 && !outcome.forced && !outcome.launchError ? 'needs_review' : 'blocked';
  const result = await appendResult(directory, {
    platform: options.platform, scenario: options.scenario, variant, status,
    environment: { model: adapter.model, clientVersion, os: process.platform, surface: adapter.surface, account: 'isolated local state; provider credentials only if explicitly inherited', workspace: 'isolated evaluation workspace', fixture: options.fixture ?? 'fresh isolated home (no TinyCloud state)' },
    observed: `Native ${phase === 'version' ? 'version lookup interrupted; main command not launched. Version subprocess' : 'process'} exit=${outcome.code}, signal=${outcome.signal ?? 'none'}, stop=${outcome.forced || outcome.launchError || 'none'}. Raw output is private and ungraded. ${status === 'needs_review' ? 'Exit zero is not acceptance.' : 'Review output before attributing this block to product, authentication or infrastructure.'}`,
    checks: scenario.checks.map(check => ({ id: check.id, status: 'not_run', observed: '', evidence: [] })), evidence: [], metrics: { durationMs: Date.now() - started },
  });
  return { result, captureDir, stateRoot: root };
}
