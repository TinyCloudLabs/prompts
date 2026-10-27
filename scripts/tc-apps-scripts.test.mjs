import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// Every home and tool home lives in one /var/tmp directory; the process environment is pointed there
// before any file is written, and checked.
const base = mkdtempSync(join("/var/tmp", "TC-1943."));
for (const key of ["HOME", "TC_HOME", "COURIER_HOME", "BUN_INSTALL_CACHE_DIR"]) process.env[key] = base;
assert.ok(base.startsWith("/var/tmp/TC-1943."));
for (const key of ["HOME", "TC_HOME", "COURIER_HOME", "BUN_INSTALL_CACHE_DIR"]) assert.ok(process.env[key].startsWith("/var/tmp/TC-1943."), key);
after(() => rmSync(base, { recursive: true, force: true }));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = join(root, "skills/tc-apps");
let count = 0;
const fresh = () => {
  const dir = join(base, `h${++count}`);
  const work = join(dir, ".local/share/tc-apps");
  const state = join(dir, "state");
  mkdirSync(work, { recursive: true });
  mkdirSync(state, { recursive: true });
  return { dir, work, state };
};
// A stand-in CLI: records which file name was run and its arguments, and prints a grant for `auth grant`.
const stub = (path) => {
  writeFileSync(path, `#!/bin/sh\necho "${path} $*" >> "$HOME/calls"\ncase "$1 $2" in "auth grant") echo '{"ok":1}' ;; esac\n`, { mode: 0o755 });
  chmodSync(path, 0o755);
};
const run = (args, env) => spawnSync(args[0], args.slice(1), {
  encoding: "utf8", input: "", timeout: 20000,
  env: { PATH: process.env.PATH, ...env },
});
const calls = (dir) => (existsSync(join(dir, "calls")) ? readFileSync(join(dir, "calls"), "utf8").trim().split("\n") : []);

const section = readFileSync(join(skill, "SKILL.md"), "utf8").split("## 1. Read the paths and the time")[1];
const firstBlock = section.match(/```sh\n([\s\S]*?)\n```/)[1];

test("SKILL §1 names the tinycloud script, then an earlier tc script, then reports unset; TC_BIN wins", () => {
  const first = (setup, extra = {}) => {
    const h = fresh();
    setup(h);
    const out = run(["sh", "-c", firstBlock], { HOME: h.dir, ...extra });
    assert.equal(out.status, 0, out.stderr);
    return { line: out.stdout.split("\n")[0], h };
  };
  const both = first(({ work }) => { writeFileSync(join(work, "tinycloud"), ""); writeFileSync(join(work, "tc"), ""); });
  assert.equal(both.line, join(both.h.work, "tinycloud"));
  const old = first(({ work }) => writeFileSync(join(work, "tc"), ""));
  assert.equal(old.line, join(old.h.work, "tc"));
  assert.equal(first(() => {}).line, "TC_BIN is unset");
  assert.equal(first(({ work }) => writeFileSync(join(work, "tinycloud"), ""), { TC_BIN: "/opt/own/cli" }).line, "/opt/own/cli");
  const empty = first(({ work }) => writeFileSync(join(work, "tinycloud"), ""), { TC_BIN: "" });
  assert.equal(empty.line, join(empty.h.work, "tinycloud"));
});

test("SKILL §1 prints TC_APPS_STATE if set, else the default state folder", () => {
  const second = (extra = {}) => {
    const h = fresh();
    const out = run(["sh", "-c", firstBlock], { HOME: h.dir, ...extra });
    assert.equal(out.status, 0, out.stderr);
    return { line: out.stdout.split("\n")[1], h };
  };
  const unset = second();
  assert.equal(unset.line, join(unset.h.dir, ".local/state/tc-apps"));
  const empty = second({ TC_APPS_STATE: "" });
  assert.equal(empty.line, join(empty.h.dir, ".local/state/tc-apps"));
  assert.equal(second({ TC_APPS_STATE: "/opt/own/state" }).line, "/opt/own/state");
});

test("SKILL §1a's second line is TC_BETA_BIN if set, else the setup's beta CLI, else unset", () => {
  const layoutSection = readFileSync(join(skill, "SKILL.md"), "utf8").split("## 1a. Which layout does this app use?")[1];
  const betaLine = layoutSection.match(/```sh\n([\s\S]*?)\n```/)[1].split("\n")[1];
  const beta = (setup, extra = {}) => {
    const h = fresh();
    setup(h);
    const out = run(["sh", "-c", betaLine], { HOME: h.dir, ...extra });
    assert.equal(out.status, 0, out.stderr);
    return { line: out.stdout.trim(), h };
  };
  const installed = ({ work }) => {
    mkdirSync(join(work, "cli-beta/node_modules/.bin"), { recursive: true });
    writeFileSync(join(work, "cli-beta/node_modules/.bin/tinycloud"), "");
  };
  const found = beta(installed);
  assert.equal(found.line, join(found.h.work, "cli-beta/node_modules/.bin/tinycloud"));
  assert.equal(beta(() => {}).line, "TC_BETA is unset");
  assert.equal(beta(() => {}, { TC_BETA_BIN: "" }).line, "TC_BETA is unset");
  assert.equal(beta(installed, { TC_BETA_BIN: "/opt/own/beta" }).line, "/opt/own/beta");
});

