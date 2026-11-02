import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// TC-2323: CLI 1.5.0/1.5.1 keep an approval request that expired before it was approved and then exit 8
// (APPROVAL_REQUEST_UNAVAILABLE, "HTTP 400") on every run. QA showed `auth logout` clears it unattended,
// so the guides cap the retries and use logout; they never edit the CLI's files.
const base = mkdtempSync(join("/var/tmp", "TC-2323."));
for (const key of ["HOME", "TC_HOME"]) process.env[key] = base;
after(() => rmSync(base, { recursive: true, force: true }));
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const guide = readFileSync(join(root, "setup/onboarding.md"), "utf8");
const exit8 = guide.split("- **Exit 8:**")[1]?.split("\n- **`APPROVAL_REQUEST_EXPIRED`")[0];

test("onboarding caps exit 8 at three tries, then logs out only for a dead request", () => {
  assert.ok(exit8, "the onboarding guide must handle exit 8");
  assert.match(exit8, /at most three times in a row/);
  assert.match(exit8, /`APPROVAL_REQUEST_UNAVAILABLE` with `\(HTTP 400\)`/);
  assert.match(exit8, /Run `"\$TC" auth logout` \(with the same `--profile <name>` if you used one\), then run `"\$TC" onboard` again/);
  assert.match(exit8, /Never edit or delete the CLI's files yourself\./);
  assert.match(exit8, /\*\*Otherwise:\*\* stop and report it to the owner; don't retry\./);
  assert.doesNotMatch(exit8, /```|approval-pending/, "no block touches the CLI's state");
});

test("owner-grant.sh caps exit 8 and names the owner-profile logout for a dead request, touching no CLI file", () => {
  const dir = join(base, "apps");
  const state = join(dir, "state");
  const profile = join(dir, ".tinycloud", "profiles", "owner");
  mkdirSync(state, { recursive: true });
  mkdirSync(profile, { recursive: true });
  const pending = join(profile, "approval-pending.json");
  writeFileSync(pending, JSON.stringify([{ version: 1, requestId: "dead", requestExpiresAt: new Date(Date.now() - 3600_000).toISOString() }]));
  writeFileSync(join(state, "meal-request.json"), "{}");
  writeFileSync(join(state, "owner-did.txt"), "did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
  const cli = join(dir, "tinycloud");
  writeFileSync(cli, `#!/bin/sh\necho "$*" >> "$HOME/calls"\ncase " $* " in *" context "*) echo '{"ownerDid":"did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' ;; *" auth grant "*) echo 'OpenKey could not discover this request (HTTP 400). Retry the command to resume.' >&2; exit 8 ;; esac\n`, { mode: 0o755 });
  const before = readFileSync(pending, "utf8");
  const out = spawnSync("sh", [join(root, "skills/tc-apps/owner-grant.sh"), "healthlog"], {
    encoding: "utf8", input: "", timeout: 20000,
    env: { PATH: process.env.PATH, HOME: dir, TC_HOME: dir, TC_APPS_STATE: state, TC_BIN: cli },
  });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /Run this step again in a minute, at most three times in a row\./);
  assert.match(out.stderr, /APPROVAL_REQUEST_UNAVAILABLE with \(HTTP 400\).*--profile owner auth logout, then run this step again; the owner signs in again first\. Otherwise stop and tell the owner\./);
  assert.doesNotMatch(out.stderr, /owner sign-in has expired/);
  assert.equal(readFileSync(pending, "utf8"), before, "the helper never edits the CLI's request file");
  assert.ok(!readFileSync(join(dir, "calls"), "utf8").includes("logout"), "the helper itself never logs the owner out");
});
