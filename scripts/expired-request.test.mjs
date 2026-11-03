import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// TC-2323: since OpenKey #407, a request that expired before it was approved gets 410 expired_request,
// and CLI 1.5.1 exits 3 (APPROVAL_REQUEST_EXPIRED) and drops it. The guides send the new link on exit 3,
// cap exit-8 retries at three, and never log out or edit the CLI's files to get past an expired link.
// TC-2238: /onboarding runs `onboard --timeout 1s` (js-sdk #822), where exit 8 with a `pending` object is
// the normal wait and an expired link can end as exit 3 once more before the next run makes a new one.
const base = mkdtempSync(join("/var/tmp", "TC-2323."));
for (const key of ["HOME", "TC_HOME"]) process.env[key] = base;
after(() => rmSync(base, { recursive: true, force: true }));
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const guide = readFileSync(join(root, "setup/onboarding.md"), "utf8");
const exit8 = guide.split("- **Exit 8 without a `pending` object:**")[1]?.split("\n- ")[0];
const expired = guide.split("- **`APPROVAL_REQUEST_EXPIRED` (exit 3):**")[1]?.split("\n- ")[0];

test("onboarding caps exit 8 without a pending link at three tries and never logs out", () => {
  assert.ok(exit8, "the onboarding guide must handle exit 8 without a pending object");
  assert.match(exit8, /at most three times in a row\. If it still fails, stop and report it to the owner; don't retry\./);
  assert.match(exit8, /Never edit or delete the CLI's files yourself\./);
  assert.doesNotMatch(guide, /"\$TC" auth logout|auth logout`? \(|HTTP 400|approval-pending/, "no logout or file way-out for an expired link");
});

test("onboarding reruns an expired link, which can end as exit 3 once more, then sends the new one", () => {
  assert.ok(expired, "the onboarding guide must handle APPROVAL_REQUEST_EXPIRED");
  assert.match(expired, /Run the same command again; it can end this way once more before it makes a new link\. Send the new link\./);
});

const helper = (code, message) => {
  const dir = join(base, `apps-${code}`);
  const state = join(dir, "state");
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "meal-request.json"), "{}");
  writeFileSync(join(state, "owner-did.txt"), "did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
  const cli = join(dir, "tinycloud");
  writeFileSync(cli, `#!/bin/sh\necho "$*" >> "$HOME/calls"\ncase " $* " in *" context "*) echo '{"ownerDid":"did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' ;; *" auth grant "*) echo '${message}' >&2; exit ${code} ;; esac\n`, { mode: 0o755 });
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
