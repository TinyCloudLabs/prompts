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
const ACCOUNT = "Health Log is set up for a different TinyCloud account than the one this computer is signed in with; sign in with the right account at https://agents.tinycloud.xyz/onboarding.\n";
const CONTEXT_ARGS = ["context", "--space", "applications", "--json"];
const KEY = "xyz.tinycloud.sample.healthlog/settings/timezone";
const ZONE = "Pacific/Kiritimati";
const base = mkdtempSync("/var/tmp/tc-2174-context.");
after(() => rmSync(base, { recursive: true, force: true }));

function world({ owner = A, context = { ownerDid: A, spaceId: space(A) }, stderr = "", status = 0, page = ZONE, fallback } = {}) {
  const dir = mkdtempSync(join(base, "case."));
  if (owner !== null) writeFileSync(join(dir, "owner-did.txt"), owner + "\n");
  if (fallback !== undefined) writeFileSync(join(dir, "owner-timezone.txt"), fallback + "\n");
  writeFileSync(join(dir, "fixture.json"), JSON.stringify({ context, stderr, status, page }));
  const cli = join(dir, "custom cli.mjs");
  writeFileSync(cli, `#!${process.execPath}
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.env.TEST_WORLD;
const args = process.argv.slice(2);
appendFileSync(join(dir, 'calls'), JSON.stringify(args) + '\\n');
const f = JSON.parse(readFileSync(join(dir, 'fixture.json')));
if (args.includes('context')) {
  process.stderr.write(f.stderr);
  process.stdout.write(typeof f.context === 'string' ? f.context : JSON.stringify(f.context));
  process.exit(f.status);
}
if (args.includes('kv')) {
  if (f.page === null) process.exit(4);
  process.stdout.write(f.page);
  process.exit(0);
}
console.log('{}');
`, { mode: 0o755 });
  const env = { PATH: process.env.PATH, TEST_WORLD: dir, TZ: "UTC" };
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

test("current documented INSERT refuses bound owner A with signed-in owner B before SQL", () => {
  const w = world({ context: { ownerDid: B, spaceId: space(B) } });
  const r = docBlock(w, "INSERT INTO meal");
  assert.equal(w.calls().some((args) => args.includes("sql")), false, "wrong-owner SQL reached CLI");
  assert.notEqual(r.status, 0);
  assert.equal(r.stderr, ACCOUNT);
});

test("helper returns validated space and a fresh owner-local clock using only the sign-in's context", () => {
  const w = world();
  const before = Date.now();
  const r = run(w);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out).sort(), ["day", "now", "spaceId", "timeZone", "utc"]);
  assert.equal(out.spaceId, space(A));
  assert.equal(out.timeZone, ZONE);
  assert.ok(Date.parse(out.utc) >= before && Date.parse(out.utc) <= Date.now());
  assert.equal(Date.parse(out.now), Date.parse(out.utc));
  assert.equal(out.day, out.now.slice(0, 10));
  assert.match(out.now, /\+14:00$/);
  assert.deepEqual(w.calls(), [CONTEXT_ARGS, ["kv", "get", KEY, "--space", space(A), "--raw"]]);
});

test("a fresh conversation asks nothing: the saved owner and the page's timezone are enough", () => {
  const w = world();
  const r = run(w);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  assert.doesNotMatch(r.stdout + r.stderr, /ask/i);
});

for (const [label, fixture, zone] of [
  ["page key missing", { page: null, fallback: "Asia/Kathmandu" }, "Asia/Kathmandu"],
  ["page key not an IANA zone", { page: "+14:00", fallback: "Asia/Kathmandu" }, "Asia/Kathmandu"],
  ["page key unknown zone", { page: "Moon/Base", fallback: "Asia/Kathmandu" }, "Asia/Kathmandu"],
  ["page key preferred over the setup fallback", { fallback: "Asia/Kathmandu" }, ZONE],
]) test(`timezone: ${label}`, () => {
  const w = world(fixture);
  const r = run(w);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  assert.equal(JSON.parse(r.stdout).timeZone, zone);
});

test("timezone: no page key and no setup fallback uses host UTC without a question", () => {
  const w = world({ page: null });
  const r = run(w);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).timeZone, "UTC");
  assert.equal(r.stderr, "");
});

test("a wrong account is refused with the account line even when no timezone exists", () => {
  const r = run(world({ context: { ownerDid: B, spaceId: space(B) }, page: null }));
  assert.notEqual(r.status, 0);
  assert.equal(r.stderr, ACCOUNT);
});

test("first use binds the signed-in owner and never replaces it later", () => {
  const w = world({ owner: null });
  const r = run(w);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(w.dir, "owner-did.txt"), "utf8").trim(), A);
  assert.equal(readFileSync(join(w.dir, "owner-timezone.txt"), "utf8").trim(), "UTC");
  writeFileSync(join(w.dir, "fixture.json"), JSON.stringify({ context: { ownerDid: B, spaceId: space(B) }, stderr: "", status: 0, page: ZONE }));
  const again = run(w);
  assert.notEqual(again.status, 0);
  assert.equal(again.stderr, ACCOUNT);
  assert.equal(readFileSync(join(w.dir, "owner-did.txt"), "utf8").trim(), A);
});

test("a malformed saved owner, or no owner to bind, fails closed with one line", () => {
  for (const fixture of [{ owner: "0xaaaa" }, { owner: null, context: { spaceId: space(A) } }]) {
    const r = run(world(fixture));
    assert.notEqual(r.status, 0);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, ACCOUNT);
  }
});

for (const [label, fixture] of [
  ["wrong saved owner", { owner: B }],
  ["wrong session owner", { context: { spaceId: space(B) } }],
  ["missing context space", { context: {} }], ["malformed context JSON", { context: "not JSON" }],
  ["malformed context space", { context: { spaceId: "applications" } }],
  ["wrong chain", { context: { spaceId: space(A).replace("eip155:1:", "eip155:137:") } }],
  ["wrong space name", { context: { spaceId: space(A).replace(/applications$/, "default") } }],
  ["CLI error is private", { stderr: "PRIVATE CLI ERROR\nSTACK TRACE\n", status: 3 }],
]) test(`${label}: fail closed with one account message`, () => {
  const w = world(fixture);
  const r = run(w);
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, ACCOUNT);
  assert.ok(w.calls().every((args) => ["context", "kv"].includes(args[0])));
});

test("address comparisons ignore case without changing the validated space", () => {
  const upper = space(A).replace(/0xa+/, (s) => "0x" + s.slice(2).toUpperCase());
  const w = world({ context: { spaceId: upper } });
  const r = run(w);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).spaceId, upper);
});

test("pure clock supports date boundaries, fractional offsets and DST independently of host TZ", async () => {
  const { validateContext } = await import(pathToFileURL(helper));
  const at = new Date("2026-10-27T12:30:00.123Z");
  const context = (timeZone, date = at) => validateContext({ ownerDid: A, timeZone,
    context: { spaceId: space(A) }, now: date });
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
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(utc);
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
});