// Hermes installs a skill from its SKILL.md URL only if its skills guard passes the file. The guard
// blocks `printenv` (dump_all_env) and a curl command piped into a shell (curl_pipe_shell), even in prose.
test("SKILL.md has no line that Hermes' skills guard blocks: no printenv, no curl piped into a shell", () => {
  const dumpEnv = /printenv|(?<![A-Za-z0-9_])env\s*\|(?!\|)(?!\s*[{(])/;
  const curlShell = /curl\s+[^|\s][^\n]*\|\s*(?:sudo\s+(?:-\S+\s+)*)?(?:ba|z|da|k|c|tc|fi)?sh\b/;
  const lines = readFileSync(join(skill, "SKILL.md"), "utf8").split("\n");
  const flagged = lines.flatMap((line, i) => (dumpEnv.test(line) || curlShell.test(line) ? [`${i + 1}: ${line}`] : []));
  assert.deepEqual(flagged, []);
});

for (const [name, argv, expected] of [
  ["owner-grant.sh", ["healthlog"], ["profile show", "auth grant"]],
  ["owner-undo.sh", [], ["--profile agent-data auth logout", "--profile agent-data-sql auth logout", "profile delete agent-meal"]],
]) {
  const scenarios = [
    ["tinycloud script when both exist", ["tinycloud", "tc"], {}, "tinycloud"],
    ["an earlier tc script when it is the only one", ["tc"], {}, "tc"],
    ["TC_BIN over both", ["tinycloud", "tc"], { TC_BIN: "custom" }, "custom"],
  ];
  for (const [label, present, extra, used] of scenarios) {
    test(`${name} runs the ${label}`, () => {
      const h = fresh();
      for (const file of [...present, "custom"]) stub(join(h.work, file));
      writeFileSync(join(h.state, "meal-request.json"), "{}");
      const env = { HOME: h.dir, TC_APPS_STATE: h.state };
      if (extra.TC_BIN) env.TC_BIN = join(h.work, extra.TC_BIN);
      const out = run(["sh", join(skill, name), ...argv], env);
      assert.equal(out.status, 0, out.stderr + out.stdout);
      const seen = calls(h.dir);
      assert.deepEqual(seen.map((line) => line.split(" ")[0]), expected.map(() => join(h.work, used)));
      expected.forEach((tail, i) => assert.ok(seen[i].endsWith(` ${tail}`) || seen[i].includes(` ${tail} `), seen[i]));
    });
  }
}

test("the wrapper runs the CLI named in cli-path whatever its own file name is", () => {
  const h = fresh();
  const cli = join(h.work, "cli-target");
  writeFileSync(cli, '#!/bin/sh\necho "CLI $*"\n', { mode: 0o755 });
  writeFileSync(join(h.work, "cli-path"), `${cli}\n`);
  for (const name of ["tinycloud", "tc"]) {
    copyFileSync(join(skill, "tc-wrapper.sh"), join(h.work, name));
    chmodSync(join(h.work, name), 0o755);
    const out = run([join(h.work, name), "--version"], { HOME: h.dir });
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout, "CLI --version\n");
  }
});

import { readdirSync } from "node:fs";
// ---- migrate.sh: owner-device copy of one generic tiny app from `default` to its own `applications` root ----
// A stand-in CLI keeps both spaces in one JSON file under the test home, records every call, and can be told to
// misbehave (changed read-back, partial failure, late edits on the source).
const standInCli = String.raw`#!/usr/bin/env node
const fs = require("fs");
const home = process.env.HOME;
const kvPath = home + "/kv-state.json", ctlPath = home + "/control.json", putsPath = home + "/put-count";
const argv = process.argv.slice(2);
const opts = {}, pos = [];
const withValue = new Set(["--profile", "--space", "--prefix", "--file", "--if-none-match", "--limit", "--cursor", "-o", "--output"]);
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (withValue.has(a)) opts[a] = argv[++i]; else if (a.startsWith("--")) opts[a] = true; else pos.push(a); }
fs.appendFileSync(home + "/calls.log", JSON.stringify({ profile: opts["--profile"], argv }) + "\n");
const fail = (code, status) => { process.stderr.write(JSON.stringify({ error: { code } }) + "\n"); process.exit(status); };
const ctl = fs.existsSync(ctlPath) ? JSON.parse(fs.readFileSync(ctlPath, "utf8")) : {};
const kv = JSON.parse(fs.readFileSync(kvPath, "utf8"));
const save = () => fs.writeFileSync(kvPath, JSON.stringify(kv));
const profile = opts["--profile"] || "", space = opts["--space"] || "default";
if ((ctl.missingProfiles || []).includes(profile) || !/^(agent-data|default|tinyapp-[a-z0-9-]+)$/.test(profile)) fail("PROFILE_NOT_FOUND", 3);
const slug = (profile.match(/^tinyapp-(.*)$/) || [])[1];
const allowed = (op, key) => {
  if (!slug) return space === "default";
  if (space !== "applications") return false;
  const own = "xyz.tinycloud.tinyapps." + slug + "/", cat = "xyz.tinycloud.tinyapps.catalog/";
  if (key.startsWith(own)) return true;
  if (op === "get" || op === "list") return key.startsWith(cat);
  return op === "put" && key.startsWith(cat + slug + "/");
};
if (pos[0] !== "kv") fail("USAGE_ERROR", 2);
const op = pos[1], s = kv[space] || (kv[space] = {});
if (op === "list") {
  const prefix = opts["--prefix"] || "";
  if (!allowed("list", prefix)) fail("PERMISSION_DENIED", 5);
  const keys = Object.keys(s).filter((k) => k.startsWith(prefix)).sort();
  console.log(JSON.stringify({ keys, count: keys.length, prefix }));
} else if (op === "get") {
  const key = pos[2];
  if (!allowed("get", key)) fail("PERMISSION_DENIED", 5);
  if (!(key in s)) fail("NOT_FOUND", 4);
  const value = space === "applications" && ctl.corruptRead && ctl.corruptRead[key] !== undefined ? ctl.corruptRead[key] : s[key];
  if (opts["--raw"]) process.stdout.write(value); else console.log(JSON.stringify({ key, data: value }));
} else if (op === "put") {
  const key = pos[2];
  if (!allowed("put", key)) fail("PERMISSION_DENIED", 5);
  if (ctl.failPut === key) fail("NETWORK_ERROR", 7);
  if (opts["--if-none-match"] === "*" && key in s) fail("KV_ALREADY_EXISTS", 5);
  s[key] = fs.readFileSync(opts["--file"], "utf8");
  const n = (fs.existsSync(putsPath) ? Number(fs.readFileSync(putsPath, "utf8")) : 0) + 1;
  fs.writeFileSync(putsPath, String(n));
  if (ctl.late && n === ctl.late.afterPuts) kv.default[ctl.late.key] = ctl.late.value;
  save();
  console.log(JSON.stringify({ key, written: true }));
} else if (op === "delete") {
  delete s[pos[2]];
  save();
  console.log(JSON.stringify({ key: pos[2], deleted: true }));
} else fail("USAGE_ERROR", 2);
`;

const migrate = join(skill, "migrate.sh");
const OLD = "xyz.tinycloud.agent-data";
const NEW = (slug) => `xyz.tinycloud.tinyapps.${slug}`;
const weight = (kg) => JSON.stringify({ v: 1, at: "2026-10-06", data: { kg }, by: "codex" });
const sourceRecords = () => ({
  [`${OLD}/catalog/fitness`]: JSON.stringify({ app: "fitness", title: "Fitness", about: "Body weight.", created: "2026-10-06", by: "codex" }),
  [`${OLD}/catalog/fitness/weight`]: JSON.stringify({ app: "fitness", kind: "weight", shape: "log", per: "day", v: 1, fields: { kg: "number" } }),
  [`${OLD}/catalog/fitness-extra`]: JSON.stringify({ app: "fitness-extra", title: "Other" }),
  [`${OLD}/catalog/todos`]: JSON.stringify({ app: "todos", title: "Todos" }),
  [`${OLD}/fitness/weight/2026-10/2026-10-06`]: weight(80.5),
  [`${OLD}/fitness/weight/2026-10/2026-10-07`]: weight(80.1),
  [`${OLD}/fitness-extra/x/2026-10/a`]: "{}",
});
const FITNESS_KEYS = [
  `${NEW("fitness")}/catalog`,
  `${NEW("fitness")}/catalog/weight`,
  `${NEW("fitness")}/weight/2026-10/2026-10-06`,
  `${NEW("fitness")}/weight/2026-10/2026-10-07`,
];
const world = (applications = {}) => {
  const h = fresh();
  h.bin = join(h.dir, "stand-in-tinycloud");
  writeFileSync(h.bin, standInCli, { mode: 0o755 });
  writeFileSync(join(h.dir, "kv-state.json"), JSON.stringify({ default: sourceRecords(), applications }));
  return h;
};
const store = (h) => JSON.parse(readFileSync(join(h.dir, "kv-state.json"), "utf8"));
const control = (h, c) => writeFileSync(join(h.dir, "control.json"), JSON.stringify(c));
const cliCalls = (h) => (existsSync(join(h.dir, "calls.log")) ? readFileSync(join(h.dir, "calls.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
const runMigrate = (h, args, env = {}) => run(["sh", migrate, ...args], { HOME: h.dir, TC_BETA_BIN: h.bin, TC_APPS_STATE: h.state, ...env });
const receiptPath = (h, slug) => join(h.state, "migration", `${slug}.receipt.json`);
const newKeys = (h, slug) => Object.keys(store(h).applications).filter((k) => k.startsWith(`${NEW(slug)}/`)).sort();
const notSwitched = (h, out) => {
  assert.notEqual(out.status, 0, out.stdout);
  assert.match(out.stderr + out.stdout, /NOT SWITCHED/);
  assert.equal(existsSync(receiptPath(h, "fitness")), false);
  assert.equal(`xyz.tinycloud.tinyapps.catalog/fitness/entry` in store(h).applications, false);
  assert.deepEqual(Object.keys(store(h).default).sort(), Object.keys(sourceRecords()).sort(), "the old records are untouched");
};

test("migrate.sh --dry-run prints the plan and writes nothing, locally or remotely", () => {
  const h = world();
  const before = readFileSync(join(h.dir, "kv-state.json"), "utf8");
  const out = runMigrate(h, ["--dry-run", "fitness"]);
  assert.equal(out.status, 0, out.stderr + out.stdout);
  assert.match(out.stdout, /xyz\.tinycloud\.tinyapps\.fitness/);
  assert.match(out.stdout, /4 records/);
  assert.match(out.stdout, /nothing was written/i);
  assert.equal(readFileSync(join(h.dir, "kv-state.json"), "utf8"), before);
  assert.deepEqual(cliCalls(h).filter((c) => c.argv[1] !== "list"), []);
  assert.deepEqual(readdirSync(h.state), []);
});

test("migrate.sh --dry-run without an app lists the old catalog's apps", () => {
  const h = world();
  const out = runMigrate(h, ["--dry-run"]);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(out.stdout.split("\n").filter((l) => /^app: /.test(l)), ["app: fitness", "app: fitness-extra", "app: todos"]);
});

test("migrate.sh copies one app, reads it back, re-checks the source and only then records the move", () => {
  const h = world({ "xyz.tinycloud.sample.healthlog/knowledge/index.md": "# pinned app" });
  const sourceBefore = JSON.stringify(store(h).default);
  const out = runMigrate(h, ["fitness"]);
  assert.equal(out.status, 0, out.stderr + out.stdout);
  const after = store(h);
  assert.deepEqual(newKeys(h, "fitness"), [...FITNESS_KEYS].sort());
  const from = {
    [FITNESS_KEYS[0]]: `${OLD}/catalog/fitness`,
    [FITNESS_KEYS[1]]: `${OLD}/catalog/fitness/weight`,
    [FITNESS_KEYS[2]]: `${OLD}/fitness/weight/2026-10/2026-10-06`,
    [FITNESS_KEYS[3]]: `${OLD}/fitness/weight/2026-10/2026-10-07`,
  };
  for (const key of FITNESS_KEYS) assert.equal(after.applications[key], after.default[from[key]], key);
  assert.deepEqual(JSON.parse(after.applications["xyz.tinycloud.tinyapps.catalog/fitness/entry"]), { v: 1, app: "fitness", id: NEW("fitness"), title: "Fitness" });
  assert.equal(after.applications["xyz.tinycloud.sample.healthlog/knowledge/index.md"], "# pinned app");
  assert.equal(JSON.stringify(after.default), sourceBefore, "the old records are untouched");
  assert.equal(Object.keys(after.applications).some((k) => k.includes("fitness-extra") || k.includes("todos")), false);
  const receipt = JSON.parse(readFileSync(receiptPath(h, "fitness"), "utf8"));
  assert.equal(receipt.verified, true);
  assert.equal(receipt.id, NEW("fitness"));
  assert.equal(receipt.counts.total, 4);
  assert.match(receipt.digest, /^[0-9a-f]{64}$/);
});

test("migrate.sh never deletes or writes the old place and every new key is created, never overwritten", () => {
  const h = world();
  assert.equal(runMigrate(h, ["fitness"]).status, 0);
  const calls = cliCalls(h);
  assert.equal(calls.some((c) => c.argv.includes("delete") || c.argv.includes("del")), false);
  const puts = calls.filter((c) => c.argv[1] === "put");
  assert.equal(puts.length, FITNESS_KEYS.length + 1);
  for (const c of puts) {
    assert.equal(c.profile, "tinyapp-fitness");
    assert.equal(c.argv[c.argv.indexOf("--space") + 1], "applications");
    assert.equal(c.argv[c.argv.indexOf("--if-none-match") + 1], "*", c.argv.join(" "));
  }
  for (const c of calls.filter((c) => c.profile === "agent-data")) assert.equal(c.argv[1] === "list" || c.argv[1] === "get", true, c.argv.join(" "));
});

test("migrate.sh refuses to switch when a record reads back different from what was sent", () => {
  const h = world();
  control(h, { corruptRead: { [`${NEW("fitness")}/weight/2026-10/2026-10-07`]: weight(99) } });
  notSwitched(h, runMigrate(h, ["fitness"]));
});

test("migrate.sh refuses to switch when the new place already holds a different record, and does not overwrite it", () => {
  const key = `${NEW("fitness")}/weight/2026-10/2026-10-06`;
  const h = world({ [key]: weight(70) });
  notSwitched(h, runMigrate(h, ["fitness"]));
  assert.equal(store(h).applications[key], weight(70));
});

test("migrate.sh refuses to switch when the new place holds a record the old place lacks", () => {
  const h = world({ [`${NEW("fitness")}/weight/2026-10/2026-10-09`]: weight(79) });
  notSwitched(h, runMigrate(h, ["fitness"]));
});

test("migrate.sh refuses to switch when a record is added to the old place during the copy", () => {
  const h = world();
  control(h, { late: { afterPuts: 2, key: `${OLD}/fitness/weight/2026-10/2026-10-08`, value: weight(79.9) } });
  const out = runMigrate(h, ["fitness"]);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr + out.stdout, /NOT SWITCHED/);
  assert.equal(existsSync(receiptPath(h, "fitness")), false);
  assert.equal("xyz.tinycloud.tinyapps.catalog/fitness/entry" in store(h).applications, false);
});

test("migrate.sh refuses to switch when a record in the old place changes during the copy", () => {
  const h = world();
  control(h, { late: { afterPuts: 2, key: `${OLD}/fitness/weight/2026-10/2026-10-06`, value: weight(81) } });
  const out = runMigrate(h, ["fitness"]);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr + out.stdout, /NOT SWITCHED/);
  assert.equal(existsSync(receiptPath(h, "fitness")), false);
  assert.equal("xyz.tinycloud.tinyapps.catalog/fitness/entry" in store(h).applications, false);
});

test("migrate.sh resumes after a failed write: copied records are recognised, nothing is overwritten, and it then switches", () => {
  const h = world();
  control(h, { failPut: FITNESS_KEYS[2] });
  notSwitched(h, runMigrate(h, ["fitness"]));
  assert.deepEqual(newKeys(h, "fitness"), FITNESS_KEYS.slice(0, 2));
  control(h, {});
  const again = runMigrate(h, ["fitness"]);
  assert.equal(again.status, 0, again.stderr + again.stdout);
  assert.deepEqual(newKeys(h, "fitness"), [...FITNESS_KEYS].sort());
  const first = JSON.parse(readFileSync(receiptPath(h, "fitness"), "utf8"));
  const third = runMigrate(h, ["fitness"]);
  assert.equal(third.status, 0, third.stderr + third.stdout);
  assert.equal(JSON.parse(readFileSync(receiptPath(h, "fitness"), "utf8")).digest, first.digest);
});

test("migrate.sh stops before writing when the app's profile has no approval yet", () => {
  const h = world();
  control(h, { missingProfiles: ["tinyapp-fitness"] });
  const out = runMigrate(h, ["fitness"]);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr + out.stdout, /NOT SWITCHED/);
  assert.match(out.stderr + out.stdout, /approv/i);
  assert.equal(cliCalls(h).some((c) => c.argv[1] === "put"), false);
  assert.deepEqual(newKeys(h, "fitness"), []);
});

test("migrate.sh refuses a kind whose name would collide with the app's catalog folder", () => {
  const h = world();
  const data = store(h);
  data.default[`${OLD}/fitness/catalog/2026-10/x`] = "{}";
  writeFileSync(join(h.dir, "kv-state.json"), JSON.stringify(data));
  const out = runMigrate(h, ["fitness"]);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr + out.stdout, /NOT SWITCHED/);
  assert.equal(cliCalls(h).some((c) => c.argv[1] === "put"), false);
});

