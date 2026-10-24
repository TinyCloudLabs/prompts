import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMatrix, NOT_MEASURED } from "./matrix.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "matrix/interactions.json"), "utf8"));
const variants = data.skills.flatMap((s) => s.flows.flatMap((f) => [f.fresh, f.returning])).filter(Boolean);

before(() => {
  const built = spawnSync(process.execPath, [join(root, "scripts/build-site.mjs")], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
});

test("every measured variant has a date and a run reference, and counts are whole numbers", () => {
  for (const v of variants) {
    assert.match(v.measured_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(v.run_ref, "run_ref");
    assert.ok(v.cli_version && v.skill_version, "versions");
    for (const n of [v.agent_turns, ...Object.values(v.owner_interactions)]) {
      assert.ok(n === null || (Number.isInteger(n) && n >= 0), String(n));
    }
    assert.doesNotMatch(JSON.stringify(v), /\/home\/|~\/|@[a-z0-9-]+\.[a-z]/i, "no paths or emails in the data");
  }
});

test("/matrix is built, and a null count prints 'not measured yet'", () => {
  const html = readFileSync(join(root, "_site/matrix.html"), "utf8");
  assert.match(html, /How many steps each skill asks of you/);
  const flows = data.skills.flatMap((s) => s.flows);
  const nulls = flows.flatMap((f) => [f.fresh, f.returning]).filter((v) => !Number.isInteger(v?.owner_interactions?.total)).length;
  assert.equal(html.split(NOT_MEASURED).length - 1, nulls + data.skills.filter((s) => !s.flows.some((f) => f.fresh || f.returning)).length);
  for (const f of flows) assert.ok(html.includes(f.task), f.task);
});

test("a measured zero renders as 0, not as not measured", () => {
  const html = renderMatrix({ skills: [{ name: "x", blurb: "b", flows: [{ task: "t", fresh: { owner_interactions: { total: 0, openkey_approvals: 0 }, measured_on: "2026-10-24", cli_version: "1", skill_version: "2" }, returning: null }] }] });
  assert.match(html, /New agent<\/span> <span class="n">0</);
  assert.match(html, /Returning agent<\/span> <span class="n none">not measured yet</);
  assert.match(html, /Last measured 2026-10-24, CLI 1, skill 2\./);
});
