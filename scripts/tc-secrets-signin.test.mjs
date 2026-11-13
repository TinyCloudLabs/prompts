import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// tc-secrets §3b-§3d, run as written against a stand-in CLI that prints CLI 1.6.6's approval banner (the link on its
// own line, after "Approve this request in OpenKey (open the complete link):"): no code is read, the sign-in runs in the
// background with its output in files, and only a sealed openkey.so/a/ link is accepted.
const base = mkdtempSync(join("/var/tmp", "tc-secrets-signin."));
after(() => rmSync(base, { recursive: true, force: true }));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(root, "skills/tc-secrets/SKILL.md"), "utf8");
const block = (step) => {
  const from = skill.indexOf(`**${step}.`);
  assert.ok(from > 0, step);
  return skill.slice(from).match(/```sh\n([\s\S]*?)\n```/)[1].replace("NAMES='<SECRET_NAME …>'", "NAMES='ELEVENLABS_API_KEY'");
};
const OWNER = "did:pkh:eip155:1:0xd559CCd9EB87c530A9a349262669386dE93cf412";
const LINK = "https://openkey.so/a/ylu6utlcgitpzqibo2frkckghz#v=4&k=Abc-9_x&c=Def-0_y";
const BANNER = "Approve this request in OpenKey (open the complete link):";

let count = 0;
const fresh = () => {
  const home = join(base, `h${++count}`);
  const state = join(home, "state");
  mkdirSync(state, { recursive: true });
  // Prints the banner, waits until the test "approves", then prints the CLI's success JSON.
  const cli = join(home, "tinycloud");
  writeFileSync(cli, `#!/bin/sh
printf '%s\\n' "$*" > "$HOME/args"
[ -t 0 ] && echo tty > "$HOME/stdin" || cat > "$HOME/stdin"
echo "${BANNER}" >&2
echo "${LINK}" >&2
echo >&2
i=0; while [ ! -e "$HOME/approved" ] && [ $i -lt 300 ]; do sleep 0.1; i=$((i + 1)); done
echo '{"authenticated":true,"profile":"api-keys","scoped":true,"declined":[],"expiresAt":"2026-12-01T00:00:00.000Z"}'
`, { mode: 0o755 });
  const env = { PATH: process.env.PATH, HOME: home, TC_BIN: cli, TC_OWNER_DID: OWNER, TC_SECRETS_STATE: state };
  return { home, state, env };
};
const sh = (step, env, shell = "bash") => spawnSync(shell, ["-c", block(step)], { encoding: "utf8", env, timeout: 20000 }).stdout.trim();
const rc = (w) => (existsSync(join(w.state, "login.rc")) ? readFileSync(join(w.state, "login.rc"), "utf8").trim() : "");
const until = async (check) => {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail("timed out");
};

test("§3b writes and checks the manifest before any sign-in", () => {
  const w = fresh();
  assert.equal(sh("3b", w.env), "REQUEST_OK ELEVENLABS_API_KEY");
  const manifest = JSON.parse(readFileSync(join(w.state, "manifest.json"), "utf8"));
  assert.equal(manifest.space, "secrets");
  assert.deepEqual(manifest.permissions.map((p) => [p.service, p.path, p.actions]), [
    ["tinycloud.kv", "vault/secrets/ELEVENLABS_API_KEY", ["get"]],
    ["tinycloud.encryption", `urn:tinycloud:encryption:${OWNER}:default`, ["decrypt"]],
    ["tinycloud.capabilities", "", ["read"]],
  ]);
  assert.match(sh("3b", { ...w.env, TC_OWNER_DID: "0xd559" }), /^BAD_INPUT /);
  assert.ok(!existsSync(join(w.home, "args")), "§3b never starts the CLI");
});

