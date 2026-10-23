import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, stat, chmod, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { appendResult, assert, caseFor, rejectSecrets, saveNew } from './store.mjs';
import { capture } from './native.mjs';

const execute = promisify(execFile);
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/;

// Observe an operator-owned terminal. VHS must never own the agent's lifetime
// or send keys to its permission/login dialogs.
export async function captureTerminal(directory, run, options) {
  assert(process.platform !== 'win32', 'Terminal capture requires POSIX, tmux, VHS, ttyd and ffmpeg');
  const { scenario } = caseFor(run, options.platform, options.scenario);
  assert(['codex', 'claude-code', 'omp', 'opencode'].includes(options.platform), 'Use an operator packet for this platform');
  assert(!scenario.controlled || options.controlled === true, 'Controlled scenario: provision an authorized fault fixture and pass --controlled');
  for (const field of ['model', 'clientVersion', 'fixture']) assert(typeof options[field] === 'string' && options[field].trim(), `Terminal capture requires ${field}`);
  const socket = options.socket ?? 'default';
  assert(NAME.test(socket) && NAME.test(options.session ?? ''), 'Use simple tmux socket/session names (letters, digits, underscore, hyphen)');
  assert(typeof options.wait === 'string' && options.wait.trim() && !/[\r\n/\0]/.test(options.wait), '--wait needs a single-line Go regexp without slash delimiters');
  assert(Number.isInteger(options.timeout) && options.timeout >= 1 && options.timeout <= 300, 'Terminal wait timeout must be 1..300 seconds');
  const variant = options.variant ?? 'terminal-vhs';
  assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(variant), 'Invalid variant');
  rejectSecrets(options);

  const tmux = ['-L', socket];
  const target = `=${options.session}`;
  const command = async args => (await execute('tmux', [...tmux, ...args], { timeout: 10000, maxBuffer: 10 * 1024 * 1024 })).stdout;
  const panes = (await command(['list-panes', '-s', '-t', target, '-F', '#{pane_id}'])).trim().split('\n');
  assert(panes.length === 1 && /^%\d+$/.test(panes[0]), 'Capture a dedicated session with exactly one window and pane');
  const pane = panes[0];
  const geometry = (await command(['display-message', '-p', '-t', pane, '#{window_width} #{window_height} #{status}'])).trim().split(' ');
  const statusRows = geometry[2] === 'on' ? 1 : geometry[2] === 'off' ? 0 : Number(geometry[2]);
  const dimensions = [Number(geometry[0]), Number(geometry[1]) + statusRows];
  assert(Number.isInteger(statusRows) && statusRows >= 0 && dimensions.every(value => Number.isInteger(value) && value > 0), 'Cannot determine terminal dimensions');
  const captureDir = resolve(directory, 'private', 'terminals', randomUUID());
  await mkdir(captureDir, { recursive: true, mode: 0o700 });
  const template = await readFile(new URL('./terminal.tape', import.meta.url), 'utf8');
  const attach = `exec tmux -L ${socket} attach-session -f read-only,ignore-size -t ${target}`;
  const values = { ATTACH: attach, WAIT: options.wait, TIMEOUT: String(options.timeout), COLUMNS: String(dimensions[0]), ROWS: String(dimensions[1]) };
  const tape = template.replace(/\{\{(ATTACH|WAIT|TIMEOUT|COLUMNS|ROWS)\}\}/g, (_, key) => values[key]);
  await saveNew(join(captureDir, 'capture.tape'), tape);
  await saveNew(join(captureDir, 'before.txt'), await command(['capture-pane', '-p', '-S', '-', '-t', pane]));
  const started = Date.now();
  // The recorder gets no provider environment or owner shell configuration.
  // tmux attaches to the existing server; the client stays outside this process group.
  // Chromium's Unix sockets cannot use the potentially long run-directory path.
  const temporary = await mkdtemp(join(tmpdir(), 'tc-vhs-'));
  const env = {
    PATH: process.env.PATH, HOME: captureDir, TMPDIR: temporary,
    LANG: 'C.UTF-8', TERM: 'xterm-256color',
  };
  if (process.env.VHS_NO_SANDBOX) env.VHS_NO_SANDBOX = process.env.VHS_NO_SANDBOX;
  if (process.env.TMUX_TMPDIR) env.TMUX_TMPDIR = process.env.TMUX_TMPDIR;
  let outcome;
  try {
    outcome = await capture(['vhs', 'capture.tape'], env, captureDir, captureDir, options.timeout + 60);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  let paneError = '';
  try {
    await saveNew(join(captureDir, 'after.txt'), await command(['capture-pane', '-p', '-S', '-', '-t', pane]));
  } catch {
    paneError = 'Original pane unavailable after capture; inspect private output before attributing a cause.';
  }
  let screenshot = false;
  for (const file of ['terminal.png', 'terminal.gif']) {
    try {
      const info = await stat(join(captureDir, file));
      await chmod(join(captureDir, file), 0o600);
      if (file === 'terminal.png') screenshot = info.size > 0;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await saveNew(join(captureDir, 'capture.json'), {
    platform: options.platform, scenario: options.scenario, session: options.session, socket, pane,
    startedAt: new Date(started).toISOString(), wait: options.wait, outcome, paneError, screenshot,
  });
  const status = outcome.code === 0 && !outcome.forced && !outcome.launchError && !paneError && screenshot ? 'needs_review' : 'blocked';
  const result = await appendResult(directory, {
    platform: options.platform, scenario: options.scenario, variant, status,
    environment: {
      model: options.model, clientVersion: options.clientVersion, os: process.platform,
      surface: 'native interactive terminal; read-only VHS observation of persistent tmux session',
      account: 'operator-managed test fixture; capture does not authenticate or approve',
      workspace: 'operator-owned disposable runner; no state reset by recorder', fixture: options.fixture,
    },
    observed: `VHS exit=${outcome.code}, stop=${outcome.forced || outcome.launchError || 'none'}, screenshot=${screenshot}. ${paneError} Screen matches are synchronization only, not acceptance. Raw captures remain private; no checks are graded. The recorder never sends input to or terminates the native session.`,
    checks: scenario.checks.map(check => ({ id: check.id, status: 'not_run', observed: '', evidence: [] })),
    evidence: [], metrics: { durationMs: Date.now() - started },
  });
  return { result, captureDir, attach: `tmux -L ${socket} attach-session -t ${target}` };
}
