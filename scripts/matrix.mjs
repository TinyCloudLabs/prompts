// Projects reviewed QA rows into the public, static /matrix page.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export const NOT_MEASURED = "not measured yet";
export const TITLE = "How many steps each TinyCloud skill asks of you";
export const INTRO =
  "Each row counts what you do when an agent sets up or uses a TinyCloud skill: OpenKey approvals, codes pasted, choices and codes typed. We measure a new agent, a returning agent whose access still works, and a returning agent whose access has to be renewed. Those four counts may not be everything; the total appears only when every step in the run was recorded. An unmeasured cell says \"not measured yet\".";
const OWNER_COUNTS = [
  ["approvals", "OpenKey approvals"],
  ["pastes", "Codes pasted"],
  ["choices", "Choices"],
  ["codesTyped", "Codes typed"],
];
const ADDITIONAL_ACTIONS = [
  ["consentNavigation", "Consent navigation"],
  ["advanced", "Advanced"],
];
const PUBLIC_RUN_KEYS = new Set([
  "skill", "basicFlow", "variant", "returningMode", "enrollment", "utcDate", "skillVersion", "cliVersion",
  "runRef", "verdict", "ownerInteractions", "namedSubtotal", "actionLedgerComplete", "ownerActionTotal",
  "additionalActionCounts", "agentTurns",
]);
const LEGACY_ACTION_KINDS = new Set(["approval", "openkeyapproval", "paste", "pastes", "choice", "choices", "codetyped"]);

