import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// TC-2323: CLI 1.5.x keeps an approval request that expired unapproved in approval-pending.json and
// exits 8 on every later run. The guides drop only such dead requests so the next run prints a fresh link.
const base = mkdtempSync(join("/var/tmp", "TC-2323."));
for (const key of ["HOME", "TC_HOME"]) process.env[key] = base;
after(() => rmSync(base, { recursive: true, force: true }));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const hourAgo = new Date(Date.now() - 3600_000).toISOString();
const inAnHour = new Date(Date.now() + 3600_000).toISOString();
const entries = () => [
  { requestId: "dead", requestExpiresAt: hourAgo },
  { requestId: "live", requestExpiresAt: inAnHour },
  { requestId: "approved", requestExpiresAt: hourAgo, resultRef: "r", resultEnvelope: "e" },
];
let count = 0;
const home = (profile, items) => {
  const dir = join(base, `h${++count}`);
  const profileDir = join(dir, ".tinycloud", "profiles", profile);
  mkdirSync(profileDir, { recursive: true });
  if (items) writeFileSync(join(profileDir, "approval-pending.json"), JSON.stringify(items), { mode: 0o600 });
  return { dir, file: join(profileDir, "approval-pending.json") };
};
const ids = (file) => JSON.parse(readFileSync(file, "utf8")).map((item) => item.requestId);

const guide = readFileSync(join(root, "setup/onboarding.md"), "utf8");
const exit8 = guide.split("- **Exit 8:**")[1]?.split("\n- **`APPROVAL_REQUEST_EXPIRED`")[0];
const dropBlock = exit8?.match(/```sh\n([\s\S]*?)\n\s*```/)?.[1];
const runDrop = (dir, env = {}) => spawnSync("sh", ["-c", dropBlock], {
  encoding: "utf8", timeout: 20000, env: { PATH: process.env.PATH, HOME: dir, TC_HOME: dir, ...env },
});

test("onboarding caps exit 8 at three tries before dropping the dead request", () => {
  assert.ok(dropBlock, "the Exit 8 case must carry the drop block");
  assert.match(exit8, /After the third exit 8 in a row, stop retrying/);
  assert.match(exit8, /`NONE_EXPIRED`:\*\* OpenKey is still unavailable\. Stop and report it to the owner; don't retry\./);
});

test("onboarding's block drops only requests that expired with no result, keeping mode 0600", () => {
  const h = home("default", entries());
  const out = runDrop(h.dir);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), "DROPPED");
  assert.deepEqual(ids(h.file), ["live", "approved"]);
  assert.equal(statSync(h.file).mode & 0o777, 0o600);
});

test("onboarding's block changes nothing when no request has expired, or there is no request file", () => {
  const live = home("default", entries().slice(1));
  const before = readFileSync(live.file, "utf8");
  const out = runDrop(live.dir);
  assert.equal(out.stdout.trim(), "NONE_EXPIRED", out.stderr);
  assert.equal(readFileSync(live.file, "utf8"), before);
  const none = home("default");
  assert.equal(runDrop(none.dir).stdout.trim(), "NONE_EXPIRED");
  assert.equal(existsSync(none.file), false);
});

test("onboarding's block follows TC_PROFILE", () => {
  const h = home("owner", entries());
  const out = runDrop(h.dir, { TC_PROFILE: "owner" });
  assert.equal(out.stdout.trim(), "DROPPED", out.stderr);
  assert.deepEqual(ids(h.file), ["live", "approved"]);
});

// owner-grant.sh: a stand-in CLI that, like CLI 1.5.1, exits 8 on `auth grant` while a dead request is stored.
const ownerGrant = (items) => {
  const h = home("owner", items);
  const state = join(h.dir, "state");
  mkdirSync(state);
  writeFileSync(join(state, "meal-request.json"), "{}");
  writeFileSync(join(state, "owner-did.txt"), "did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
  const cli = join(h.dir, "tinycloud");
  writeFileSync(cli, String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2).slice(2);
const file = ${JSON.stringify(h.file)};
const items = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
if (args[0] === "profile") console.log("{}");
else if (args[0] === "context") console.log(JSON.stringify({ ownerDid: "did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }));
else if (args[0] === "auth" && args[1] === "grant") {
  if (items.some((i) => !i.resultRef && Date.parse(i.requestExpiresAt) < Date.now())) {
    process.stderr.write('{"error":{"code":"APPROVAL_REQUEST_UNAVAILABLE"}}\n');
    process.exit(8);
  }
  console.log('{"ok":true}');
}
`, { mode: 0o755 });
  const out = spawnSync("sh", [join(root, "skills/tc-apps/owner-grant.sh"), "healthlog"], {
    encoding: "utf8", input: "", timeout: 20000,
    env: { PATH: process.env.PATH, HOME: h.dir, TC_HOME: h.dir, TC_APPS_STATE: state, TC_BIN: cli },
  });
  return { ...h, out };
};

test("owner-grant.sh drops a dead access request first, so the grant gets a fresh link instead of exit 8", () => {
  const { file, out } = ownerGrant(entries());
  assert.equal(out.status, 0, out.stderr + out.stdout);
  assert.match(out.stdout, /Done: approval saved for the agent\./);
  assert.deepEqual(ids(file), ["live", "approved"]);
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test("owner-grant.sh caps exit 8: rerun in a minute, stop and tell the owner after three", () => {
  // An unexpired request that OpenKey still can't serve: nothing is dropped and the helper says when to stop.
  const items = [{ requestId: "live", requestExpiresAt: inAnHour }];
  const h = home("owner", items);
  const state = join(h.dir, "state");
  mkdirSync(state);
  writeFileSync(join(state, "meal-request.json"), "{}");
  writeFileSync(join(state, "owner-did.txt"), "did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
  const cli = join(h.dir, "tinycloud");
  writeFileSync(cli, `#!/bin/sh\ncase " $* " in *" context "*) echo '{"ownerDid":"did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' ;; *" auth grant "*) exit 8 ;; esac\n`, { mode: 0o755 });
  const out = spawnSync("sh", [join(root, "skills/tc-apps/owner-grant.sh"), "healthlog"], {
    encoding: "utf8", input: "", timeout: 20000,
    env: { PATH: process.env.PATH, HOME: h.dir, TC_HOME: h.dir, TC_APPS_STATE: state, TC_BIN: cli },
  });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /Run this step again in a minute; after the third time in a row, stop and tell the owner\./);
  assert.doesNotMatch(out.stderr, /owner sign-in has expired/);
  assert.deepEqual(ids(h.file), ["live"]);
});
