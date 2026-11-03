import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// TC-2238: /onboarding runs `onboard --timeout 60s` in the foreground and reruns it, sending each new link as soon
// as it exists (js-sdk #822). The real-CLI tests run the pinned devDependency (1.6.0, with #822 and #824).
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(root, "node_modules/.bin/tinycloud");
const guide = readFileSync(join(root, "setup/onboarding.md"), "utf8");
const run = guide.split("**2. Run onboarding.**")[1]?.split("\n## MCP\n")[0];
const blocks = (text) => [...text.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((match) => match[1]);
const once = (text, needle) => assert.equal(text.split(needle).length - 1, 1, `exactly once: ${needle}`);
const base = mkdtempSync(join("/var/tmp", "TC-2238."));
after(() => rmSync(base, { recursive: true, force: true }));

test("onboarding runs one bounded foreground command, with no background run, file reads or sleep loop", () => {
  assert.ok(run, "the onboarding guide must have its run step");
  // One block: the skill and CLI-version gates, then the one bounded onboard run.
  assert.equal(blocks(run).length, 1);
  assert.ok(blocks(run)[0].includes('\n{ "$TC" onboard --timeout 60s; echo "$?" > "$OUT.rc"; } | tee "$OUT"\n'));
  assert.equal(blocks(run)[0].split("\n").at(-1), 'exit "$RC"');
  assert.doesNotMatch(blocks(run)[0], /&\s*$|\bnohup\b|\bwhile\b|\buntil\b/m);
  assert.match(run, /Run this in the foreground, as its own shell call\./);
  assert.doesNotMatch(guide, /\bsleep\b|seq 1|onboard\.(err|out)|background process|read the files/);
});

test("the --timeout is one #822 accepts and keeps a call under a 2-minute tool limit", () => {
  // #822 accepts Ns or Nm, more than 0, at most 9m; a call ends within timeout + 30 s grace + 3 s + one 10 s link request.
  const durations = [...guide.matchAll(/onboard --timeout (\S+?)[`;\s]/g)].map((match) => match[1]);
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
  const pending = run.split("**Still waiting: a `pending` object on stdout**")[1]?.split("\n- **Exit 0")[0];
  assert.ok(pending, "the guide must handle exit 8 with a pending object");
  assert.match(pending, /`step` \(1 or 2\), `of` \(2\), `approvalUrl` \(the link\) and `expiresAt`/);
  assert.match(pending, /When a rerun shows step 2's link, send it at once, without the step-1 text, and run the block again\./);
  assert.match(pending, /When it shows a link you already sent, don't send it again; just run the block again\./);
  assert.match(pending, /never counts toward a retry limit/);
  for (const code of ["SPACE_SETUP_PENDING", "PROFILE_NOT_ONBOARDABLE"]) assert.ok(run.includes(`**\`${code}\``), code);
  // Standard C: exit 3, exit 8 without `pending` and any other error go by the shared table, pasted in by the build.
  assert.match(run, /exit codes go by the \[shared table\]\(#exit-codes-and-owner-lines\), with `<what>` = "TinyCloud"/);
  assert.ok(guide.includes("\n## Exit codes and owner lines\n\n{{ERRORS}}\n"));
});

test("the owner sees the same words as before the loop", () => {
  for (const line of [
    "> I'll set up TinyCloud so I can act for you. You'll approve two OpenKey screens: first, sign in (or create your account) and let me read, change and delete your apps' data for 30 days; then let me see which spaces and apps you have, read-only, for 30 days.",
    '"Open this link and approve. I\'ll carry on as soon as you do."',
    'this reply to send: "Go ahead: run `tinycloud onboard` to set up TinyCloud."',
    // Standard C: the owner isn't asked to say they've approved while the CLI is waiting.
    "There's no code to send back, and nothing to tell your agent: it carries on as soon as you approve.",
  ]) once(guide, line);
  assert.doesNotMatch(guide, /tell your agent when you've approved|owner tells the agent when/);
});

test("the readiness check passes for the pinned CLI and only for a CLI whose onboard takes --timeout", () => {
  const check = blocks(guide.split("**1. The CLI.**")[1])[0];
  assert.ok(check.startsWith("TC='<TC_BIN>'\n"), check);
  const fakes = [["  --timeout <duration>  Wait at most this long", true], ["  --code <code>  Manual fallback", false]].map(([help, ready]) => {
    const cli = join(base, `tinycloud-${ready}`);
    writeFileSync(cli, `#!/bin/sh\n[ "$*" = "onboard --help" ] && printf '%s\\n' 'Usage: tinycloud onboard [options]' '${help}'\n`, { mode: 0o700 });
    return [cli, ready];
  });
  for (const [cli, ready] of [[CLI, true], ...fakes]) {
    const out = spawnSync("sh", ["-c", check.replace("<TC_BIN>", cli)], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: base } });
    assert.equal(out.stdout.includes("ONBOARD_READY"), ready, cli);
  }
});

// The real CLI with no network: stubs for the links API's create call and OpenKey's poll, which answers
// "not approved yet" (202), "expired" (410 expired_request) or "unavailable" (503). Any other connection fails and is logged.
const OPENKEY = "https://openkey.example.invalid";
const LINKS_API = "https://links.example.invalid";
const sandbox = (answer) => {
  const dir = mkdtempSync(join(base, `onboard-${answer}-`));
  // The run block requires the tinycloud-cli skill before it runs the CLI.
  mkdirSync(join(dir, ".agents/skills/tinycloud-cli"), { recursive: true });
  writeFileSync(join(dir, ".agents/skills/tinycloud-cli/SKILL.md"), "skill");
  const forbidden = join(dir, "forbidden");
  const polls = join(dir, "polls");
  const fence = join(dir, "network-fence.cjs");
  writeFileSync(fence, `
    const fs = require("node:fs");
    const { randomBytes } = require("node:crypto");
    const { syncBuiltinESMExports } = require("node:module");
    const deny = (operation) => () => { fs.appendFileSync(${JSON.stringify(forbidden)}, operation + "\\n"); throw Error("ONBOARD_TEST_NETWORK_DENIED"); };
    globalThis.fetch = async (input, options = {}) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = options.method || "GET";
      if (url === ${JSON.stringify(`${LINKS_API}/v1/links`)} && method === "POST") {
        const id = Array.from(randomBytes(26), (byte) => "abcdefghijklmnopqrstuvwxyz234567"[byte % 32]).join("");
        return Response.json({ id, expiresAt: JSON.parse(options.body).header.expiresAt }, { status: 201 });
      }
      const poll = ${JSON.stringify(`${OPENKEY}/api/approval-requests/`)};
      if (!url.startsWith(poll) || !/^[a-z2-7]{26}\\/result$/.test(url.slice(poll.length)) || method !== "POST") return deny("fetch " + url)();
      fs.appendFileSync(${JSON.stringify(polls)}, url + "\\n");
      return ${JSON.stringify(answer)} === "expired" ? Response.json({ code: "expired_request" }, { status: 410 })
        : ${JSON.stringify(answer)} === "unavailable" ? new Response("{}", { status: 503 }) : new Response(null, { status: 202 });
    };
    for (const name of ["http", "https"]) {
      const module = require("node:" + name);
      for (const operation of ["get", "request", "createServer"]) module[operation] = deny(name + "." + operation);
    }
    // The CLI's profile lock talks over a local socket path; any host/port connection is denied.
    const net = require("node:net");
    for (const operation of ["connect", "createConnection"]) {
      const original = net[operation];
      net[operation] = (...args) => typeof args[0] === "string" || typeof args[0]?.path === "string" ? original(...args) : deny("net." + operation)();
    }
    for (const [name, operation] of [["tls", "connect"], ["dns", "lookup"]]) require("node:" + name)[operation] = deny(name + "." + operation);
    syncBuiltinESMExports();
  `);
  const env = {
    PATH: process.env.PATH, HOME: dir, TC_HOME: join(dir, "tc"), FORCE_COLOR: "0", NODE_OPTIONS: `--require=${fence}`,
    TC_OPENKEY_HOST: OPENKEY, TC_OPENKEY_API_HOST: OPENKEY, TC_LINKS_API_ORIGIN: LINKS_API,
  };
  // The guide's run block for the selected CLI, with its 60 s wait shortened so the test is quick; the owner never approves.
  const script = blocks(run)[0].replace("<TC_BIN>", CLI).replace("--timeout 60s", "--timeout 2s");
  const onboard = () => spawnSync("sh", ["-c", script], { env, encoding: "utf8", timeout: 20000 });
  const untouched = () => assert.equal(existsSync(forbidden), false, existsSync(forbidden) ? readFileSync(forbidden, "utf8") : "");
  return { onboard, polled: () => readFileSync(polls, "utf8").trim().split("\n"), untouched };
};
const PROMPT = "Approve in OpenKey (open the complete link):";
// The block shows the CLI's stdout in full, then one line of its own: what to do next.
const lastLine = (result) => result.stdout.trimEnd().split("\n").at(-1);
const cliStdout = (result) => result.stdout.trimEnd().split("\n").slice(0, -1).join("\n");
const next = (url) => `NEXT: send the owner this link now, on its own line, with the onboarding guide's message for it: ${url} Then, in the same turn and without waiting for a reply, run this block again. If you already sent this exact link, don't send it again; just run this block again now.`;

test("the real CLI's first run exits 8 with step 1's pending link, and a rerun waits and shows the same link", () => {
  assert.ok(run.includes(`stderr shows the same link on the line after \`${PROMPT}\``));
  const { onboard, polled, untouched } = sandbox("pending");
  const first = onboard();
  assert.ifError(first.error);
  assert.equal(first.status, 8, first.stderr);
  const { pending } = JSON.parse(cliStdout(first));
  assert.equal(lastLine(first), next(pending.approvalUrl));
  assert.deepEqual(Object.keys(pending), ["step", "of", "approvalUrl", "expiresAt"]);
  assert.deepEqual({ step: pending.step, of: pending.of }, { step: 1, of: 2 });
  assert.match(pending.approvalUrl, /^https:\/\/openkey\.example\.invalid\/a\/[a-z2-7]{26}#v=4&/);
  assert.ok(Date.parse(pending.expiresAt) > Date.now(), pending.expiresAt);
  const lines = first.stderr.split("\n");
  assert.equal(lines[lines.indexOf(PROMPT) + 1], pending.approvalUrl, first.stderr);
  const started = Date.now();
  const again = onboard();
  assert.equal(again.status, 8, again.stderr);
  assert.ok(Date.now() - started >= 2000, "the rerun waits for the owner until --timeout");
  assert.deepEqual(JSON.parse(cliStdout(again)), { pending });
  assert.equal(lastLine(again), next(pending.approvalUrl));
  const id = new URL(pending.approvalUrl).pathname.split("/").pop();
  assert.deepEqual([...new Set(polled())], [`${OPENKEY}/api/approval-requests/${id}/result`]);
  untouched();
});

test("the real CLI ends an expired link as exit 3 APPROVAL_REQUEST_EXPIRED, and OpenKey trouble as exit 8 without pending", () => {
  for (const [answer, code] of [["expired", "APPROVAL_REQUEST_EXPIRED"], ["unavailable", "APPROVAL_REQUEST_UNAVAILABLE"]]) {
    const { onboard, untouched } = sandbox(answer);
    assert.equal(onboard().status, 8);
    const result = onboard();
    assert.equal(result.status, answer === "expired" ? 3 : 8, result.stderr);
    // No pending link: the block prints the exit code, no NEXT line.
    assert.equal(result.stdout, `ONBOARD_EXIT ${answer === "expired" ? 3 : 8}\n`);
    assert.equal(JSON.parse(result.stderr.slice(result.stderr.indexOf("{"))).error.code, code);
    untouched();
  }
});

// Clarissa's cell (TC-2238): an agent ended its turn after sending a link and reran only after the owner's "done",
// and piped the run through `tail`, losing `"onboarded": true`. The rerun is in the same paragraph as the owner line,
// and the block says not to filter its output; on the source and the served page.
const OWNER_LINE = '"Open this link and approve. I\'ll carry on as soon as you do."';
const SAME_TURN = 'Then, in the same turn and without waiting for a reply, run the block again: the owner\'s reply is not needed, the command itself sees the approval.';
const NO_FILTER = "Run it exactly as written; don't pipe it through `tail`, `head` or a filter; read the whole output.";
test("the same-turn rerun follows the owner line in its paragraph, and the run's output is read unfiltered", () => {
  for (const file of ["setup/onboarding.md", "_site/onboarding.md"]) {
    const text = readFileSync(join(root, file), "utf8");
    const step = text.split("**2. Run onboarding.**")[1]?.split("\n## MCP\n")[0];
    assert.ok(step, file);
    const paragraphs = step.split("\n\n").filter((paragraph) => paragraph.includes(OWNER_LINE));
    assert.equal(paragraphs.length, 1, file);
    assert.ok(paragraphs[0].includes(`followed by: ${OWNER_LINE} ${SAME_TURN}`), file);
    // Sam's approved wording (02:41:54Z via Holden): no owner line asks the owner to say they're done.
    assert.doesNotMatch(text, /tell me when you're done|says they're done/, file);
    const block = step.indexOf('exit "$RC"\n```');
    assert.ok(block > 0, file);
    assert.ok(step.slice(block).split("\n\n")[1].startsWith(NO_FILTER), `${file}: the no-filter line follows the block`);
  }
});

// The block itself says what to do next (agents follow tool output more reliably than page prose): exit 0 →
// the done line, with the CLI's JSON still shown; any exit other than 0, or 8 with a pending link → ONBOARD_EXIT.
test("the run block prints the done line on exit 0 and only ONBOARD_EXIT on other exits, after the CLI's full stdout", () => {
  for (const [exit, stdout, last] of [
    [0, '{\n  "onboarded": true,\n  "profile": "default"\n}', "NEXT: onboarding is done; continue with the owner's goal."],
    [1, "", "ONBOARD_EXIT 1"],
    [8, "", "ONBOARD_EXIT 8"],
    [8, '{"pending":{"step":2,"of":2}}', "ONBOARD_EXIT 8"],
  ]) {
    const dir = mkdtempSync(join(base, "fake-"));
    mkdirSync(join(dir, ".agents/skills/tinycloud-cli"), { recursive: true });
    writeFileSync(join(dir, ".agents/skills/tinycloud-cli/SKILL.md"), "skill");
    const cli = join(dir, "tinycloud");
    writeFileSync(cli, `#!/bin/sh\ncase "$*" in --version) echo 9.9.9 ;; "onboard --timeout 60s") printf '%s\\n' '${stdout}' | sed '/^$/d'; echo 'cli stderr' >&2; exit ${exit} ;; esac\n`, { mode: 0o700 });
    const result = spawnSync("sh", ["-c", blocks(run)[0].replace("<TC_BIN>", cli)], { cwd: dir, env: { PATH: process.env.PATH, HOME: dir }, encoding: "utf8" });
    assert.equal(result.status, exit, result.stderr);
    assert.equal(result.stderr, "cli stderr\n");
    assert.equal(result.stdout, `${stdout ? `${stdout}\n` : ""}${last}\n`);
    assert.equal(result.stdout.split("\n").filter((line) => line.startsWith("NEXT:")).length, exit === 0 ? 1 : 0);
  }
});
