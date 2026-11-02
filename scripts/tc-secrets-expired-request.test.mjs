import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// TC-2323: CLI 1.5.x keeps a sign-in request that expired unapproved in approval-pending.json and
// exits 8 on every later run. After three exit 8s in a row, tc-secrets drops only such dead requests.
const base = mkdtempSync(join("/var/tmp", "TC-2323-secrets."));
after(() => rmSync(base, { recursive: true, force: true }));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(root, "skills/tc-secrets/SKILL.md"), "utf8");
const exit8 = skill.split("- `LOGIN_FAILED APPROVAL_REQUEST_UNAVAILABLE`")[1]?.split("\n- `LOGIN_FAILED <other code>`")[0];
const dropBlock = exit8?.match(/```sh\n([\s\S]*?)\n\s*```/)?.[1].replace(/^ {2}/gm, "");

const hourAgo = new Date(Date.now() - 3600_000).toISOString();
const inAnHour = new Date(Date.now() + 3600_000).toISOString();
const entries = () => [
  { version: 1, requestId: "dead", requestExpiresAt: hourAgo },
  { version: 1, requestId: "live", requestExpiresAt: inAnHour },
  { version: 1, requestId: "approved", requestExpiresAt: hourAgo, resultRef: "r", resultEnvelope: "e" },
];
let count = 0;
const home = (items, profile = "api-keys") => {
  const dir = join(base, `h${++count}`);
  const profileDir = join(dir, ".tinycloud", "profiles", profile);
  mkdirSync(profileDir, { recursive: true });
  if (items) writeFileSync(join(profileDir, "approval-pending.json"), JSON.stringify(items), { mode: 0o600 });
  return { dir, file: join(profileDir, "approval-pending.json") };
};
const ids = (file) => JSON.parse(readFileSync(file, "utf8")).map((item) => item.requestId);
// A stand-in for "$TC_BIN": only `--version` is called by the block.
const runDrop = (dir, version = "1.5.1", env = {}) => {
  const tc = join(dir, "tc-version");
  writeFileSync(tc, `#!/bin/sh\necho ${version}\n`, { mode: 0o755 });
  return spawnSync("sh", ["-c", dropBlock], {
    encoding: "utf8", timeout: 20000, env: { PATH: process.env.PATH, HOME: dir, TC_HOME: dir, TC_BIN: tc, ...env },
  });
};

test("tc-secrets caps exit 8 at three starts before running the drop block", () => {
  assert.ok(dropBlock, "the exit 8 case must carry the drop block");
  assert.match(exit8, /If the third start of §3c in a row ends this way, stop retrying and run this block once\./);
  assert.match(dropBlock, /^PROFILE="\$\{TC_SECRETS_PROFILE:-api-keys\}"$/m);
  assert.match(dropBlock, /"\$PROFILE" "\$\("\$TC_BIN" --version 2>\/dev\/null\)"/);
  assert.match(exit8, /`DROPPED` → [^\n]*Same as `APPROVAL_REQUEST_EXPIRED` above: run §3c again, then §3d, and send the owner only the new link\./);
  assert.match(exit8, /`NONE_EXPIRED` → OpenKey is still unavailable\. Stop and report it; don't retry\./);
  assert.match(exit8, /`UNKNOWN` → stop and report it; don't retry or change the file yourself\./);
});

test("tc-secrets's block drops only requests that expired with no result, keeping mode 0600", () => {
  const h = home(entries());
  const out = runDrop(h.dir);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), "DROPPED");
  assert.deepEqual(ids(h.file), ["live", "approved"]);
  assert.equal(statSync(h.file).mode & 0o777, 0o600);
  assert.equal(readFileSync(h.file, "utf8"), JSON.stringify(entries().slice(1), null, 2) + "\n");
});

test("tc-secrets's block uses the TC_SECRETS_PROFILE profile", () => {
  const h = home(entries(), "keys");
  const out = runDrop(h.dir, "1.5.0", { TC_SECRETS_PROFILE: "keys" });
  assert.equal(out.stdout.trim(), "DROPPED", out.stderr);
  assert.deepEqual(ids(h.file), ["live", "approved"]);
});

test("tc-secrets's block changes nothing when no request has expired, or there is no request file", () => {
  const live = home(entries().slice(1));
  const before = readFileSync(live.file, "utf8");
  const out = runDrop(live.dir);
  assert.equal(out.stdout.trim(), "NONE_EXPIRED", out.stderr);
  assert.equal(readFileSync(live.file, "utf8"), before);
  const none = home();
  assert.equal(runDrop(none.dir).stdout.trim(), "NONE_EXPIRED");
  assert.equal(existsSync(none.file), false);
});

test("tc-secrets's block changes nothing for another CLI version or an unfamiliar file shape", () => {
  const newer = home(entries());
  const before = readFileSync(newer.file, "utf8");
  assert.equal(runDrop(newer.dir, "1.6.0").stdout.trim(), "UNKNOWN");
  assert.equal(readFileSync(newer.file, "utf8"), before);
  for (const items of [{ entries: entries() }, [...entries(), { requestId: "v2", version: 2, requestExpiresAt: hourAgo }], [{ requestId: "x" }]]) {
    const odd = home(items);
    const raw = readFileSync(odd.file, "utf8");
    assert.equal(runDrop(odd.dir).stdout.trim(), "UNKNOWN");
    assert.equal(readFileSync(odd.file, "utf8"), raw);
  }
  const broken = home();
  writeFileSync(broken.file, "{not json", { mode: 0o600 });
  assert.equal(runDrop(broken.dir).stdout.trim(), "UNKNOWN");
  assert.equal(readFileSync(broken.file, "utf8"), "{not json");
});
