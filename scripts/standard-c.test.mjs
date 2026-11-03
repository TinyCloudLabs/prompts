// Standard C (agent standardization brief, rule 4 and 5): one exit-code table and four owner lines,
// written once in setup/errors.md and pasted by the build into every guide and skill authored here.
// Builds a copy of the repository, so the shared _site other tests read is left alone.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const errors = read("setup/errors.md").trimEnd();
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-standard-c-"));
after(() => rmSync(work, { recursive: true, force: true }));
let site;
before(async () => {
  const dir = join(work, "repo");
  cpSync(root, dir, { recursive: true, filter: (src) => src === root || dirname(src) !== root || ![".git", "_site", "node_modules"].includes(basename(src)) });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CF_PAGES.*|SITE_URL)$/.test(key)));
  await promisify(execFile)(process.execPath, [join(dir, "scripts/build-site.mjs")], { env });
  site = join(dir, "_site");
});
const served = (path) => readFileSync(join(site, path), "utf8");

// Every guide and skill this repository authors, as source and as served.
const SURFACES = [
  ["setup/onboarding.md", "onboarding.md"],
  ["setup/tinycloud.md", "cli"],
  ["setup/agent.md", "agent"],
  ["setup/tc-apps.md", "apps"],
  ["setup/publish.md", "publish"],
  ["setup/share.md", "share"],
  ["setup/secrets.md", "secrets"],
  ["setup/courier.md", "courier"],
  ["apps/tinychat/setup.md", "chat"],
  ["skills/tc-apps/SKILL.md", "skills/apps/SKILL.md"],
  ["skills/tc-publish/SKILL.md", "skills/publish/SKILL.md"],
  ["skills/tc-secrets/SKILL.md", "skills/secrets/SKILL.md"],
  ["skills/tinycloud-feed/SKILL.md", "skills/feed/SKILL.md"],
  ["skills/tinycloud-feed/creating-a-post.md", "feed"],
];
// Courier's served skill gets the guide's setup section, shared block included.
const SERVED_ONLY = ["skills/courier/SKILL.md", "skills/courier/start.md", "onboarding.html", "skills/apps.md", "skills/publish.md", "skills/secrets.md", "skills/feed.md"];

const walk = (dir) => readdirSync(join(root, dir)).flatMap((name) => statSync(join(root, dir, name)).isDirectory() ? walk(`${dir}/${name}`) : [`${dir}/${name}`]);
const AUTHORED = [...walk("setup"), ...walk("skills"), "apps/tinychat/setup.md"].filter((path) => /\.(md|sh)$/.test(path) && path !== "setup/errors.md");
const count = (text, needle) => text.split(needle).length - 1;

const ASK = "Open this link and approve. I'll carry on as soon as you do.";
const ASK_COURIER = "Open this link and approve the one-time Courier permission. I'll carry on as soon as you do.";
const RETRY = "That link expired. Please open this new one and approve. I'll carry on as soon as you do.";
const DONE = "`<What>` is set up.";
const CANT = "I can't set up `<what>` right now. Please ask me again later.";
const COULDNT = "I couldn't set up `<what>` this time. Tell me if you'd like me to try again.";

test("the shared table and owner lines are pasted into every guide and skill authored here, once", () => {
  for (const [source, url] of SURFACES) {
    assert.equal(count(read(source), "\n{{ERRORS}}\n"), 1, source);
    assert.equal(count(served(url), errors), 1, url);
  }
  for (const url of SERVED_ONLY) assert.equal(count(served(url), "Exit codes and owner lines (the same in every TinyCloud guide)."), 1, url);
  const leftover = AUTHORED.filter((path) => !SURFACES.some(([source]) => source === path) && read(path).includes("{{ERRORS}}"));
  assert.deepEqual(leftover, []);
  for (const url of [...SURFACES.map(([, url]) => url), ...SERVED_ONLY, "llms-full.txt"]) assert.doesNotMatch(served(url), /\{\{ERRORS\}\}/, url);
});

