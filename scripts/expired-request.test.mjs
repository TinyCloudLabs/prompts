import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// TC-2323: CLI 1.5.0/1.5.1 keep an approval request that expired before it was approved in
// approval-pending.json and exit 8 on every later run. /onboarding caps the retries, then, as a last
// resort, drops only such a request with the installed CLI's own state code, under its profile lock.
const base = mkdtempSync(join("/var/tmp", "TC-2323."));
for (const key of ["HOME", "TC_HOME"]) process.env[key] = base;
after(() => rmSync(base, { recursive: true, force: true }));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const realTc = join(root, "node_modules/.bin/tinycloud");
const hourAgo = new Date(Date.now() - 3600_000).toISOString();
const inAnHour = new Date(Date.now() + 3600_000).toISOString();
const entries = () => [
  { version: 1, requestId: "dead", requestExpiresAt: hourAgo },
  { version: 1, requestId: "live", requestExpiresAt: inAnHour },
  { version: 1, requestId: "approved", requestExpiresAt: hourAgo, resultRef: "r", resultEnvelope: "e" },
  // Entries the CLI still needs after expiry: a command's (auth grant), a committed or an acknowledged one.
  { version: 1, requestId: "grant", requestExpiresAt: hourAgo, commandIntent: "auth-grant:x" },
  { version: 1, requestId: "command", requestExpiresAt: hourAgo, commandIntent: "auth-grant:y", command: { result: {} } },
  { version: 1, requestId: "committed", requestExpiresAt: hourAgo, committed: true },
  { version: 1, requestId: "acked", requestExpiresAt: hourAgo, acknowledged: true },
];
const kept = ["live", "approved", "grant", "command", "committed", "acked"];
let count = 0;
// A profile as the CLI keeps it: a 0700 folder with profile.json, which the CLI's lock requires.
const home = (profile, items) => {
  const dir = join(base, `h${++count}`);
  const profileDir = join(dir, ".tinycloud", "profiles", profile);
  mkdirSync(profileDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(profileDir, "profile.json"), JSON.stringify({ name: profile }), { mode: 0o600 });
  if (items) writeFileSync(join(profileDir, "approval-pending.json"), JSON.stringify(items), { mode: 0o600 });
  return { dir, file: join(profileDir, "approval-pending.json") };
};
const ids = (file) => JSON.parse(readFileSync(file, "utf8")).map((item) => item.requestId);

const guide = readFileSync(join(root, "setup/onboarding.md"), "utf8");
const exit8 = guide.split("- **Exit 8:**")[1]?.split("\n- **`APPROVAL_REQUEST_EXPIRED`")[0];
const dropBlock = exit8?.match(/```sh\n([\s\S]*?)\n\s*```/)?.[1];
// The block runs the repo's installed CLI 1.5.1: its --version and its state module.
const run = (dir, { env = {}, tc = realTc } = {}) => spawnSync("sh", ["-c", dropBlock], {
  encoding: "utf8", timeout: 30000, env: { PATH: process.env.PATH, HOME: dir, TC_HOME: dir, TC: tc, ...env },
});
// A stand-in "$TC" that only answers --version, with no CLI state code beside it.
const versionOnly = (dir, version) => {
  const tc = join(dir, "tc-version");
  writeFileSync(tc, `#!/bin/sh\necho ${version}\n`, { mode: 0o755 });
  return tc;
};

test("onboarding caps exit 8 at three tries before the last-resort block", () => {
  assert.ok(dropBlock, "the Exit 8 case must carry the block");
  assert.match(exit8, /After the third exit 8 in a row, stop retrying/);
  assert.match(exit8, /last resort for CLI 1\.5\.0 and 1\.5\.1/);
  assert.match(exit8, /installed CLI's own state code and profile lock/);
  assert.match(exit8, /`NONE_EXPIRED`:\*\* OpenKey is still unavailable\. Stop and report it to the owner; don't retry\./);
});

test("the block drops only a plain request that expired unapproved, keeping every other entry and mode 0600", () => {
  const h = home("default", entries());
  const out = run(h.dir);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), "DROPPED", out.stderr);
  assert.deepEqual(ids(h.file), kept);
  assert.deepEqual(JSON.parse(readFileSync(h.file, "utf8")), entries().filter((i) => kept.includes(i.requestId)));
  assert.equal(statSync(h.file).mode & 0o777, 0o600);
});

test("the block changes nothing when no request has expired, or there is no request file", () => {
  const live = home("default", entries().filter((i) => kept.includes(i.requestId)));
  const before = readFileSync(live.file, "utf8");
  assert.equal(run(live.dir).stdout.trim(), "NONE_EXPIRED");
  assert.equal(readFileSync(live.file, "utf8"), before);
  const none = home("default");
  assert.equal(run(none.dir).stdout.trim(), "NONE_EXPIRED");
  assert.equal(existsSync(none.file), false);
});

