import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// tc-secrets §3b-§3d, run as written against a stand-in CLI: no code is read, the sign-in runs in
// the background with its output in files, and only a sealed openkey.so/a/ link is accepted.
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
const LINK = "https://openkey.so/a/ylu6utlcgitpzqibo2frkckghz#k1_Abc-9";

let count = 0;
const fresh = () => {
  const home = join(base, `h${++count}`);
  const state = join(home, "state");
  mkdirSync(state, { recursive: true });
  // Prints the link, waits until the test "approves", then prints the CLI's success JSON.
  const cli = join(home, "tinycloud");
  writeFileSync(cli, `#!/bin/sh
printf '%s\\n' "$*" > "$HOME/args"
[ -t 0 ] && echo tty > "$HOME/stdin" || cat > "$HOME/stdin"
echo "Approve this request in OpenKey: ${LINK}" >&2
i=0; while [ ! -e "$HOME/approved" ] && [ $i -lt 300 ]; do sleep 0.1; i=$((i + 1)); done
echo '{"authenticated":true,"profile":"api-keys","scoped":true,"declined":[],"expiresAt":"2026-12-01T00:00:00.000Z"}'
`, { mode: 0o755 });
  const env = { PATH: process.env.PATH, HOME: home, TC_BIN: cli, TC_OWNER_DID: OWNER, TC_SECRETS_STATE: state };
  return { home, state, env };
};
const sh = (step, env) => spawnSync("bash", ["-c", block(step)], { encoding: "utf8", env, timeout: 20000 }).stdout.trim();
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

test("§3c runs the sign-in in the background without a code; §3d sends the link once, then reads the result", async () => {
  const w = fresh();
  sh("3b", w.env);
  const job = spawn("bash", ["-c", block("3c")], { env: w.env, stdio: "ignore" });
  let first;
  await until(() => !["STARTING", "LOGIN_STOPPED"].includes(first = sh("3d", w.env)));
  assert.equal(first, "APPROVAL_READY new");
  assert.equal(readFileSync(join(w.state, "approve.url"), "utf8"), LINK);
  assert.equal(sh("3d", w.env), "APPROVAL_READY same");
  const args = readFileSync(join(w.home, "args"), "utf8");
  assert.match(args, /auth login --method openkey --manifest \S+manifest\.json --owner \S+ --expiry 30d --no-popup/);
  assert.doesNotMatch(args, /--paste/);
  assert.equal(readFileSync(join(w.home, "stdin"), "utf8"), "", "stdin is /dev/null");
  assert.equal(sh("3c", w.env), "LOGIN_ALREADY_RUNNING — run §3d");
  writeFileSync(join(w.home, "approved"), "");
  await new Promise((r) => job.on("exit", r));
  assert.equal(sh("3d", w.env), "SIGNED_IN expires 2026-12-01T00:00:00.000Z declined []");
  for (const file of ["login.out", "login.err", "login.rc", "login.pid", "approve.url"]) assert.ok(!existsSync(join(w.state, file)), file);
});

test("§3d refuses any printed link that is not a sealed openkey.so/a/ link, and stops the sign-in", async () => {
  for (const url of ["https://openkey.so/delegate?did=did:key:z6Mk&permissions=e30", "https://openkey.so/a/abc123", "https://openkey.so.evil.example/a/abc#k"]) {
    const w = fresh();
    const sleeper = spawn("sleep", ["30"], { stdio: "ignore" });
    writeFileSync(join(w.state, "login.pid"), `${sleeper.pid}\n`);
    writeFileSync(join(w.state, "login.err"), `Approve this request in OpenKey: ${url}\n`);
    const exited = new Promise((r) => sleeper.on("exit", r));
    assert.equal(sh("3d", w.env), "REQUEST_MISMATCH not an OpenKey approval link - sign-in stopped", url);
    await exited;
    assert.ok(!existsSync(join(w.state, "approve.url")), url);
  }
});

test("§3d reports a stopped sign-in and CLI errors by code", () => {
  const w = fresh();
  writeFileSync(join(w.state, "login.pid"), "999999999\n");
  writeFileSync(join(w.state, "login.err"), `Approve this request in OpenKey: ${LINK}\n`);
  assert.equal(sh("3d", w.env), "LOGIN_STOPPED");
  writeFileSync(join(w.state, "login.rc"), "3\n");
  writeFileSync(join(w.state, "login.err"), '{"error":{"code":"APPROVAL_REQUEST_EXPIRED","message":"This approval request expired before it was approved. Start a new request."}}\n');
  assert.equal(sh("3d", w.env), "LOGIN_FAILED APPROVAL_REQUEST_EXPIRED This approval request expired before it was approved. Start a new request.");
});
