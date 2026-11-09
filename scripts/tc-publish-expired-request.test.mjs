import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// TC-2238: tc-publish's sign-in (§2) is one `auth login --method openkey --no-popup` run, started detached with its
// output, process id and exit code in files; a separate check block reads them. Both blocks run here as written,
// against a stand-in CLI that prints CLI 1.6.2's approval banner (the link on its own line after
// "Approve this request in OpenKey (open the complete link):") and then waits for the owner.
const base = mkdtempSync(join("/var/tmp", "TC-2238-publish."));
after(() => rmSync(base, { recursive: true, force: true }));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(root, "skills/tc-publish/SKILL.md"), "utf8");
const blocks = [...skill.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((m) => m[1]);
const starter = blocks.find((b) => b.includes("auth login --method openkey"));
const reader = blocks.find((b) => b.includes('python3 - "$STATE" <<'));
const LINK = "https://openkey.so/a/ylu6utlcgitpzqibo2frkckghz#v=4&k=Abc-9_x&c=Def-0_y";
const BANNER = "Approve this request in OpenKey (open the complete link):";
const MESSAGE = "OpenKey could not discover this request (HTTP 503). Retry the command to resume.";

let count = 0;
const fresh = () => {
  const home = join(base, `h${++count}`);
  const state = join(home, "state");
  mkdirSync(state, { recursive: true });
  const cli = join(home, "tinycloud");
  writeFileSync(cli, `#!/bin/sh
printf '%s\\n' "$*" > "$HOME/args"
[ -t 0 ] && echo tty > "$HOME/stdin" || cat > "$HOME/stdin"
echo "${BANNER}" >&2
echo "${LINK}" >&2
echo >&2
i=0; while [ ! -e "$HOME/approved" ] && [ $i -lt 300 ]; do sleep 0.1; i=$((i + 1)); done
echo '{"authenticated":true,"declined":[]}'
`);
  chmodSync(cli, 0o755);
  return { home, state, env: { PATH: process.env.PATH, HOME: home, TC_BIN: cli, TC_PUBLISH_STATE: state } };
};
const SHELLS = ["sh", "bash"];   // sh is dash on Debian: nothing in the blocks may need bash
const runIn = (shell, script, w) => spawnSync(shell, ["-c", script], { encoding: "utf8", env: w.env, timeout: 20000 }).stdout.trim();
const run = (script, w) => runIn("sh", script, w);
const until = async (check) => {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail("timed out");
};
// A process whose command line looks like the sign-in, standing in for the CLI.
const sleeper = (w) => {
  const child = spawn("bash", ["-c", "sleep 30; :", "fake", "auth", "login", "--manifest", `${w.state}/share-publishing.json`], { stdio: "ignore" });
  writeFileSync(join(w.state, "login.pid"), `${child.pid}\n`);
  return { child, exited: new Promise((r) => child.on("exit", r)) };
};

test("the sign-in blocks exist", () => {
  assert.ok(starter && reader);
});

for (const shell of SHELLS) test(`the start block detaches the sign-in and returns at once, with no code; the check sends the link once, then the result (${shell})`, async () => {
  const w = fresh();
  const run = (script, w) => runIn(shell, script, w);
  const started = Date.now();
  assert.equal(run(starter, w), "LOGIN_STARTED");
  assert.ok(Date.now() - started < 1500, `the start block took ${Date.now() - started} ms`);
  let first;
  await until(() => (first = run(reader, w)) !== "LOGIN_RUNNING\nNO_LINK_YET");
  assert.equal(first, "LOGIN_RUNNING\nAPPROVE_LINK new");
  assert.equal(readFileSync(join(w.state, "approve.url"), "utf8"), LINK, "the link is the whole second line, fragment included");
  assert.equal(run(reader, w), "LOGIN_RUNNING\nAPPROVE_LINK same");
  assert.ok(!existsSync(join(w.state, "login.rc")), "the CLI is still running");
  const args = readFileSync(join(w.home, "args"), "utf8");
  assert.match(args, /--profile publisher auth login --method openkey --no-popup --manifest \S+share-publishing\.json --expiry 30d/);
  assert.doesNotMatch(args, /--paste/);
  assert.equal(readFileSync(join(w.home, "stdin"), "utf8"), "", "stdin is /dev/null");
  assert.equal(run(starter, w), "LOGIN_ALREADY_RUNNING — run the check");
  writeFileSync(join(w.home, "approved"), "");
  await until(() => existsSync(join(w.state, "login.rc")) && readFileSync(join(w.state, "login.rc"), "utf8").trim() === "0");
  assert.equal(run(reader, w), "SIGNED_IN");
  for (const file of ["login.out", "login.err", "login.rc", "login.pid", "approve.url"]) assert.ok(!existsSync(join(w.state, file)), file);
});

test("the check tells a running sign-in from a stopped one, and a stopped one's link is not new", async () => {
  const w = fresh();
  writeFileSync(join(w.state, "login.err"), `${BANNER}\n`);
  writeFileSync(join(w.state, "login.pid"), "999999999\n");
  assert.equal(run(reader, w), "LOGIN_STOPPED\nNO_LINK_YET");
  const live = sleeper(w);
  assert.equal(run(reader, w), "LOGIN_RUNNING\nNO_LINK_YET");
  writeFileSync(join(w.state, "login.err"), `${BANNER}\n${LINK.slice(0, 40)}`);
  assert.equal(run(reader, w), "LOGIN_RUNNING\nNO_LINK_YET", "a half-written link is never accepted");
  writeFileSync(join(w.state, "login.err"), `${BANNER}\n${LINK}\n\n`);
  assert.equal(run(reader, w), "LOGIN_RUNNING\nAPPROVE_LINK new");
  live.child.kill();
  await live.exited;
  assert.equal(run(reader, w), "LOGIN_STOPPED\nAPPROVE_LINK same");
  const other = spawn("sleep", ["30"], { stdio: "ignore" });
  writeFileSync(join(w.state, "login.pid"), `${other.pid}\n`);
  assert.equal(run(reader, w), "LOGIN_STOPPED\nAPPROVE_LINK same");
  assert.equal(other.exitCode, null, "an unrelated process is never signalled");
  other.kill();
});

test("the check refuses any printed link that is not a sealed openkey.so/a/ link, and stops the sign-in", async () => {
  for (const url of ["https://openkey.so/delegate?did=did:key:z6Mk&permissions=e30", "https://openkey.so/a/abc123", "https://openkey.so.evil.example/a/abc#k"]) {
    const w = fresh();
    const live = sleeper(w);
    writeFileSync(join(w.state, "login.err"), `${BANNER}\n${url}\n\n`);
    assert.equal(run(reader, w), "LOGIN_RUNNING\nREQUEST_MISMATCH not an OpenKey approval link - sign-in stopped", url);
    await live.exited;
    assert.ok(!existsSync(join(w.state, "approve.url")), url);
  }
  const w = fresh();
  const live = sleeper(w);
  writeFileSync(join(w.state, "login.err"), `${BANNER}\n${LINK}\n${LINK}x\n`);
  assert.equal(run(reader, w), "LOGIN_RUNNING\nREQUEST_MISMATCH more than one link - sign-in stopped");
  await live.exited;
});

test("the check reports a finished sign-in, with any permission the owner left out", () => {
  const w = fresh();
  writeFileSync(join(w.state, "login.rc"), "0\n");
  writeFileSync(join(w.state, "login.out"), JSON.stringify({ authenticated: true, declined: [{ service: "tinycloud.kv", path: "artifacts/" }] }));
  writeFileSync(join(w.state, "login.err"), `${BANNER}\n${LINK}\n\n`);
  assert.equal(run(reader, w), `NOT_GRANTED {"service": "tinycloud.kv", "path": "artifacts/"}\nSIGNED_IN`);
});

test("the check reports CLI errors by code with the CLI's message and the link redacted; only a resumable request keeps its link", () => {
  const w = fresh();
  const failed = (rc, code, message) => {
    writeFileSync(join(w.state, "approve.url"), LINK);
    writeFileSync(join(w.state, "login.rc"), `${rc}\n`);
    writeFileSync(join(w.state, "login.err"), `${BANNER}\n${LINK}\n\n${JSON.stringify({ error: { code, message } })}\n`);
    return run(reader, w);
  };
  assert.equal(failed(3, "APPROVAL_REQUEST_EXPIRED", `Open ${LINK} again`), "LOGIN_FAILED APPROVAL_REQUEST_EXPIRED Open <link> again");
  assert.ok(!existsSync(join(w.state, "approve.url")), "an expired request's link is dropped");
  assert.equal(failed(8, "APPROVAL_REQUEST_UNAVAILABLE", MESSAGE), `LOGIN_FAILED APPROVAL_REQUEST_UNAVAILABLE ${MESSAGE}`);
  assert.equal(readFileSync(join(w.state, "approve.url"), "utf8"), LINK, "a resumable request keeps its link, so it is not sent twice");
  assert.equal(failed(6, "NETWORK_ERROR", "The network did not answer."), "LOGIN_FAILED NETWORK_ERROR The network did not answer.");
  assert.equal(readFileSync(join(w.state, "approve.url"), "utf8"), LINK);
  writeFileSync(join(w.state, "login.rc"), "143\n");
  writeFileSync(join(w.state, "login.err"), `${BANNER}\n${LINK}\n\n`);
  assert.equal(run(reader, w), "LOGIN_FAILED exit-143");
});

test("a harness that kills the start block's process group does not lose the sign-in: the owner's approval is still read as SIGNED_IN", async (t) => {
  if (spawnSync("sh", ["-c", "command -v setsid"]).status !== 0) return t.skip("no setsid on this system");
  const w = fresh();
  const block = spawn("sh", ["-c", `${starter}\nsleep 30`], { detached: true, stdio: "ignore", env: w.env });
  await until(() => run(reader, w) === "LOGIN_RUNNING\nAPPROVE_LINK new");
  try { process.kill(-block.pid, "SIGKILL"); } catch {}
  await new Promise((r) => block.on("exit", r));
  assert.equal(run(reader, w), "LOGIN_RUNNING\nAPPROVE_LINK same", "the sign-in outlives the block's process group");
  writeFileSync(join(w.home, "approved"), "");
  await until(() => existsSync(join(w.state, "login.rc")));
  assert.equal(run(reader, w), "SIGNED_IN");
});

test("the check reads the result even when the exit code was never written, but not while the sign-in is still running", async () => {
  const w = fresh();
  writeFileSync(join(w.state, "login.pid"), "999999999\n");
  writeFileSync(join(w.state, "login.err"), `${BANNER}\n${LINK}\n\n`);
  writeFileSync(join(w.state, "login.out"), JSON.stringify({ authenticated: true, declined: [] }));
  writeFileSync(join(w.state, "approve.url"), LINK);
  assert.equal(run(reader, w), "SIGNED_IN");
  for (const file of ["login.out", "login.err", "login.pid", "approve.url"]) assert.ok(!existsSync(join(w.state, file)), file);
  const live = sleeper(w);
  writeFileSync(join(w.state, "login.out"), JSON.stringify({ authenticated: true, declined: [] }));
  assert.equal(run(reader, w), "LOGIN_RUNNING\nNO_LINK_YET", "the exit code is still to come");
  live.child.kill();
  await live.exited;
});
