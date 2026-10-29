import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { after, test } from "node:test";

// TINY-APPS.md §3's blocks for agents without a live interactive session: the helper gets a pipe of its own,
// codes reach it through that pipe, and cancelling stops only its recorded PID. Every step runs as its own
// shell call, the way such an agent runs it, so nothing carries over between them.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = mkdtempSync("/var/tmp/tc2238-pipe.");
after(() => rmSync(base, { recursive: true, force: true }));
const owner = "did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const cli = join(base, "cli.mjs");
writeFileSync(cli, `#!${process.execPath}
import { createInterface } from 'node:readline';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const a = process.argv.slice(2), signed = join(process.env.HOME, 'signed');
if (a.includes('show')) { if (!existsSync(signed)) { console.error('PROFILE_NOT_FOUND'); process.exit(4); } process.exit(0); }
if (a.includes('context')) { console.log(JSON.stringify({ ownerDid: '${owner}' })); process.exit(0); }
const stage = a.includes('init') ? 'init' : 'grant';
console.error('READY ' + stage);
createInterface({ input: process.stdin }).once('line', code => {
  if (code !== stage + '-code') process.exit(3);
  if (stage === 'init') writeFileSync(signed, 'signed'); else console.log('{"approved":true}');
  process.exit(0);
});
`, { mode: 0o755 });

const doc = readFileSync(join(root, "skills/tc-apps/TINY-APPS.md"), "utf8");
const section = doc.split("**Without a live interactive session**")[1];
const [block, steps] = [...section.matchAll(/```sh\n([\s\S]*?)\n```/g)].slice(0, 2).map((m) => m[1]);
const step = (prefix) => {
  const line = steps.split("\n").find((l) => l.startsWith(prefix));
  assert.ok(line, `no step starting with ${prefix}`);
  return line;
};

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(check, what) {
  for (let i = 0; i < 100; i++) { const value = check(); if (value) return value; await delay(100); }
  assert.fail(`timed out waiting for ${what}`);
}

function session(name) {
  const home = join(base, name), state = join(home, "state"), skill = join(home, ".agents/skills/tc-apps");
  mkdirSync(state, { recursive: true });
  mkdirSync(skill, { recursive: true });
  copyFileSync(join(root, "skills/tc-apps/owner-grant.sh"), join(skill, "owner-grant.sh"));
  writeFileSync(join(state, "meal-request.json"), "{}");
  writeFileSync(join(state, "meal-grant.json"), '{"previous":true}\n');
  const sh = (script) => {
    const run = spawnSync("sh", ["-c", script.replaceAll("<TC_BIN>", cli).replaceAll("<STATE>", state)],
      { encoding: "utf8", timeout: 20000, env: { PATH: process.env.PATH, HOME: home, TZ: "UTC" } });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout;
  };
  const dir = join(state, "owner-grant-session");
  return {
    state, dir, start: () => sh(block), out: () => sh(step("cat ")), pid: () => Number(readFileSync(join(dir, "pid"), "utf8")),
    send: (code) => sh(step("printf ").replace("<the code>", code)), cancel: () => sh(step("P=")), clean: () => sh(step("rm ")),
  };
}

test("codes sent with the doc's own step reach the sign-in and the grant, and the helper exits by itself", async () => {
  const s = session("codes");
  s.start();
  const pid = s.pid();
  assert.ok(statSync(join(s.dir, "in")).isFIFO());
  assert.match(s.out(), new RegExp(`OWNER_GRANT_PID=${pid}\\b`), "the recorded pid is the helper's own");
  await until(() => s.out().includes("READY init"), "sign-in");
  s.send("init-code");
  await until(() => s.out().includes("READY grant"), "grant");
  s.send("grant-code");
  await until(() => s.out().includes("Done: approval saved"), "done");
  await until(() => !alive(pid), "helper exit");
  assert.equal(readFileSync(join(s.state, "meal-grant.json"), "utf8").trim(), '{"approved":true}');
  s.clean();
  assert.ok(!existsSync(s.dir));
});

test("starting again while a helper waits keeps its record, and cancelling stops only that PID", async () => {
  const bystander = spawn("sh", ["-c", "sleep 30"], { stdio: "ignore" });
  try {
    const s = session("cancel");
    s.start();
    const pid = s.pid();
    await until(() => s.out().includes("READY init"), "sign-in");
    assert.match(s.start(), /^HELPER_RUNNING/);
    assert.equal(s.pid(), pid);
    s.cancel();
    await until(() => !alive(pid), "helper exit");
    assert.match(s.out(), /Cancelled; nothing changed/);
    assert.equal(readFileSync(join(s.state, "meal-grant.json"), "utf8").trim(), '{"previous":true}');
    assert.ok(alive(bystander.pid), "an unrelated process was stopped");
  } finally { bystander.kill("SIGKILL"); }
});

test("a pid left by an ended helper is ignored: no HELPER_RUNNING, and the cancel step leaves that process alone", async () => {
  const reused = spawn("sh", ["-c", "sleep 30"], { stdio: "ignore" });
  try {
    const s = session("stale");
    mkdirSync(s.dir, { recursive: true });
    writeFileSync(join(s.dir, "pid"), `${reused.pid}\n`);
    writeFileSync(join(s.dir, "out"), "Done: approval saved for the agent.\n");
    assert.match(s.cancel(), /NOT_RUNNING/);
    assert.ok(alive(reused.pid), "the cancel step stopped a process that isn't the helper");
    assert.doesNotMatch(s.start(), /HELPER_RUNNING/);
    const pid = s.pid();
    assert.notEqual(pid, reused.pid);
    s.cancel();
    await until(() => !alive(pid), "helper exit");
    assert.ok(alive(reused.pid));
  } finally { reused.kill("SIGKILL"); }
});

test("no guide, skill or script stops processes by name or pattern", () => {
  const files = [];
  const walk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path); else files.push(path);
  } };
  for (const dir of ["setup", "skills", "apps", "functions"]) walk(join(root, dir));
  const hits = files.flatMap((path) => readFileSync(path, "utf8").split("\n")
    .map((line, i) => [line, i + 1]).filter(([line]) => /\b(pkill|killall|pgrep)\b/.test(line))
    .map(([line, n]) => `${path.slice(root.length + 1)}:${n}: ${line.trim()}`));
  assert.deepEqual(hits, []);
});
