#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { readJson, readRun, createRun, validateCatalog, makePacket, importPacket, applies, assert, json, saveNew, resolveScenarioInstructions } from './store.mjs';
import { probe } from './probes.mjs';
import { captureNative } from './native.mjs';
import { captureTerminal } from './terminal.mjs';
import { compareRuns, renderHtml, renderMarkdown } from './report.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const HELP = `TinyCloud connect evaluations (Node.js >=22; no dependencies)

  node evals/connect/runner.mjs init --out RUN --candidate LABEL [--revision REV]
      [--catalog FILE] [--connect-url HTTPS_URL] [--mcp-url HTTPS_URL]
  node evals/connect/runner.mjs list [--run RUN] [--platform ID] [--scenario ID] [--tier smoke|full]
  node evals/connect/runner.mjs packet --run RUN --platform ID --scenario ID --out FILE [--variant ID]
  node evals/connect/runner.mjs record --run RUN --input FILE --redacted
  node evals/connect/runner.mjs probe --run RUN [--scenario HTTP-entry|HTTP-oauth|HTTP-skill]
  node evals/connect/runner.mjs native --run RUN --platform ID --scenario ID --model MODEL
      [--adapter FILE] [--variant ID] [--timeout SECONDS] [--inherit-env NAME,NAME]
      [--state ID] [--fixture LABEL] [--client-version VERSION] [--controlled]
  node evals/connect/runner.mjs terminal --run RUN --platform ID --scenario ID
      --session TMUX_SESSION --wait REGEXP --model MODEL --client-version VERSION --fixture LABEL
      [--socket TMUX_SOCKET] [--variant ID] [--timeout SECONDS] [--controlled]
  node evals/connect/runner.mjs report --run RUN [--baseline RUN]
  node evals/connect/runner.mjs compare --run RUN --baseline RUN
  node evals/connect/runner.mjs gate --run RUN [--platform ID] [--tier smoke|full]

