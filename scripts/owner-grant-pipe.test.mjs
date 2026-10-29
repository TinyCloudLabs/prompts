import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { after, test } from "node:test";

// TINY-APPS.md §3's block for agents without a live interactive session: the helper gets a pipe of its own,
// codes reach it through that pipe, and cancelling stops only its recorded PID.
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
const block = doc.split("**Without a live interactive session**")[1].match(/```sh\n([\s\S]*?)\n```/)[1];

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(check, what) {
  for (let i = 0; i < 100; i++) { const value = check(); if (value) return value; await delay(100); }
  assert.fail(`timed out waiting for ${what}`);
}

function start(name) {
  const home = join(base, name), state = join(home, "state"), skill = join(home, ".agents/skills/tc-apps");
  mkdirSync(state, { recursive: true });
  mkdirSync(skill, { recursive: true });
  copyFileSync(join(root, "skills/tc-apps/owner-grant.sh"), join(skill, "owner-grant.sh"));
  writeFileSync(join(state, "meal-request.json"), "{}");
  writeFileSync(join(state, "meal-grant.json"), '{"previous":true}\n');
  const script = block.replaceAll("<TC_BIN>", cli).replaceAll("<STATE>", state);
  const run = spawnSync("sh", ["-c", script], { encoding: "utf8", timeout: 20000,
    env: { PATH: process.env.PATH, HOME: home, TZ: "UTC" } });
  assert.equal(run.status, 0, run.stderr);
  const session = join(state, "owner-grant-session");
  const out = () => (existsSync(join(session, "out")) ? readFileSync(join(session, "out"), "utf8") : "");
  const pid = Number(out().match(/OWNER_GRANT_PID=(\d+)/)?.[1]);
  assert.ok(pid > 0, `no OWNER_GRANT_PID in: ${out()}`);
  const send = (code) => writeFileSync(join(session, "in"), code + "\n");
  return { state, session, out, pid, send };
}

test("codes written to the session pipe reach the sign-in and the grant, and the helper exits by itself", async () => {
  const s = start("codes");
  assert.ok(statSync(join(s.session, "in")).isFIFO());
  await until(() => s.out().includes("READY init"), "sign-in");
  s.send("init-code");
  await until(() => s.out().includes("READY grant"), "grant");
  s.send("grant-code");
  await until(() => s.out().includes("Done: approval saved"), "done");
  await until(() => !alive(s.pid), "helper exit");
  assert.equal(readFileSync(join(s.state, "meal-grant.json"), "utf8").trim(), '{"approved":true}');
});

test("cancelling stops only the recorded PID: the helper ends, nothing changes, other processes keep running", async () => {
  const bystander = spawn("sh", ["-c", `tail -f ${join(base, "other-session-in.fifo")} 2>/dev/null; sleep 30`], { stdio: "ignore" });
  try {
    const s = start("cancel");
    await until(() => s.out().includes("READY init"), "sign-in");
    process.kill(s.pid, "SIGTERM");
    await until(() => !alive(s.pid), "helper exit");
    assert.match(s.out(), /Cancelled; nothing changed/);
    assert.equal(readFileSync(join(s.state, "meal-grant.json"), "utf8").trim(), '{"previous":true}');
    assert.ok(alive(bystander.pid), "an unrelated process was stopped");
  } finally { bystander.kill("SIGKILL"); }
});

test("no guide, skill or script stops processes by name or pattern", () => {
  const files = [];
  const walk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path); else files.push(path);
  } };
  for (const dir of ["setup", "skills", "apps"]) walk(join(root, dir));
  walk(join(root, "functions"));
  const hits = files.flatMap((path) => readFileSync(path, "utf8").split("\n")
    .map((line, i) => [line, i + 1]).filter(([line]) => /\b(pkill|killall|pgrep)\b/.test(line))
    .map(([line, n]) => `${path.slice(root.length + 1)}:${n}: ${line.trim()}`));
  assert.deepEqual(hits, []);
});
