import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// TC-2323: since OpenKey #407, a request that expired before it was approved gets 410 expired_request,
// and CLI 1.5.1 exits 3 (APPROVAL_REQUEST_EXPIRED) and drops it. tc-secrets sends the new link on exit 3,
// caps exit-8 retries at three, and never logs out or edits the CLI's files to get past an expired link.
const base = mkdtempSync(join("/var/tmp", "TC-2323-secrets."));
after(() => rmSync(base, { recursive: true, force: true }));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(root, "skills/tc-secrets/SKILL.md"), "utf8");
const exit8 = skill.split("- `LOGIN_FAILED APPROVAL_REQUEST_UNAVAILABLE`")[1]?.split("\n- ")[0];
const expired = skill.split("- `LOGIN_FAILED APPROVAL_REQUEST_EXPIRED`")[1]?.split("\n- ")[0];
const reader = skill.slice(skill.indexOf("**3d.")).match(/```sh\n([\s\S]*?)\n```/)?.[1];
const row = (code) => skill.split("\n").find((line) => line.startsWith(`| \`${code}\``));
const MESSAGE = "OpenKey could not discover this request (HTTP 503). Retry the command to resume.";

test("tc-secrets caps exit 8 at three tries, then stops; an expired link is exit 3 and gets a new link", () => {
  assert.ok(exit8 && expired, "§3d must handle exit 8 and exit 3");
  assert.match(exit8, /at most three times in a row; it resumes the same link, so don't send it again\./);
  assert.match(exit8, /If it still fails, stop and report it; don't retry\. Never edit or delete the CLI's files yourself\.$/);
  assert.match(expired, /Run §3c again, then this block, and send the owner only the new link/);
  assert.match(row("APPROVAL_REQUEST_UNAVAILABLE"), /at most three times in a row; it resumes the same link\. If it still fails, stop and report it\. Never edit or delete the CLI's files yourself \|$/);
  assert.match(row("APPROVAL_REQUEST_EXPIRED"), /\(exit 3\) \| .*\| §3c again; send only the new link \|$/);
  assert.doesNotMatch(`${exit8}\n${row("APPROVAL_REQUEST_UNAVAILABLE")}`, /logout|HTTP 400/, "exit 8 names no logout");
  assert.doesNotMatch(skill, /HTTP 400|approval-pending|orphaned/, "no logout or file way-out for an expired link");
});

test("§3d prints the CLI's message with the exit 8 code", () => {
  const state = join(base, "reader");
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "login.out"), "");
  writeFileSync(join(state, "login.err"), `Approve this request in OpenKey: https://openkey.so/a/abc#k\n${JSON.stringify({ error: { code: "APPROVAL_REQUEST_UNAVAILABLE", message: MESSAGE } })}\n`);
  writeFileSync(join(state, "login.rc"), "8\n");
  writeFileSync(join(state, "login.pid"), "1\n");
  const out = spawnSync("bash", ["-c", reader], { encoding: "utf8", timeout: 20000, env: { PATH: process.env.PATH, HOME: base, TC_SECRETS_STATE: state } });
  assert.equal(out.stdout.trim(), `LOGIN_FAILED APPROVAL_REQUEST_UNAVAILABLE ${MESSAGE}`, out.stderr);
});