test("migrate.sh with no old records for the app records nothing and switches nothing", () => {
  const h = world();
  const out = runMigrate(h, ["books"]);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /nothing to migrate/i);
  assert.equal(cliCalls(h).some((c) => c.argv[1] === "put"), false);
  assert.equal(existsSync(receiptPath(h, "books")), false);
});

test("migrate.sh rejects app names that are not a plain slug or are reserved, before any CLI call", () => {
  const h = world();
  for (const slug of ["Fitness", "../x", "a b", "-x", "1x", "catalog", "index-stale", "healthlog", "recipes"]) {
    const out = runMigrate(h, [slug]);
    assert.equal(out.status, 2, `${slug}: ${out.stderr}`);
  }
  assert.equal(runMigrate(h, []).status, 2);
  assert.equal(cliCalls(h).length, 0);
});

test("migrate.sh has one write command, it creates only, and it has no delete command", () => {
  const text = readFileSync(migrate, "utf8");
  const writes = text.split("\n").filter((l) => /\bkv put\b/.test(l));
  assert.equal(writes.length, 1);
  assert.match(writes[0], /--if-none-match '\*'/);
  assert.equal(/\bkv (delete|del)\b|delegation revoke|\bsql\b/.test(text), false);
});

// ---- layout.sh: an app with old records and no verified move stays in the old layout ----
const layout = join(skill, "layout.sh");
const runLayout = (h, slug, env = {}) => run(["sh", layout, slug], { HOME: h.dir, TC_BIN: h.bin, TC_APPS_STATE: h.state, ...env });
const writeReceipt = (h, slug, receipt) => {
  mkdirSync(join(h.state, "migration"), { recursive: true });
  writeFileSync(receiptPath(h, slug), JSON.stringify(receipt));
};

