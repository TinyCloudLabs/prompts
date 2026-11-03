import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// TC-2323: since OpenKey #407, a request that expired before it was approved gets 410 expired_request,
// and CLI 1.5.1 exits 3 (APPROVAL_REQUEST_EXPIRED) and drops it. The guides send the new link on exit 3,
// cap exit-8 retries at three, and never log out or edit the CLI's files to get past an expired link.
// TC-2238: /onboarding runs `onboard --timeout 60s` (js-sdk #822), where exit 8 with a `pending` object is
// the normal wait and an expired link can end as exit 3 once more before the next run makes a new one.
const base = mkdtempSync(join("/var/tmp", "TC-2323."));
for (const key of ["HOME", "TC_HOME"]) process.env[key] = base;
after(() => rmSync(base, { recursive: true, force: true }));
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const guide = readFileSync(join(root, "setup/onboarding.md"), "utf8");
// Standard C: the exit-8 and exit-3 rows live once in setup/errors.md, which the build pastes into /onboarding.
const errors = readFileSync(join(root, "setup/errors.md"), "utf8");
const row = (exit) => errors.split("\n").find((line) => line.startsWith(`| ${exit} |`));

test("onboarding caps exit 8 without a pending link at three tries and never logs out", () => {
  assert.ok(guide.includes("\n{{ERRORS}}\n"), "the onboarding guide must carry the shared table");
  assert.match(row(8), /Or OpenKey is down: no `pending` object\./);
  assert.match(row(8), /run it at most 3 times in a row; then send the "can't" failed line and stop\./);
  assert.match(row(8), /Waiting never counts as a retry\./);
  assert.match(guide, /Never edit or delete the CLI's files yourself, and never log out, to get past an error or an expired link\./);
  assert.doesNotMatch(guide, /"\$TC" auth logout|auth logout`? \(|HTTP 400|approval-pending/, "no logout or file way-out for an expired link");
});

test("onboarding reruns an expired link, which can end as exit 3 once more, then sends the new one", () => {
  assert.match(row(3), /Run the same command again\. It can end with 3 once more before it makes a new link\. Send the new link once, with the retry line\./);
});

const helper = (code, message, { signedIn = true, name = `apps-${code}` } = {}) => {
  const dir = join(base, name);
  const state = join(dir, "state");
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "meal-request.json"), "{}");
  if (signedIn) writeFileSync(join(state, "owner-did.txt"), "did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
  const cli = join(dir, "tinycloud");
  // Signed in: the access grant ends with the given exit. Not signed in: no owner profile yet, and the sign-in
  // (init) ends with it.
  const cases = signedIn
    ? `*" context "*) echo '{"ownerDid":"did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' ;; *" auth grant "*) echo '${message}' >&2; exit ${code} ;;`
    : `*" profile show "*) echo '{"error":{"code":"PROFILE_NOT_FOUND"}}' >&2; exit 4 ;; *" init "*) echo '${message}' >&2; exit ${code} ;;`;
  writeFileSync(cli, `#!/bin/sh\necho "$*" >> "$HOME/calls"\ncase " $* " in ${cases} esac\n`, { mode: 0o755 });
  const out = spawnSync("sh", [join(root, "skills/tc-apps/owner-grant.sh"), "healthlog"], {
    encoding: "utf8", input: "", timeout: 20000,
    env: { PATH: process.env.PATH, HOME: dir, TC_HOME: dir, TC_APPS_STATE: state, TC_BIN: cli },
  });
  return { out, calls: readFileSync(join(dir, "calls"), "utf8") };
};

test("owner-grant.sh caps exit 8 at three tries and names no logout", () => {
  const { out, calls } = helper(8, "OpenKey could not discover this request (HTTP 503). Retry the command to resume.");
  assert.equal(out.status, 1);
  assert.match(out.stderr, /Run this step again in a minute, at most three times in a row; if it still fails, stop and tell the owner\./);
  assert.doesNotMatch(out.stderr, /logout|HTTP 400/);
  assert.ok(!calls.includes("logout"), "the helper never logs the owner out");
});

test("owner-grant.sh sends the agent back for a new link when the access link expired (exit 3)", () => {
  const { out } = helper(3, '{"error":{"code":"APPROVAL_REQUEST_EXPIRED"}}');
  assert.equal(out.status, 1);
  assert.match(out.stderr, /APPROVAL_REQUEST_EXPIRED above means the access link expired before it was approved: run this step again for a new link\./);
});

test("owner-grant.sh sends the agent back for a new link when the sign-in link expired (exit 3)", () => {
  const { out, calls } = helper(3, '{"error":{"code":"APPROVAL_REQUEST_EXPIRED"}}', { signedIn: false, name: "apps-signin-3" });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /APPROVAL_REQUEST_EXPIRED above means the sign-in link expired before it was approved: run this step again for a new link, and send it with the retry line\./);
  assert.ok(calls.includes("init --name owner --no-popup\n"), calls);
  assert.ok(!calls.includes("auth grant"), "nothing is granted after an expired sign-in");
});
