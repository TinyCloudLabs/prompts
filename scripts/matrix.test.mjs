import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMatrix, cellModel, NOT_MEASURED } from "./matrix.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "matrix/interactions.json"), "utf8"));
const variants = data.skills.flatMap((s) => s.flows.flatMap((f) => [f.fresh, f.returning])).filter(Boolean);

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
  }
});

const cellsOf = (html, task, skill) => {
  if (skill) html = html.slice(html.indexOf(`<code>${skill}</code><span`));
  const row = html.match(new RegExp(`<th scope="row">${task.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?:<small class="cap">[^<]*</small>)?</th>(.*?)</tr>`, "s"));
  assert.ok(row, task);
  return [...row[1].matchAll(/<td data-label="([^"]+)">(.*?)<\/td>/gs)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, "|").replace(/\|+/g, "|").replace(/^\||\|$/g, "")]);
};

test("the page renders as one real table: every flow, header scopes, and 'not measured yet' for every unmeasured cell", () => {
  const html = renderMatrix(data);
  assert.match(html, /How many steps each skill asks of you/);
  for (const col of ["Skill", "Task", "New agent", "Returning agent"]) assert.match(html, new RegExp(`<th scope="col">${col}</th>`));
  assert.equal(html.split("<table>").length, 2);
  for (const s of data.skills) {
    assert.match(html, new RegExp(`<th scope="rowgroup" colspan="4"><code>${s.name}</code>`));
    for (const f of s.flows) {
      const cells = cellsOf(html, f.task, s.name);
      assert.deepEqual(cells.map((c) => c[0]), ["New agent", "Returning agent"]);
      [f.fresh, f.returning].forEach((v, i) => {
        const { total, parts } = cellModel(v);
        assert.equal(cells[i][1], total === null ? NOT_MEASURED : `${total}|${parts.join(" · ")}`, `${s.name}/${f.task}`);
      });
    }
  }
});

test("the page shows both a total and its breakdown, or neither; partial parts are never printed", () => {
  const html = renderMatrix(data);
  const sign = cellsOf(html, "Sign in", "tc-publish")[0];
  assert.equal(cellsOf(html, "Log a meal", "tc-apps")[0][1], "0|OpenKey approvals 0 · codes pasted 0 · codes typed 0 · answers 0 · scripted owner");
  assert.equal(sign[1], NOT_MEASURED);
    const half = renderMatrix({ skills: [{ name: "x", blurb: "b", flows: [{ task: "t", fresh: { owner_interactions: { total: 3, openkey_approvals: 2, pastes: null, choices: null, codes_typed: 1 }, owner_kind: "scripted", measured_on: "2026-10-24", run_ref: "r", cli_version: "1", skill_version: "2" }, returning: null }] }] });
  assert.doesNotMatch(half, /OpenKey approvals|class="n"/);
});

test("a measured zero renders as 0, not as not measured", () => {
  const zero = { total: 0, openkey_approvals: 0, pastes: 0, choices: 0, codes_typed: 0 };
  const html = renderMatrix({ skills: [{ name: "x", blurb: "b", flows: [{ task: "t", fresh: { owner_interactions: zero, owner_kind: "scripted", measured_on: "2026-10-24", run_ref: "r", cli_version: "1", skill_version: "2" }, returning: null }] }] });
  assert.deepEqual(cellsOf(html, "t"), [["New agent", "0|OpenKey approvals 0 · codes pasted 0 · codes typed 0 · answers 0 · scripted owner"], ["Returning agent", NOT_MEASURED]]);
  assert.match(html, /Last measured 2026-10-24, CLI 1, skill 2\./);
});

test("'Last measured' appears only for a skill with at least one number, from its numbered cells", () => {
  const zero = { total: 0, openkey_approvals: 0, pastes: 0, choices: 0, codes_typed: 0 };
  const none = { total: null, openkey_approvals: null, pastes: null, choices: null, codes_typed: null };
  const mk = (oi, on, cli, sk) => ({ owner_kind: "scripted", run_ref: "r", owner_interactions: oi, run_ref: "r", measured_on: on, cli_version: cli, skill_version: sk });
  const html = renderMatrix({
    skills: [
      { name: "a", blurb: "b", flows: [{ task: "t1", fresh: mk(none, "2026-10-24", "1.3.5", "0.5.13"), returning: null }] },
      { name: "c", blurb: "d", flows: [{ task: "t2", fresh: mk(zero, "2026-10-20", "1.3.4", "0.1.1"), returning: mk(zero, "2026-10-24", "1.3.5", "0.1.2") }, { task: "t3", fresh: mk(none, "2026-10-30", "9", "9"), returning: null }] },
    ],
  });
  assert.equal(html.split("Last measured").length - 1, 1);
  assert.match(html, /Last measured 2026-10-24, CLI 1\.3\.4, 1\.3\.5, skill 0\.1\.1, 0\.1\.2\./);
  assert.doesNotMatch(html, /0\.5\.13|2026-10-30/);
  const page = renderMatrix(data);
  const publish = page.slice(page.indexOf("<code>tc-publish</code>"), page.indexOf("<code>tc-secrets</code>"));
  assert.doesNotMatch(publish, /Last measured/);
});

test("a measured cell needs owner_kind; the label and agent turns render from the data", () => {
  const oi = { total: 3, openkey_approvals: 1, pastes: 1, choices: 1, codes_typed: 0 };
  const page = (v) => renderMatrix({ skills: [{ name: "x", blurb: "b", flows: [{ task: "t", fresh: { owner_interactions: oi, run_ref: "r", measured_on: "2026-10-24", cli_version: "1", skill_version: "2", run_ref: "r", ...v }, returning: null }] }] });
  assert.throws(() => page({}), /owner_kind/);
  assert.throws(() => page({ owner_kind: "robot" }), /owner_kind/);
  assert.match(page({ owner_kind: "scripted", agent_turns: 7 }), /OpenKey approvals 1 · codes pasted 1 · codes typed 0 · answers 1 · scripted owner · 7 agent turns</);
  assert.match(page({ owner_kind: "human", agent_turns: 1 }), /human owner · 1 agent turn</);
  const noTurns = page({ owner_kind: "human", agent_turns: null });
  assert.match(noTurns, /human owner</);
  assert.doesNotMatch(noTurns, /agent turn|not measured yet<\/span><small/);
  assert.match(renderMatrix(data), /Counts marked "scripted owner" come from a test run in which a script does each step a person would do\. A person re-checks the main tasks\./);
});

test("the renderer requires measured_on and run_ref for a measured cell, and prints a row caption", () => {
  const oi = { total: 0, openkey_approvals: 0, pastes: 0, choices: 0, codes_typed: 0 };
  const page = (v, caption) => renderMatrix({ skills: [{ name: "x", blurb: "b", flows: [{ task: "t", caption, fresh: { owner_interactions: oi, owner_kind: "scripted", cli_version: "1", skill_version: "2", ...v }, returning: null }] }] });
  assert.throws(() => page({ run_ref: "r" }), /measured_on/);
  assert.throws(() => page({ measured_on: "2026-10-24" }), /run_ref/);
  assert.match(page({ measured_on: "2026-10-24", run_ref: "r" }, "Counted after sign-in."), /<th scope="row">t<small class="cap">Counted after sign-in\.<\/small><\/th>/);
});