test("layout.sh: old records and no receipt stay in the old layout, with no new grant, profile or write", () => {
  const h = world();
  const out = runLayout(h, "fitness");
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), "legacy");
  const calls = cliCalls(h);
  assert.deepEqual(calls.map((c) => c.argv.slice(0, 2).join(" ")), ["kv list"]);
  assert.equal(calls[0].profile, "agent-data");
  assert.equal(calls[0].argv[calls[0].argv.indexOf("--space") + 1], "default");
  assert.deepEqual(readdirSync(h.state), []);
});

test("layout.sh: a verified receipt for the app switches it to the new layout without asking the network", () => {
  const h = world();
  writeReceipt(h, "fitness", { v: 1, app: "fitness", id: NEW("fitness"), verified: true });
  const out = runLayout(h, "fitness");
  assert.equal(out.stdout.trim(), "new");
  assert.equal(cliCalls(h).length, 0);
});

test("layout.sh: an app with no old records starts in the new layout", () => {
  const h = world();
  const out = runLayout(h, "books");
  assert.equal(out.stdout.trim(), "new");
  assert.deepEqual(cliCalls(h).map((c) => c.argv.slice(0, 2).join(" ")), ["kv list"]);
});

test("layout.sh: a successful migrate.sh without its receipt is still the old layout, and the receipt switches it", () => {
  const h = world();
  assert.equal(runMigrate(h, ["fitness"]).status, 0);
  assert.equal(runLayout(h, "fitness").stdout.trim(), "new");
  const receipt = readFileSync(receiptPath(h, "fitness"), "utf8");
  rmSync(receiptPath(h, "fitness"));
  assert.equal(runLayout(h, "fitness").stdout.trim(), "legacy");
  writeFileSync(receiptPath(h, "fitness"), receipt);
  assert.equal(runLayout(h, "fitness").stdout.trim(), "new");
});