for (const shell of ["bash", "sh"]) test(`§3c detaches the sign-in and returns at once, without a code; §3d sends the link once, then reads the result (${shell})`, async () => {
  const w = fresh();
  sh("3b", w.env, shell);
  const started = Date.now();
  assert.equal(sh("3c", w.env, shell), "LOGIN_STARTED");
  assert.ok(Date.now() - started < 1500, `§3c took ${Date.now() - started} ms`);
  let first;
  await until(() => !["STARTING", "LOGIN_STOPPED"].includes(first = sh("3d", w.env, shell)));
  assert.equal(first, "APPROVAL_READY new");
  assert.equal(readFileSync(join(w.state, "approve.url"), "utf8"), LINK, "the link is the whole second line, fragment included");
  assert.equal(sh("3d", w.env, shell), "APPROVAL_READY same");
  assert.equal(rc(w), "", "the CLI is still running: no exit status yet");
  const args = readFileSync(join(w.home, "args"), "utf8");
  assert.match(args, /auth login --method openkey --manifest \S+manifest\.json --owner \S+ --expiry 30d --no-popup/);
  assert.doesNotMatch(args, /--paste/);
  assert.equal(readFileSync(join(w.home, "stdin"), "utf8"), "", "stdin is /dev/null");
  assert.equal(sh("3c", w.env, shell), "LOGIN_ALREADY_RUNNING — run §3d");
  writeFileSync(join(w.home, "approved"), "");
  await until(() => rc(w) === "0");
  assert.equal(sh("3d", w.env, shell), "SIGNED_IN expires 2026-12-01T00:00:00.000Z declined []");
  for (const file of ["login.out", "login.err", "login.rc", "login.pid", "approve.url"]) assert.ok(!existsSync(join(w.state, file)), file);
});

test("§3d refuses any printed link that is not a sealed openkey.so/a/ link, and stops the sign-in", async () => {
  for (const url of ["https://openkey.so/delegate?did=did:key:z6Mk&permissions=e30", "https://openkey.so/a/abc123", "https://openkey.so.evil.example/a/abc#k"]) {
    const w = fresh();
    const sleeper = spawn("bash", ["-c", "sleep 30; :", "fake", "auth", "login", "--manifest", `${w.state}/manifest.json`], { stdio: "ignore" });
    writeFileSync(join(w.state, "login.pid"), `${sleeper.pid}\n`);
    writeFileSync(join(w.state, "login.err"), `${BANNER}\n${url}\n\n`);
    const exited = new Promise((r) => sleeper.on("exit", r));
    assert.equal(sh("3d", w.env), "REQUEST_MISMATCH not an OpenKey approval link - sign-in stopped", url);
    await exited;
    assert.ok(!existsSync(join(w.state, "approve.url")), url);
  }
});

test("§3d waits for the link's line to be complete, and refuses two different links", async () => {
  const w = fresh();
  const sleeper = spawn("bash", ["-c", "sleep 30; :", "fake", "auth", "login", "--manifest", `${w.state}/manifest.json`], { stdio: "ignore" });
  writeFileSync(join(w.state, "login.pid"), `${sleeper.pid}\n`);
  writeFileSync(join(w.state, "login.err"), `${BANNER}\n${LINK.slice(0, 40)}`);
  assert.equal(sh("3d", w.env), "STARTING", "a half-written link is never accepted");
  assert.ok(!existsSync(join(w.state, "approve.url")));
  const exited = new Promise((r) => sleeper.on("exit", r));
  writeFileSync(join(w.state, "login.err"), `${BANNER}\n${LINK}\n${LINK}x\n`);
  assert.equal(sh("3d", w.env), "REQUEST_MISMATCH more than one link - sign-in stopped");
  await exited;
});

test("§3d and §3c treat a PID that is gone, or is no longer the sign-in, as stopped", async () => {
  const w = fresh();
  writeFileSync(join(w.state, "login.pid"), "999999999\n");
  writeFileSync(join(w.state, "login.err"), `${BANNER}\n${LINK}\n\n`);
  assert.equal(sh("3d", w.env), "LOGIN_STOPPED");
  const other = spawn("sleep", ["30"], { stdio: "ignore" });
  writeFileSync(join(w.state, "login.pid"), `${other.pid}\n`);
  assert.equal(sh("3d", w.env), "LOGIN_STOPPED");
  assert.equal(other.exitCode, null, "an unrelated process is never signalled");
  sh("3b", w.env);
  assert.equal(sh("3c", w.env), "LOGIN_STARTED");
  other.kill();
  writeFileSync(join(w.home, "approved"), "");
  await until(() => rc(w) !== "");
});

