import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const helper = join(root, "skills/tc-apps/healthlog-context.mjs");
const catalog = () => readFileSync(join(root, "skills/tc-apps/TINY-APPS.md"), "utf8");
const A = "did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "did:pkh:eip155:1:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const space = (did) => did.replace(/^did:/, "tinycloud:") + ":applications";
const CONFIG = "Ask the owner for their TinyCloud address and timezone.\n";
const ACCOUNT = "Ask the owner to confirm their TinyCloud address and approve Health Log for that account.\n";
const base = mkdtempSync("/var/tmp/tc-2174-context.");
after(() => rmSync(base, { recursive: true, force: true }));

function world({ saved = space(A), context = { spaceId: space(A) }, stderr = "", status = 0, changed } = {}) {
  const dir = mkdtempSync(join(base, "case."));
  if (saved !== null) writeFileSync(join(dir, "meal-space.txt"), saved + "\n");
  writeFileSync(join(dir, "fixture.json"), JSON.stringify({ context, stderr, status, changed }));
  const cli = join(dir, "custom cli.mjs");
  writeFileSync(cli, `#!${process.execPath}
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.env.TEST_WORLD;
const args = process.argv.slice(2);
appendFileSync(join(dir, 'calls'), JSON.stringify(args) + '\\n');
const f = JSON.parse(readFileSync(join(dir, 'fixture.json')));
if (args.includes('context')) {
  if (f.changed !== undefined) writeFileSync(join(dir, 'meal-space.txt'), f.changed + '\\n');
  process.stderr.write(f.stderr);
  process.stdout.write(typeof f.context === 'string' ? f.context : JSON.stringify(f.context));
  process.exit(f.status);
}
console.log('{}');
`, { mode: 0o755 });
  const env = { PATH: process.env.PATH, TEST_WORLD: dir,
    TC_APPS_OWNER_DID: A, TC_APPS_TIMEZONE: "Pacific/Kiritimati", TZ: "UTC" };
  return { dir, cli, env,
    calls: () => existsSync(join(dir, "calls")) ? readFileSync(join(dir, "calls"), "utf8").trim().split("\n").map(JSON.parse) : [] };
}

const run = (w, extra = {}) => spawnSync(process.execPath, [helper, w.cli, w.dir], {
  encoding: "utf8", timeout: 5000, env: { ...w.env, ...extra },
});
function docBlock(w, contains) {
  const block = [...catalog().matchAll(/```sh\n([\s\S]*?)\n```/g)].map((m) => m[1]).find((b) => b.includes(contains));
  assert.ok(block, contains);
  const text = block.replaceAll("<TC_BIN>", w.cli).replaceAll("<STATE>", w.dir)
    .replaceAll("<HEALTHLOG_CONTEXT>", helper).replaceAll("<MARK>", "0123456789abcdef")
    .replaceAll("<the owner's meal name, exactly as typed (line breaks allowed)>", "Guard regression")
    .replaceAll("<OP_ID>", "test-op").replaceAll("<DAY>", "2026-10-27")
    .replaceAll("<SLOT>", "breakfast").replaceAll("<KCAL>", "600").replaceAll("<UTC>", "2026-10-27T12:00:00Z");
  return spawnSync("sh", ["-c", text], { encoding: "utf8", timeout: 5000, env: w.env });
}

test("current documented INSERT refuses expected owner A with saved/session owner B before SQL", () => {
  const w = world({ saved: space(B), context: { spaceId: space(B) } });
  const r = docBlock(w, "INSERT INTO meal");
  assert.equal(w.calls().some((args) => args.includes("sql")), false, "wrong-owner SQL reached CLI");
  assert.notEqual(r.status, 0);
  assert.equal(r.stderr, ACCOUNT);
});

test("helper returns validated space and a fresh owner-local clock using only delegate context", () => {
  const w = world();
  const before = Date.now();
  const r = run(w);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out).sort(), ["day", "now", "spaceId", "timeZone", "utc"]);
  assert.equal(out.spaceId, space(A));
  assert.equal(out.timeZone, "Pacific/Kiritimati");
  assert.ok(Date.parse(out.utc) >= before && Date.parse(out.utc) <= Date.now());
  assert.equal(Date.parse(out.now), Date.parse(out.utc));
  assert.equal(out.day, out.now.slice(0, 10));
  assert.match(out.now, /\+14:00$/);
  assert.deepEqual(w.calls(), [["--profile", "agent-meal", "context", "--json"]]);
});