test("the shared table has the standard's rows: 0 done, 3 expired once, 8 waiting or down at most 3 times, 5 declined, anything else stop and report", () => {
  const rows = errors.split("\n").filter((line) => /^\| (\d|Anything else) \|/.test(line)).map((line) => line.split(" | ").map((cell) => cell.replace(/^\| |\s\|$/g, "")));
  assert.deepEqual(rows.map(([exit]) => exit), ["0", "3", "8", "5", "Anything else"]);
  const [done, expired, waiting, declined, other] = rows;
  assert.match(done[1], /^Done\.$/);
  assert.match(expired[1], /link expired/);
  assert.match(expired[2], /Send the new link once, with the retry line\./);
  assert.match(waiting[1], /^Still waiting: .* Or OpenKey is down: no `pending` object\.$/);
  assert.match(waiting[2], /Waiting never counts as a retry\. OpenKey down: wait a minute, and run it at most 3 times in a row/);
  assert.match(declined[1], /^The owner declined/);
  assert.match(declined[2], /^Stop, and say so/);
  assert.match(other[2], /^Stop, and send the "couldn't" failed line, then the code on its own line\. Don't retry\.$/);
});

test("the four owner lines are word for word, and every guide's quoted line uses the same words", () => {
  for (const line of [ASK, ASK_COURIER, RETRY, DONE, CANT, COULDNT]) assert.equal(count(errors, line), 1, line);
  for (const [label, sentence] of [["Ask", ASK], ["Retry", RETRY], ["Done", DONE]]) assert.ok(errors.includes(`- **${label}**`) && errors.includes(sentence), label);
  assert.match(errors, /Call what the owner approves a permission\./);
  // A sentence that starts like a shared line ends like it, on every authored and served surface.
  const families = [
    [/"Open this link and approve([^"]*)"/g, (m) => m === ASK || m === ASK_COURIER],
    [/"That link expired\.([^"]*)"/g, (m) => m === RETRY],
    [/"I can't set up ([^"]*?) right now\.([^"]*)"/g, (m) => m.endsWith(" right now. Please ask me again later.")],
    [/"I couldn't set up ([^"]*?) this time\.([^"]*)"/g, (m) => m.endsWith(" this time. Tell me if you'd like me to try again.")],
  ];
  const texts = [...AUTHORED.map((path) => [path, read(path)]), ...[...SURFACES.map(([, url]) => url), ...SERVED_ONLY].map((url) => [url, served(url)])];
  for (const [path, text] of texts) {
    for (const [pattern, ok] of families) {
      for (const match of text.matchAll(pattern)) {
        const sentence = match[0].slice(1, -1);
        // TinyChat's line still asks for the code its pack needs (an exception below).
        if (path.endsWith("tinychat/setup.md") || path === "chat") { if (sentence.startsWith("Open this link and approve TinyChat access")) continue; }
        assert.ok(ok(sentence), `${path}: ${sentence}`);
      }
    }
  }
});

// Where a command's real codes differ, the guide keeps its own rows. Every prose mention of exit 3, 5 or 8 outside the
// shared block and shell blocks is in one of these files, for the reason given.
const EXIT_EXCEPTIONS = {
  "setup/courier.md": "Courier exits 0, 8 (still waiting), 2 (usage) and 1 with [code] for every error; an expired link is exit 1 [approval-expired]",
  "skills/tc-apps/SKILL.md": "data commands: kv put --if-none-match exits 5 KV_ALREADY_EXISTS; layout.sh exits 3 when jq is missing",
  "skills/tc-publish/SKILL.md": "publish sign-in (device: 3 DEVICE_AUTH_EXPIRED, 5 DEVICE_AUTH_DENIED/SCOPE_REJECTED/BINDING_MISMATCH) and share commands (3 AUTH_REQUIRED session, 5 PERMISSION_DENIED scope)",
  "skills/tc-secrets/SKILL.md": "secrets sign-in (3 PASTE_CODE_MISSING expected), reads (3 AUTH_REQUIRED, 5 PERMISSION_DENIED) and secrets wait (8 still missing)",
};
const EXIT_MENTION = /\b[Ee]xit(?:s|ed| code| status)?:?\s*`?[358]\b|\(exit [358]\)|TC_EXIT: [358]|\| *`?[358]`? *\||\bexits? [358]\b|exit-[358]\b|\brc `?[358]\b/;
const prose = (text) => text.replace(/^```[\s\S]*?^```$/gm, "");
test("no exit-code rule for 3, 5 or 8 is left outside the shared table, except the listed commands", () => {
  const found = new Set();
  for (const path of AUTHORED.filter((p) => p.endsWith(".md"))) {
    for (const line of prose(read(path)).split("\n")) {
      if (!EXIT_MENTION.test(line)) continue;
      assert.ok(EXIT_EXCEPTIONS[path], `${path}: ${line.slice(0, 160)}`);
      found.add(path);
    }
  }
  assert.deepEqual([...found].sort(), Object.keys(EXIT_EXCEPTIONS).sort(), "every exception is still needed");
  // The superseded generic rows are gone from /onboarding: the table carries them.
  const onboarding = read("setup/onboarding.md");
  assert.doesNotMatch(onboarding, /\*\*Exit 8 without a `pending` object:\*\*|\*\*`APPROVAL_REQUEST_EXPIRED` \(exit 3\):\*\*|\*\*Any other error:\*\*/);
  assert.doesNotMatch(read("skills/tc-apps/TINY-APPS.md"), /exit-8 message|\(exit 3\)/);
});