const count = (value, label) => {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer or null`);
  return value;
};
const safeLabel = (value, label) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9 _-]{0,39}$/.test(value)) throw new Error(`${label} must be a short, safe label or null`);
  return value;
};
const validVersion = (value, label) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9.+-]{0,79}$/.test(value)) throw new Error(`${label} must be a version string`);
  return value;
};
const validDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
    throw new Error("utcDate must be a valid YYYY-MM-DD date");
  return value;
};
const safeRunRef = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value) ? value : null;
const BUG_REPORT_KEYS = new Set(["skill", "basicFlow", "source", "count"]);
const validBugCount = (value) => count(value, "bug report count");
const normalizedKind = (value) => value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
const publicActionKind = (value) => {
  const kind = normalizedKind(value);
  return kind === "consentnavigation" ? "consentNavigation" : kind === "advanced" ? "advanced" : value;
};
const actionKindLabel = (value) => ({ consentNavigation: "Consent navigation", advanced: "Advanced" })[value] ?? value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());

// The full event ledger stays with QA. This allowlisted projection excludes its
// paths, notes, timestamps, URLs, and event identifiers from the public page.
export function projectRun(row, ledger = null) {
  if (!row || typeof row !== "object") throw new Error("QA row must be an object");
  const skill = safeLabel(row.skill, "skill");
  const basicFlow = safeLabel(row.basicFlow, "basicFlow");
  if (!skill || !basicFlow) throw new Error("QA row needs skill and basicFlow");
  if (!["freshAgent", "returningAgent"].includes(row.variant)) throw new Error("variant must be freshAgent or returningAgent");
  const returningMode = row.returningMode ?? null;
  if (row.variant === "returningAgent" && !["ordinaryReuse", "forcedRenewal"].includes(returningMode))
    throw new Error("returningAgent needs an ordinaryReuse or forcedRenewal qualifier");
  if (row.variant === "freshAgent" && returningMode !== null) throw new Error("freshAgent cannot have a returningMode");
  if (!["PASS", "FAIL"].includes(row.verdict)) throw new Error("verdict must be PASS or FAIL");

  const ownerInteractions = Object.fromEntries(OWNER_COUNTS.map(([key]) => [key, count(row[key], key)]));
  const values = Object.values(ownerInteractions);
  const namedSubtotal = values.every(Number.isInteger) ? values.reduce((sum, value) => sum + value, 0) : null;
  if (ledger !== null && (!ledger || typeof ledger !== "object" || Array.isArray(ledger))) throw new Error("owner action ledger must be an object or null");
  if (ledger?.complete !== undefined && typeof ledger.complete !== "boolean") throw new Error("owner action ledger completeness must be boolean");
  const actionLedgerComplete = ledger?.complete === true;
  if (actionLedgerComplete && !Array.isArray(ledger.actions)) throw new Error("owner action ledger actions must be an array");
  const actions = Array.isArray(ledger?.actions) ? ledger.actions : [];
  const uniqueActions = new Map();
  for (const action of actions) {
    if (!action || typeof action !== "object" || typeof action.id !== "string" || !action.id || typeof action.kind !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(action.kind))
      throw new Error("owner action ledger entries need an id and safe kind");
    const previous = uniqueActions.get(action.id);
    if (previous && previous !== action.kind) throw new Error(`owner action ${action.id} has conflicting kinds`);
    uniqueActions.set(action.id, action.kind);
  }
  const ownerActionTotal = actionLedgerComplete ? uniqueActions.size : null;
  const additionalActionCounts = Object.fromEntries(ADDITIONAL_ACTIONS.map(([kind]) => [kind, actionLedgerComplete ? 0 : null]));
  if (actionLedgerComplete) {
    for (const kind of uniqueActions.values()) {
      if (LEGACY_ACTION_KINDS.has(normalizedKind(kind))) continue;
      const publicKind = publicActionKind(kind);
      additionalActionCounts[publicKind] = (additionalActionCounts[publicKind] ?? 0) + 1;
    }
  }

  return {
    skill,
    basicFlow,
    variant: row.variant,
    returningMode,
    enrollment: safeLabel(row.enrollment, "enrollment"),
    utcDate: validDate(row.utcDate),
    skillVersion: validVersion(row.skillVersion, "skillVersion"),
    cliVersion: validVersion(row.cliVersion, "cliVersion"),
    runRef: safeRunRef(row.runRef),
    verdict: row.verdict,
    ownerInteractions,
    namedSubtotal,
    actionLedgerComplete,
    ownerActionTotal,
    additionalActionCounts,
    agentTurns: count(row.agentTurns, "agentTurns"),
  };
}

const normalizePublicRun = (run) => {
  if (!run || typeof run !== "object" || Array.isArray(run)) throw new Error("public matrix run must be an object");
  const extra = Object.keys(run).filter((key) => !PUBLIC_RUN_KEYS.has(key));
  if (extra.length) throw new Error(`public matrix run contains private or unknown fields: ${extra.join(", ")}`);
  const required = [
    "skill", "basicFlow", "variant", "returningMode", "enrollment", "utcDate", "skillVersion", "cliVersion",
    "runRef", "verdict", "ownerInteractions", "namedSubtotal", "actionLedgerComplete", "ownerActionTotal",
    "additionalActionCounts", "agentTurns",
  ];
  const missing = required.filter((key) => !Object.hasOwn(run, key));
  if (missing.length) throw new Error(`public matrix run is missing required fields: ${missing.join(", ")}`);
  const skill = safeLabel(run.skill, "skill");
  const basicFlow = safeLabel(run.basicFlow, "basicFlow");
  if (!skill || !basicFlow) throw new Error("public matrix run needs skill and basicFlow");
  if (!["freshAgent", "returningAgent"].includes(run.variant)) throw new Error("public matrix run variant is invalid");
  if (run.variant === "returningAgent" && !["ordinaryReuse", "forcedRenewal"].includes(run.returningMode))
    throw new Error("public returning-agent run needs a reuse or renewal qualifier");
  if (run.variant === "freshAgent" && run.returningMode !== null) throw new Error("public fresh-agent run cannot have a returningMode");
  if (!["PASS", "FAIL"].includes(run.verdict)) throw new Error("public matrix run verdict is invalid");
  if (run.runRef !== null && !safeRunRef(run.runRef)) throw new Error("public matrix runRef is unsafe");
  if (!run.ownerInteractions || typeof run.ownerInteractions !== "object" || Array.isArray(run.ownerInteractions))
    throw new Error("public owner interaction counts must be an object");
  const interactionKeys = new Set(OWNER_COUNTS.map(([key]) => key));
  const unknownCounts = Object.keys(run.ownerInteractions).filter((key) => !interactionKeys.has(key));
  const missingCounts = [...interactionKeys].filter((key) => !Object.hasOwn(run.ownerInteractions, key));
  if (unknownCounts.length || missingCounts.length)
    throw new Error(`public owner interaction counts have invalid fields: ${[...unknownCounts, ...missingCounts].join(", ")}`);

  const ownerInteractions = Object.fromEntries(OWNER_COUNTS.map(([key]) => [key, count(run.ownerInteractions[key], key)]));
  const values = Object.values(ownerInteractions);
  const namedSubtotal = values.every(Number.isInteger) ? values.reduce((sum, value) => sum + value, 0) : null;
  if (run.namedSubtotal !== namedSubtotal) throw new Error("public matrix run subtotal does not match its four counts");
  if (typeof run.actionLedgerComplete !== "boolean") throw new Error("public action ledger completeness must be boolean");
  if (!run.additionalActionCounts || typeof run.additionalActionCounts !== "object" || Array.isArray(run.additionalActionCounts))
    throw new Error("public additional-action counts must be an object");
  const additionalActionCounts = Object.fromEntries(Object.entries(run.additionalActionCounts).map(([kind, value]) => {
    if (!safeLabel(kind, "action kind")) throw new Error("public action kind is required");
    return [kind, count(value, kind)];
  }));
  for (const [kind] of ADDITIONAL_ACTIONS) {
    if (!(kind in additionalActionCounts)) throw new Error(`public action counts are missing ${kind}`);
  }
  const ownerActionTotal = run.actionLedgerComplete ? count(run.ownerActionTotal, "ownerActionTotal") : null;
  if (run.actionLedgerComplete && ownerActionTotal === null) throw new Error("complete ledger needs an owner-action total");
  if (run.actionLedgerComplete && Object.values(additionalActionCounts).some((value) => !Number.isInteger(value)))
    throw new Error("complete ledger needs action-kind counts");
  const additionalTotal = Object.values(additionalActionCounts).reduce((sum, value) => sum + value, 0);
  const measuredOwnerCount = values.reduce((sum, value) => sum + (Number.isInteger(value) ? value : 0), 0);
  if (run.actionLedgerComplete && ownerActionTotal < measuredOwnerCount + additionalTotal)
    throw new Error("complete ledger total is smaller than the reported action counts");
  if (!run.actionLedgerComplete && run.ownerActionTotal !== null) throw new Error("incomplete ledger cannot publish an owner-action total");
  if (!run.actionLedgerComplete && Object.values(additionalActionCounts).some((value) => value !== null))
    throw new Error("incomplete ledger cannot publish action-kind counts");

  return {
    skill,
    basicFlow,
    variant: run.variant,
    returningMode: run.returningMode ?? null,
    enrollment: safeLabel(run.enrollment, "enrollment"),
    utcDate: validDate(run.utcDate),
    skillVersion: validVersion(run.skillVersion, "skillVersion"),
    cliVersion: validVersion(run.cliVersion, "cliVersion"),
    runRef: run.runRef ?? null,
    verdict: run.verdict,
    ownerInteractions,
    namedSubtotal,
    actionLedgerComplete: run.actionLedgerComplete,
    ownerActionTotal,
    additionalActionCounts,
    agentTurns: count(run.agentTurns, "agentTurns"),
  };
};

export const cellModel = (run) => {
  const ownerInteractions = Object.fromEntries(OWNER_COUNTS.map(([key]) => [key, count(run?.ownerInteractions?.[key], key)]));
  const values = Object.values(ownerInteractions);
  const subtotalValid = values.every(Number.isInteger) && Number.isInteger(run?.namedSubtotal) && run.namedSubtotal >= 0;
  const ownerActionTotal = run?.actionLedgerComplete === true ? count(run.ownerActionTotal, "ownerActionTotal") : null;
  const additionalActionCounts = Object.fromEntries(ADDITIONAL_ACTIONS.map(([key]) => [
    key,
    run?.actionLedgerComplete === true ? count(run?.additionalActionCounts?.[key], key) : null,
  ]));
  if (run?.actionLedgerComplete === true && run.additionalActionCounts && typeof run.additionalActionCounts === "object") {
    for (const [kind, value] of Object.entries(run.additionalActionCounts)) {
      if (!(kind in additionalActionCounts)) additionalActionCounts[kind] = count(value, kind);
    }
  }
  return {
    ownerInteractions,
    namedSubtotal: subtotalValid ? run.namedSubtotal : null,
    actionLedgerComplete: run?.actionLedgerComplete === true,
    ownerActionTotal,
    additionalActionCounts,
    agentTurns: count(run?.agentTurns, "agentTurns"),
  };
};

const countText = (value) => Number.isInteger(value) && value >= 0 ? String(value) : NOT_MEASURED;
const renderRun = (run) => {
  const model = cellModel(run);
  const counts = OWNER_COUNTS.map(([key, label]) => `<div><dt>${label}</dt><dd>${countText(model.ownerInteractions[key])}</dd></div>`).join("");
  const additional = Object.entries(model.additionalActionCounts)
    .map(([kind, value]) => `<div><dt>${esc(actionKindLabel(kind))}</dt><dd>${countText(value)}</dd></div>`)
    .join("");
  const enrollment = run.enrollment === null ? NOT_MEASURED : esc(run.enrollment);
  const runRef = run.runRef ? ` · Run ${esc(run.runRef)}` : "";
  return `<section class="measurement">
        <p class="result">${esc(run.verdict)}</p>
        <p class="qualifier">Enrollment qualifier: ${enrollment}</p>
        <dl>${counts}<div><dt>Subtotal of the four above</dt><dd>${countText(model.namedSubtotal)}</dd></div>${additional}<div><dt>All your steps</dt><dd>${countText(model.ownerActionTotal)}</dd></div></dl>
        <small>${model.agentTurns === null ? NOT_MEASURED : `${model.agentTurns} agent turn${model.agentTurns === 1 ? "" : "s"}`} · ${esc(run.utcDate)} · CLI ${esc(run.cliVersion)} · skill ${esc(run.skillVersion)}${runRef}</small>
      </section>`;
};
const cell = (label, runs) => `<td data-label="${esc(label)}">${runs.length ? runs.map(renderRun).join("") : `<span class="none">${NOT_MEASURED}</span>`}</td>`;
const renderBugReports = (count) => `<small class="bugs">${count == null ? "Bug reports: not reported" : `Bug reports: ${count}`}</small>`;
const runsFor = (flow, variant, returningMode = null) => (flow.runs ?? []).filter((run) => run.variant === variant && (variant !== "returningAgent" || run.returningMode === returningMode));

export function prepareMatrixData(catalogSkills, legacyData, publicData) {
  if (!Array.isArray(catalogSkills) || !Array.isArray(legacyData?.skills) || !Array.isArray(publicData?.skills) || !Array.isArray(publicData?.runs))
    throw new Error("matrix inputs must contain skill and run arrays");
  const bugReports = publicData.bugReports ?? [];
  if (!Array.isArray(bugReports)) throw new Error("bug reports must be an array");
  const configByAlias = new Map();
  for (const config of publicData.skills) {
    if (!config || typeof config.alias !== "string" || configByAlias.has(config.alias) || !(config.source === null || typeof config.source === "string"))
      throw new Error("matrix skill aliases must be unique and have an optional legacy source");
    configByAlias.set(config.alias, config);
  }
  const catalogByAlias = new Map();
  for (const skill of catalogSkills) {
    if (!skill || typeof skill.short !== "string" || catalogByAlias.has(skill.short)) throw new Error("published skill aliases must be unique");
    catalogByAlias.set(skill.short, skill);
  }
  if (configByAlias.size !== catalogByAlias.size || [...catalogByAlias.keys()].some((alias) => !configByAlias.has(alias)))
    throw new Error("matrix aliases do not match the current published skill catalog");
  const legacyByName = new Map(legacyData.skills.map((skill) => [skill.name, skill]));
  const groups = [];
  const flowForRow = new Map();
  for (const skill of catalogSkills) {
    const config = configByAlias.get(skill.short);
    const legacy = config.source === null ? null : legacyByName.get(config.source);
    const flows = (legacy?.flows ?? []).map(({ id, task, caption }) => ({ id, task, ...(caption ? { caption } : {}), runs: [], bugReports: null }));
    for (const flow of flows) {
      const key = `${skill.name}\0${flow.id}`;
      flowForRow.set(key, flow);
      if (flow.task !== flow.id) flowForRow.set(`${skill.name}\0${flow.task}`, flow);
    }
    groups.push({
      name: skill.name,
      alias: skill.short,
      version: skill.version,
      blurb: legacy?.blurb ?? skill.desc ?? "",
      guideURL: `/skills/${skill.short}/SKILL.md`,
      flows,
    });
  }
  const bugReportsByFlow = new Map();
  for (const report of bugReports) {
    if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error("bug report metadata must be an object");
    const extra = Object.keys(report).filter((key) => !BUG_REPORT_KEYS.has(key));
    if (extra.length) throw new Error(`bug report metadata contains unknown fields: ${extra.join(", ")}`);
    if (report.source !== "Linear") throw new Error("bug report source must be Linear");
    const bugCount = validBugCount(report.count);
    if (bugCount === null) throw new Error("bug report count must be an integer");
    const group = groups.find((candidate) => candidate.name === report.skill || candidate.alias === report.skill);
    const flow = group && flowForRow.get(`${group.name}\0${report.basicFlow}`);
    if (!group || !flow) continue;
    const key = `${group.name}\0${flow.id}`;
    bugReportsByFlow.set(key, (bugReportsByFlow.get(key) ?? 0) + bugCount);
  }
  for (const group of groups) {
    for (const flow of group.flows) {
      const key = `${group.name}\0${flow.id}`;
      if (bugReportsByFlow.has(key)) flow.bugReports = bugReportsByFlow.get(key);
    }
  }
  const matched = new Set();
  for (const run of publicData.runs) {
    const group = groups.find((candidate) => candidate.name === run?.skill || candidate.alias === run?.skill);
    const flow = group && flowForRow.get(`${group.name}\0${run?.basicFlow}`);
    if (!group || !flow) throw new Error(`unmapped matrix run ${run?.skill}/${run?.basicFlow}`);
    const publicRun = normalizePublicRun(run);
    if (!matched.has(run)) {
      flow.runs.push(publicRun);
      matched.add(run);
    }
  }
  return { skills: groups };
}

export function renderMatrix(data, style = "", base = "") {
  const groups = data.skills.map((skill) => `      <tbody>
        <tr class="group"><th scope="rowgroup" colspan="5"><code>${esc(skill.name)}</code><span class="alias">/${esc(skill.alias)}</span><span class="version">Skill ${esc(skill.version)}</span><span class="blurb">${esc(skill.blurb)}</span></th></tr>
${skill.flows.map((flow) => {
  const fresh = runsFor(flow, "freshAgent");
  const ordinary = runsFor(flow, "returningAgent", "ordinaryReuse");
  const forced = runsFor(flow, "returningAgent", "forcedRenewal");
  return `        <tr><td class="sk"><a href="${esc(skill.guideURL)}">/${esc(skill.alias)}</a></td><th scope="row">${esc(flow.task)}${flow.caption ? `<small class="cap">${esc(flow.caption)}</small>` : ""}${renderBugReports(flow.bugReports)}</th>${cell("New agent", fresh)}${cell("Returning agent, access still valid", ordinary)}${cell("Returning agent, access renewed", forced)}</tr>`;
}).join("\n")}
      </tbody>`).join("\n");
  const canonical = base ? `  <link rel="canonical" href="${esc(`${base.replace(/\/$/, "")}/matrix`)}">\n` : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(TITLE)} · TinyCloud</title>
  <meta name="description" content="${esc(TITLE)}">
${canonical}${style}
  <style>
    body { max-width: 60rem; }
    table { border-collapse: collapse; width: 100%; }
    thead th { text-align: left; border-bottom: 2px solid #ccc; padding: 0.4rem 0.5rem; }
    tbody th, tbody td { text-align: left; padding: 0.5rem; border-top: 1px solid #eee; vertical-align: top; font-weight: normal; }
    tr.group th { background: #f6f6f6; border-top: 2px solid #ccc; padding-top: 0.75rem; }
    .alias, .version { margin-left: 0.55rem; color: #555; font-size: 0.85rem; }
    .blurb { display: block; color: #555; margin-top: 0.15rem; }
    tbody th[scope="row"] { font-weight: 600; }
    td.sk { font-size: 0.85rem; }
    .none { color: #777; }
    .measurement + .measurement { border-top: 1px solid #ddd; margin-top: 0.6rem; padding-top: 0.6rem; }
    .measurement p { margin: 0.15rem 0; }
    .measurement .result { font-weight: 700; }
    .measurement .qualifier { color: #555; }
    .measurement dl { display: grid; grid-template-columns: minmax(7rem, 1fr) auto; gap: 0.05rem 0.5rem; margin: 0.4rem 0; font-size: 0.88rem; }
    .measurement dt, .measurement dd { margin: 0; }
    .measurement dd { text-align: right; font-variant-numeric: tabular-nums; }
    small.cap { font-weight: normal; }
    small { display: block; color: #666; font-size: 0.78rem; overflow-wrap: anywhere; }
    @media (max-width: 767px) {
      body { margin: 1.25rem auto; padding: 0 0.75rem; }
      thead { position: absolute; left: -9999px; }
      table, tbody, tr, th, td { display: block; }
      tbody { border: 1px solid #ddd; border-radius: 6px; padding: 0.25rem 0.75rem 0.75rem; margin: 1.25rem 0; }
      tr.group th { background: none; border-top: 0; padding: 0.5rem 0 0.25rem; }
      tbody tr:not(.group) { border-top: 1px solid #eee; padding: 0.5rem 0; }
      tbody th, tbody td { border: 0; padding: 0.1rem 0; }
      td[data-label]::before { content: attr(data-label) ": "; color: #555; font-weight: 600; }
      td.sk { display: none; }
    }
  </style>
</head>
<body>
  <main>
    <h1>${esc(TITLE)}</h1>
    <p>${INTRO}</p>
    <table>
      <thead><tr><th scope="col">Skill</th><th scope="col">Basic flow</th><th scope="col">New agent</th><th scope="col">Returning agent, access still valid</th><th scope="col">Returning agent, access renewed</th></tr></thead>
${groups}
    </table>
  </main>
  <footer><a href="/">All guides and skills</a></footer>
</body>
</html>
`;
}
