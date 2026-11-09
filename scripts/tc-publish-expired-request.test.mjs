import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// TC-2238: tc-publish's sign-in is one `auth login --method openkey --no-popup` run started in the background; the agent
// reads its output files. CLI 1.6.2 prints the approval link on its own line after a banner line (see the CLI's
// "Approve this request in OpenKey (open the complete link):"), then keeps waiting until the owner approves.
const base = mkdtempSync(join("/var/tmp", "TC-2238-publish."));
after(() => rmSync(base, { recursive: true, force: true }));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(root, "skills/tc-publish/SKILL.md"), "utf8");
const blocks = [...skill.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((m) => m[1]);
const starter = blocks.find((b) => b.includes("auth login --method openkey"));
const reader = blocks.find((b) => b.includes('python3 - "$STATE/login.out" "$STATE/login.err"'));
const LINK = "https://openkey.so/a/abc123#v=4&k=KEY&c=CHALLENGE";
const BANNER = `Approve this request in OpenKey (open the complete link):\n${LINK}\n\n`;
const MESSAGE = "OpenKey could not discover this request (HTTP 503). Retry the command to resume.";

const readState = (state) => {
  const run = spawnSync("sh", ["-c", reader], { encoding: "utf8", timeout: 20000, env: { PATH: process.env.PATH, HOME: base, TC_PUBLISH_STATE: state } });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
};
const check = (name, { out = "", err = "" }) => {
  const state = join(base, name);
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "login.out"), out);
  writeFileSync(join(state, "login.err"), err);
  return readState(state);
};

test("the check prints the link from CLI 1.6.2's two-line banner while the sign-in is waiting", () => {
  assert.ok(reader, "the sign-in needs its check block");
  assert.equal(check("waiting", { err: BANNER }), `APPROVE_LINK ${LINK}`);
  assert.equal(check("banner-only", { err: "Approve this request in OpenKey (open the complete link):\n" }), "NO_LINK_YET");
  assert.equal(check("empty", {}), "NO_LINK_YET");
});

test("the check reports the sign-in as done, with any permission the owner left out", () => {
  const done = { authenticated: true, declined: [] };
  assert.equal(check("done", { out: JSON.stringify(done), err: BANNER }), "SIGNED_IN");
  const declined = { authenticated: true, declined: [{ service: "tinycloud.kv", path: "artifacts/" }] };
  assert.equal(check("declined", { out: JSON.stringify(declined), err: BANNER }), `NOT_GRANTED {"service": "tinycloud.kv", "path": "artifacts/"}\nSIGNED_IN`);
});

test("the check prints the CLI's error code and message, with the link redacted", () => {
  const err = `${BANNER}${JSON.stringify({ error: { code: "APPROVAL_REQUEST_UNAVAILABLE", message: MESSAGE } })}\n`;
  assert.equal(check("exit8", { err }), `LOGIN_FAILED APPROVAL_REQUEST_UNAVAILABLE ${MESSAGE}`);
  const linked = `${BANNER}${JSON.stringify({ error: { code: "APPROVAL_REQUEST_EXPIRED", message: `Open ${LINK} again` } })}\n`;
  assert.equal(check("exit3", { err: linked }), "LOGIN_FAILED APPROVAL_REQUEST_EXPIRED Open <link> again");
});

test("the sign-in block starts one login in the background with no code and no foreground wait", () => {
  assert.ok(starter, "the sign-in needs its start block");
  const home = join(base, "start-home");
  const state = join(home, "state");
  const bin = join(home, "stub-tinycloud");
  const calls = join(home, "calls");
  mkdirSync(home, { recursive: true });
  writeFileSync(bin, `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(calls)}
cat > ${JSON.stringify(join(home, "stdin"))}
printf 'Approve this request in OpenKey (open the complete link):\\n%s\\n\\n' ${JSON.stringify(LINK)} >&2
sleep 30
`);
  chmodSync(bin, 0o700);
  const started = Date.now();
  const run = spawnSync("sh", ["-c", `${starter}\nsleep 1`], { encoding: "utf8", timeout: 20000, env: { PATH: process.env.PATH, HOME: home, TC_BIN: bin, TC_PUBLISH_STATE: state } });
  try {
    assert.equal(run.status, 0, run.stderr);
    assert.ok(Date.now() - started < 15000, "the block must return while the login is still waiting");
    const args = readFileSync(calls, "utf8");
    assert.match(args, /--profile publisher auth login --method openkey --no-popup --manifest .*share-publishing\.json --expiry 30d/);
    assert.doesNotMatch(args, /--paste/);
    assert.equal(readFileSync(join(home, "stdin"), "utf8"), "", "stdin is /dev/null");
    assert.equal(readState(state), `APPROVE_LINK ${LINK}`);
  } finally {
    spawnSync("pkill", ["-f", bin]);
  }
});
