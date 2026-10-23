import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, realpath, open, unlink } from 'node:fs/promises';
import { resolve, join, dirname, relative, isAbsolute, extname, basename, sep } from 'node:path';

export const ENV_FIELDS = ['model', 'clientVersion', 'os', 'surface', 'account', 'workspace', 'fixture'];
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const CHECK_STATES = new Set(['passed', 'failed', 'blocked', 'not_run']);
export const hash = value => createHash('sha256').update(value).digest('hex');
export const json = value => JSON.stringify(value, null, 2) + '\n';
export const assert = (condition, message) => { if (!condition) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
export const applies = (scenario, platform) => scenario.platforms.includes(platform) || (platform !== 'public-web' && scenario.platforms.includes('*'));

export function validateCatalog(catalog) {
  assert(catalog?.schemaVersion === 1, 'Unsupported catalog schemaVersion');
  for (const field of ['platforms', 'scenarios']) {
    assert(Array.isArray(catalog[field]) && catalog[field].length, `Catalog needs ${field}`);
    const ids = new Set();
    for (const item of catalog[field]) {
      assert(ID.test(item.id) && !ids.has(item.id), `Invalid or duplicate ${field} id: ${item.id}`);
      ids.add(item.id);
      assert(text(item.title), `${item.id} needs a title`);
    }
  }
  const platforms = new Set(catalog.platforms.map(p => p.id));
  for (const scenario of catalog.scenarios) {
    assert(['smoke', 'full'].includes(scenario.tier) && text(scenario.category), `${scenario.id}: invalid tier/category`);
    assert(typeof scenario.controlled === 'boolean' && typeof scenario.prompt === 'string', `${scenario.id}: invalid controlled/prompt`);
    assert(Array.isArray(scenario.platforms) && scenario.platforms.length && scenario.platforms.every(p => p === '*' || platforms.has(p)), `${scenario.id}: unknown platform`);
    for (const field of ['preconditions', 'steps']) assert(Array.isArray(scenario[field]) && scenario[field].length && scenario[field].every(text), `${scenario.id}: missing ${field}`);
    assert(Array.isArray(scenario.checks) && scenario.checks.length, `${scenario.id}: missing checks`);
    const seen = new Set();
    for (const check of scenario.checks) {
      assert(ID.test(check.id) && !seen.has(check.id) && text(check.description), `${scenario.id}: invalid/duplicate check`);
      seen.add(check.id);
    }
  }
  return catalog;
}

export async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
export async function saveNew(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, typeof value === 'string' || Buffer.isBuffer(value) ? value : json(value), { flag: 'wx', mode: 0o600 });
}

export async function createRun(directory, catalog, candidate) {
  validateCatalog(catalog);
  for (const field of ['label', 'revision', 'connectUrl', 'mcpUrl']) assert(text(candidate[field]), `Candidate needs ${field}`);
  for (const field of ['connectUrl', 'mcpUrl']) {
    const url = new URL(candidate[field]);
    assert(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, `${field} must be a public HTTPS URL without credentials/query/fragment`);
  }
  const run = { schemaVersion: 1, id: randomUUID(), createdAt: new Date().toISOString(), candidate, catalogHash: hash(json(catalog)), catalog, results: [] };
  await saveNew(join(directory, 'run.json'), run);
  return run;
}

export function caseFor(run, platformId, scenarioId) {
  const platform = run.catalog.platforms.find(p => p.id === platformId);
  const scenario = run.catalog.scenarios.find(s => s.id === scenarioId);
  assert(platform && scenario, `Unknown platform/scenario: ${platformId}/${scenarioId}`);
  assert(applies(scenario, platformId), `${scenarioId} is not applicable to ${platformId}`);
  return { platform, scenario };
}