// Owner wording that asks for a code, or asks the owner to say they're done. Kept only where a flow still needs it.
const DONE_WORDING = /tell me when you(?:'|’)re done|tell me you(?:'|’)re done|says they(?:'|’)re done|tell your agent when you(?:'|’)ve approved|when you(?:'|’)ve approved, reply here/i;
const CODE_WORDING = /sends? back the code|sends? (?:me )?(?:back )?the short code|paste (?:it|the code|its code) back|send it back to me here|paste the code here/i;
const WORDING_EXCEPTIONS = {
  "setup/publish.md": "publish sign-in (auth login --paste)",
  "setup/share.md": "publish sign-in (auth login --paste)",
  "skills/tc-publish/SKILL.md": "publish sign-in (auth login --paste), and its device fallback's background waiter, which may not wake the agent",
  "skills/tc-publish/QUICKSTART.md": "publish sign-in (auth login --paste)",
  "skills/tc-secrets/SKILL.md": "secrets sign-in (auth login --paste)",
  "apps/tinychat/setup.md": "TinyChat's pack (authorize, then login --code)",
  "skills/tc-apps/LEGACY-SQL.md": "the older apps index sign-in (auth login --paste)",
  "skills/tc-apps/announce.sh": "the older Health Log fallback's owner sign-in (init --name owner --paste)",
  "skills/tc-apps/owner-grant.sh": "the older Health Log fallback's owner sign-in (init --name owner --paste)",
};
test("no stray \"tell me when you're done\" or \"send back the code\" outside the listed flows", () => {
  const found = new Set();
  for (const path of [...AUTHORED, "setup/README.md"].filter((p, i, all) => all.indexOf(p) === i)) {
    for (const line of read(path).split("\n")) {
      if (!DONE_WORDING.test(line) && !CODE_WORDING.test(line)) continue;
      assert.ok(WORDING_EXCEPTIONS[path], `${path}: ${line.slice(0, 160)}`);
      found.add(path);
    }
  }
  assert.deepEqual([...found].sort(), Object.keys(WORDING_EXCEPTIONS).sort(), "every exception is still needed");
  for (const path of ["setup/onboarding.md", "setup/README.md", "setup/owner.md", "setup/courier.md", "skills/tinycloud-feed/SKILL.md", "skills/tc-apps/SKILL.md", "skills/tc-apps/SQL.md"]) {
    assert.doesNotMatch(read(path), DONE_WORDING, path);
    assert.doesNotMatch(read(path), CODE_WORDING, path);
  }
  assert.doesNotMatch(read("skills/tc-apps/announce.sh"), DONE_WORDING);
  // The built llms.txt and llms-full.txt carry each guide's description and text: a match is allowed only in the
  // entry or section of a listed flow's served page.
  const SERVED_EXCEPTIONS = ["publish", "share", "secrets", "chat", "skills/publish.md", "skills/secrets.md", "skills/chat.md"].map((path) => `https://agents.tinycloud.xyz/${path}`);
  for (const line of served("llms.txt").split("\n")) {
    if (CODE_WORDING.test(line) || DONE_WORDING.test(line)) assert.ok(SERVED_EXCEPTIONS.includes(line.match(/\]\((\S+?)\)/)?.[1]), `llms.txt: ${line.slice(0, 160)}`);
  }
  const sections = served("llms-full.txt").split(/\n---\nSource: (\S+)\n---\n/);
  assert.ok(sections.length > 20);
  for (let i = 1; i < sections.length; i += 2) {
    for (const line of sections[i + 1].split("\n")) {
      if (CODE_WORDING.test(line) || DONE_WORDING.test(line)) assert.ok(SERVED_EXCEPTIONS.includes(sections[i]), `llms-full.txt ${sections[i]}: ${line.slice(0, 160)}`);
    }
  }
});

// OpenKey's short code lasts 5 minutes: CLI 1.6.0's `auth login --help` ("OpenKey return codes expire after 5 minutes")
// and OpenKey's apps/api/src/routes/delegation-codes.ts (CODE_TTL_MS = 5 * 60 * 1000).
test("every claim about how long the OpenKey code lasts says 5 minutes, as the pinned CLI does", () => {
  assert.ok(readFileSync(join(root, "node_modules/@tinycloud/cli/dist/legacy-entry.js"), "utf8").includes("OpenKey return codes expire after 5 minutes"));
  const claims = [];
  for (const path of [...walk("skills/tc-secrets"), "setup/secrets.md", "setup/agent.md", "setup/errors.md", "apps/tinychat/setup.md"]) {
    for (const sentence of read(path).split(/(?<=[.:;])\s+/)) {
      if (!/\bcode\b/i.test(sentence)) continue;
      for (const match of sentence.matchAll(/\b(\d+) minutes\b/g)) claims.push([path, match[1], sentence.slice(0, 120)]);
    }
  }
  assert.ok(claims.length >= 6, JSON.stringify(claims));
  for (const [path, minutes, sentence] of claims) assert.equal(minutes, "5", `${path}: ${sentence}`);
  assert.doesNotMatch(read("skills/tc-secrets/SKILL.md"), /valid for 10 minutes/);
});