test("§3d reports CLI errors by code, with the CLI's message", () => {
  const w = fresh();
  writeFileSync(join(w.state, "login.rc"), "3\n");
  writeFileSync(join(w.state, "login.err"), `${BANNER}\n${LINK}\n\n{"error":{"code":"APPROVAL_REQUEST_EXPIRED","message":"This approval request expired before it was approved. Start a new request."}}\n`);
  writeFileSync(join(w.state, "approve.url"), LINK);
  assert.equal(sh("3d", w.env), "LOGIN_FAILED APPROVAL_REQUEST_EXPIRED This approval request expired before it was approved. Start a new request.");
  assert.ok(!existsSync(join(w.state, "approve.url")), "an expired request's link is dropped");
  const message = "OpenKey could not discover this request (HTTP 503). Retry the command to resume.";
  writeFileSync(join(w.state, "approve.url"), LINK);
  writeFileSync(join(w.state, "login.rc"), "8\n");
  writeFileSync(join(w.state, "login.err"), `${BANNER}\n${LINK}\n\n${JSON.stringify({ error: { code: "APPROVAL_REQUEST_UNAVAILABLE", message } })}\n`);
  assert.equal(sh("3d", w.env), `LOGIN_FAILED APPROVAL_REQUEST_UNAVAILABLE ${message}`);
  assert.equal(readFileSync(join(w.state, "approve.url"), "utf8"), LINK, "a resumable request keeps its link, so it is not sent twice");
});

test("the sign-in survives its tool call's process group being killed; the exit status is written inside the detached session", async (ctx) => {
  if (spawnSync("sh", ["-c", "command -v setsid"]).status !== 0) return ctx.skip("no setsid");
  for (const shell of ["bash", "sh"]) {
    const w = fresh();
    sh("3b", w.env, shell);
    const start = spawn(shell, ["-c", block("3c")], { env: w.env, detached: true, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    start.stdout.on("data", (d) => (out += d));
    await new Promise((r) => start.on("close", r));
    assert.equal(out.trim(), "LOGIN_STARTED", shell);
    try { process.kill(-start.pid, "SIGKILL"); } catch {}   // a harness ending the tool call's process group
    let first;
    await until(() => !["STARTING", "LOGIN_STOPPED"].includes(first = sh("3d", w.env, shell)));
    assert.equal(first, "APPROVAL_READY new", shell);
    writeFileSync(join(w.home, "approved"), "");
    await until(() => rc(w) === "0");
    assert.equal(sh("3d", w.env, shell), "SIGNED_IN expires 2026-12-01T00:00:00.000Z declined []", shell);
  }
});

test("§3d reads the result of a sign-in that ended without writing its exit status", () => {
  const w = fresh();
  writeFileSync(join(w.state, "login.pid"), "999999999\n");
  writeFileSync(join(w.state, "login.err"), `${BANNER}\n${LINK}\n\n`);
  writeFileSync(join(w.state, "login.out"), '{"authenticated":true,"declined":[],"expiresAt":"2026-12-01T00:00:00.000Z"}\n');
  assert.equal(sh("3d", w.env), "SIGNED_IN expires 2026-12-01T00:00:00.000Z declined []");
  writeFileSync(join(w.state, "login.pid"), "999999999\n");
  writeFileSync(join(w.state, "login.err"), '{"error":{"code":"APPROVAL_REQUEST_UNAVAILABLE","message":"OpenKey is down."}}\n');
  assert.equal(sh("3d", w.env), "LOGIN_FAILED APPROVAL_REQUEST_UNAVAILABLE OpenKey is down.");
});

// Live run (Claude Code): a command whose `sh -c` script contains rm is denied by the built-in removal check
// ("This shell -c script runs rm and could not be checked"). The §3c start block must contain no rm at all.
test("the §3c start block has no rm, so Claude Code's removal check lets it run", () => {
  assert.doesNotMatch(block("3c"), /\brm\b/);
});
