import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// TC-2323: CLI 1.5.0/1.5.1 keep a sign-in request that expired before it was approved and then exit 8
// (APPROVAL_REQUEST_UNAVAILABLE, "HTTP 400") on every run. `auth logout` clears it, so tc-publish caps
// the retries at three and then logs out the sign-in profile; it never edits the CLI's files.
const base = mkdtempSync(join("/var/tmp", "TC-2323-publish."));
after(() => rmSync(base, { recursive: true, force: true }));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(root, "skills/tc-publish/SKILL.md"), "utf8");
const exit8 = skill.split("- `LOGIN_FAILED APPROVAL_REQUEST_UNAVAILABLE`")[1]?.split("\n- `LOGIN_FAILED APPROVAL_RESULT_ACKNOWLEDGED`")[0];
const logoutBlock = exit8?.match(/```sh\n([\s\S]*?)\n\s*```/)?.[1].replace(/^ {4}/gm, "");
const reader = skill.slice(skill.indexOf("Then, in a separate tool call, read where the sign-in is:")).match(/```sh\n([\s\S]*?)\n```/)?.[1];
const row = skill.split("\n").find((line) => line.startsWith("| `APPROVAL_REQUEST_UNAVAILABLE`"));
const MESSAGE = "OpenKey could not discover this request (HTTP 400). Retry the command to resume.";

test("tc-publish caps exit 8 at three tries, then logs out only for a dead request", () => {
  assert.ok(exit8, "the sign-in must handle exit 8");
  assert.match(exit8, /at most three times in a row/);
  assert.match(exit8, /If each of those says `APPROVAL_REQUEST_UNAVAILABLE` with `\(HTTP 400\)`/);
  assert.match(exit8, /runs `"\$TC_BIN" --profile "\$PROFILE" auth logout` on the sign-in profile, then start the sign-in block again and send the new link with the same line, as for `APPROVAL_REQUEST_EXPIRED` above\./);
  assert.match(exit8, /Never edit or delete the CLI's files yourself\./);
  assert.match(exit8, /- Otherwise: stop and report the code; don't retry\./);
  assert.doesNotMatch(skill, /approval-pending/, "nothing touches the CLI's request file");
  assert.match(row, /at most three times in a row/);
  assert.match(row, /`APPROVAL_REQUEST_UNAVAILABLE` with `\(HTTP 400\)`, run the §2 `auth logout` block/);
});

test("tc-publish's check prints the CLI's (HTTP 400) message with the exit 8 code", () => {
  const state = join(base, "reader");
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "login.out"), "");
  writeFileSync(join(state, "login.err"), `Approve this request in OpenKey: https://openkey.so/a/abc#k\n${JSON.stringify({ error: { code: "APPROVAL_REQUEST_UNAVAILABLE", message: MESSAGE } })}\n`);
  const out = spawnSync("sh", ["-c", reader], { encoding: "utf8", timeout: 20000, env: { PATH: process.env.PATH, HOME: base, TC_PUBLISH_STATE: state } });
  assert.equal(out.stdout.trim(), `LOGIN_FAILED APPROVAL_REQUEST_UNAVAILABLE ${MESSAGE}`, out.stderr);
});

test("tc-publish's logout block logs out only the sign-in profile", () => {
  const home = join(base, "logout");
  mkdirSync(home, { recursive: true });
  const cli = join(home, "tinycloud");
  writeFileSync(cli, `#!/bin/sh\necho "$*" >> "$HOME/calls"\n`, { mode: 0o755 });
  const out = spawnSync("sh", ["-c", logoutBlock], { encoding: "utf8", timeout: 20000, env: { PATH: process.env.PATH, HOME: home, TC_BIN: cli } });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(readFileSync(join(home, "calls"), "utf8"), "--profile publisher auth logout\n");
});
