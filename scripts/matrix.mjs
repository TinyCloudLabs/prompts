// Renders matrix/interactions.json as the static /matrix page.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const NOT_MEASURED = "not measured yet";
export const TITLE = "How many steps each skill asks of you";
export const INTRO =
  "When your AI agent uses a TinyCloud skill, it sometimes needs you. You approve something in OpenKey, paste or type a code, or answer a yes-or-no question. Each of those counts as one step here. A <strong>new agent</strong> is one using the skill for the first time on your computer. A <strong>returning agent</strong> has used it before and still has a valid sign-in. The table shows how many steps each task took in our latest test runs. Counts marked \"scripted owner\" come from a test run that performs the same steps a person would; a person re-checks the main flows.";

const PARTS = [
  ["openkey_approvals", "OpenKey approvals"],
  ["pastes", "codes pasted"],
  ["codes_typed", "codes typed"],
  ["choices", "answers"],
];

// A cell shows its total only with a fully observed breakdown; otherwise it shows nothing but "not measured yet".
export const OWNER_KINDS = { scripted: "scripted owner", human: "human owner" };
export const cellModel = (v) => {
  const oi = v?.owner_interactions;
  if (!oi || !Number.isInteger(oi.total) || !PARTS.every(([k]) => Number.isInteger(oi[k]))) return { total: null, parts: [] };
  if (!v.measured_on || !v.run_ref) throw new Error(`a measured cell needs measured_on and run_ref (run_ref ${v.run_ref ?? "missing"})`);
  if (!Object.hasOwn(OWNER_KINDS, v.owner_kind)) throw new Error(`a measured cell needs owner_kind "scripted" or "human" (run_ref ${v.run_ref})`);
  const parts = PARTS.map(([k, name]) => `${name} ${oi[k]}`);
  parts.push(OWNER_KINDS[v.owner_kind]);
  if (Number.isInteger(v.agent_turns) && v.agent_turns >= 0) parts.push(`${v.agent_turns} agent turn${v.agent_turns === 1 ? "" : "s"}`);
  return { total: oi.total, parts };
};

const cell = (label, v) => {
  const { total, parts } = cellModel(v);
  return `<td data-label="${label}">${
    total === null
      ? `<span class="none">${NOT_MEASURED}</span>`
      : `<span class="n">${total}</span><small>${esc(parts.join(" · "))}</small>`
  }</td>`;
};

// Newest measured date among cells that show a number, with the CLI and skill versions of those cells.
export const footerLines = (skill) => {
  const measured = skill.flows.flatMap((f) => [f.fresh, f.returning]).filter((v) => v?.measured_on && cellModel(v).total !== null);
  if (!measured.length) return [];
  const date = measured.map((v) => v.measured_on).sort().at(-1);
  const list = (key) => [...new Set(measured.map((v) => v[key] ?? "unknown"))].sort().join(", ");
  return [`Last measured ${date}, CLI ${list("cli_version")}, skill ${list("skill_version")}.`];
};

export function renderMatrix(data, style = "") {
  const groups = data.skills
    .map((s) => {
      const foot = footerLines(s);
      return `      <tbody>
        <tr class="group"><th scope="rowgroup" colspan="4"><code>${esc(s.name)}</code><span class="blurb">${esc(s.blurb)}</span></th></tr>
${s.flows.map((f) => `        <tr><td class="sk"><code>${esc(s.name)}</code></td><th scope="row">${esc(f.task)}${f.caption ? `<small class="cap">${esc(f.caption)}</small>` : ""}</th>${cell("New agent", f.fresh)}${cell("Returning agent", f.returning)}</tr>`).join("\n")}
${foot.length ? `        <tr class="foot"><td colspan="4">${foot.map(esc).join("<br>")}</td></tr>\n` : ""}
      </tbody>`;
    })
    .join("\n");
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
    table { border-collapse: collapse; width: 100%; }
    thead th { text-align: left; border-bottom: 2px solid #ccc; padding: 0.4rem 0.5rem; }
    tbody th, tbody td { text-align: left; padding: 0.5rem; border-top: 1px solid #eee; vertical-align: top; font-weight: normal; }
    tr.group th { background: #f6f6f6; border-top: 2px solid #ccc; padding-top: 0.75rem; }
    .blurb { display: block; color: #555; margin-top: 0.15rem; }
    tbody th[scope="row"] { font-weight: 600; }
    td.sk code { font-size: 0.8em; }
    .none { color: #777; }
    small.cap { font-weight: normal; }
    small { display: block; color: #666; font-size: 0.78rem; }
    tr.foot td { color: #555; font-size: 0.85rem; }
    @media (max-width: 767px) {
      body { margin: 1.25rem auto; padding: 0 0.75rem; }
      thead { position: absolute; left: -9999px; }
      table, tbody, tr, th, td { display: block; }
      tbody { border: 1px solid #ddd; border-radius: 6px; padding: 0.25rem 0.75rem 0.75rem; margin: 1.25rem 0; }
      tr.group th { background: none; border-top: 0; padding: 0.5rem 0 0.25rem; }
      tbody tr:not(.group):not(.foot) { border-top: 1px solid #eee; padding: 0.5rem 0; }
      tbody th, tbody td { border: 0; padding: 0.1rem 0; }
      td[data-label]::before { content: attr(data-label) ": "; color: #555; }
      td[data-label] small { margin-left: 0.2rem; }
      td.sk { display: none; }
      tr.foot td { padding-top: 0.6rem; }
    }
  </style>
</head>
<body>
  <main>
    <h1>${esc(TITLE)}</h1>
    <p>${INTRO}</p>
    <table>
      <thead><tr><th scope="col">Skill</th><th scope="col">Task</th><th scope="col">New agent</th><th scope="col">Returning agent</th></tr></thead>
${groups}
    </table>
  </main>
  <footer><a href="/">All guides and skills</a></footer>
</body>
</html>
`;
}
