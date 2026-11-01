import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { after, test } from "node:test";

// TINY-APPS.md §3's blocks: the start block runs the helper in the background with its output in a file and returns at
// once; every OpenKey step prints a short link and waits for the owner's approval, with no code; cancelling stops only
// the recorded PID. Every step runs as its own shell call, the way an agent runs it, so nothing carries over between them.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = mkdtempSync("/var/tmp/tc2238-pipe.");
after(() => rmSync(base, { recursive: true, force: true }));
const owner = "did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const cli = join(base, "cli.mjs");
writeFileSync(cli, `#!${process.execPath}
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Like CLI 1.5.1: init makes the profile before it asks for approval, so a cancelled sign-in leaves a profile with no
// signed-in owner; context --json then reports ownerDid null. init, auth login and auth grant each print a short
// OpenKey link on stderr and wait until the owner approves (here: until the test writes approved-<step>). None reads
// a code: --paste is refused.
const a = process.argv.slice(2), home = process.env.HOME, signed = join(home, 'signed'), profile = join(home, 'profile');
if (a.includes('--paste')) { console.error('{"error":{"code":"UNEXPECTED_PASTE"}}'); process.exit(2); }
if (a.includes('show')) { if (!existsSync(profile)) { console.error('PROFILE_NOT_FOUND'); process.exit(4); } process.exit(0); }
if (a.includes('context')) { console.log(JSON.stringify({ ownerDid: existsSync(signed) ? '${owner}' : null })); process.exit(0); }
const step = a.includes('init') ? 'init' : a.includes('login') ? 'login' : 'grant';
if (step === 'init') writeFileSync(profile, 'profile');
console.error('Approve this request in OpenKey: https://openkey.so/a/' + step + '#k');
const stop = setTimeout(() => process.exit(9), 20000);
setInterval(() => {
  if (!existsSync(join(home, 'approved-' + step))) return;
  clearTimeout(stop);
  if (step === 'grant') console.log('{"approved":true}'); else { writeFileSync(signed, 'signed'); console.log('{"authenticated":true}'); }
  process.exit(0);
}, 100);
`, { mode: 0o755 });

const doc = readFileSync(join(root, "skills/tc-apps/TINY-APPS.md"), "utf8");
const section = doc.split("3. **The owner's approval")[1].split("\n4. **Import the grant")[0];
const blocks = [...section.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((m) => m[1]);
const block = blocks.find((b) => b.includes("owner-grant.sh"));
const steps = blocks.find((b) => b.startsWith("cat '<STATE>/owner-grant-session/out'"));
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
    // A short timeout: a block that leaves the helper attached to the tool call's output would hang here.
    const run = spawnSync("sh", ["-c", script.replaceAll("<TC_BIN>", cli).replaceAll("<STATE>", state)],
      { encoding: "utf8", timeout: 5000, env: { PATH: process.env.PATH, HOME: home, TZ: "UTC" } });
    assert.equal(run.error, undefined, "the block did not return at once");
    assert.equal(run.status, 0, run.stderr);
    return run.stdout;
  };
  const dir = join(state, "owner-grant-session");
  return {
    home, state, dir, start: () => sh(block), out: () => sh(step("cat ")), pid: () => Number(readFileSync(join(dir, "pid"), "utf8")),
    approve: (what) => writeFileSync(join(home, `approved-${what}`), ""), cancel: () => sh(step("P=")),
  };
}

test("the start block returns at once; each step shows its short link and finishes on approval with no code, and the helper exits by itself", async () => {
  const s = session("links");
  s.start();
  const pid = s.pid();
  await until(() => new RegExp(`OWNER_GRANT_PID=${pid}\\b`).test(s.out()), "the recorded pid is the helper's own");
  await until(() => s.out().includes("Approve this request in OpenKey: https://openkey.so/a/init#k"), "sign-in link");
  assert.doesNotMatch(s.out(), /paste/i, "the helper's output asks for no code");
  s.approve("init");
  await until(() => s.out().includes("Approve this request in OpenKey: https://openkey.so/a/grant#k"), "access link");
  s.approve("grant");
  await until(() => s.out().includes("Done: approval saved"), "done");
  await until(() => !alive(pid), "helper exit");
  assert.equal(readFileSync(join(s.state, "meal-grant.json"), "utf8").trim(), '{"approved":true}');
  assert.equal(readFileSync(join(s.state, "owner-did.txt"), "utf8").trim(), owner);
  assert.equal(existsSync(join(s.dir, "in")), false, "no code pipe is made");
  assert.doesNotMatch(block + steps, /\brm\b/, "the helper blocks run no rm");
});

test("§3 never asks for, relays or pipes a code, and never runs the helper in the foreground", () => {
  assert.doesNotMatch(section, /<the code>|mkfifo|--paste|\/delegate\?|paste (it|the code|each code)|PTY/);
  assert.match(block, /^nohup sh "\$G" healthlog > "\$S\/out" 2>&1 < \/dev\/null &$/m);
});

test("starting again while a helper waits keeps its record, and cancelling stops only that PID", async () => {
  const bystander = spawn("sh", ["-c", "sleep 30"], { stdio: "ignore" });
  try {
    const s = session("cancel");
    s.start();
    const pid = s.pid();
    await until(() => s.out().includes("openkey.so/a/init"), "sign-in link");
    assert.match(s.start(), /^HELPER_RUNNING/);
    assert.equal(s.pid(), pid);
    s.cancel();
    await until(() => !alive(pid), "helper exit");
    assert.match(s.out(), /Cancelled; nothing changed/);
    assert.equal(readFileSync(join(s.state, "meal-grant.json"), "utf8").trim(), '{"previous":true}');
    assert.ok(alive(bystander.pid), "an unrelated process was stopped");
  } finally { bystander.kill("SIGKILL"); }
});

test("after a sign-in is cancelled, starting again signs the owner in on the existing profile and finishes", async () => {
  const s = session("restart");
  s.start();
  const first = s.pid();
  await until(() => s.out().includes("openkey.so/a/init"), "sign-in link");
  s.cancel();
  await until(() => !alive(first), "helper exit");
  s.start();
  const pid = s.pid();
  await until(() => s.out().includes("Approve this request in OpenKey: https://openkey.so/a/login#k"), "sign-in again on the existing profile");
  assert.doesNotMatch(s.out(), /Could not read the signed-in owner account/);
  s.approve("login");
  await until(() => s.out().includes("openkey.so/a/grant"), "access link");
  s.approve("grant");
  await until(() => s.out().includes("Done: approval saved"), "done");
  await until(() => !alive(pid), "helper exit");
  assert.equal(readFileSync(join(s.state, "owner-did.txt"), "utf8").trim(), owner);
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