test("the block changes nothing for another CLI version, a CLI without its state code, or an unfamiliar file", () => {
  for (const version of ["1.6.0", "1.5.1"]) {
    const h = home("default", entries());
    const before = readFileSync(h.file, "utf8");
    assert.equal(run(h.dir, { tc: versionOnly(h.dir, version) }).stdout.trim(), "UNKNOWN", version);
    assert.equal(readFileSync(h.file, "utf8"), before);
  }
  for (const items of [{ entries: entries() }, [...entries(), { requestId: "v2", version: 2, requestExpiresAt: hourAgo }], [{ requestId: "x" }]]) {
    const odd = home("default", items);
    const raw = readFileSync(odd.file, "utf8");
    assert.equal(run(odd.dir).stdout.trim(), "UNKNOWN");
    assert.equal(readFileSync(odd.file, "utf8"), raw);
  }
  const broken = home("default");
  writeFileSync(broken.file, "{not json", { mode: 0o600 });
  assert.equal(run(broken.dir).stdout.trim(), "UNKNOWN");
  assert.equal(readFileSync(broken.file, "utf8"), "{not json");
});

test("the block waits for the CLI's own profile lock and changes nothing while another command holds it", async () => {
  const h = home("default", entries());
  const before = readFileSync(h.file, "utf8");
  // Hold the profile lock with the CLI's own code, longer than the block waits for it.
  const holder = spawn(process.execPath, ["-e", `
    const state = require("node:module").createRequire(require("node:fs").realpathSync(${JSON.stringify(realTc)}))("@tinycloud/operations/state");
    state.withProfileLock("default", () => { console.log("HELD"); return new Promise((r) => setTimeout(r, 20000)); });
  `], { env: { PATH: process.env.PATH, HOME: h.dir, TC_HOME: h.dir }, stdio: ["ignore", "pipe", "inherit"] });
  try {
    await new Promise((resolve) => holder.stdout.once("data", resolve));
    const stdout = await new Promise((resolve) => {
      const child = spawn("sh", ["-c", dropBlock], { env: { PATH: process.env.PATH, HOME: h.dir, TC_HOME: h.dir, TC: realTc } });
      let text = "";
      child.stdout.on("data", (chunk) => { text += chunk; });
      child.on("close", () => resolve(text));
    });
    assert.equal(stdout.trim(), "BUSY");
    assert.equal(readFileSync(h.file, "utf8"), before);
  } finally {
    holder.kill();
  }
});

test("the block finds the profile onboard used: PROFILE, then TC_PROFILE, then the CLI's default profile", () => {
  for (const [env, setup] of [
    [{ PROFILE: "owner" }, () => {}],
    [{ TC_PROFILE: "owner" }, () => {}],
    [{}, (dir) => writeFileSync(join(dir, ".tinycloud", "config.json"), JSON.stringify({ defaultProfile: "owner" }))],
  ]) {
    const h = home("owner", entries());
    setup(h.dir);
    const out = run(h.dir, { env });
    assert.equal(out.stdout.trim(), "DROPPED", JSON.stringify(env) + out.stderr);
    assert.deepEqual(ids(h.file), kept);
  }
});

test("owner-grant.sh caps exit 8: rerun in a minute, stop and tell the owner after three", () => {
  const h = home("owner", [{ version: 1, requestId: "live", requestExpiresAt: inAnHour }]);
  const state = join(h.dir, "state");
  mkdirSync(state);
  writeFileSync(join(state, "meal-request.json"), "{}");
  writeFileSync(join(state, "owner-did.txt"), "did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
  const cli = join(h.dir, "tinycloud");
  writeFileSync(cli, `#!/bin/sh\ncase " $* " in *" context "*) echo '{"ownerDid":"did:pkh:eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' ;; *" auth grant "*) exit 8 ;; esac\n`, { mode: 0o755 });
  const before = readFileSync(h.file, "utf8");
  const out = spawnSync("sh", [join(root, "skills/tc-apps/owner-grant.sh"), "healthlog"], {
    encoding: "utf8", input: "", timeout: 20000,
    env: { PATH: process.env.PATH, HOME: h.dir, TC_HOME: h.dir, TC_APPS_STATE: state, TC_BIN: cli },
  });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /Run this step again in a minute; after the third time in a row, stop and tell the owner\./);
  assert.doesNotMatch(out.stderr, /owner sign-in has expired/);
  assert.equal(readFileSync(h.file, "utf8"), before, "the helper never edits the CLI's request file");
});