// Resolve only executable instructions; catalog identity and provenance stay canonical.
export function resolveScenarioInstructions(run, scenario) {
  const endpoints = {
    'https://agents.tinycloud.xyz/connect': run.candidate?.connectUrl,
    'https://mcp.tinycloud.xyz/mcp': run.candidate?.mcpUrl,
  };
  const resolveText = value => value.replace(/https:\/\/(?:agents\.tinycloud\.xyz\/connect|mcp\.tinycloud\.xyz\/mcp)/g, url => endpoints[url] || url);
  return {
    ...scenario,
    prompt: resolveText(scenario.prompt),
    preconditions: scenario.preconditions?.map(resolveText),
    steps: scenario.steps?.map(resolveText),
    checks: scenario.checks?.map(check => ({ ...check, description: resolveText(check.description) })),
  };
}

export async function containedFile(root, path) {
  assert(text(path) && !isAbsolute(path), 'Evidence paths must be relative');
  const base = await realpath(root);
  const full = await realpath(resolve(base, path));
  const rel = relative(base, full);
  assert(rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), `Evidence escapes its directory: ${path}`);
  return full;
}

export async function readRun(directory) {
  const run = await readJson(join(directory, 'run.json'));
  assert(run.schemaVersion === 1 && Array.isArray(run.results) && !run.results.length, 'Invalid immutable run header');
  validateCatalog(run.catalog);
  assert(hash(json(run.catalog)) === run.catalogHash, 'Run catalog snapshot changed');
  let files;
  try { files = await readdir(join(directory, 'results')); } catch (error) { if (error.code !== 'ENOENT') throw error; files = []; }
  for (const file of files.filter(f => /^\d{6}-[a-f0-9-]+\.json$/.test(f)).sort()) {
    const result = await readJson(join(directory, 'results', file));
    caseFor(run, result.platform, result.scenario);
    for (const evidence of result.evidence) {
      assert(evidence.path.startsWith('evidence/'), 'Only reviewed evidence may enter reports');
      const bytes = await readFile(await containedFile(directory, evidence.path));
      assert(hash(bytes) === evidence.sha256, `Evidence changed: ${evidence.path}`);
    }
    run.results.push(result);
  }
  return run;
}

export async function appendResult(directory, result) {
  const lock = join(directory, '.record-lock');
  let handle;
  try { handle = await open(lock, 'wx', 0o600); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another writer holds .record-lock; retry after it exits. Remove a stale lock only after checking no writer is alive.');
    throw error;
  }
  try {
    const run = await readRun(directory);
    caseFor(run, result.platform, result.scenario);
    const complete = { ...result, id: randomUUID(), recordedAt: new Date().toISOString() };
    const name = `${String(run.results.length + 1).padStart(6, '0')}-${complete.id}.json`;
    await saveNew(join(directory, 'results', name), complete);
    return complete;
  } finally { await handle.close(); await unlink(lock); }
}

export function makePacket(run, platform, scenarioId, variant = 'default') {
  const { scenario } = caseFor(run, platform, scenarioId);
  assert(ID.test(variant), 'Invalid variant');
  return {
    schemaVersion: 1, runId: run.id, catalogHash: run.catalogHash, platform, scenario: scenarioId, variant,
    environment: Object.fromEntries(ENV_FIELDS.map(key => [key, ''])), reviewer: '', controlledFixture: false,
    observed: '', checks: scenario.checks.map(check => ({ id: check.id, status: 'not_run', observed: '', evidence: [] })),
    evidence: [], metrics: {},
  };
}

// A guardrail, not a redaction engine. Screenshots and prose still require human review.
export function rejectSecrets(value) {
  const raw = typeof value === 'string' ? value : json(value);
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* Non-URL text need not decode. */ }
  const patterns = [
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/,
    /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/i,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /https?:\/\/[^\s"<>]+[?&#](?:code|state|token|access_token|refresh_token|delegation|proof|signature|p)=/i,
    /["']?(?:access_token|refresh_token|private_key|client_secret)["']?\s*[:=]\s*["']?[A-Za-z0-9_+\/-]{8,}/i,
  ];
  assert(!patterns.some(pattern => pattern.test(decoded)), 'Possible credential, email or signed approval URL in evidence. Redact locally before importing.');
}

