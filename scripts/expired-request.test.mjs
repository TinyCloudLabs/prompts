import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// The 1.6.2 expired-request message and the shared agent-side decline rule are checked against standard/blocks.md.
const base = mkdtempSync(join("/var/tmp", "TC-2323."));
for (const key of ["HOME", "TC_HOME"]) process.env[key] = base;
after(() => rmSync(base, { recursive: true, force: true }));
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const guide = readFileSync(join(root, "setup/onboarding.md"), "utf8");
const errors = readFileSync(join(root, "standard/blocks.md"), "utf8").split(/^<!-- std:errors -->\n/m)[1].trim();
const row = (exit) => errors.split("\n").find((line) => line.startsWith(`| ${exit} |`));

test("onboarding caps exit 8 without a pending link at three tries and never logs out", () => {
  assert.ok(guide.includes("\n{{std:errors}}\n"), "the onboarding guide must carry the shared table");
  assert.match(row(8), /Or OpenKey is down: no `pending` object\./);
  assert.match(row(8), /at most 3 times in a row; then send the “can't” failed line and stop\./);
  assert.match(row(8), /Waiting never counts as a retry/);
  assert.doesNotMatch(guide, /"\$TC" auth logout|auth logout`? \(|HTTP 400|approval-pending/, "no logout or private-file way out for an expired link");
});

test("exit 3 uses expiry time and the approved decline question, not an automatic resend", () => {
  assert.match(row(3), /APPROVAL_REQUEST_EXPIRED/);
  assert.match(row(3), /Before doing anything else, use `pending\.expiresAt` from the earlier exit-8 JSON and compare it with now/);
  assert.match(row(3), /If more than 2 minutes remain before `expiresAt`, do not run a command or create a link; ask exactly/);
  assert.match(row(3), /Create a new request only when 2 minutes or less remain before `expiresAt`/);
  assert.match(row(3), /If you don't have the earlier exit-8 JSON, ask the decline question and wait/);
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

test("owner-grant.sh uses the shared decline/expiry rule after exit 3, not an automatic new link", () => {
  const { out } = helper(3, '{"error":{"code":"APPROVAL_REQUEST_EXPIRED"}}');
  assert.equal(out.status, 1);
  assert.match(out.stderr, /APPROVAL_REQUEST_EXPIRED above means the access link may have expired before it was approved: use the shared exit-3 decline\/expiry rule before starting a new request\./);
});