test("layout.sh: a receipt that is unverified, damaged or for another app does not switch the app", () => {
  for (const receipt of [{ app: "fitness", verified: false }, { app: "todos", verified: true }, { app: "fitness" }]) {
    const h = world();
    writeReceipt(h, "fitness", receipt);
    assert.equal(runLayout(h, "fitness").stdout.trim(), "legacy", JSON.stringify(receipt));
  }
  const h = world();
  mkdirSync(join(h.state, "migration"), { recursive: true });
  writeFileSync(receiptPath(h, "fitness"), "{not json");
  assert.equal(runLayout(h, "fitness").stdout.trim(), "legacy");
});

test("layout.sh: with no usable earlier sign-in it says ask, and with another failure it says check-failed", () => {
  const h = world();
  control(h, { missingProfiles: ["agent-data"] });
  assert.equal(runLayout(h, "fitness").stdout.trim(), "ask");
  const g = world();
  const broken = join(g.dir, "broken-tinycloud");
  writeFileSync(broken, "#!/bin/sh\necho '{\"error\":{\"code\":\"NETWORK_ERROR\"}}' >&2\nexit 7\n", { mode: 0o755 });
  assert.equal(runLayout(g, "fitness", { TC_BIN: broken }).stdout.trim(), "check-failed");
});

test("layout.sh rejects a name that is not a plain slug or is reserved, before any CLI call", () => {
  const h = world();
  for (const slug of ["Fitness", "../x", "-x", "healthlog", "catalog", ""]) assert.equal(runLayout(h, slug).status, 2, slug);
  assert.equal(cliCalls(h).length, 0);
});

// ---- layout.sh and migrate.sh: paged catalog, missing jq, local work copy, tab in a key ----
test("layout.sh follows the old catalog's pages: an app whose key is on a later page is legacy", () => {
  const h = world();
  const paged = join(h.dir, "paged-tinycloud");
  writeFileSync(paged, `#!/bin/sh
case " $* " in
  *" --all "*) echo '{"keys":["${OLD}/catalog/fitness","${OLD}/catalog/todos"],"count":2}' ;;
  *) echo '{"keys":["${OLD}/catalog/fitness"],"count":1,"truncated":true,"nextCursor":"c1"}' ;;
esac
`, { mode: 0o755 });
  assert.equal(runLayout(h, "todos", { TC_BIN: paged }).stdout.trim(), "legacy");
  assert.equal(runLayout(h, "books", { TC_BIN: paged }).stdout.trim(), "new");
});

test("layout.sh and migrate.sh without jq say so and exit 3 before any CLI call or write", () => {
  const h = world();
  const empty = join(h.dir, "empty-bin");
  mkdirSync(empty);
  for (const args of [[layout, "fitness"], [migrate, "--dry-run", "fitness"], [migrate, "fitness"]]) {
    const out = spawnSync("/bin/sh", args, { encoding: "utf8", timeout: 20000, env: { PATH: empty, HOME: h.dir, TC_BIN: h.bin, TC_BETA_BIN: h.bin, TC_APPS_STATE: h.state } });
    assert.equal(out.status, 3, args.join(" "));
    assert.match(out.stderr, /jq is needed/);
    assert.equal(out.stdout, "");
  }
  assert.equal(cliCalls(h).length, 0);
  assert.deepEqual(readdirSync(h.state), []);
});

test("migrate.sh removes its private copy of the records after a verified move and keeps it after a refusal", () => {
  const ok = world();
  const out = runMigrate(ok, ["fitness"]);
  assert.equal(out.status, 0, out.stderr + out.stdout);
  assert.equal(existsSync(join(ok.state, "migration", "fitness.work")), false);
  assert.equal(existsSync(receiptPath(ok, "fitness")), true);
  assert.ok(out.stdout.includes(`Receipt: ${receiptPath(ok, "fitness")}`), out.stdout);
  const bad = world();
  control(bad, { corruptRead: { [`${NEW("fitness")}/weight/2026-10/2026-10-07`]: weight(99) } });
  assert.notEqual(runMigrate(bad, ["fitness"]).status, 0);
  assert.equal(existsSync(join(bad.state, "migration", "fitness.work", "src")), true);
});

test("migrate.sh says plainly that a key contains a tab and changes nothing", () => {
  const h = world();
  const data = store(h);
  data.default[`${OLD}/fitness/weight/2026-10/a\tb`] = "{}";
  writeFileSync(join(h.dir, "kv-state.json"), JSON.stringify(data));
  for (const args of [["fitness"], ["--dry-run", "fitness"]]) {
    const out = runMigrate(h, args);
    assert.notEqual(out.status, 0, args.join(" "));
    assert.match(out.stderr, /a key contains a tab; nothing was changed/);
  }
  assert.equal(cliCalls(h).some((c) => c.argv[1] === "put"), false);
  assert.deepEqual(readdirSync(h.state), []);
});

// The session check (setup §4, CONTEXT.md §6): one marked line in each agent's global instructions file.
const sessionCheck = join(skill, "session-check.sh");
const MARK = "<!-- tinycloud-context -->";
const sc = (h, args, extra = {}) => run(["sh", sessionCheck, ...args], { HOME: h.dir, TC_APPS_STATE: h.state, ...extra });
const withSkill = (h, dir = ".agents/skills/tc-apps") => {
  mkdirSync(join(h.dir, dir), { recursive: true });
  writeFileSync(join(h.dir, dir, "CONTEXT.md"), "# context\n");
  return join(h.dir, dir);
};
const lineFor = (skillDir) => `Before your first answer in a session, check my TinyCloud context: follow ${skillDir}/CONTEXT.md (tc-apps skill, context app). Save new facts I tell you there. ${MARK}`;