// TC-2398: Courier's [no-space] has two causes, told apart by stderr in the pinned CLI's Courier bundle.
const AUTO_SIGN_LINE = "Your TinyCloud space isn't set up yet. Please turn on \"Account bootstrap auto-sign\" in your OpenKey settings (https://openkey.so/dashboard/settings), then open this new link and approve. I'll carry on as soon as you do.";
const STILL_SETTING_UP = "  - **`[no-space]`, and stderr says OpenKey is still setting up the space**";
const NOT_SET_UP = "  - **`[no-space]`, and stderr says the space is not set up**";
// The four [no-space] messages Courier 0.5.0 (in CLI 1.6.0) prints, as template literals in its bundle (backticks escaped),
// then filled in with "agents" and a host.
const bundle = readFileSync(join(root, "node_modules/@tinycloud/cli/dist/courier-entry.js"), "utf8");
const NO_SPACE = [
  ["pending", 'OpenKey is still setting up your TinyCloud "${COURIER_SPACE}" space on ${profile.host}. This can take a few minutes. Run \\`${cmd("init --resume")}\\` shortly; no new approval is needed.'],
  ["pending", 'TinyCloud "${COURIER_SPACE}" space is still being set up by OpenKey; run \\`${cmd("init --resume")}\\`.'],
  ["missing", 'Your TinyCloud "${COURIER_SPACE}" space is not set up on ${profile.host}, so the approved grant can\'t be used yet. Courier will not create it.'],
  ["missing", 'TinyCloud "${COURIER_SPACE}" space is missing; after hosting it, run \\`${cmd("init --resume")}\\`.'],
];
const filled = (template) => template.replaceAll("\\`", "`").replaceAll("${COURIER_SPACE}", "agents").replaceAll("${profile.host}", "https://tee.node.tinycloud.xyz").replace(/\$\{cmd\("([^"]+)"\)\}/g, "tinycloud courier $1");
const bullet = (section, head) => section.split("\n").find((line) => line.startsWith(head));
// A bullet's quoted stderr phrases; "…" stands for any text in between.
const phrases = (line) => [...line.match(/\*\* \(([^)]*)\):/)[1].matchAll(/"((?:[^"]|"agents")+)"/g)].map((m) => m[1]);
const says = (message, phrase) => {
  let at = 0;
  for (const part of phrase.split(" … ")) { at = message.indexOf(part, at); if (at < 0) return false; at += part.length; }
  return true;
};
test("Courier [no-space]: still being set up waits with no new approval; not set up sends the Auto-Sign line with a new link, once", () => {
  for (const [, template] of NO_SPACE) assert.ok(bundle.includes(template), template);
  for (const [surface, text] of [["setup/courier.md", read("setup/courier.md")], ["skills/courier/SKILL.md", served("skills/courier/SKILL.md")], ["skills/courier/start.md", served("skills/courier/start.md")]]) {
    const section = text.split("\n## Set up Courier once\n")[1].split("\n## ")[0];
    const pending = bullet(section, STILL_SETTING_UP);
    const missing = bullet(section, NOT_SET_UP);
    assert.ok(pending && missing, surface);
    // Each CLI message matches exactly one case.
    for (const [kind, template] of NO_SPACE) {
      const message = filled(template);
      const cases = [["pending", pending], ["missing", missing]].filter(([, line]) => phrases(line).some((phrase) => says(message, phrase))).map(([name]) => name);
      assert.deepEqual(cases, [kind], `${surface}: ${message}`);
    }
    assert.match(pending, /Do not ask for another approval\./);
    assert.doesNotMatch(pending, /Auto-Sign|auto-sign|Run step 1/);
    assert.ok(pending.includes('"I can\'t set up Courier right now. Please ask me again later."'));
    assert.ok(missing.includes(`Run step 1 once, and send its new link with exactly this line, once: "${AUTO_SIGN_LINE}"`), surface);
    assert.match(missing, /If this case comes back, don't send that line again: send the owner exactly "I couldn't set up Courier this time\. Tell me if you'd like me to try again\." and stop\./);
    assert.equal(count(text, AUTO_SIGN_LINE), 1, `${surface}: the Auto-Sign line is sent from one place`);
  }
  // The setting's name as OpenKey's settings page shows it (openkey apps/web/src/routes/dashboard/settings).
  assert.match(AUTO_SIGN_LINE, /"Account bootstrap auto-sign"/);
});
