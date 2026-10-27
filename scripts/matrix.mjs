// Renders matrix/interactions.json as the static /matrix page: one table per skill, its tasks as rows and
// the agents with a measured number as columns.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const NOT_MEASURED = "not measured yet";
export const TITLE = "How many steps each skill asks of you";
// A flow's own fresh/returning cells: measured before runs recorded the agent.
export const ANY_AGENT = "Any agent";
export const INTRO = [
  "When your AI agent uses a TinyCloud skill, it sometimes needs you. You approve something in OpenKey, paste or type a code, or answer a yes-or-no question. Each of those counts as one step here.",
  "Each skill has a table. Each row is a task, and each column is an agent we have measured. A <strong>new agent</strong> is one using the skill for the first time on your computer. A <strong>returning agent</strong> has used it before and still has a valid sign-in; it gets its own rows once we measure one. The \"Any agent\" column is from an earlier test run that did not record which agent it used.",
  "The table shows how many steps each task took in our latest test runs. Counts marked \"scripted owner\" come from a test run in which a script does each step a person would do. A person re-checks the main tasks.",
  "Times come from the same scripted runs. There, a script approves in OpenKey and hands the agent OpenKey's long code, which the agent copies out in full. You would paste a short code instead, so your time after the OpenKey link can differ.",
];

const PARTS = [
  ["openkey_approvals", "OpenKey approvals"],
  ["pastes", "codes pasted"],
  ["codes_typed", "codes typed"],
  ["choices", "answers"],
];

export const OWNER_KINDS = { scripted: "scripted owner", human: "human owner" };
const needsRefs = (v, what) => {
  if (!v.measured_on || !v.run_ref) throw new Error(`a measured ${what} needs measured_on and run_ref (run_ref ${v.run_ref ?? "missing"})`);
  if (!Object.hasOwn(OWNER_KINDS, v.owner_kind)) throw new Error(`a measured ${what} needs owner_kind "scripted" or "human" (run_ref ${v.run_ref})`);
};

// A cell shows its total only with a fully observed breakdown; otherwise it shows nothing but "not measured yet".
export const cellModel = (v) => {
  const oi = v?.owner_interactions;
  if (!oi || !Number.isInteger(oi.total) || !PARTS.every(([k]) => Number.isInteger(oi[k]))) return { total: null, parts: [] };
  needsRefs(v, "cell");
  const parts = PARTS.map(([k, name]) => `${name} ${oi[k]}`);
  parts.push(OWNER_KINDS[v.owner_kind]);
  if (Number.isInteger(v.agent_turns) && v.agent_turns >= 0) parts.push(`${v.agent_turns} agent turn${v.agent_turns === 1 ? "" : "s"}`);
  return { total: oi.total, parts };
};

export const formatTime = (s) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`);

// The "Time to done" row: a cell's run time (timing.total_s), with the time to the first OpenKey link.
export const timeModel = (v) => {
  const t = v?.timing;
  if (!t || !Number.isInteger(t.total_s)) return { total: null, parts: [] };
  needsRefs(v, "time");
  const parts = [];
  if (Number.isInteger(t.time_to_approval_s)) parts.push(`OpenKey link at ${formatTime(t.time_to_approval_s)}`);
  if (Number.isInteger(v.runs) && v.runs > 1) parts.push(`median of ${v.runs} runs`);
  parts.push(OWNER_KINDS[v.owner_kind]);
  return { total: formatTime(t.total_s), parts };
};

const shown = (m) => m.total !== null;
const td = (label, m) =>
  `<td data-label="${esc(label)}">${shown(m) ? `<span class="n">${esc(m.total)}</span><small>${esc(m.parts.join(" · "))}</small>` : `<span class="none">${NOT_MEASURED}</span>`}</td>`;

const agentList = (data) => {
  const agents = data.agents ?? [];
  const ids = new Set(agents.map((a) => a.id));
  for (const s of data.skills) {
    for (const f of s.flows) {
      for (const id of Object.keys(f.by_agent ?? {})) if (!ids.has(id)) throw new Error(`${s.name}/${f.id}: by_agent has "${id}", which is not in agents`);
    }
    if (s.time_to_done && !s.flows.some((f) => f.id === s.time_to_done.flow)) throw new Error(`${s.name}: time_to_done names flow "${s.time_to_done.flow}", which it does not have`);
  }
  return agents;
};

const timeFlow = (skill) => (skill.time_to_done ? skill.flows.find((f) => f.id === skill.time_to_done.flow) : null);

// Columns: each agent with at least one number or time in this skill, then "Any agent" when its cells have a
// number (or when no agent has one, so the table still lists the tasks).
export const columnsFor = (skill, agents) => {
  const tf = timeFlow(skill);
  const cols = agents
    .filter((a) => skill.flows.some((f) => ["fresh", "returning"].some((w) => shown(cellModel(f.by_agent?.[a.id]?.[w])))) || (tf && shown(timeModel(tf.by_agent?.[a.id]?.fresh))))
    .map((a) => ({ id: a.id, name: a.name, cell: (f, w) => f.by_agent?.[a.id]?.[w] ?? null }));
  if (!cols.length || skill.flows.some((f) => ["fresh", "returning"].some((w) => shown(cellModel(f[w]))))) cols.push({ id: null, name: ANY_AGENT, cell: (f, w) => f[w] ?? null });
  return cols;
};

// Newest measured date among cells that show a number or a time, with the CLI and skill versions of those cells.
export const footerLines = (skill) => {
  const cells = skill.flows.flatMap((f) => [f.fresh, f.returning, ...Object.values(f.by_agent ?? {}).flatMap((a) => [a?.fresh, a?.returning])]);
  const measured = cells.filter((v) => v?.measured_on && (shown(cellModel(v)) || shown(timeModel(v))));
  if (!measured.length) return [];
  const date = measured.map((v) => v.measured_on).sort().at(-1);
  const list = (key) => [...new Set(measured.flatMap((v) => String(v[key] ?? "unknown").split(/\s*[,;]\s*/)))].sort().join(", ");
  return [`Last measured ${date}, CLI ${list("cli_version")}, skill ${list("skill_version")}.`];
};

const header = (label, caption) => `<th scope="row">${esc(label)}${caption ? `<small class="cap">${esc(caption)}</small>` : ""}</th>`;

function skillTable(skill, agents) {
  const cols = columnsFor(skill, agents);
  const rows = [];
  for (const f of skill.flows) {
    rows.push(`        <tr>${header(f.task, f.caption)}${cols.map((c) => td(c.name, cellModel(c.cell(f, "fresh")))).join("")}</tr>`);
    if (cols.some((c) => shown(cellModel(c.cell(f, "returning"))))) rows.push(`        <tr>${header(`${f.task}, returning agent`)}${cols.map((c) => td(c.name, cellModel(c.cell(f, "returning")))).join("")}</tr>`);
  }
  const tf = timeFlow(skill);
  if (tf) rows.push(`        <tr class="time">${header("Time to done", skill.time_to_done.caption)}${cols.map((c) => td(c.name, timeModel(c.cell(tf, "fresh")))).join("")}</tr>`);
  const foot = footerLines(skill);
  const missing = agents.filter((a) => !cols.some((c) => c.id === a.id));
  return `    <section>
      <h2><code>${esc(skill.name)}</code><span class="blurb">${esc(skill.blurb)}</span></h2>
      <div class="wide"><table>
        <thead><tr><th scope="col">Task</th>${cols.map((c) => `<th scope="col">${esc(c.name)}</th>`).join("")}</tr></thead>
        <tbody>
