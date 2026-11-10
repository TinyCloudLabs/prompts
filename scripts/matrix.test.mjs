import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as matrix from "./matrix.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicData = JSON.parse(readFileSync(join(root, "matrix/public.json"), "utf8"));
const legacyData = JSON.parse(readFileSync(join(root, "matrix/interactions.json"), "utf8"));

const row = (overrides = {}) => ({
  skill: "tinycloud-cli",
  basicFlow: "install",
  variant: "returningAgent",
  returningMode: "ordinaryReuse",
  enrollment: "existing-account",
  utcDate: "2026-11-10",
  startUTC: "2026-11-10T15:00:00Z",
  endUTC: "2026-11-10T15:04:00Z",
  skillVersion: "1.6.5",
  cliVersion: "1.6.5",
  runRef: "cli-fresh-001",
  verdict: "PASS",
  approvals: 1,
  pastes: 0,
  choices: 0,
  codesTyped: 0,
  agentTurns: 4,
  guideURL: "https://agents.tinycloud.xyz/skills/cli/SKILL.md",
  notes: "private note with did:key:private-value",
  evidencePaths: ["/var/tmp/private-evidence.json"],
  ...overrides,
});

const ledger = (overrides = {}) => ({
  complete: true,
  actions: [
    { id: "approval-1", kind: "openKeyApproval" },
    { id: "consent-1", kind: "consentNavigation" },
    { id: "advanced-1", kind: "advanced" },
  ],
  ...overrides,
});

test("a complete ledger produces a unique full total and distinct additional-action counts", () => {
  assert.equal(typeof matrix.projectRun, "function");
  const projected = matrix.projectRun(row(), ledger({
    actions: [
      { id: "approval-1", kind: "openKeyApproval" },
      { id: "consent-1", kind: "consent-navigation" },
      { id: "consent-1", kind: "consent-navigation" },
      { id: "advanced-1", kind: "Advanced" },
    ],
  }));
  assert.equal(projected.namedSubtotal, 1);
  assert.equal(projected.ownerActionTotal, 3);
  assert.deepEqual(projected.additionalActionCounts, { consentNavigation: 1, advanced: 1 });
  assert.equal(projected.variant, "returningAgent");
  assert.equal(projected.returningMode, "ordinaryReuse");
  assert.equal(projected.enrollment, "existing-account");
  assert.throws(() => matrix.projectRun(row(), { complete: true }), /actions must be an array/);
});

test("incomplete ledgers and unknown legacy counts remain unmeasured, never zero", () => {
  const projected = matrix.projectRun(row({ pastes: null }), ledger({ complete: false }));
  assert.equal(projected.namedSubtotal, null);
  assert.equal(projected.ownerActionTotal, null);
  assert.deepEqual(projected.additionalActionCounts, { consentNavigation: null, advanced: null });
  assert.equal(projected.ownerInteractions.pastes, null);
  assert.equal(matrix.cellModel({ ...projected, ownerActionTotal: 99 }).ownerActionTotal, null);
  assert.equal(matrix.cellModel({ ...projected, actionLedgerComplete: true, ownerActionTotal: 0 }).ownerActionTotal, 0);
});

test("projection drops private evidence fields and unsafe run references", () => {
  const projected = matrix.projectRun(row({
    runRef: "/var/tmp/private-run.json",
    guideURL: "https://agents.tinycloud.xyz/skills/cli/SKILL.md?token=private#bearer",
    notes: "did:key:private-value",
    evidencePaths: ["/var/tmp/private-evidence.json"],
  }), ledger());
  const json = JSON.stringify(projected);
  assert.equal(projected.runRef, null);
  for (const forbidden of ["private-run", "private-evidence", "private-value", "bearer", "guideURL", "startUTC", "endUTC", "notes", "evidencePaths"])
    assert.ok(!json.includes(forbidden), forbidden);
});
test("matrix build rejects private run references and forged derived subtotals", () => {
  const safe = matrix.projectRun(row(), ledger());
  const prepare = (run) => matrix.prepareMatrixData(
    [{ name: "tinycloud-cli", short: "cli", version: "1.6.5" }],
    { skills: [{ name: "tc-cli", flows: [{ id: "install", task: "Install" }] }] },
    { skills: [{ alias: "cli", source: "tc-cli" }], runs: [run], bugReports: [] },
  );
  assert.throws(() => prepare({ ...safe, runRef: "/var/tmp/private.json" }), /runRef/);
  assert.throws(() => prepare({ ...safe, namedSubtotal: 99 }), /subtotal/);
  assert.throws(() => prepare({ ...safe, additionalActionCounts: { ...safe.additionalActionCounts, advanced: null } }), /complete ledger/);
});


test("ordinary reuse, forced renewal, and enrollment stay distinct in the rendered matrix", () => {
  const ordinary = matrix.projectRun(row(), ledger());
  const forced = matrix.projectRun(row({ returningMode: "forcedRenewal", enrollment: "new-account" }), ledger());
  const fresh = matrix.projectRun(row({ variant: "freshAgent", returningMode: null, enrollment: "new-account" }), ledger());
  const html = matrix.renderMatrix({ skills: [{
    name: "tinycloud-cli", alias: "cli", version: "1.6.5", blurb: "CLI", guideURL: "/skills/cli/SKILL.md",
    flows: [{ id: "install", task: "Install", runs: [ordinary, forced, fresh] }],
  }] });
  for (const label of ["Fresh agent", "Returning agent — ordinary reuse", "Returning agent — forced renewal"])
    assert.ok(html.includes(`<th scope="col">${label}</th>`), label);
  assert.match(html, /Enrollment qualifier: existing-account/);
  assert.match(html, /Enrollment qualifier: new-account/);
  assert.match(html, /<dt>Consent navigation<\/dt><dd>1<\/dd>/);
  assert.match(html, /<dt>Advanced<\/dt><dd>1<\/dd>/);
  assert.match(html, /<dt>Full owner-action total<\/dt><dd>3<\/dd>/);
  assert.match(html, /<dt>Four-category subtotal<\/dt><dd>1<\/dd>/);
});

