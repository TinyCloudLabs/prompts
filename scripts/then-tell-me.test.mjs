// "Then tell me": every agent sends the link, stops, and waits for the owner. Runs against the built site.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-then-tell-me-"));
after(() => rmSync(work, { recursive: true, force: true }));

let site;
before(async () => {
  const dir = join(work, "repo");
  cpSync(root, dir, { recursive: true, filter: (src) => src === root || dirname(src) !== root || ![".git", "_site", "node_modules"].includes(basename(src)) });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CF_PAGES.*|SITE_URL)$/.test(key)));
  await promisify(execFile)(process.execPath, [join(dir, "scripts/build-site.mjs")], { env: clean });
  site = join(dir, "_site");
});
const served = () => readdirSync(site, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(site.length + 1));
const text = (file) => readFileSync(join(site, file), "utf8");
const count = (haystack, needle) => haystack.split(needle).length - 1;

const OWNER_LINE = "Open this link and approve, then tell me.";
const NEXT_RULE = "if the command's stderr has `Next:` lines, do every one in order, exactly as written. Run the command the `Next:` line names, using your selected `\"$TC\"` in place of `tinycloud`.";

test("the owner line is in every place it must be, and the old line is nowhere in the built site", () => {
  const onboarding = text("onboarding.md");
  assert.equal(count(onboarding, `"${OWNER_LINE}"`), 1, "/onboarding's approval line (step 1 and step 2 links share it)");
  const courier = text("courier");
  for (const line of [
    `> Open this link and approve the one-time Courier permission, then tell me.`,
    `"That didn't finish on my side. Please open this link and approve, then tell me."`,
    `Did you decline that request? If not, I'll send you a fresh link.`,
    `ask the decline question from the shared table`,
  ]) assert.ok(courier.includes(line), line);
  assert.ok(text("onboarding.md").includes("There's no code to send back: tell your agent when you've approved."));
  const forbidden = new RegExp(["carry", "on", "as", "soon", "as", "you", "do"].join("\\s+") + "|" + ["nothing", "to", "tell", "your", "agent"].join("\\s+"), "i");
  for (const file of served()) {
    const body = readFileSync(join(site, file), "utf8");
    assert.doesNotMatch(body, forbidden, file);
  }
});

test("the Next: rule is in one shared block, served once in each guide that uses the relay rule", () => {
  const blocks = readFileSync(join(root, "standard/blocks.md"), "utf8");
  assert.equal(count(blocks, NEXT_RULE), 1, "one block carries the Next: rule");
  for (const guide of ["onboarding.md", "courier"]) {
    const body = text(guide);
    assert.equal(count(body, NEXT_RULE), 1, guide);
    assert.equal(count(body, "send each link, then stop and wait for the owner"), 1, guide);
  }
  // The invitation text keeps its own rule: the guides don't teach "do not end your turn" for invitations.
  for (const guide of ["onboarding.md", "courier"]) assert.doesNotMatch(text(guide), /do not end your turn/i, guide);
});

// The built /onboarding step 2 block against a fake CLI that is pending (exit 8) and then approved (exit 0).
const URL = "https://x/a";
const PENDING = `{"pending":{"step":1,"of":2,"approvalUrl":"${URL}","expiresAt":"2099-01-01T00:00:00Z"}}`;
const runBlock = (cliBody) => {
  const dir = mkdtempSync(join(work, "fake-"));
  mkdirSync(join(dir, ".agents/skills/tinycloud-cli"), { recursive: true });
  writeFileSync(join(dir, ".agents/skills/tinycloud-cli/SKILL.md"), "skill");
  const cli = join(dir, "tinycloud");
  writeFileSync(cli, `#!/bin/sh\ncase "$*" in --version) echo 9.9.9 ;; "onboard --timeout 1s") ${cliBody} ;; *) exit 99 ;; esac\n`, { mode: 0o700 });
  const guide = text("onboarding.md");
  const step = guide.split("**2. Run onboarding.**")[1].split("\n## MCP\n")[0];
  const block = [...step.matchAll(/```sh\n([\s\S]*?)\n```/g)][0][1];
  assert.ok(block.includes('"$TC" onboard --timeout 1s;'));
  return spawnSync("sh", ["-c", block.replace("<TC_BIN>", cli)], { cwd: dir, env: { PATH: process.env.PATH, HOME: dir }, encoding: "utf8" });
};

test("the built onboarding block prints a pending link on its own line and says to send it and wait for the owner", () => {
  const result = runBlock(`printf '%s\\n' '${PENDING}'; echo 'Approve in OpenKey (open the complete link):' >&2; echo '${URL}' >&2; exit 8`);
  assert.equal(result.status, 8, result.stderr);
  const lines = result.stdout.trimEnd().split("\n");
  assert.equal(lines[0], PENDING);
  const next = lines.at(-1);
  assert.equal(lines.length, 2);
  assert.equal(next, `NEXT: send the owner this link in your reply now, on its own line, with the onboarding guide's line: ${URL} When the owner next writes to you, run this block again. If you already sent this exact link, don't send it again.`);
  assert.doesNotMatch(next, /same turn|without waiting/);
  assert.ok(next.includes(`line: ${URL} `), "the link stands alone as a word in the NEXT text");
  assert.ok(result.stderr.split("\n").includes(URL), "the CLI's own stderr shows the link on its own line");
});

test("the built onboarding block ends with the done line when the CLI exits 0", () => {
  const result = runBlock(`printf '%s\\n' '{"onboarded":true}'; exit 0`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `{"onboarded":true}\nNEXT: onboarding is done; continue with the owner's goal.\n`);
});

test("the built onboarding block prints only ONBOARD_EXIT 6; CLI network handling has no NEXT line", () => {
  const result = runBlock(`echo '{"error":{"code":"NETWORK_ERROR"}}' >&2; exit 6`);
  assert.equal(result.status, 6);
  assert.equal(result.stdout, "ONBOARD_EXIT 6\n");
  assert.doesNotMatch(result.stdout, /NEXT:|send the owner this link|this is a new link/);
});

test("the Next: rule is scoped to approval commands; invitations follow their own steps", () => {
  for (const guide of ["onboarding.md", "courier"]) {
    const body = text(guide);
    assert.equal(count(body, "For an approval command (`onboard`, `auth login`, `auth grant`, `courier init`): if the command's stderr"), 1, guide);
    assert.equal(count(body, "For invitations, follow the invitation steps below, not the `Next:` lines."), 1, guide);
  }
});

test("CLI exit 6 is shared in the onboarding table; Courier 0.5.2 has no exit-6 branch", () => {
  assert.match(text("onboarding.md"), /\| 6 \| `NETWORK_ERROR`\./);
  const courier = text("courier");
  assert.doesNotMatch(courier, /\*\*Exit 6|rc === "6"|rc === 6/);
});
test("exit 3 blocks a fresh request until the saved exit-8 expiry is checked", () => {
  const result = runBlock(`echo '{"error":{"code":"APPROVAL_REQUEST_EXPIRED"}}' >&2; exit 3`);
  assert.equal(result.status, 3);
  assert.match(result.stdout, /NEXT: Before doing anything else, compare now with pending\.expiresAt from the earlier exit-8 JSON/);
  assert.match(result.stdout, /If more than 2 minutes remain, do not run a command or create a link; ask exactly "Did you decline that request\? If not, I'll send you a fresh link\."/);
  assert.match(result.stdout, /If 2 minutes or less remain, it's a real expiry: run this block again to create a fresh link/);
  assert.match(result.stdout, /If you do not have the earlier exit-8 JSON, ask the owner the decline question and wait/);
});