${rows.join("\n")}
        </tbody>
      </table></div>
${foot.length ? `      <p class="foot">${foot.map(esc).join("<br>")}</p>\n` : ""}${missing.length ? `      <p class="untested">${missing.length === agents.length ? "Not measured yet for any agent." : `Not measured yet: ${esc(missing.map((a) => a.name).join(", "))}.`}</p>\n` : ""}    </section>`;
}

export function renderMatrix(data, style = "") {
  const agents = agentList(data);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(TITLE)} · TinyCloud</title>
  <meta name="description" content="${esc(TITLE)}">
${style}
  <style>
    body { max-width: 60rem; }
    section { margin-top: 2rem; }
    h2 { font-size: 1.15rem; margin-bottom: 0.5rem; }
    .blurb { display: block; color: #555; font-size: 1rem; font-weight: normal; margin-top: 0.15rem; }
    .wide { overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; }
    thead th { text-align: left; border-bottom: 2px solid #ccc; padding: 0.4rem 0.5rem; }
    tbody th, tbody td { text-align: left; padding: 0.5rem; border-top: 1px solid #eee; vertical-align: top; font-weight: normal; }
    tbody th[scope="row"] { font-weight: 600; width: 30%; }
    tr.time th, tr.time td { border-top: 2px solid #ccc; }
    .none { color: #777; }
    small.cap { font-weight: normal; }
    small { display: block; color: #666; font-size: 0.78rem; }
    p.foot, p.untested { color: #555; font-size: 0.85rem; margin: 0.5rem 0 0; }
    @media (max-width: 767px) {
      body { margin: 1.25rem auto; padding: 0 0.75rem; }
      section { border: 1px solid #ddd; border-radius: 6px; padding: 0.5rem 0.75rem 0.75rem; margin: 1.25rem 0; }
      h2 { margin-top: 0.25rem; }
      .wide { overflow-x: visible; }
      thead { position: absolute; left: -9999px; }
      table, tbody, tr, th, td { display: block; }
      tbody tr { border-top: 1px solid #eee; padding: 0.5rem 0; }
      tbody th, tbody td, tr.time th, tr.time td { border: 0; padding: 0.1rem 0; }
      tbody tr.time { border-top: 2px solid #ccc; }
      tbody th[scope="row"] { width: auto; }
      td[data-label]::before { content: attr(data-label) ": "; color: #555; }
      td[data-label] small { margin-left: 0.2rem; }
    }
  </style>
</head>
<body>
  <main>
    <h1>${esc(TITLE)}</h1>
${INTRO.map((p) => `    <p>${p}</p>`).join("\n")}
${data.skills.map((s) => skillTable(s, agents)).join("\n")}
  </main>
  <footer><a href="/">All guides and skills</a></footer>
</body>
</html>
`;
}