init snapshots the catalog. probe checks public endpoints only, never accounts or storage.
packet provides actual-client instructions and a review form. record requires reviewed,
redacted evidence. native captures an isolated CLI turn, NEVER auto-passes it. Its fresh
HOME is state isolation, NOT a security sandbox; use a disposable VM/container for installs.
terminal records a persistent operator-owned tmux session through read-only VHS attachment.
It never types into the client, approves permissions, ends its session, or auto-passes checks.
report writes matrix.html/matrix.md beside the run's evidence. compare exits 1 on lost
coverage/regressions, 2 on changed comparison context; gate requires every selected cell
and every recorded variant to pass. No missing run, provider API or HTTP probe certifies
native onboarding. Raw native captures under RUN/private are never report attachments.
`;
const definitions = {
  run: { type: 'string' }, out: { type: 'string' }, candidate: { type: 'string' }, revision: { type: 'string' }, catalog: { type: 'string' },
  'connect-url': { type: 'string' }, 'mcp-url': { type: 'string' }, platform: { type: 'string' }, scenario: { type: 'string' }, tier: { type: 'string' },
  variant: { type: 'string' }, input: { type: 'string' }, redacted: { type: 'boolean' }, baseline: { type: 'string' }, adapter: { type: 'string' },
  model: { type: 'string' }, timeout: { type: 'string' }, 'inherit-env': { type: 'string' }, state: { type: 'string' }, fixture: { type: 'string' },
  'client-version': { type: 'string' }, controlled: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  session: { type: 'string' }, socket: { type: 'string' }, wait: { type: 'string' },
};
const flags = {
  init: ['out', 'candidate', 'revision', 'catalog', 'connect-url', 'mcp-url'], list: ['run', 'platform', 'scenario', 'tier', 'catalog'],
  packet: ['run', 'platform', 'scenario', 'out', 'variant'], record: ['run', 'input', 'redacted'], probe: ['run', 'scenario'],
  native: ['run', 'platform', 'scenario', 'model', 'adapter', 'variant', 'timeout', 'inherit-env', 'state', 'fixture', 'client-version', 'controlled'],
  terminal: ['run', 'platform', 'scenario', 'session', 'socket', 'wait', 'model', 'client-version', 'fixture', 'variant', 'timeout', 'controlled'],
  report: ['run', 'baseline'], compare: ['run', 'baseline'], gate: ['run', 'platform', 'tier'],
};
function required(options, ...names) { for (const name of names) assert(options[name], `Missing --${name}`); }
function select(catalog, options) {
  if (options.tier) assert(['smoke', 'full'].includes(options.tier), '--tier must be smoke or full');
  if (options.platform) assert(catalog.platforms.some(p => p.id === options.platform), `Unknown platform: ${options.platform}`);
  if (options.scenario) assert(catalog.scenarios.some(s => s.id === options.scenario), `Unknown scenario: ${options.scenario}`);
  return catalog.scenarios.filter(s => (!options.scenario || s.id === options.scenario) && (!options.platform || applies(s, options.platform)) && (options.tier !== 'smoke' || s.tier === 'smoke'));
}

async function main() {
  const { positionals, values: options } = parseArgs({ options: definitions, allowPositionals: true, strict: true });
  if (options.help || !positionals.length) { console.log(HELP); return; }
  assert(positionals.length === 1 && flags[positionals[0]], 'Unknown command. Use --help.');
  const command = positionals[0];
  for (const name of Object.keys(options)) assert(flags[command].includes(name), `--${name} is not valid for ${command}`);
  if (command === 'init') {
    required(options, 'out', 'candidate');
    const catalog = validateCatalog(await readJson(options.catalog ?? join(HERE, 'catalog.json')));
    const run = await createRun(resolve(options.out), catalog, { label: options.candidate, revision: options.revision ?? 'remote deployment revision unverified', connectUrl: options['connect-url'] ?? 'https://agents.tinycloud.xyz/connect', mcpUrl: options['mcp-url'] ?? 'https://mcp.tinycloud.xyz/mcp' });
    console.log(json({ run: resolve(options.out), id: run.id, catalogHash: run.catalogHash, platforms: catalog.platforms.length, scenarios: catalog.scenarios.length }));
    return;
  }
  if (command === 'list') {
    const catalog = options.run ? (await readRun(options.run)).catalog : validateCatalog(await readJson(options.catalog ?? join(HERE, 'catalog.json')));
    console.log(json({ platforms: catalog.platforms.filter(p => !options.platform || p.id === options.platform), scenarios: select(catalog, options) }));
    return;
  }
  required(options, 'run');
  const directory = resolve(options.run);
  const run = await readRun(directory);
  if (command === 'packet') {
    required(options, 'platform', 'scenario', 'out');
    const packet = makePacket(run, options.platform, options.scenario, options.variant);
    assert(options.platform !== 'public-web', 'Use probe for infrastructure');
    await saveNew(resolve(options.out), packet);
    const scenario = resolveScenarioInstructions(run, run.catalog.scenarios.find(s => s.id === options.scenario));
    console.log(json({ packet: resolve(options.out), candidate: run.candidate, platform: run.catalog.platforms.find(p => p.id === options.platform), scenario }));
  } else if (command === 'record') {
    required(options, 'input');
    const result = await importPacket(directory, resolve(options.input), options.redacted);
    console.log(json({ id: result.id, status: result.status, platform: result.platform, scenario: result.scenario }));
  } else if (command === 'probe') {
    const results = await probe(directory, run, options.scenario);
    console.log(json(results.map(({ platform, scenario, status, observed }) => ({ platform, scenario, status, observed }))));
    if (results.some(result => result.status !== 'passed')) process.exitCode = 1;
  } else if (command === 'native') {
    required(options, 'platform', 'scenario');
    const result = await captureNative(directory, run, {
      platform: options.platform, scenario: options.scenario, model: options.model,
      adapter: options.adapter ? await readJson(options.adapter) : undefined,
      variant: options.variant, timeout: Number(options.timeout ?? 180), passEnv: options['inherit-env']?.split(',') ?? [], state: options.state,
      fixture: options.fixture, clientVersion: options['client-version'], controlled: options.controlled,
    });
    console.log(json({ status: result.result.status, captureDir: result.captureDir, stateRoot: result.stateRoot, instruction: 'Review raw output locally; redact evidence, then import a packet. No acceptance checks have passed.' }));
    if (result.result.status === 'blocked') process.exitCode = 2;
  } else if (command === 'terminal') {
    required(options, 'platform', 'scenario', 'session', 'wait', 'model', 'client-version', 'fixture');
    const result = await captureTerminal(directory, run, {
      platform: options.platform, scenario: options.scenario, session: options.session, socket: options.socket,
      wait: options.wait, model: options.model, clientVersion: options['client-version'], fixture: options.fixture,
      variant: options.variant, timeout: Number(options.timeout ?? 45), controlled: options.controlled,
    });
    console.log(json({ status: result.result.status, captureDir: result.captureDir, attach: result.attach, instruction: 'Capture only: review/redact PNG and text locally, then import a packet. No acceptance checks passed; the native session remains operator-owned.' }));
    if (result.result.status === 'blocked') process.exitCode = 2;
  } else if (command === 'report') {
    const baseline = options.baseline ? await readRun(resolve(options.baseline)) : null;
    await writeFile(join(directory, 'matrix.html'), renderHtml(run, baseline), { mode: 0o600 });
    await writeFile(join(directory, 'matrix.md'), renderMarkdown(run, baseline), { mode: 0o600 });
    console.log(json({ html: join(directory, 'matrix.html'), markdown: join(directory, 'matrix.md') }));
  } else if (command === 'compare') {
    required(options, 'baseline');
    const changes = compareRuns(run, await readRun(resolve(options.baseline)));
    console.log(json(changes));
    if (changes.some(change => ['regression', 'coverage_lost'].includes(change.kind))) process.exitCode = 1;
    else if (changes.some(change => change.kind === 'context_changed')) process.exitCode = 2;
  } else if (command === 'gate') {
    const scenarios = select(run.catalog, options);
    const platforms = run.catalog.platforms.filter(p => !options.platform || p.id === options.platform);
    const incomplete = [];
    let cells = 0;
    for (const platform of platforms) {
      const variants = [...new Set(run.results.filter(r => r.platform === platform.id).map(r => r.variant))];
      if (!variants.length) variants.push('default');
      for (const scenario of scenarios) if (applies(scenario, platform.id)) for (const variant of variants) {
        cells++;
        const result = run.results.findLast(r => r.platform === platform.id && r.scenario === scenario.id && r.variant === variant);
        if (result?.status !== 'passed') incomplete.push({ platform: platform.id, scenario: scenario.id, variant, status: result?.status ?? 'not_run' });
      }
    }
    assert(cells > 0, 'No applicable cases selected');
    console.log(json({ selectedCells: cells, passed: cells - incomplete.length, incomplete }));
    if (incomplete.length) process.exitCode = 1;
  }
}

main().catch(error => { console.error(`connect-eval: ${error.message}`); process.exitCode = 2; });