for (const [label, extra] of [
  ["missing owner", { TC_APPS_OWNER_DID: "" }], ["missing timezone", { TC_APPS_TIMEZONE: "" }],
  ["malformed owner", { TC_APPS_OWNER_DID: "0xaaaa" }],
  ["malformed timezone", { TC_APPS_TIMEZONE: "Moon/Base" }],
  ["offset instead of IANA timezone", { TC_APPS_TIMEZONE: "+14:00" }],
]) test(`${label}: one configuration message and no CLI call`, () => {
  const w = world();
  const r = run(w, extra);
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, CONFIG);
  assert.deepEqual(w.calls(), []);
});

for (const [label, fixture] of [
  ["wrong saved owner", { saved: space(B) }],
  ["wrong session owner", { context: { spaceId: space(B) } }],
  ["missing saved space", { saved: null }], ["malformed saved space", { saved: "applications" }],
  ["missing context space", { context: {} }], ["malformed context JSON", { context: "not JSON" }],
  ["malformed context space", { context: { spaceId: "applications" } }],
  ["wrong chain", { context: { spaceId: space(A).replace("eip155:1:", "eip155:137:") } }],
  ["wrong space name", { saved: space(A).replace(/applications$/, "default") }],
  ["saved space changes during metadata check", { changed: space(B) }],
  ["CLI error is private", { stderr: "PRIVATE CLI ERROR\nSTACK TRACE\n", status: 3 }],
]) test(`${label}: fail closed with one account message`, () => {
  const w = world(fixture);
  const r = run(w);
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, ACCOUNT);
  assert.ok(w.calls().every((args) => JSON.stringify(args) === JSON.stringify(["--profile", "agent-meal", "context", "--json"])));
});

test("address comparisons ignore case without changing the validated saved space", () => {
  const upper = space(A).replace(/0xa+/, (s) => "0x" + s.slice(2).toUpperCase());
  const w = world({ saved: upper });
  const r = run(w);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).spaceId, upper);
});

test("pure clock supports date boundaries, fractional offsets and DST independently of host TZ", async () => {
  const { validateContext } = await import(pathToFileURL(helper));
  const at = new Date("2026-10-27T12:30:00.123Z");
  const context = (timeZone, date = at) => validateContext({ ownerDid: A, timeZone,
    savedSpace: space(A), context: { spaceId: space(A) }, now: date });
  assert.deepEqual(context("Pacific/Kiritimati"), { spaceId: space(A), day: "2026-10-28",
    now: "2026-10-28T02:30:00.123+14:00", utc: at.toISOString(), timeZone: "Pacific/Kiritimati" });
  assert.equal(context("Asia/Kathmandu").now, "2026-10-27T18:15:00.123+05:45");
  assert.match(context("America/New_York", new Date("2026-11-01T05:30:00Z")).now, /01:30:00.000-04:00$/);
  assert.match(context("America/New_York", new Date("2026-11-01T06:30:00Z")).now, /01:30:00.000-05:00$/);
});

for (const statement of ["INSERT INTO meal", "UPDATE meal", "SELECT id, slot, name, kcal FROM meal WHERE op_id", "SELECT id, op_id, slot, name, kcal FROM meal WHERE day"]) {
  test(`documented ${statement} rechecks account and stops before SQL`, () => {
    const w = world({ context: { spaceId: space(B) } });
    const r = docBlock(w, statement);
    assert.equal(w.calls().some((a) => a.includes("sql")), false);
    assert.notEqual(r.status, 0);
    assert.equal(r.stderr, ACCOUNT);
  });
}

test("doc INSERT uses validated owner date and UTC instead of host date or filled placeholders", () => {
  const w = world();
  const r = docBlock(w, "INSERT INTO meal");
  assert.equal(r.status, 0, r.stderr);
  const args = w.calls().find((a) => a.includes("sql"));
  const params = JSON.parse(args[args.indexOf("--params") + 1]);
  assert.equal(args[args.indexOf("--space") + 1], space(A));
  const utc = new Date(params[5]);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: w.env.TC_APPS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(utc);
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  assert.equal(params[1], `${p.year}-${p.month}-${p.day}`);
  assert.ok(Math.abs(Date.now() - utc.getTime()) < 5000);
});

test("setup downloads and copies the helper into both installed skill paths", () => {
  const setup = readFileSync(join(root, "setup/tc-apps.md"), "utf8");
  assert.ok(setup.includes('-O "https://agents.tinycloud.xyz/skills/apps/healthlog-context.mjs"'));
  const copies = setup.split("\n").filter((line) => line.includes(" && cp SKILL.md "));
  assert.equal(copies.length, 2);
  for (const line of copies) assert.ok(line.includes(" healthlog-context.mjs "));
  assert.match(catalog(), /<HEALTHLOG_CONTEXT>/);
  assert.match(catalog(), /TC_APPS_OWNER_DID/);
  assert.match(catalog(), /TC_APPS_TIMEZONE/);
});
