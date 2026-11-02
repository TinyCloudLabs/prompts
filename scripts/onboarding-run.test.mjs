import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// TC-2238: /onboarding runs `onboard --timeout 60s` in the foreground and reruns it, sending each new link as soon
// as it exists (js-sdk #822, shapes frozen at 4e75a1ea). These pin the guide's text only: the pinned CLI has no
// --timeout yet, so the loop itself must be re-run live once the guides pin a CLI with #822.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const guide = readFileSync(join(root, "setup/onboarding.md"), "utf8");
const run = guide.split("**2. Run onboarding.**")[1]?.split("\n## MCP\n")[0];
const blocks = (text) => [...text.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((match) => match[1]);
const once = (text, needle) => assert.equal(text.split(needle).length - 1, 1, `exactly once: ${needle}`);
const base = mkdtempSync(join("/var/tmp", "TC-2238."));
after(() => rmSync(base, { recursive: true, force: true }));

test("onboarding runs one bounded foreground command, with no background run, file reads or sleep loop", () => {
  assert.ok(run, "the onboarding guide must have its run step");
  assert.deepEqual(blocks(run), ['"$TC" onboard --timeout 60s']);
  assert.match(run, /Run this in the foreground, as its own shell call\./);
  assert.doesNotMatch(guide, /\bsleep\b|seq 1|onboard\.(err|out)|background process|read the files/);
});

test("the --timeout is one #822 accepts and keeps a call under a 2-minute tool limit", () => {
  // #822 accepts Ns or Nm, more than 0, at most 9m; a call ends within timeout + 30 s grace + 3 s + one 10 s link request.
  const durations = [...guide.matchAll(/onboard --timeout (\S+?)[`\s]/g)].map((match) => match[1]);
  assert.ok(durations.length >= 2);
  for (const duration of durations) {
    const match = /^(\d+)([sm])$/.exec(duration);
    assert.ok(match, duration);
    const seconds = Number(match[1]) * (match[2] === "m" ? 60 : 1);
    assert.ok(seconds > 0 && seconds + 30 + 3 + 10 < 120, duration);
  }
});

test("every onboarding run in the guide is bounded; only --help and the owner's reply name onboard without it", () => {
  const runs = [...guide.matchAll(/"\$TC"(?: --profile \S+)? onboard\b[^`\n]*/g)].map((match) => match[0]);
  assert.deepEqual(runs.filter((line) => !line.includes("--timeout 60s")), ['"$TC" onboard --help | grep -q -e --timeout && echo ONBOARD_READY']);
  assert.match(run, /Never run `onboard --code`/);
});

test("exit 8 with a pending link: send each new link at once, rerun, never resend, never count it as a retry", () => {
  const pending = run.split("**Exit 8 with a `pending` object on stdout**")[1]?.split("\n- **Exit 0")[0];
  assert.ok(pending, "the guide must handle exit 8 with a pending object");
  assert.match(pending, /`step` \(1 or 2\), `of` \(2\), `approvalUrl` \(the link\) and `expiresAt`/);
  assert.match(pending, /Don't wait for the owner to say they're done\. Right after sending a link, run the same command again\./);
  assert.match(pending, /When it shows step 2's link, send it at once, without the step-1 text, and run the command again\./);
  assert.match(pending, /When it shows a link you already sent, don't send it again; just run the command again\./);
  assert.match(pending, /never counts toward a retry limit/);
  for (const code of ["APPROVAL_REQUEST_EXPIRED", "SPACE_SETUP_PENDING", "PROFILE_NOT_ONBOARDABLE"]) assert.ok(run.includes(`**\`${code}\``), code);
  assert.match(run, /\*\*Exit 8 without a `pending` object:\*\*/);
  assert.match(run, /\*\*Any other error:\*\* stop and report it to the owner\./);
});

test("the owner sees the same words as before the loop", () => {
  for (const line of [
    "> I'll set up TinyCloud so I can act for you. You'll approve two OpenKey screens: first, sign in (or create your account) and let me read, change and delete your apps' data for 30 days; then let me see which spaces and apps you have, read-only, for 30 days.",
    'Send the owner each new link with this line: "Open this link and approve; tell me when you\'re done." For step 1, start that message with this text, word for word:',
    'this reply to send: "Go ahead: run `tinycloud onboard` to set up TinyCloud."',
    "done. Tell the owner in one line that TinyCloud is set up, then go to [the owner's goal](#the-owners-goal). If they asked only for setup, end with a short list of what they can ask you next: keep records, share or publish a page, use a stored API key, ask about their meetings.",
    "There's no code to send back: tell your agent when you've approved.",
  ]) once(guide, line);
});

test("the readiness check passes only for a CLI whose onboard takes --timeout", () => {
  const check = blocks(guide.split("**1. The CLI.**")[1])[0];
  for (const [help, ready] of [["  --timeout <duration>  Wait at most this long", true], ["  --code <code>  Manual fallback", false]]) {
    const cli = join(base, `tinycloud-${ready}`);
    writeFileSync(cli, `#!/bin/sh\n[ "$*" = "onboard --help" ] && printf '%s\\n' 'Usage: tinycloud onboard [options]' '${help}'\n`, { mode: 0o700 });
    const out = spawnSync("sh", ["-c", check], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: base, TC_BIN: cli } });
    assert.equal(out.stdout.includes("ONBOARD_READY"), ready, help);
  }
});