export async function importPacket(directory, packetPath, redacted) {
  assert(redacted, 'record requires --redacted after a human checks JSON and every attachment');
  const run = await readRun(directory);
  const packet = await readJson(packetPath);
  assert(packet.schemaVersion === 1 && packet.runId === run.id && packet.catalogHash === run.catalogHash, 'Packet belongs to another run/catalog');
  const { scenario } = caseFor(run, packet.platform, packet.scenario);
  assert(packet.platform !== 'public-web', 'Infrastructure results come from probe, not manual grading');
  assert(ID.test(packet.variant) && text(packet.reviewer), 'Packet needs variant and reviewer');
  assert(ENV_FIELDS.every(key => text(packet.environment?.[key])), 'Record every environment field; use an explicit unknown/not-applicable explanation where necessary');
  assert(!scenario.controlled || packet.controlledFixture === true, 'This scenario requires an explicitly authorized controlled fixture');
  assert(text(packet.observed), 'Record what actually happened');
  assert(Array.isArray(packet.checks) && packet.checks.length === scenario.checks.length, 'Every scenario check must be graded exactly once');
  const expected = new Set(scenario.checks.map(check => check.id));
  for (const check of packet.checks) {
    assert(expected.delete(check.id) && CHECK_STATES.has(check.status), 'Unknown, duplicate or invalid check');
    assert(Array.isArray(check.evidence), 'Each check needs an evidence array');
    if (check.status !== 'not_run') assert(text(check.observed), `${check.id}: observation required`);
    if (['passed', 'failed'].includes(check.status)) assert(check.evidence.length, `${check.id}: passing/failing needs evidence`);
  }
  assert(Array.isArray(packet.evidence) && new Set(packet.evidence).size === packet.evidence.length, 'Evidence must be unique relative paths');
  assert(packet.checks.every(check => check.evidence.every(path => packet.evidence.includes(path))), 'A check refers to unattached evidence');
  const metrics = packet.metrics ?? {};
  assert(Object.entries(metrics).every(([key, value]) => ['durationMs', 'turns', 'approvals'].includes(key) && Number.isFinite(value) && value >= 0), 'Invalid smoothness metrics');
  rejectSecrets(packet);
  const loaded = [];
  for (const path of packet.evidence) {
    assert(['.txt', '.md', '.json', '.png', '.jpg', '.jpeg', '.webp', '.pdf'].includes(extname(path).toLowerCase()), 'Attach reviewed text, images or PDF only');
    const bytes = await readFile(await containedFile(dirname(resolve(packetPath)), path));
    assert(bytes.length <= 10 * 1024 * 1024, 'Evidence exceeds 10 MiB');
    if (['.txt', '.md', '.json'].includes(extname(path).toLowerCase())) rejectSecrets(bytes.toString('utf8'));
    loaded.push({ path, bytes });
  }
  const evidence = [];
  const map = new Map();
  const group = randomUUID();
  for (const [index, item] of loaded.entries()) {
    const path = `evidence/${group}/${index}-${basename(item.path).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await saveNew(join(directory, path), item.bytes);
    map.set(item.path, path);
    evidence.push({ path, sha256: hash(item.bytes) });
  }
  const checks = packet.checks.map(check => ({ ...check, evidence: check.evidence.map(path => map.get(path)) }));
  const status = checks.some(c => c.status === 'failed') ? 'failed' : checks.some(c => c.status === 'blocked') ? 'blocked' : checks.every(c => c.status === 'passed') ? 'passed' : 'needs_review';
  return appendResult(directory, {
    platform: packet.platform, scenario: packet.scenario, variant: packet.variant, status, environment: packet.environment,
    observed: packet.observed, reviewer: packet.reviewer, checks, evidence, metrics,
  });
}
