import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMatrix, cellModel, timeModel, columnsFor, formatTime, NOT_MEASURED, ANY_AGENT } from "./matrix.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "matrix/interactions.json"), "utf8"));
const AGENT_IDS = ["chatgpt", "claude", "gemini", "grok", "perplexity", "muse", "cursor", "openclaw", "hermes", "claude-code", "codex", "opencode"];
const byAgent = (f) => Object.values(f.by_agent ?? {}).flatMap((a) => [a.fresh, a.returning]);
const variants = data.skills.flatMap((s) => s.flows.flatMap((f) => [f.fresh, f.returning, ...byAgent(f)])).filter(Boolean);
const TIMING = ["time_to_approval_s", "approver_s", "time_after_approval_s", "total_s", "link_to_done_s", "code_copy_s", "agent_tool_calls", "agent_turns"];

test("every measured variant has a date and a run reference, and counts are whole numbers", () => {
  for (const v of variants) {
    assert.match(v.measured_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(v.run_ref, "run_ref");
    if (Number.isInteger(v.owner_interactions.total)) assert.ok(["scripted", "human"].includes(v.owner_kind), "owner_kind");
    assert.ok(v.cli_version && v.skill_version, "versions");
    for (const n of [v.agent_turns, ...Object.values(v.owner_interactions)]) {
      assert.ok(n === null || (Number.isInteger(n) && n >= 0), String(n));
    }
    assert.doesNotMatch(JSON.stringify(v), /\/home\/|~\/|@[a-z0-9-]+\.[a-z]/i, "no paths or emails in the data");
    if (v.partial) assert.ok(!Object.values(v.owner_interactions).every(Number.isInteger), "partial only while a part is unobserved");
    if (Number.isInteger(v.owner_interactions.total)) {
      const { total, ...parts } = v.owner_interactions;
      assert.equal(total, Object.values(parts).reduce((a, b) => a + b, 0), `${v.run_ref}: total is the sum of its parts`);
    }
  }
});

test("agents and by_agent: the twelve tracked agents; per-agent cells only for them, with whole-second timing from passing runs", () => {
  assert.deepEqual(data.agents.map((a) => a.id), AGENT_IDS);
  for (const a of data.agents) assert.ok(a.name, a.id);
  for (const s of data.skills) {
    for (const f of s.flows) {
      for (const [id, cells] of Object.entries(f.by_agent ?? {})) {
        assert.ok(AGENT_IDS.includes(id), id);
        assert.deepEqual(Object.keys(cells).sort(), ["fresh", "returning"], `${s.name}/${f.id}/${id}`);
        for (const v of [cells.fresh, cells.returning].filter(Boolean)) {
          if (v.timing) {
            assert.deepEqual(Object.keys(v.timing).sort(), [...TIMING].sort());
            for (const k of TIMING) assert.ok(v.timing[k] === null || (Number.isInteger(v.timing[k]) && v.timing[k] >= 0), `${k}=${v.timing[k]}`);
          }
          // Numbers and times come from passing runs only; a failing cell keeps them null and says why in notes.
          if (v.result !== "pass") assert.ok(cellModel(v).total === null && timeModel(v).total === null && v.notes, `${s.name}/${f.id}/${id}`);
        }
      }
    }
    if (s.time_to_done) assert.ok(s.flows.some((f) => f.id === s.time_to_done.flow), s.name);
  }
});

const section = (html, skill) => {
  const i = html.indexOf(`<h2><code>${skill}</code>`);
  assert.ok(i >= 0, skill);
  return html.slice(i, html.indexOf("</section>", i));
};
const heads = (sec) => [...sec.matchAll(/<th scope="col">([^<]*)<\/th>/g)].map((m) => m[1]);
const cellsOf = (html, task, skill) => {
  if (skill) html = section(html, skill);
  const row = html.match(new RegExp(`<th scope="row">${task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:<small class="cap">[^<]*</small>)?</th>(.*?)</tr>`, "s"));
  assert.ok(row, task);
  return [...row[1].matchAll(/<td data-label="([^"]+)">(.*?)<\/td>/gs)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, "|").replace(/\|+/g, "|").replace(/^\||\|$/g, "")]);
};
const shownAs = ({ total, parts }) => (total === null ? NOT_MEASURED : `${total}|${parts.join(" · ")}`);

test("one table per skill: tasks as rows, measured agents as columns, and 'not measured yet' for every unmeasured cell", () => {
  const html = renderMatrix(data);
  assert.match(html, /How many steps each skill asks of you/);
  assert.equal(html.split("<table>").length - 1, data.skills.length);
  for (const s of data.skills) {
    const sec = section(html, s.name);
    const cols = columnsFor(s, data.agents);
    assert.deepEqual(heads(sec), ["Task", ...cols.map((c) => c.name)]);
    for (const f of s.flows) {
      const cells = cellsOf(sec, f.task);
      // Every cell is labelled with its column, which the phone layout prints before it.
      assert.deepEqual(cells.map((c) => c[0]), cols.map((c) => c.name));
      cols.forEach((c, i) => assert.equal(cells[i][1], shownAs(cellModel(c.cell(f, "fresh"))), `${s.name}/${f.task}/${c.name}`));
    }
  }
  assert.match(html, /@media \(max-width: 767px\)[\s\S]*td\[data-label\]::before \{ content: attr\(data-label\) ": "/);
});

test("tc-apps shows Codex, measured on 2026-10-27, beside the earlier any-agent run; other agents are listed as not measured yet", () => {
  const html = renderMatrix(data);
  const apps = section(html, "tc-apps");
  assert.deepEqual(heads(apps), ["Task", "Codex", ANY_AGENT]);
  assert.deepEqual(cellsOf(apps, "Sign in"), [
    ["Codex", "2|OpenKey approvals 1 · codes pasted 1 · codes typed 0 · answers 0 · scripted owner"],
    [ANY_AGENT, "3|OpenKey approvals 2 · codes pasted 0 · codes typed 1 · answers 0 · scripted owner"],
  ]);
  assert.deepEqual(cellsOf(apps, "Add a todo"), [["Codex", "0|OpenKey approvals 0 · codes pasted 0 · codes typed 0 · answers 0 · scripted owner"], [ANY_AGENT, NOT_MEASURED]]);
  assert.match(apps, /Not measured yet: ChatGPT, Claude, Gemini, Grok, Perplexity, Muse, Cursor, OpenClaw, Hermes, Claude Code, OpenCode\./);
  assert.match(apps, /Last measured 2026-10-27, CLI 1\.3\.5, 1\.5\.0-beta\.2, skill 0\.1\.20, 0\.2\.0\./);
  // A failing agent (Claude Code here) gets no column: its cells have no numbers.
  for (const s of data.skills.filter((x) => x.name !== "tc-apps")) {
    assert.deepEqual(heads(section(html, s.name)), ["Task", ANY_AGENT]);
    assert.match(section(html, s.name), /Not measured yet for any agent\./);
  }
});

test("the 'Time to done' row shows each agent's run time with its time to the OpenKey link", () => {
  const html = renderMatrix(data);
  const apps = data.skills.find((s) => s.name === "tc-apps");
  const t = apps.flows.find((f) => f.id === apps.time_to_done.flow).by_agent.codex.fresh;
  assert.deepEqual(cellsOf(html, "Time to done", "tc-apps"), [
    ["Codex", `${formatTime(t.timing.total_s)}|OpenKey link at ${formatTime(t.timing.time_to_approval_s)} · median of ${t.runs} runs · scripted owner`],
    [ANY_AGENT, NOT_MEASURED],
  ]);
  assert.equal(html.split("Time to done").length - 1, data.skills.filter((s) => s.time_to_done).length);
  assert.equal(formatTime(345), "5 min 45 s");
  assert.equal(formatTime(45), "45 s");
  assert.equal(formatTime(3720), "1 h 2 min");
  const page = (v) => renderMatrix({ agents: [{ id: "codex", name: "Codex" }], skills: [{ name: "x", blurb: "b", time_to_done: { flow: "t" }, flows: [{ id: "t", task: "t", fresh: null, returning: null, by_agent: { codex: { fresh: v, returning: null } } }] }] });
  assert.throws(() => page({ timing: { total_s: 60 }, owner_kind: "scripted", measured_on: "2026-10-27" }), /run_ref/);
  assert.match(page({ timing: { total_s: 61, time_to_approval_s: null }, owner_kind: "human", measured_on: "2026-10-27", run_ref: "r", runs: 1 }), /<span class="n">1 min 1 s<\/span><small>human owner<\/small>/);
  assert.match(page({ timing: { total_s: null }, owner_kind: "scripted", measured_on: "2026-10-27", run_ref: "r" }), /Not measured yet for any agent\./);
});

test("by_agent cells must name a listed agent; returning rows appear only once one is measured", () => {
  const oi = { total: 1, openkey_approvals: 1, pastes: 0, choices: 0, codes_typed: 0 };
  const v = { owner_interactions: oi, owner_kind: "scripted", measured_on: "2026-10-27", run_ref: "r", cli_version: "1", skill_version: "2" };
  const page = (by, agents = [{ id: "codex", name: "Codex" }]) => renderMatrix({ agents, skills: [{ name: "x", blurb: "b", flows: [{ id: "t", task: "t", fresh: null, returning: null, by_agent: by }] }] });
  assert.throws(() => page({ robot: { fresh: v, returning: null } }), /not in agents/);
  assert.doesNotMatch(page({ codex: { fresh: v, returning: null } }), /returning agent<\/th>/);
  const both = page({ codex: { fresh: v, returning: v } });
  assert.deepEqual(cellsOf(both, "t, returning agent"), [["Codex", "1|OpenKey approvals 1 · codes pasted 0 · codes typed 0 · answers 0 · scripted owner"]]);
  assert.deepEqual(heads(both), ["Task", "Codex"]);
});

test("the page shows both a total and its breakdown, or neither; partial parts are never printed", () => {
  const html = renderMatrix(data);
  assert.equal(cellsOf(html, "Log a meal", "tc-apps")[1][1], "0|OpenKey approvals 0 · codes pasted 0 · codes typed 0 · answers 0 · scripted owner");
  assert.equal(cellsOf(html, "Sign in", "tc-publish")[0][1], NOT_MEASURED);
  const half = renderMatrix({ skills: [{ name: "x", blurb: "b", flows: [{ task: "t", fresh: { owner_interactions: { total: 3, openkey_approvals: 2, pastes: null, choices: null, codes_typed: 1 }, owner_kind: "scripted", measured_on: "2026-10-24", run_ref: "r", cli_version: "1", skill_version: "2" }, returning: null }] }] });
  assert.doesNotMatch(half, /OpenKey approvals|class="n"/);
});

test("a measured zero renders as 0, not as not measured", () => {
  const zero = { total: 0, openkey_approvals: 0, pastes: 0, choices: 0, codes_typed: 0 };
  const html = renderMatrix({ skills: [{ name: "x", blurb: "b", flows: [{ task: "t", fresh: { owner_interactions: zero, owner_kind: "scripted", measured_on: "2026-10-24", run_ref: "r", cli_version: "1", skill_version: "2" }, returning: null }] }] });
  assert.deepEqual(cellsOf(html, "t"), [[ANY_AGENT, "0|OpenKey approvals 0 · codes pasted 0 · codes typed 0 · answers 0 · scripted owner"]]);
  assert.match(html, /Last measured 2026-10-24, CLI 1, skill 2\./);
});

test("'Last measured' appears only for a skill with at least one number, from its numbered cells", () => {
  const zero = { total: 0, openkey_approvals: 0, pastes: 0, choices: 0, codes_typed: 0 };
  const none = { total: null, openkey_approvals: null, pastes: null, choices: null, codes_typed: null };
  const mk = (oi, on, cli, sk) => ({ owner_kind: "scripted", run_ref: "r", owner_interactions: oi, measured_on: on, cli_version: cli, skill_version: sk });
  const html = renderMatrix({
    agents: [{ id: "codex", name: "Codex" }],
    skills: [
      { name: "a", blurb: "b", flows: [{ task: "t1", fresh: mk(none, "2026-10-24", "1.3.5", "0.5.13"), returning: null }] },
      { name: "c", blurb: "d", flows: [{ task: "t2", fresh: mk(zero, "2026-10-20", "1.3.4", "0.1.1"), returning: null, by_agent: { codex: { fresh: mk(zero, "2026-10-24", "1.3.5, 1.5.0-beta.2", "0.1.2"), returning: null } } }, { task: "t3", fresh: mk(none, "2026-10-30", "9", "9"), returning: null }] },
    ],
  });
  assert.equal(html.split("Last measured").length - 1, 1);
  assert.match(html, /Last measured 2026-10-24, CLI 1\.3\.4, 1\.3\.5, 1\.5\.0-beta\.2, skill 0\.1\.1, 0\.1\.2\./);
  assert.doesNotMatch(html, /0\.5\.13|2026-10-30/);
  assert.doesNotMatch(section(renderMatrix(data), "tc-publish"), /Last measured/);
});

test("a measured cell needs owner_kind; the label and agent turns render from the data; the intro stays plain", () => {
  const oi = { total: 3, openkey_approvals: 1, pastes: 1, choices: 1, codes_typed: 0 };
  const page = (v) => renderMatrix({ skills: [{ name: "x", blurb: "b", flows: [{ task: "t", fresh: { owner_interactions: oi, measured_on: "2026-10-24", cli_version: "1", skill_version: "2", run_ref: "r", ...v }, returning: null }] }] });
  assert.throws(() => page({}), /owner_kind/);
  assert.throws(() => page({ owner_kind: "robot" }), /owner_kind/);
  assert.match(page({ owner_kind: "scripted", agent_turns: 7 }), /OpenKey approvals 1 · codes pasted 1 · codes typed 0 · answers 1 · scripted owner · 7 agent turns</);
  assert.match(page({ owner_kind: "human", agent_turns: 1 }), /human owner · 1 agent turn</);
  const noTurns = page({ owner_kind: "human", agent_turns: null });
  assert.match(noTurns, /human owner</);
  assert.doesNotMatch(noTurns, /agent turn|not measured yet<\/span><small/);
  const html = renderMatrix(data);
  assert.match(html, /Counts marked "scripted owner" come from a test run in which a script does each step a person would do\. A person re-checks the main tasks\./);
  assert.match(html, /Times come from the same scripted runs\./);
  for (const p of html.match(/<main>[\s\S]*?<section>/)[0].match(/<p>[\s\S]*?<\/p>/g)) {
    for (const sentence of p.replace(/<[^>]+>/g, "").split(/(?<=[.!?])\s+/)) assert.ok(sentence.split(/\s+/).length <= 32, `short sentence: ${sentence}`);
  }
});

test("the renderer requires measured_on and run_ref for a measured cell, and prints a row caption", () => {
  const oi = { total: 0, openkey_approvals: 0, pastes: 0, choices: 0, codes_typed: 0 };
  const page = (v, caption) => renderMatrix({ skills: [{ name: "x", blurb: "b", flows: [{ task: "t", caption, fresh: { owner_interactions: oi, owner_kind: "scripted", cli_version: "1", skill_version: "2", ...v }, returning: null }] }] });
  assert.throws(() => page({ run_ref: "r" }), /measured_on/);
  assert.throws(() => page({ measured_on: "2026-10-24" }), /run_ref/);
  assert.match(page({ measured_on: "2026-10-24", run_ref: "r" }, "Counted after sign-in."), /<th scope="row">t<small class="cap">Counted after sign-in\.<\/small><\/th>/);
});