test("session-check.sh add puts one marked line in each agent's instructions file, keeps every other byte, and remove takes only that line out", () => {
  const h = fresh();
  const installed = withSkill(h);
  mkdirSync(join(h.dir, ".claude"));
  mkdirSync(join(h.dir, ".codex"));
  const claude = join(h.dir, ".claude/CLAUDE.md");
  const codex = join(h.dir, ".codex/AGENTS.md");
  writeFileSync(claude, "# Mine\n\nkeep this line\n");
  writeFileSync(codex, "no newline at the end");
  const added = sc(h, ["add", "codex"]);
  assert.equal(added.status, 0, added.stderr + added.stdout);
  assert.deepEqual(added.stdout.trim().split("\n").sort(), [`added: ${claude}`, `added: ${codex}`].sort());
  assert.equal(readFileSync(claude, "utf8"), `# Mine\n\nkeep this line\n${lineFor(installed)}\n`);
  assert.equal(readFileSync(codex, "utf8"), `no newline at the end\n${lineFor(installed)}\n`);
  assert.equal(existsSync(join(h.dir, ".config/opencode")), false, "OpenCode isn't on this computer: nothing is created for it");
  const again = sc(h, ["add", "codex"]);
  assert.equal(again.status, 0);
  assert.match(again.stdout, /already there/);
  assert.equal(readFileSync(claude, "utf8").split(MARK).length, 2, "one line, however often add runs");
  assert.equal(sc(h, ["status", "codex"]).stdout, "on\nclients: codex claude-code\n");
  const removed = sc(h, ["remove"]);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(readFileSync(claude, "utf8"), "# Mine\n\nkeep this line\n");
  assert.equal(readFileSync(codex, "utf8"), "no newline at the end\n");
  assert.equal(sc(h, ["status", "codex"]).stdout.split("\n")[0], "off");
});

test("session-check.sh names each agent's own skill copy if it has one, and creates the running agent's file", () => {
  const h = fresh();
  const agents = withSkill(h);
  const own = withSkill(h, ".claude/skills/tc-apps");
  const added = sc(h, ["add", "claude-code"]);
  assert.equal(added.status, 0, added.stderr);
  assert.equal(readFileSync(join(h.dir, ".claude/CLAUDE.md"), "utf8"), `${lineFor(own)}\n`);
  assert.equal(existsSync(join(h.dir, ".codex")), false);
  mkdirSync(join(h.dir, ".codex"));
  assert.equal(sc(h, ["add", "claude-code"]).status, 0);
  assert.equal(readFileSync(join(h.dir, ".codex/AGENTS.md"), "utf8"), `${lineFor(agents)}\n`);
});

test("session-check.sh uses Codex's AGENTS.override.md when it exists, and OpenCode's fallback to ~/.claude/CLAUDE.md", () => {
  const h = fresh();
  const installed = withSkill(h);
  mkdirSync(join(h.dir, ".codex"));
  mkdirSync(join(h.dir, ".claude"));
  mkdirSync(join(h.dir, ".config/opencode"), { recursive: true });
  writeFileSync(join(h.dir, ".codex/AGENTS.override.md"), "override\n");
  writeFileSync(join(h.dir, ".claude/CLAUDE.md"), "claude\n");
  const added = sc(h, ["add", "opencode"]);
  assert.equal(added.status, 0, added.stderr);
  assert.equal(readFileSync(join(h.dir, ".codex/AGENTS.override.md"), "utf8"), `override\n${lineFor(installed)}\n`);
  assert.equal(readFileSync(join(h.dir, ".claude/CLAUDE.md"), "utf8"), `claude\n${lineFor(installed)}\n`);
  assert.equal(existsSync(join(h.dir, ".codex/AGENTS.md")), false, "a new AGENTS.md would be shadowed by the override");
  assert.equal(existsSync(join(h.dir, ".config/opencode/AGENTS.md")), false, "a new AGENTS.md would stop OpenCode reading ~/.claude/CLAUDE.md");
  assert.equal(sc(h, ["remove"]).status, 0);
  assert.equal(readFileSync(join(h.dir, ".codex/AGENTS.override.md"), "utf8"), "override\n");
  assert.equal(readFileSync(join(h.dir, ".claude/CLAUDE.md"), "utf8"), "claude\n");
});

test("session-check.sh remove keeps a linked instructions file linked, with its mode", () => {
  const h = fresh();
  withSkill(h);
  mkdirSync(join(h.dir, "dotfiles"));
  mkdirSync(join(h.dir, ".claude"));
  const target = join(h.dir, "dotfiles/CLAUDE.md");
  writeFileSync(target, "linked\n", { mode: 0o600 });
  chmodSync(target, 0o600);
  symlinkSync(target, join(h.dir, ".claude/CLAUDE.md"));
  assert.equal(sc(h, ["add", "claude-code"]).status, 0);
  assert.match(readFileSync(target, "utf8"), /tinycloud-context/);
  assert.equal(sc(h, ["remove"]).status, 0);
  assert.equal(lstatSync(join(h.dir, ".claude/CLAUDE.md")).isSymbolicLink(), true);
  assert.equal(readFileSync(target, "utf8"), "linked\n");
  assert.equal(statSync(target).mode & 0o777, 0o600);
});

test("session-check.sh reports a file it can't change, still changes the others, and exits 1", () => {
  const h = fresh();
  withSkill(h);
  mkdirSync(join(h.dir, ".claude"));
  mkdirSync(join(h.dir, ".codex"));
  chmodSync(join(h.dir, ".codex"), 0o500);
  try {
    const added = sc(h, ["add", "claude-code"]);
    assert.equal(added.status, 1);
    assert.match(added.stdout, new RegExp(`could not change: ${join(h.dir, ".codex/AGENTS.md")}`));
    assert.match(readFileSync(join(h.dir, ".claude/CLAUDE.md"), "utf8"), /tinycloud-context/);
  } finally {
    chmodSync(join(h.dir, ".codex"), 0o700);
  }
});

test("session-check.sh decline is remembered until add, and bad usage changes nothing", () => {
  const h = fresh();
  withSkill(h);
  mkdirSync(join(h.dir, ".claude"));
  assert.equal(sc(h, ["status", "claude-code"]).stdout.split("\n")[0], "off");
  assert.equal(sc(h, ["decline"]).status, 0);
  assert.equal(sc(h, ["status", "claude-code"]).stdout.split("\n")[0], "declined");
  assert.equal(sc(h, ["add", "claude-code"]).status, 0);
  assert.equal(sc(h, ["status", "claude-code"]).stdout.split("\n")[0], "on");
  assert.equal(existsSync(join(h.state, "session-check")), false);
  for (const args of [[], ["add"], ["add", "cursor"], ["status"], ["wipe"]]) assert.equal(sc(h, args).status, 2, args.join(" "));
});

