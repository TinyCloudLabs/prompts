import { resolveScenarioInstructions } from './store.mjs';

const STATUS_LABELS = Object.freeze({
  passed: 'Passed', failed: 'Failed', blocked: 'Blocked', needs_review: 'Needs review',
  not_run: 'Not run', not_applicable: 'N/A',
});
const ENVIRONMENT_KEYS = ['model', 'clientVersion', 'os', 'surface', 'account', 'workspace', 'fixture'];
const WARNING = 'Evaluation evidence, not production certification. Public HTTP probes do not prove native onboarding, authentication, save/readback, identity, or plan eligibility. A passing honest-stop scenario does not prove happy-path setup. Unknown capabilities are not N/A.';

function text(value) { return value == null ? '' : String(value); }
function html(value) {
  return text(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function md(value) {
  return text(value).replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character])
    .replace(/[\\`*_{}\[\]()#+.!|~\-]/g, '\\$&').replace(/\r?\n/g, '<br>');
}
function canonical(value) {
  if (value === undefined || value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function environment(value = {}) {
  return Object.fromEntries([...new Set([...ENVIRONMENT_KEYS, ...Object.keys(value)])].sort()
    .map(key => [key, value[key] == null ? '' : typeof value[key] === 'string' ? value[key].trim() : value[key]]));
}
function key(platform, scenario, variant) { return JSON.stringify([platform, scenario, variant]); }
function columnKey(platform, variant) { return JSON.stringify([platform, variant]); }
function variantOf(result) { return result.variant || 'default'; }
function statusOf(result) { return result ? (Object.hasOwn(STATUS_LABELS, result.status) ? result.status : 'needs_review') : 'not_run'; }
function applicable(scenario, platform) {
  return Boolean(scenario && platform && (scenario.platforms || []).some(id => id === platform.id || (id === '*' && platform.id !== 'public-web')));
}
function indexRun(run) {
  const platforms = new Map((run?.catalog?.platforms || []).map(platform => [platform.id, platform]));
  const scenarios = new Map((run?.catalog?.scenarios || []).map(scenario => [scenario.id, scenario]));
  const attempts = new Map();
  const variants = new Map();
  for (const result of run?.results || []) {
    const variant = variantOf(result);
    const id = key(result.platform, result.scenario, variant);
    if (!attempts.has(id)) attempts.set(id, []);
    attempts.get(id).push(result);
    if (!variants.has(result.platform)) variants.set(result.platform, new Set());
    variants.get(result.platform).add(variant);
  }
  const columns = [];
  for (const platform of platforms.values()) {
    for (const variant of variants.get(platform.id) || ['default']) columns.push({ platform, variant });
  }
  return { platforms, scenarios, attempts, columns };
}
function last(attempts) { return attempts?.at(-1); }

/** Compare latest attempts only; changed scenario/environment takes precedence over outcome changes. */
export function compareRuns(current, baseline) {
  if (!baseline) return [];
  const now = indexRun(current);
  const previous = indexRun(baseline);
  const cells = new Map();
  for (const index of [previous, now]) {
    for (const [id, attempts] of index.attempts) {
      const result = last(attempts);
      cells.set(id, { platform: result.platform, scenario: result.scenario, variant: variantOf(result) });
    }
  }
  // Removed catalog coverage remains visible even if it had not yet been executed.
  for (const { platform, variant } of previous.columns) {
    for (const scenario of previous.scenarios.values()) {
      if ((!now.platforms.has(platform.id) || !now.scenarios.has(scenario.id)) && applicable(scenario, platform)) {
        cells.set(key(platform.id, scenario.id, variant), { platform: platform.id, scenario: scenario.id, variant });
      }
    }
  }
  const changes = [];
  for (const [id, cell] of cells) {
    const beforeResult = last(previous.attempts.get(id));
    const afterResult = last(now.attempts.get(id));
    const before = statusOf(beforeResult);
    const after = statusOf(afterResult);
    const oldScenario = previous.scenarios.get(cell.scenario);
    const newScenario = now.scenarios.get(cell.scenario);
    const removed = !now.platforms.has(cell.platform) || !newScenario;
    const add = (kind, detail) => changes.push({ ...cell, before, after, kind, detail });
    if (removed) {
      add('coverage_lost', `Removed ${[!now.platforms.has(cell.platform) && 'platform', !newScenario && 'scenario'].filter(Boolean).join(' and ')} from the current catalog; previous coverage is retained here.`);
    } else if (beforeResult && !afterResult) {
      add('coverage_lost', 'No current attempt for this platform/scenario/variant; a previous outcome must not be carried forward.');
    } else if (oldScenario && canonical(oldScenario) !== canonical(newScenario)) {
      add('context_changed', 'Scenario definition changed; outcomes are not comparable under the same conditions.');
    } else if (beforeResult && afterResult && canonical(environment(beforeResult.environment)) !== canonical(environment(afterResult.environment))) {
      const oldEnvironment = environment(beforeResult.environment);
      const newEnvironment = environment(afterResult.environment);
      const changed = [...new Set([...Object.keys(oldEnvironment), ...Object.keys(newEnvironment)])]
        .filter(field => canonical(oldEnvironment[field] ?? '') !== canonical(newEnvironment[field] ?? ''));
      add('context_changed', `Client/environment changed (${changed.join(', ')}); outcomes are not comparable under the same conditions.`);
    } else if (!beforeResult && afterResult) {
      add(after === 'passed' ? 'improvement' : 'changed', 'New outcome; no baseline attempt exists for this exact platform/scenario/variant.');
    } else if (before !== after) {
      add(before === 'passed' && ['failed', 'blocked', 'needs_review'].includes(after) ? 'regression' : after === 'passed' ? 'improvement' : 'changed', 'Latest recorded outcomes compared under unchanged scenario and environment.');
    }
  }
  return changes;
}

function reportModel(run, baseline) {
  const current = indexRun(run);
  const previous = indexRun(baseline);
  const columns = current.columns.map(column => ({ ...column, removed: false }));
  const columnIds = new Set(columns.map(column => columnKey(column.platform.id, column.variant)));
  for (const column of previous.columns) {
    if (!columnIds.has(columnKey(column.platform.id, column.variant))) columns.push({ ...column, removed: true });
  }
  const scenarios = [...current.scenarios.values()].map(scenario => ({ scenario: resolveScenarioInstructions(run, scenario), removed: false }));
  for (const scenario of previous.scenarios.values()) {
    if (!current.scenarios.has(scenario.id)) scenarios.push({ scenario: resolveScenarioInstructions(baseline, scenario), removed: true });
  }
  const changes = compareRuns(run, baseline);
  const changesByCell = new Map(changes.map(change => [key(change.platform, change.scenario, change.variant), change]));
  const rows = scenarios.map(({ scenario, removed }, rowIndex) => ({
    scenario, removed,
    cells: columns.map((column, columnIndex) => {
      const id = key(column.platform.id, scenario.id, column.variant);
      const attempts = current.attempts.get(id) || [];
      const result = last(attempts);
      const lost = removed || column.removed;
      const applies = applicable(scenario, column.platform);
      return {
        id: `cell-${rowIndex}-${columnIndex}`, column, scenario, attempts, result,
        previousAttempts: previous.attempts.get(id) || [],
        status: !applies ? 'not_applicable' : statusOf(result),
        removed: lost, change: changesByCell.get(id),
      };
    }),
  }));
  return { columns, rows, changes };
}
function infrastructure(platform) { return platform.id === 'public-web' || platform.route === 'public-http'; }
function counts(model, isInfrastructure) {
  const totals = Object.fromEntries(Object.keys(STATUS_LABELS).map(status => [status, 0]));
  for (const row of model.rows) for (const cell of row.cells) {
    if (!cell.removed && infrastructure(cell.column.platform) === isInfrastructure) totals[cell.status]++;
  }
  return totals;
}
function statusLabel(cell) { return `${STATUS_LABELS[cell.status]}${cell.removed || cell.change?.kind === 'coverage_lost' ? ' · Coverage lost' : ''}`; }
function badge(status) { return `<span class="badge ${html(status)}">${html(STATUS_LABELS[status] || status)}</span>`; }

// Only local, non-executable, declared redacted artifacts can become links. Content is never embedded.
function evidenceHref(path) {
  const value = text(path);
  if (!value || /[\u0000-\u001f\u007f\\:?#]/.test(value) || value.startsWith('/') || value.includes('%')) return null;
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment.startsWith('.') || /^(?:raw|private|captures?|transcripts?)(?:[._-]|$)/i.test(segment))) return null;
  if (!/\.(?:txt|md|json|csv|png|jpe?g|gif|webp|pdf)$/i.test(value)) return null;
  return segments.map(encodeURIComponent).join('/');
}
function validEvidence(result) {
  return (result.evidence || []).filter(item => item && typeof item.path === 'string' && /^[a-f0-9]{64}$/i.test(item.sha256 || ''));
}
function evidenceHtml(result, paths = null, linkEvidence = true) {
  const declared = validEvidence(result);
  const selected = paths == null ? (result.evidence || []) : paths.map(path => declared.find(item => item.path === path) || { path });
  if (!selected.length) return '<p class="muted">No evidence attached.</p>';
  return `<ul class="evidence">${selected.map(item => {
    const verified = declared.some(candidate => candidate.path === item.path && candidate.sha256 === item.sha256);
    const href = linkEvidence && verified && evidenceHref(item.path);
    return `<li>${href ? `<a href="${html(href)}" rel="noopener noreferrer">${html(item.path)}</a>` : `${html(item.path)} <span class="muted">(${linkEvidence ? 'not linked: unsafe path or missing validated digest' : 'baseline artifact; open from baseline run directory'})</span>`}${item.sha256 ? `<br><span class="digest">SHA-256: ${html(item.sha256)}</span>` : ''}</li>`;
  }).join('')}</ul>`;
}
function listHtml(items, ordered = false) {
  const tag = ordered ? 'ol' : 'ul';
  return items?.length ? `<${tag}>${items.map(item => `<li>${html(item)}</li>`).join('')}</${tag}>` : '<p class="muted">None specified.</p>';
}
function fieldsHtml(fields) {
  return `<dl>${Object.entries(fields).map(([name, value]) => `<dt>${html(name)}</dt><dd>${html(value === '' || value == null ? 'Not recorded' : value)}</dd>`).join('')}</dl>`;
}
function attemptHtml(result, scenario, index, total, linkEvidence = true) {
  const checks = new Map((result.checks || []).map(check => [check.id, check]));
  const expected = scenario.checks || [];
  const expectedIds = new Set(expected.map(check => check.id));
  const entries = [...expected, ...(result.checks || []).filter(check => !expectedIds.has(check.id)).map(check => ({ id: check.id, description: 'Not defined in this scenario snapshot.' }))];
  return `<section class="attempt"><h4>Attempt ${index + 1} of ${total}${index === total - 1 ? ' — latest' : ' — history'}</h4>
${fieldsHtml({ 'Result ID': result.id, 'Recorded at': result.recordedAt, Outcome: STATUS_LABELS[statusOf(result)], Reason: result.reason })}
<h5>Client and environment</h5>${fieldsHtml(environment(result.environment))}
<h5>Observed outcome</h5><p class="verbatim">${html(result.observed || 'No observation recorded.')}</p>
<h5>Expected checks versus observed evidence</h5>${entries.length ? entries.map(expectedCheck => {
    const check = checks.get(expectedCheck.id);
    return `<section class="check"><h6>${html(expectedCheck.id)} — ${badge(check?.status || 'not_run')}</h6><p><strong>Expected:</strong> ${html(expectedCheck.description)}</p><p class="verbatim"><strong>Observed:</strong> ${html(check?.observed || 'No observation recorded.')}</p>${evidenceHtml(result, check?.evidence || [], linkEvidence)}</section>`;
  }).join('') : '<p>No checks defined.</p>'}
<h5>Declared redacted evidence</h5>${evidenceHtml(result, null, linkEvidence)}
<h5>Metrics</h5>${fieldsHtml({ 'Duration (ms)': result.metrics?.durationMs, Turns: result.metrics?.turns, Approvals: result.metrics?.approvals })}</section>`;
}
function provenanceHtml(run, heading) {
  return `<section><h2>${html(heading)}</h2>${fieldsHtml({ 'Run ID': run.id, 'Created at': run.createdAt, Candidate: run.candidate?.label, Revision: run.candidate?.revision, 'Connect URL': run.candidate?.connectUrl, 'MCP URL': run.candidate?.mcpUrl, 'Catalog SHA-256': run.catalogHash })}</section>`;
}
function summaryHtml(model) {
  return [false, true].map(isInfrastructure => `<section><h3>${isInfrastructure ? 'Public infrastructure probes' : 'Native/client scenarios'}</h3><ul class="summary">${Object.entries(counts(model, isInfrastructure)).map(([status, total]) => `<li>${badge(status)} <strong>${total}</strong> cells</li>`).join('')}</ul></section>`).join('');
}
function changesHtml(changes, baseline) {
  if (!baseline) return '<p>No baseline supplied. No previous outcomes or regressions are inferred.</p>';
  if (!changes.length) return '<p>No outcome, context, or coverage differences found in compared cells.</p>';
  return `<div class="scroll"><table><caption>Comparison against baseline ${html(baseline.id)}</caption><thead><tr><th>Platform / variant</th><th>Scenario</th><th>Before</th><th>After</th><th>Classification</th><th>Explanation</th></tr></thead><tbody>${changes.map(change => `<tr><td>${html(change.platform)} / ${html(change.variant)}</td><td>${html(change.scenario)}</td><td>${html(STATUS_LABELS[change.before])}</td><td>${html(STATUS_LABELS[change.after])}</td><td>${html(change.kind)}</td><td>${html(change.detail)}</td></tr>`).join('')}</tbody></table></div>`;
}

const STYLE = `
:root{color-scheme:light dark;font-family:system-ui,sans-serif;line-height:1.5}
*{box-sizing:border-box}
body{max-width:1600px;margin:auto;padding:1.5rem}
h1,h2,h3{line-height:1.2}h4,h5,h6{font-size:1rem}
a{color:light-dark(#064f9a,#90c5ff)}
.warning{border-inline-start:5px solid #b87900;padding:1rem;background:light-dark(#fff4d6,#352b16)}
.muted{color:light-dark(#555,#bbb)}
.scroll{overflow:auto;max-height:70vh;border:1px solid #888}
table{border-collapse:collapse;min-width:100%;text-align:left}
th,td{padding:.65rem;border:1px solid #888;vertical-align:top}
thead th{position:sticky;top:0;background:light-dark(#eaf0f5,#202830);z-index:2}
tbody th{position:sticky;left:0;background:light-dark(#f5f7fa,#202830);min-width:13rem}
td{min-width:9rem}
.badge{display:inline-block;border:1px solid currentColor;border-radius:.25rem;padding:.1rem .4rem;white-space:nowrap;font-size:.9rem}
.passed{color:light-dark(#176133,#85dda4)}.failed{color:light-dark(#a01616,#ff9a9a)}
.blocked,.needs_review{color:light-dark(#775200,#ffd27b)}.not_run,.not_applicable{color:light-dark(#555,#ccc)}
.summary{display:flex;flex-wrap:wrap;gap:1rem;list-style:none;padding:0}
.filters{display:flex;flex-wrap:wrap;align-items:end;gap:1rem;padding:1rem;border:1px solid #888}
.filters label{display:flex;flex-direction:column;gap:.3rem;min-width:0}
input,select,button{font:inherit;padding:.4rem;max-width:100%}button{cursor:pointer}
dl{display:grid;grid-template-columns:minmax(9rem,auto) minmax(0,1fr);gap:.25rem 1rem}
dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}
.digest{font-family:monospace;overflow-wrap:anywhere}.verbatim{white-space:pre-wrap;overflow-wrap:anywhere}
details{margin:.8rem 0;border:1px solid #888;padding:.7rem;overflow-wrap:anywhere}
summary{cursor:pointer;font-weight:600}
.attempt,.check{border-inline-start:3px solid #888;padding-inline-start:1rem;margin-block:1rem}
.removed{border-style:dashed}.notice{font-weight:600}
.platform-notes{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:1.5rem}
.platform-notes section{min-width:0}.platform-notes dl{display:block}.platform-notes dd{margin-bottom:.6rem}
[hidden]{display:none!important}
:focus-visible{outline:3px solid light-dark(#005fcc,#8ac4ff);outline-offset:3px}
@media(max-width:600px){body{padding:.7rem}dl{display:block}dd{margin-bottom:.5rem}}
@media print{.filters{display:none}.scroll{max-height:none;overflow:visible}thead th,tbody th{position:static}details{break-inside:avoid}}
`;

// This script contains no run data. It reads inert, escaped DOM attributes only.
const FILTER_SCRIPT = `(() => {
  const form = document.getElementById('filters');
  const status = document.getElementById('status-filter');
  const platform = document.getElementById('platform-filter');
  const category = document.getElementById('category-filter');
  const query = document.getElementById('text-filter');
  const cells = [...document.querySelectorAll('[data-matrix-cell]')];
  const details = [...document.querySelectorAll('[data-cell-detail]')];
  function matches(node) {
    return (!status.value || node.dataset.status === status.value || (status.value === 'coverage_lost' && node.dataset.removed === 'true')) &&
      (!platform.value || node.dataset.platform === platform.value) &&
      (!category.value || node.dataset.category === category.value) &&
      (!query.value.trim() || node.dataset.search.includes(query.value.trim().toLowerCase()));
  }
  function update() {
    let visible = 0;
    for (const cell of cells) {
      const match = matches(cell);
      cell.querySelector('[data-cell-content]').hidden = !match;
      cell.querySelector('[data-filtered-label]').hidden = match;
      cell.dataset.match = String(match);
      if (match) visible++;
    }
    for (const row of document.querySelectorAll('[data-matrix-row]')) row.hidden = ![...row.querySelectorAll('[data-matrix-cell]')].some(cell => cell.dataset.match === 'true');
    for (const node of document.querySelectorAll('[data-column]')) node.hidden = Boolean(platform.value && node.dataset.platform !== platform.value);
    for (const detail of details) detail.hidden = !matches(detail);
    document.getElementById('filter-count').textContent = visible + ' of ' + cells.length + ' cells match. Filtered cells are not changed outcomes.';
  }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('reset', () => setTimeout(update, 0));
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-open-detail]');
    if (!link) return;
    const detail = document.getElementById(link.getAttribute('href').slice(1));
    if (detail) detail.open = true;
  });
  update();
})();`;

/** Render an offline HTML artifact; all supplied content is escaped and evidence is never executed. */
export function renderHtml(run, baseline = null) {
  const model = reportModel(run, baseline);
  const platforms = [...new Map(model.columns.map(column => [column.platform.id, column.platform])).values()];
  const categories = [...new Set(model.rows.map(row => row.scenario.category || 'Uncategorized'))];
  const attrs = cell => {
    const search = [cell.column.platform.id, cell.column.platform.title, cell.column.variant, cell.scenario.id, cell.scenario.title, cell.scenario.category, cell.scenario.prompt, ...(cell.scenario.preconditions || []), ...(cell.scenario.steps || []), ...(cell.scenario.checks || []).map(check => `${check.id} ${check.description}`), ...cell.attempts.map(result => `${result.observed || ''} ${result.reason || ''} ${JSON.stringify(result.environment || {})}`)].join(' ').toLowerCase();
    return `data-status="${html(cell.status)}" data-removed="${cell.removed || cell.change?.kind === 'coverage_lost'}" data-platform="${html(cell.column.platform.id)}" data-category="${html(cell.scenario.category || 'Uncategorized')}" data-search="${html(search)}"`;
  };
  const matrix = `<div class="scroll" tabindex="0" role="region" aria-label="Scrollable scenario matrix"><table><caption>All catalog scenarios by platform and variant; current outcome is the last appended attempt, never the best attempt.</caption><thead><tr><th scope="col">Scenario / stage</th>${model.columns.map(column => `<th scope="col" data-column data-platform="${html(column.platform.id)}">${html(column.platform.title)}<br>${html(column.platform.id)} / ${html(column.variant)}<br><small>${infrastructure(column.platform) ? 'Infrastructure only' : 'Native/client surface'}${column.removed ? ' · Coverage lost' : ''}</small></th>`).join('')}</tr></thead><tbody>${model.rows.map(row => `<tr data-matrix-row><th scope="row">${html(row.scenario.id)} — ${html(row.scenario.title)}<br><small>${html(row.scenario.category || 'Uncategorized')} · ${html(row.scenario.tier)}${row.removed ? ' · Removed scenario' : ''}</small></th>${row.cells.map(cell => `<td data-matrix-cell data-column ${attrs(cell)}><div data-cell-content><a href="#${cell.id}" data-open-detail>${badge(cell.status)}</a>${cell.removed ? '<br><span class="notice">Coverage lost</span>' : ''}${cell.change ? `<br><small>${html(cell.change.kind)}</small>` : ''}<br><small>${cell.attempts.length} current attempts</small></div><span data-filtered-label hidden class="muted">Filtered out</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const details = model.rows.map(row => row.cells.map(cell => `<details id="${cell.id}" data-cell-detail ${attrs(cell)}${cell.removed ? ' class="removed"' : ''}><summary>${html(cell.scenario.id)} · ${html(cell.column.platform.title)} / ${html(cell.column.variant)} — ${html(statusLabel(cell))}</summary>
${cell.removed ? '<p class="notice">Baseline-only row or column: coverage lost, not a current execution.</p>' : ''}
${cell.status === 'not_applicable' ? '<p>Explicit scenario applicability excludes this platform. Unknown capability alone never excludes a platform.</p>' : ''}
<p><strong>Stage/category:</strong> ${html(cell.scenario.category)} · <strong>Tier:</strong> ${html(cell.scenario.tier)} · <strong>Controlled infrastructure required:</strong> ${cell.scenario.controlled ? 'Yes; authorized safe staging only' : 'No'}</p>
<h3>Prompt</h3><p class="verbatim">${html(cell.scenario.prompt)}</p><h3>Preconditions</h3>${listHtml(cell.scenario.preconditions)}<h3>Steps</h3>${listHtml(cell.scenario.steps, true)}
<h3>Expected checks</h3>${listHtml((cell.scenario.checks || []).map(check => `${check.id}: ${check.description}`))}
<h3>Scenario sources</h3>${listHtml(cell.scenario.sources)}
${cell.change ? `<p><strong>Baseline comparison — ${html(cell.change.kind)}:</strong> ${html(cell.change.detail)}</p>` : ''}
<h3>Current attempts</h3>${cell.attempts.length ? [...cell.attempts].reverse().map((result, index) => attemptHtml(result, cell.scenario, cell.attempts.length - index - 1, cell.attempts.length)).join('') : '<p>No current execution recorded. Preconditions, subscription names, and public probe success do not imply a client outcome.</p>'}
${cell.previousAttempts.length ? `<details><summary>Baseline attempts (${cell.previousAttempts.length}) — historical, not current success</summary>${[...cell.previousAttempts].reverse().map((result, index) => attemptHtml(result, resolveScenarioInstructions(baseline, baseline.catalog.scenarios.find(scenario => scenario.id === result.scenario) || cell.scenario), cell.previousAttempts.length - index - 1, cell.previousAttempts.length, false)).join('')}</details>` : ''}</details>`).join('')).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Connect evaluation — ${html(run.candidate?.label || run.id)}</title><style>${STYLE}</style></head><body>
<h1>Connect evaluation</h1><p class="warning">${html(WARNING)}</p>
${provenanceHtml(run, 'Current candidate')}${baseline ? provenanceHtml(baseline, 'Baseline candidate') : ''}
<h2>Latest-attempt coverage</h2>${summaryHtml(model)}<p>Counts describe scenario/variant cells, not certified platforms. Removed coverage is excluded from current counts and retained in the matrix and comparison below.</p>
<details><summary>Client surfaces and support notes</summary><div class="platform-notes">${platforms.map(platform => `<section><h3>${html(platform.title)} (${html(platform.id)})</h3>${fieldsHtml({ Surface: platform.surface, Route: platform.route, 'Documented capability': platform.capability, Notes: platform.notes })}<h4>Sources</h4>${listHtml(platform.sources)}</section>`).join('')}</div></details>
<h2>Baseline differences</h2>${changesHtml(model.changes, baseline)}
<h2>Coverage matrix</h2><form id="filters" class="filters" aria-label="Filter evaluation cells"><label>Status<select id="status-filter"><option value="">All statuses</option>${Object.entries(STATUS_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}<option value="coverage_lost">Coverage lost</option></select></label><label>Platform<select id="platform-filter"><option value="">All platforms</option>${platforms.map(platform => `<option value="${html(platform.id)}">${html(platform.title)} (${html(platform.id)})</option>`).join('')}</select></label><label>Stage/category<select id="category-filter"><option value="">All stages/categories</option>${categories.map(category => `<option value="${html(category)}">${html(category)}</option>`).join('')}</select></label><label>Search<input id="text-filter" type="search" placeholder="Scenario, observation, client…"></label><button type="reset">Reset filters</button></form><p id="filter-count" role="status" aria-live="polite"></p><noscript><p>Filters require JavaScript; the complete matrix and all details remain available below.</p></noscript>
${matrix}<h2>Scenario details and attempt history</h2><p>Expand a cell for setup, expected versus observed checks, provenance, and redacted evidence. Evidence links resolve relative to this report’s run directory; preserve that directory when sharing artifacts. Baseline evidence belongs to its own run directory.</p>${details}
<script>${FILTER_SCRIPT}</script></body></html>`;
}

function markdownProvenance(run, heading) {
  const fields = { 'Run ID': run.id, 'Created at': run.createdAt, Candidate: run.candidate?.label, Revision: run.candidate?.revision, 'Connect URL': run.candidate?.connectUrl, 'MCP URL': run.candidate?.mcpUrl, 'Catalog SHA-256': run.catalogHash };
  return `## ${heading}\n\n${Object.entries(fields).map(([name, value]) => `- **${name}:** ${md(value || 'Not recorded')}`).join('\n')}\n`;
}
function evidenceMarkdown(result, paths = null, linkEvidence = true) {
  const declared = validEvidence(result);
  const entries = paths == null ? (result.evidence || []) : paths.map(path => declared.find(item => item.path === path) || { path });
  if (!entries.length) return 'No evidence attached.';
  return entries.map(item => {
    const href = linkEvidence && declared.some(candidate => candidate.path === item.path && candidate.sha256 === item.sha256) && evidenceHref(item.path);
    return `${href ? `[${md(item.path)}](<${href}>)` : `${md(item.path)} (${linkEvidence ? 'not linked' : 'baseline artifact; open from baseline run directory'})`}${item.sha256 ? `; SHA-256: ${md(item.sha256)}` : ''}`;
  }).join('; ');
}
function attemptMarkdown(result, scenario, ordinal, total, linkEvidence = true) {
  const checks = new Map((result.checks || []).map(check => [check.id, check]));
  const expectedIds = new Set((scenario.checks || []).map(check => check.id));
  const expected = [...(scenario.checks || []), ...(result.checks || []).filter(check => !expectedIds.has(check.id)).map(check => ({ id: check.id, description: 'Not defined in this scenario snapshot.' }))];
  return `#### Attempt ${ordinal} of ${total}${ordinal === total ? ' — latest' : ' — history'}\n\n` +
    `- **ID / time:** ${md(result.id)} / ${md(result.recordedAt)}\n- **Outcome:** ${md(STATUS_LABELS[statusOf(result)])}\n- **Reason:** ${md(result.reason || 'Not recorded')}\n` +
    Object.entries(environment(result.environment)).map(([field, value]) => `- **${md(field)}:** ${md(value || 'Not recorded')}`).join('\n') +
    `\n- **Metrics:** durationMs=${md(result.metrics?.durationMs ?? 'not recorded')}; turns=${md(result.metrics?.turns ?? 'not recorded')}; approvals=${md(result.metrics?.approvals ?? 'not recorded')}\n\n**Observed:** ${md(result.observed || 'No observation recorded.')}\n\n` +
    `| Check | Expected | Outcome | Observed | Evidence |\n| --- | --- | --- | --- | --- |\n` + expected.map(item => {
      const check = checks.get(item.id);
      return `| ${md(item.id)} | ${md(item.description)} | ${md(STATUS_LABELS[check?.status || 'not_run'])} | ${md(check?.observed || 'No observation recorded.')} | ${evidenceMarkdown(result, check?.evidence || [], linkEvidence)} |`;
    }).join('\n') + `\n\n**Declared redacted evidence:** ${evidenceMarkdown(result, null, linkEvidence)}\n`;
}

/** Render a CI-readable artifact without treating infrastructure availability as client success. */
export function renderMarkdown(run, baseline = null) {
  const model = reportModel(run, baseline);
  const output = ['# Connect evaluation', WARNING, markdownProvenance(run, 'Current candidate')];
  if (baseline) output.push(markdownProvenance(baseline, 'Baseline candidate'));
  output.push('## Latest-attempt coverage\n\nCounts describe scenario/variant cells, not certified platforms. Baseline-only coverage is excluded from current totals.');
  for (const isInfrastructure of [false, true]) {
    output.push(`### ${isInfrastructure ? 'Public infrastructure probes' : 'Native/client scenarios'}\n\n${Object.entries(counts(model, isInfrastructure)).map(([status, count]) => `${STATUS_LABELS[status]}: ${count}`).join(' · ')}`);
  }
  output.push('## Baseline differences');
  if (!baseline) output.push('No baseline supplied. No previous passes or regressions are inferred.');
  else if (!model.changes.length) output.push('No outcome, context, or coverage differences found in compared cells.');
  else output.push('| Platform / variant | Scenario | Before | After | Classification | Explanation |\n| --- | --- | --- | --- | --- | --- |\n' + model.changes.map(change => `| ${md(change.platform)} / ${md(change.variant)} | ${md(change.scenario)} | ${md(STATUS_LABELS[change.before])} | ${md(STATUS_LABELS[change.after])} | ${md(change.kind)} | ${md(change.detail)} |`).join('\n'));
  output.push('## Coverage matrix\n\nLast appended attempt wins, not the best attempt. N/A means explicitly excluded by scenario applicability, never an unknown capability.');
  output.push(`| Scenario / stage | ${model.columns.map(column => `${md(column.platform.title)} / ${md(column.variant)}${infrastructure(column.platform) ? ' (infrastructure)' : ' (client)'}${column.removed ? ' — coverage lost' : ''}`).join(' | ')} |\n| --- | ${model.columns.map(() => '---').join(' | ')} |\n` + model.rows.map(row => `| ${md(row.scenario.id)} — ${md(row.scenario.title)} / ${md(row.scenario.category)}${row.removed ? ' (removed)' : ''} | ${row.cells.map(cell => md(statusLabel(cell))).join(' | ')} |`).join('\n'));
  output.push('## Client surfaces');
  for (const platform of new Map(model.columns.map(column => [column.platform.id, column.platform])).values()) {
    output.push(`### ${md(platform.title)} (${md(platform.id)})\n\n- **Surface:** ${md(platform.surface)}\n- **Route:** ${md(platform.route)}\n- **Capability documentation:** ${md(platform.capability)}\n- **Notes:** ${md(platform.notes)}\n- **Sources:** ${(platform.sources || []).map(md).join('; ')}`);
  }
  output.push('## Scenario details and attempts\n\nEvidence links are relative to the current run directory. Preserve the artifact layout. Baseline evidence must be opened from the baseline run directory.');
  for (const row of model.rows) {
    const scenario = row.scenario;
    output.push(`### ${md(scenario.id)} — ${md(scenario.title)}${row.removed ? ' (removed)' : ''}\n\n**Stage/category:** ${md(scenario.category)}; **Tier:** ${md(scenario.tier)}; **Controlled:** ${scenario.controlled ? 'authorized safe staging required' : 'no'}.\n\n**Prompt:** ${md(scenario.prompt)}\n\n**Preconditions:**\n${(scenario.preconditions || []).map(item => `- ${md(item)}`).join('\n') || 'None specified.'}\n\n**Steps:**\n${(scenario.steps || []).map((item, index) => `${index + 1}. ${md(item)}`).join('\n') || 'None specified.'}\n\n**Expected checks:**\n${(scenario.checks || []).map(check => `- ${md(check.id)}: ${md(check.description)}`).join('\n') || 'None specified.'}\n\n**Sources:** ${(scenario.sources || []).map(md).join('; ')}`);
    for (const cell of row.cells) {
      output.push(`#### ${md(cell.column.platform.title)} / ${md(cell.column.variant)} — ${md(statusLabel(cell))}${cell.change ? `\n\n**${md(cell.change.kind)}:** ${md(cell.change.detail)}` : ''}`);
      if (!cell.attempts.length) output.push(cell.status === 'not_applicable' ? 'Explicitly outside scenario applicability.' : 'No current execution recorded; no outcome inferred.');
      for (let index = cell.attempts.length - 1; index >= 0; index--) output.push(attemptMarkdown(cell.attempts[index], scenario, index + 1, cell.attempts.length));
      if (cell.previousAttempts.length) {
        output.push('**Baseline attempt history — not current success:**');
        const oldScenario = resolveScenarioInstructions(baseline, baseline.catalog.scenarios.find(item => item.id === scenario.id) || scenario);
        for (let index = cell.previousAttempts.length - 1; index >= 0; index--) output.push(attemptMarkdown(cell.previousAttempts[index], oldScenario, index + 1, cell.previousAttempts.length, false));
      }
    }
  }
  return `${output.join('\n\n')}\n`;
}