test("empty and partial measurements render not measured, while an observed zero remains zero", () => {
  const zero = matrix.projectRun(row({ approvals: 0, pastes: 0, choices: 0, codesTyped: 0 }), ledger({ actions: [] }));
  const partial = matrix.projectRun(row({ pastes: null }), ledger({ complete: false }));
  const html = matrix.renderMatrix({ skills: [{
    name: "tinycloud-cli", alias: "cli", version: "1.6.5", blurb: "CLI", guideURL: "/skills/cli/SKILL.md",
    flows: [
      { id: "install", task: "Install", runs: [zero] },
      { id: "link", task: "Link", runs: [partial] },
      { id: "share", task: "Share", runs: [] },
    ],
  }] });
  assert.match(html, /<dt>Four-category subtotal<\/dt><dd>0<\/dd>/);
  assert.match(html, /<dt>Full owner-action total<\/dt><dd>0<\/dd>/);
  assert.match(html, /<dt>Codes pasted<\/dt><dd>not measured yet<\/dd>/);
  assert.match(html, /<dt>Full owner-action total<\/dt><dd>not measured yet<\/dd>/);
  assert.match(html, /<span class="none">not measured yet<\/span>/);
});

test("matrix preparation uses live skill aliases and versions, adds feed, and never reuses legacy results", () => {
  assert.equal(typeof matrix.prepareMatrixData, "function");
  const prepared = matrix.prepareMatrixData(
    [
      { name: "tinycloud-cli", short: "cli", version: "1.6.5", desc: "Live CLI" },
      { name: "tinycloud-feed", short: "feed", version: "0.2.3", desc: "Live feed" },
    ],
    { skills: [{ name: "tc-cli", blurb: "old", flows: [{ id: "install", task: "Install", fresh: { owner_interactions: { total: 99 } }, returning: null }] }] },
    {
      skills: [
        { alias: "cli", source: "tc-cli" },
        { alias: "feed", source: null },
      ],
      runs: [],
    },
  );
  assert.deepEqual(prepared.skills.map(({ alias, name, version }) => [alias, name, version]), [
    ["cli", "tinycloud-cli", "1.6.5"],
    ["feed", "tinycloud-feed", "0.2.3"],
  ]);
  assert.equal(prepared.skills[0].flows[0].runs.length, 0);
  assert.deepEqual(prepared.skills[1].flows, []);
  assert.throws(() => matrix.prepareMatrixData(
    [{ name: "tinycloud-cli", short: "cli", version: "1.6.5" }],
    { skills: [] },
    { skills: [{ alias: "cli", source: null }], runs: [{ skill: "tinycloud-cli", basicFlow: "missing", variant: "freshAgent" }] },
  ), /unmapped/);
});
test("Linear issue metadata renders linked counts by kind and missing mappings stay unreported", () => {
  const prepared = matrix.prepareMatrixData(
    [{ name: "tinycloud-cli", short: "cli", version: "1.6.5", desc: "Live CLI" }, { name: "tinycloud-feed", short: "feed", version: "0.2.3", desc: "Live feed" }],
    { skills: [{ name: "tc-cli", flows: [{ id: "install", task: "Install" }, { id: "other", task: "Other" }] }] },
    {
      skills: [{ alias: "cli", source: "tc-cli" }, { alias: "feed", source: null }],
      runs: [],
      bugReports: [{ skill: "cli", basicFlow: "install", kind: "installer", source: "Linear", issueIds: ["TC-2561", "TC-2561", "TC-2592"] }],
    },
  );
  const html = matrix.renderMatrix(prepared);
  assert.match(html, /Bug reports by kind/);
  assert.match(html, /installer: 2/);
  assert.equal((html.match(/linear\.app\/tinycloud-labs\/issue\/TC-2561/g) ?? []).length, 1);
  assert.equal((html.match(/linear\.app\/tinycloud-labs\/issue\/TC-2592/g) ?? []).length, 1);
  assert.match(html, /Bug reports: not reported/);
  assert.doesNotMatch(html, /Bug reports: 0/);
});

test("bug issue metadata rejects body-like fields and invalid ticket identifiers", () => {
  const prepare = (report) => matrix.prepareMatrixData(
    [{ name: "tinycloud-cli", short: "cli", version: "1.6.5" }],
    { skills: [{ name: "tc-cli", flows: [{ id: "install", task: "Install" }] }] },
    { skills: [{ alias: "cli", source: "tc-cli" }], runs: [], bugReports: [report] },
  );
  assert.throws(() => prepare({
    skill: "cli", basicFlow: "install", kind: "installer", source: "Linear", issueIds: ["TC-2561"], body: "private report body",
  }), /unknown fields/);
  assert.throws(() => prepare({
    skill: "cli", basicFlow: "install", kind: "installer", source: "Linear", issueIds: ["TC-2561?token=secret"],
  }), /ticket identifiers/);
});


test("published matrix groups contain all current aliases, including feed", () => {
  assert.deepEqual(publicData.skills.map((skill) => skill.alias), ["apps", "feed", "publish", "secrets", "cli", "courier", "chat", "mcp"]);
  assert.deepEqual(publicData.runs, []);
  assert.ok(legacyData.skills.some((skill) => skill.name === "tc-apps"));
});
