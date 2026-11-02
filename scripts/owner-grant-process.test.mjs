import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { after, test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = mkdtempSync("/var/tmp/tc2174-pid.");
for (const key of ["HOME", "TC_HOME", "COURIER_HOME", "BUN_INSTALL_CACHE_DIR"]) process.env[key] = base;
for (const key of ["HOME", "TC_HOME", "COURIER_HOME", "BUN_INSTALL_CACHE_DIR"]) assert.equal(process.env[key], base);
writeFileSync(join(base, "temp-paths.txt"), base + "\n");
after(() => rmSync(base, { recursive: true, force: true }));
const script = join(root, "skills/tc-apps/owner-grant.sh");
const owner = "did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const cli = join(base, "cli.mjs");
writeFileSync(cli, `#!${process.execPath}
import { createInterface } from 'node:readline';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const a = process.argv.slice(2), signed = join(process.env.HOME, 'signed');
if (a.includes('show')) {
  if (!existsSync(signed)) { console.error('PROFILE_NOT_FOUND'); process.exit(4); }
  process.exit(0);
}
if (a.includes('context')) { console.log(JSON.stringify({ ownerDid: '${owner}' })); process.exit(0); }
const stage = a.includes('init') ? 'init' : 'grant';
console.error('READY ' + stage + ' ' + process.pid);
// The sign-in reads its code from stdin; the grant waits for OpenKey approval with no code, as CLI 1.5.0 does.
if (stage === 'init') {
  createInterface({ input: process.stdin }).once('line', code => {
    if (code !== 'init-code') process.exit(3);
    writeFileSync(signed, 'signed');
    process.exit(0);
  });
} else {
  setInterval(() => { if (existsSync(join(process.env.HOME, 'approved'))) { console.log('{"approved":true}'); process.exit(0); } }, 100);
}
`, { mode: 0o755 });

function start(name, stage) {
  const home = join(base, name);
  mkdirSync(home);
  writeFileSync(join(home, "meal-request.json"), "{}");
  writeFileSync(join(home, "meal-grant.json"), '{"previous":true}\n');
  if (stage === "grant") writeFileSync(join(home, "signed"), "signed");
  const proc = spawn("sh", [script, "healthlog"], { env: { PATH: process.env.PATH, HOME: home,
    TC_HOME: home, TC_APPS_STATE: home, TC_BIN: cli, COURIER_HOME: home, BUN_INSTALL_CACHE_DIR: home, TZ: "UTC" },
    stdio: ["pipe", "pipe", "pipe"] });
  const children = new Set();
  let stderr = "", finish = false;
  const ready = new Promise((resolveReady) => {
    proc.stderr.on("data", (data) => {
      stderr += data;
      for (const match of String(data).matchAll(/READY (init|grant) (\d+)/g)) {
        children.add(Number(match[2]));
        if (finish && match[1] === "grant") writeFileSync(join(home, "approved"), "");
        else if (finish) proc.stdin.write("init-code\n");
        resolveReady(Number(match[2]));
      }
    });
  });
  proc.stdout.resume();
  const closed = new Promise((resolveClose, reject) => {
    proc.once("error", reject);
    proc.once("close", (code, signal) => resolveClose({ code, signal }));
  });
  return { home, proc, children, ready, closed, stderr: () => stderr,
    finish() { finish = true; if (stage === "grant") writeFileSync(join(home, "approved"), ""); else proc.stdin.write("init-code\n"); },
    async cleanup() {
      // Only PIDs this test started (the helper and its reported fixture children).
      if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
      for (const pid of children) { try { process.kill(pid, "SIGKILL"); } catch (e) { if (e.code !== "ESRCH") throw e; } }
      await Promise.race([closed, delay(1000)]);
    },
  };
}

for (const stage of ["init", "grant"]) {
  test(`cancelling ${stage} stops only its own approval process and preserves another grant flow`, { timeout: 8000 }, async () => {
    const target = start(stage + "-target", stage);
    const other = start(stage + "-other", stage);
    try {
      const [childPid, otherPid] = await Promise.race([
        Promise.all([target.ready, other.ready]), delay(2000).then(() => { throw new Error("approval fixture did not become ready"); }),
      ]);
      target.proc.kill("SIGTERM");
      const result = await Promise.race([target.closed, delay(1000).then(() => null)]);
      assert.deepEqual(result, { code: 143, signal: null }, "cancellation must stop the helper and its waiting CLI promptly");
      assert.throws(() => process.kill(childPid, 0), { code: "ESRCH" }, "cancelled CLI must not remain running");
      assert.match(target.stderr(), new RegExp(`OWNER_GRANT_PID=${target.proc.pid}\\b`));
      assert.equal(readFileSync(join(target.home, "meal-grant.json"), "utf8"), '{"previous":true}\n');
      assert.deepEqual(readdirSync(target.home).filter(name => name.startsWith("meal-grant.json.")), []);
      assert.equal(process.kill(other.proc.pid, 0), true, "another owner-grant.sh helper must survive");
      assert.equal(process.kill(otherPid, 0), true, "the other approval CLI must survive");
      other.finish();
      assert.deepEqual(await Promise.race([other.closed, delay(2000).then(() => null)]), { code: 0, signal: null });
      assert.deepEqual(JSON.parse(readFileSync(join(other.home, "meal-grant.json"), "utf8")), { approved: true });
    } finally {
      await Promise.all([target.cleanup(), other.cleanup()]);
    }
  });
}