test("CONTEXT.md and session-check.sh have no line that Hermes' skills guard blocks", () => {
  const dumpEnv = /printenv|(?<![A-Za-z0-9_])env\s*\|(?!\|)(?!\s*[{(])/;
  const curlShell = /curl\s+[^|\s][^\n]*\|\s*(?:sudo\s+(?:-\S+\s+)*)?(?:ba|z|da|k|c|tc|fi)?sh\b/;
  for (const file of ["CONTEXT.md", "session-check.sh", "TINY-APPS.md", "QUICKSTART.md"]) {
    const lines = readFileSync(join(skill, file), "utf8").split("\n");
    assert.deepEqual(lines.flatMap((line, i) => (dumpEnv.test(line) || curlShell.test(line) ? [`${file}:${i + 1}: ${line}`] : [])), []);
  }
});

test("CONTEXT.md's TC_BETA line is SKILL §1a's, and it quotes the line session-check.sh writes", () => {
  const context = readFileSync(join(skill, "CONTEXT.md"), "utf8");
  const layoutSection = readFileSync(join(skill, "SKILL.md"), "utf8").split("## 1a. Which layout does this app use?")[1];
  const betaLine = layoutSection.match(/```sh\n([\s\S]*?)\n```/)[1].split("\n")[1];
  assert.equal(context.split("## 3. Read")[1].match(/```sh\n\s*([\s\S]*?)\n\s*```/)[1].trim(), betaLine);
  const quoted = lineFor("DIR").replace("DIR/CONTEXT.md", "`<this file>`").replace(` ${MARK}`, "");
  assert.ok(context.includes(quoted), quoted);
  assert.ok(context.includes(MARK));
});

test("deleting a context record is described the same way in CONTEXT.md, QUICKSTART.md and the setup's Undo", () => {
  const facts = "Deleting a record removes it from your TinyCloud and from every agent's view. TinyCloud's storage still keeps the old version until history collapse ships";
  for (const file of [join(skill, "CONTEXT.md"), join(skill, "QUICKSTART.md"), join(root, "setup/tc-apps.md")]) {
    assert.ok(readFileSync(file, "utf8").includes(facts), file);
  }
  const undo = readFileSync(join(root, "setup/tc-apps.md"), "utf8").split("\n## Undo\n")[1];
  assert.ok(undo.includes(facts) && undo.includes("session-check.sh\" remove"));
});

// Setup step 5 copies the skill for every supported agent on this computer, the agents session-check.sh's
// clients() finds, so a setup in one agent is seen by the others; each copy is checked against SHA256SUMS.
import { createHash } from "node:crypto";
const appsGuide = readFileSync(join(root, "setup/tc-apps.md"), "utf8");
const step5 = appsGuide.split("**Step 5.")[1].split("**Step 6.")[0];
const [claudeBlock, agentsBlock] = [...step5.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((m) => m[1]);
const step5Files = claudeBlock.match(/ cp ((?:[\w.-]+ )+)"/)[1].trim().split(" ");
const download = (h, corrupt) => {
  const dir = join(h.dir, ".local/share/tc-apps/skill");
  mkdirSync(dir, { recursive: true });
  const sums = step5Files.map((f) => {
    copyFileSync(join(skill, f), join(dir, f));
    return `${createHash("sha256").update(readFileSync(join(dir, f))).digest("hex")}  ${f}\n`;
  });
  writeFileSync(join(dir, "SHA256SUMS"), sums.join(""));
  if (corrupt) writeFileSync(join(dir, corrupt), "changed after the check\n");
  return dir;
};
const step5Run = (h, block, client, extra = {}) => run(["sh", "-c", block.replaceAll("'<client>'", `'${client}'`)], { HOME: h.dir, ...extra });

test("setup step 5 copies the skill for exactly the agents session-check.sh clients finds, and checks each copy", () => {
  assert.ok(step5Files.includes("SKILL.md") && step5Files.includes("session-check.sh"));
  assert.ok(!/Don't copy the skill into both folders|Run only the block for your client/.test(step5));
  for (const client of ["claude-code", "codex", "opencode"]) {
    for (let mask = 0; mask < 8; mask++) {
      const h = fresh();
      const dl = download(h);
      [".claude", ".codex", ".config/opencode"].forEach((d, i) => mask & (1 << i) && mkdirSync(join(h.dir, d), { recursive: true }));
      const found = run(["sh", join(dl, "session-check.sh"), "clients", client], { HOME: h.dir }).stdout.trim().split("\n");
      assert.equal(found[0], client);
      for (const block of [claudeBlock, agentsBlock]) {
        const out = step5Run(h, block, client);
        assert.equal(out.status, 0, `${client} ${mask}: ${out.stdout}${out.stderr}`);
      }
      const label = `${client}, folders ${mask}`;
      const claudeCopy = join(h.dir, ".claude/skills/tc-apps");
      const agentsCopy = join(h.dir, ".agents/skills/tc-apps");
      assert.equal(existsSync(join(claudeCopy, "SKILL.md")), found.includes("claude-code"), label);
      assert.equal(existsSync(join(agentsCopy, "SKILL.md")), found.includes("codex") || found.includes("opencode"), label);
      for (const copy of [claudeCopy, agentsCopy].filter((d) => existsSync(d))) {
        assert.deepEqual(readdirSync(copy).sort(), [...step5Files].sort(), label);
      }
    }
  }
});

test("setup step 5 uses CLAUDE_CONFIG_DIR for Claude Code's copy, and fails on a copy that doesn't match SHA256SUMS", () => {
  const h = fresh();
  download(h);
  const config = join(h.dir, "claude-config");
  mkdirSync(config);
  const out = step5Run(h, claudeBlock, "codex", { CLAUDE_CONFIG_DIR: config });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /SKILL\.md: OK/);
  assert.equal(existsSync(join(config, "skills/tc-apps/CONTEXT.md")), true);
  assert.equal(existsSync(join(h.dir, ".claude")), false);
  const skipped = step5Run(h, agentsBlock, "claude-code", { CLAUDE_CONFIG_DIR: config });
  assert.equal(skipped.status, 0);
  assert.match(skipped.stdout, /^skipped: /);
  const bad = fresh();
  download(bad, "TINY-APPS.md");
  const failed = step5Run(bad, agentsBlock, "codex");
  assert.notEqual(failed.status, 0);
  assert.match(failed.stdout + failed.stderr, /TINY-APPS\.md: FAILED/);
});

test("session-check.sh clients lists the running agent first, then each agent found, as status's clients line does", () => {
  const h = fresh();
  withSkill(h);
  mkdirSync(join(h.dir, ".config/opencode"), { recursive: true });
  assert.equal(sc(h, ["clients", "codex"]).stdout, "codex\nopencode\n");
  assert.equal(sc(h, ["status", "codex"]).stdout.split("\n")[1], "clients: codex opencode");
  const config = join(h.dir, "elsewhere");
  mkdirSync(config);
  assert.equal(sc(h, ["clients", "opencode"], { CLAUDE_CONFIG_DIR: config }).stdout, "opencode\nclaude-code\n");
  for (const args of [["clients"], ["clients", "cursor"]]) assert.equal(sc(h, args).status, 2, args.join(" "));
});

test("session-check.sh names a set CLAUDE_SKILL_DIR's CONTEXT.md in Claude Code's line, and skips it when empty", () => {
  const h = fresh();
  const agents = withSkill(h);
  const plugin = withSkill(h, "plugin/skills/tc-apps");
  mkdirSync(join(h.dir, ".claude"));
  mkdirSync(join(h.dir, ".codex"));
  assert.equal(sc(h, ["add", "codex"], { CLAUDE_SKILL_DIR: plugin }).status, 0);
  assert.equal(readFileSync(join(h.dir, ".claude/CLAUDE.md"), "utf8"), `${lineFor(plugin)}\n`);
  assert.equal(readFileSync(join(h.dir, ".codex/AGENTS.md"), "utf8"), `${lineFor(agents)}\n`, "Codex keeps its own copy");
  assert.equal(sc(h, ["remove"]).status, 0);
  assert.equal(sc(h, ["add", "claude-code"], { CLAUDE_SKILL_DIR: "" }).status, 0);
  assert.equal(readFileSync(join(h.dir, ".claude/CLAUDE.md"), "utf8"), `${lineFor(agents)}\n`);
});

// Claude Code replaces the exact text ${CLAUDE_SKILL_DIR} in a SKILL.md it loads, for a personal, project or
// plugin skill (https://code.claude.com/docs/en/skills#available-string-substitutions), but not ${CLAUDE_SKILL_DIR:-},
// and it doesn't set it in the shell. So SKILL.md's loops use the exact text, and the loops in files read with
// cat (TINY-APPS.md, CONTEXT.md, the setup page) read the variable with :- and skip it when it's empty.
const skillDirLoops = (text) => text.split("\n").filter((l) => /^\s*for d in .*tc-apps/.test(l));
test("SKILL.md's folder loops start with Claude Code's ${CLAUDE_SKILL_DIR}, then the installs, then the download folder", () => {
  const skillMd = readFileSync(join(skill, "SKILL.md"), "utf8");
  const loops = skillDirLoops(skillMd);
  assert.equal(loops.length, 5);
  const dirs = '"${CLAUDE_SKILL_DIR}" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps" "$HOME/.agents/skills/tc-apps" "$HOME/.local/share/tc-apps/skill"';
  for (const loop of loops) assert.ok(loop.startsWith(`for d in ${dirs}; do if [ -n "$d" ] && [ -f "$d/`), loop);
  assert.ok(!skillMd.includes("CLAUDE_SKILL_DIR:-"), "Claude Code doesn't fill in ${CLAUDE_SKILL_DIR:-}");
  const contextLoop = loops[0].replace('cat "$d/CONTEXT.md"', 'echo "$d"');
  const where = (h, loop, extra = {}) => run(["sh", "-c", loop], { HOME: h.dir, ...extra }).stdout.trim();
  const h = fresh();
  const agents = withSkill(h);
  const plugin = withSkill(h, "plugin/skills/tc-apps");
  assert.equal(where(h, contextLoop), agents, "not filled in, and unset in the shell: skipped");
  withSkill(h, ".claude/skills/tc-apps");
  assert.equal(where(h, contextLoop.replace("${CLAUDE_SKILL_DIR}", plugin)), plugin, "filled in by Claude Code: first");
  const only = fresh();
  const dl = withSkill(only, ".local/share/tc-apps/skill");
  assert.equal(where(only, contextLoop), dl);
});

test("the folder loops in TINY-APPS.md, CONTEXT.md and the setup page try a set CLAUDE_SKILL_DIR first and skip it when empty", () => {
  const loops = [join(skill, "TINY-APPS.md"), join(skill, "CONTEXT.md"), join(root, "setup/tc-apps.md")].flatMap((f) => skillDirLoops(readFileSync(f, "utf8")));
  assert.equal(loops.length, 3);
  const dirs = '"${CLAUDE_SKILL_DIR:-}" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps" "$HOME/.agents/skills/tc-apps" "$HOME/.local/share/tc-apps/skill"';
  for (const loop of loops) assert.ok(loop.trim().startsWith(`for d in ${dirs}; do if [ -n "$d" ] && [ -f "$d/`), loop);
  const probe = loops[0].trim().replace(/then sh "\$d\/announce\.sh" healthlog/, 'then echo "$d"').replace('[ -f "$d/announce.sh" ]', '[ -f "$d/CONTEXT.md" ]');
  const h = fresh();
  const agents = withSkill(h);
  const plugin = withSkill(h, "plugin/skills/tc-apps");
  assert.equal(run(["sh", "-uc", probe], { HOME: h.dir }).stdout.trim(), agents);
  assert.equal(run(["sh", "-c", probe], { HOME: h.dir, CLAUDE_SKILL_DIR: "" }).stdout.trim(), agents);
  assert.equal(run(["sh", "-c", probe], { HOME: h.dir, CLAUDE_SKILL_DIR: plugin }).stdout.trim(), plugin);
});

test("setup step 5 skips Claude Code's copy when the TinyCloud plugin provides the skill, and Undo removes each copy", () => {
  assert.match(step5, /`tinycloud:tc-apps`[^\n]*skip the Claude Code block/);
  assert.match(step5, /A copy your client doesn't allow[^\n]*don't run it another way[^\n]*one command to run in their own terminal/);
  const undo = appsGuide.split("\n## Undo\n")[1];
  assert.ok(undo.includes("`${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-apps` for Claude Code and `~/.agents/skills/tc-apps` for Codex and OpenCode"));
  assert.match(undo, /delete both folders if both exist/);
});

// Two agents once filed the same coffee order as fact/coffee-order and preference/coffee-order.
test("CONTEXT.md files a coffee order as a preference, a birthday or home city as a fact, and updates a subject under any kind", () => {
  const context = readFileSync(join(skill, "CONTEXT.md"), "utf8");
  const boundary = context.split("\n").find((l) => l.startsWith("- **Fact or preference.**"));
  assert.ok(boundary, "CONTEXT.md §2 defines fact and preference");
  assert.ok(boundary.includes("coffee order (`preference/coffee-order`)"), boundary);
  assert.ok(boundary.includes("birthday (`fact/birthday`)") && boundary.includes("home city (`fact/home-city`)"), boundary);
  const write = context.split("## 4. Write")[1].split("## 5.")[0];
  assert.match(write, /same subject under every kind/);
  assert.match(write, /never write a second record for the same subject/);
  const runbook = readFileSync(join(root, "forward-tests-tc-apps.md"), "utf8").split("## Follow-up test: context across agents")[1];
  assert.match(runbook, /\| A \|[^\n]*writes `preference\/coffee-order`/);
  assert.match(runbook, /\| B \|[^\n]*gets `preference\/coffee-order`/);
});
