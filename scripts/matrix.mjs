// Renders matrix/interactions.json as the static /matrix page.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const NOT_MEASURED = "not measured yet";
export const TITLE = "How many steps each skill asks of you";
export const INTRO =
  "When your AI agent uses a TinyCloud skill, it sometimes needs you. You approve something in OpenKey, paste a code back, or answer a yes-or-no question. Each of those counts as one step here. A <strong>new agent</strong> is one using the skill for the first time on your computer. A <strong>returning agent</strong> has used it before and still has a valid sign-in. The table shows how many steps each task took in our latest test runs.";

const PARTS = [
  ["openkey_approvals", "OpenKey approvals"],
  ["pastes", "pastes"],
  ["choices", "choices"],
  ["codes_typed", "codes typed"],
];

const cell = (label, v) => {
  const total = v?.owner_interactions?.total;
  const measured = Number.isInteger(total);
  const parts = PARTS.filter(([k]) => Number.isInteger(v?.owner_interactions?.[k]))
    .map(([k, name]) => `${name} ${v.owner_interactions[k]}`)
    .join(" · ");
  return `<div class="cell"><span class="who">${label}</span> <span class="n${measured ? "" : " none"}">${measured ? total : NOT_MEASURED}</span>${
    parts ? `<small>${esc(parts)}</small>` : ""
  }</div>`;
};

// One line per distinct (date, CLI, skill) among the skill's measured flows.
export const footerLines = (skill) => {
  const seen = new Set();
  for (const f of skill.flows) {
    for (const v of [f.fresh, f.returning]) {
      if (v?.measured_on) seen.add(`${v.measured_on}\t${v.cli_version ?? "unknown"}\t${v.skill_version ?? "unknown"}`);
    }
  }
  return [...seen].sort().reverse().map((k) => {
    const [date, cli, sk] = k.split("\t");
    return `Last measured ${date}, CLI ${cli}, skill ${sk}.`;
  });
};

export function renderMatrix(data, style = "") {
  const cards = data.skills
    .map((s) => {
      const foot = footerLines(s);
      return `    <section class="skill">
      <h2><code>${esc(s.name)}</code></h2>
      <p class="blurb">${esc(s.blurb)}</p>
      <ul class="flows">
${s.flows
  .map(
    (f) => `        <li><div class="task">${esc(f.task)}</div>${cell("New agent", f.fresh)}${cell("Returning agent", f.returning)}</li>`,
  )
  .join("\n")}
      </ul>
      <p class="foot">${foot.length ? foot.map(esc).join("<br>") : NOT_MEASURED}</p>
    </section>`;
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
    body { max-width: 40rem; }
    .skill { border: 1px solid #ddd; border-radius: 6px; padding: 0.5rem 1rem 1rem; margin: 1.25rem 0; }
    .skill h2 { margin: 0.5rem 0 0; }
    .blurb { margin: 0.1rem 0 0.5rem; color: #555; }
    ul.flows { list-style: none; padding: 0; margin: 0; }
    ul.flows li { border-top: 1px solid #eee; padding: 0.6rem 0; }
    .task { font-weight: 600; }
    .cell { margin-top: 0.15rem; }
    .who { display: inline-block; min-width: 9.5em; color: #555; }
    .n.none { color: #777; }
    small { display: block; color: #666; font-size: 0.78rem; margin-left: 0.2rem; }
    .foot { margin: 0.75rem 0 0; color: #555; font-size: 0.85rem; }
    @media (max-width: 420px) { body { margin: 1.25rem auto; padding: 0 0.75rem; } .who { display: block; min-width: 0; } .skill { padding: 0.25rem 0.75rem 0.75rem; } }
  </style>
</head>
<body>
  <main>
    <h1>${esc(TITLE)}</h1>
    <p>${INTRO}</p>
${cards}
  </main>
  <footer><a href="/">All guides and skills</a></footer>
</body>
</html>
`;
}
