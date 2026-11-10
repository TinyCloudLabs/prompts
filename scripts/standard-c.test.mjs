// Standard C: one CLI approval-error table and its owner lines, shared through standard blocks.
// Builds a copy of the repository, so the shared _site other tests read is left alone.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const standard = read("standard/blocks.md");
const errors = standard.split(/^<!-- std:errors -->\n/m)[1].trim();
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
const AUTHORED = [...walk("setup"), ...walk("skills"), "apps/tinychat/setup.md"].filter((path) => /\.(md|sh)$/.test(path));
const count = (text, needle) => text.split(needle).length - 1;

const DONE = "`<What>` is set up.";
const CANT = "I can't set up `<what>` right now. Please ask me again later.";
const COULDNT = "I couldn't set up `<what>` this time. Tell me if you'd like me to try again.";
const DECLINED = "Did you decline that request? If not, I'll send you a fresh link.";

test("the shared table is expanded once into every guide and skill that carries its marker", () => {
  for (const [source, url] of SURFACES) {
    assert.equal(count(read(source), "\n{{std:errors}}\n"), 1, source);
    assert.equal(count(served(url), errors), 1, url);
  }
  for (const url of SERVED_ONLY) {
    const table = served(url);
    assert.equal(count(table, url === "onboarding.html" ? "<th>Exit</th>" : "| Exit | Means | Do |"), 1, url);
  }
  const leftover = AUTHORED.filter((path) => !SURFACES.some(([source]) => source === path) && read(path).includes("{{std:errors}}"));
  assert.deepEqual(leftover, []);
  for (const url of [...SURFACES.map(([, url]) => url), ...SERVED_ONLY, "llms-full.txt"]) assert.doesNotMatch(served(url), /\{\{/, url);
});

test("the CLI 1.6.3 table matches the approval exits, including one-line error reporting", () => {
  const rows = errors.split("\n").filter((line) => /^\| (\d|Anything else) \|/.test(line)).map((line) => line.split(" | ").map((cell) => cell.replace(/^\| |\s\|$/g, "")));
  assert.deepEqual(rows.map(([exit]) => exit), ["0", "3", "6", "8", "5", "Anything else"]);
  const [done, expired, network, waiting, declined, other] = rows;
  assert.match(done[1], /^Done\.$/);
  assert.equal(expired[1], '`APPROVAL_REQUEST_EXPIRED`: “This approval request expired before it was approved. Start a new request.”');
  assert.match(expired[2], /ask exactly “Did you decline that request\? If not, I'll send you a fresh link\.” and wait/);
  assert.match(expired[2], /If more than 2 minutes remain before `expiresAt`, do not run a command or create a link/);
  assert.match(expired[2], /If you don't have the earlier exit-8 JSON, ask the decline question and wait/);
  assert.match(expired[2], /Never read `approval-pending\.json`/);
  assert.equal(network[1], "`NETWORK_ERROR`: the network did not answer (for example, an OpenKey status check or a node fetch).");
  assert.match(network[1], /OpenKey status check or a node fetch/);
  assert.match(network[2], /same command again once; make no new link/);
  assert.match(network[2], /For a resumed approval, the saved request is kept/);
  assert.ok(network[2].includes("If the retry also exits 6, tell the owner exactly “I can't set up TinyCloud right now. Please ask me again later.”, then put the stderr error code on its own line and stop."));
  assert.match(network[2], /CLI stderr has no `Next:` line/);
  assert.match(network[2], /guide block may print its own `NEXT:` line/);
  assert.doesNotMatch(network[2], /--timeout/);
  const onboarding = read("setup/onboarding.md");
  const onboardingExit6 = onboarding.split("\n").find((line) => line.startsWith("- **Exit 6:**"));
  assert.ok(onboardingExit6?.includes("I can't set up TinyCloud right now. Please ask me again later."));
  assert.ok(onboardingExit6?.includes("stderr error code on its own line and stop."));
  assert.match(onboardingExit6, /run the same command again once/);
  assert.doesNotMatch(onboardingExit6, /OpenKey only|OpenKey did not answer/);
  const onboardingRunExit6 = onboarding.split("\n").find((line) => line.includes("elif [ \"$RC\" = 6 ]"));
  assert.match(onboardingRunExit6, /run this same block again once/);
  assert.match(onboardingRunExit6, /If an approval request was saved, it resumes; do not create a new link/);
  assert.match(waiting[1], /^Still waiting only when stdout contains a non-empty `pending\.approvalUrl` link\./);
  assert.match(waiting[1], /Exit 8 without it is not pending/);
  assert.match(waiting[2], /send it once and wait for the owner/);
  assert.match(waiting[2], /Follow the shared relay block's `Next:` lines rule/);
  assert.match(declined[2], /^Stop and send the “couldn't” failed line, then the error code on its own line/);
  assert.match(declined[2], /never send a CID/);
  assert.match(other[2], /^Any code not mapped above is an error: stop and send the “couldn't” failed line/);
  assert.match(other[2], /Any code not mapped above is an error/);
  assert.match(other[2], /Do not treat it as pending or retry/);
  const courier = errors.split("\n").find((line) => line.startsWith("- Courier (`tinycloud courier …`):"));
  assert.match(courier, /`init --request`, exit 0 may still create and print an approval link/);
  assert.match(courier, /follow every stderr `Next:` line by the shared relay rule, regardless of the exit code/);
  assert.match(courier, /`init --wait`, exit 8 is pending only when stdout contains a non-empty `pending\.approvalUrl`/);
  assert.match(courier, /Courier 0\.5\.2 exits only 0, 1, 2 or 8; exit 6 is not a Courier code/);
  const courierGuide = read("setup/courier.md");
  const waitAgain = courierGuide.split("Any other non-zero exit is an error:")[1].split("\n  - **A refused grant:")[0];
  assert.match(waitAgain, /\[approval-rejected\].*\[approval-unavailable\].*exit 1/s);
  assert.match(waitAgain, /saved request is kept/);
  assert.match(waitAgain, /Run the same `"\$TC" courier init --wait --timeout 60s` again/);
  assert.match(waitAgain, /do not create or send a new link/);
  assert.doesNotMatch(waitAgain, /exit 6/i);
});

test("blocking auth request guidance covers every authored surface that invokes it", () => {
  const surfaces = [
    ["feed skill", read("skills/tinycloud-feed/SKILL.md")],
    ["feed post guide", read("skills/tinycloud-feed/creating-a-post.md")],
    ["served feed skill", served("skills/feed/SKILL.md")],
    ["served feed guide", served("feed")],
    ["onboarding", read("setup/onboarding.md")],
    ["served onboarding", served("onboarding.md")],
    ["tc-apps", read("skills/tc-apps/SKILL.md")],
    ["tc-apps TINY-APPS", read("skills/tc-apps/TINY-APPS.md")],
    ["served tc-apps TINY-APPS", served("skills/apps/TINY-APPS.md")],
    ["tc-apps SQL", read("skills/tc-apps/SQL.md")],
    ["served tc-apps SQL", served("skills/apps/SQL.md")],
    ["served tc-apps", served("skills/apps/SKILL.md")],
    ["CLI skill", served("skills/cli/SKILL.md")],
    ["CLI auth reference", served("skills/cli/AUTH.md")],
  ];
  for (const [name, text] of surfaces) {
    assert.match(text, /auth request/);
    assert.match(text, /has no `--timeout`/);
    assert.match(text, /blocks until the approval is resolved/);
    assert.match(text, /pending-link result/);
    assert.match(text, /persistent shell session that streams stderr and stays alive while you reply/);
    assert.match(text, /If your shell tool cannot keep this process alive while you reply, stop and ask for a supported flow/);
  }
});

test("onboarding describes the status lines emitted for exit 3", () => {
  const text = read("setup/onboarding.md");
  assert.match(text, /then the block prints its final status lines/);
  assert.doesNotMatch(text, /then the block prints one last line/);
});

test("the announcement tells the owner what to do when an app link has no code", () => {
  const state = mkdtempSync(join(work, "announce-"));
  try {
    const result = spawnSync("sh", [join(root, "skills/tc-apps/announce.sh"), "healthlog"], {
      encoding: "utf8",
      env: { ...process.env, TC_APPS_STATE: state },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /If OpenKey shows a code \(only the sign-in link does\), paste it back to me here in chat\. For an app-approval link, approve it, then tell me\./);
    assert.doesNotMatch(result.stdout, /I'll finish setup after you send the code/);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test("the three owner lines and declined line are exact and have no pasted copy", () => {
  assert.equal(count(errors, DECLINED), 2, DECLINED);
  for (const line of [DONE, CANT, COULDNT]) assert.equal(count(errors, line), 1, line);
  assert.ok(errors.includes(`**Declined approval, owner line:** “${DECLINED}”`));
  const texts = [...AUTHORED.map((path) => [path, read(path)]), ...[...SURFACES.map(([, url]) => url), ...SERVED_ONLY].map((url) => [url, served(url)])];
  for (const [path, text] of texts) {
    if (text.includes(errors) && path !== "standard/blocks.md") assert.equal(count(text, errors), 1, path);
  }
  const forbidden = new RegExp(["nothing", "to tell", "your agent"].join("\\s+") + "|" + ["carries", "on", "as soon as", "you", "approve"].join("\\s+") + "|" + ["as soon", "as", "you", "do"].join("\\s+") + "|" + ["don't ask", "the owner", "to tell you", "when they're done"].join("\\s+"), "i");
  for (const [path, text] of texts) assert.doesNotMatch(text, forbidden, path);
});
test("the real built onboarding block sends exit 3 through the agent-side expiry rule", () => {
  const onboarding = served("onboarding.md");
  const run = onboarding.split("**2. Run onboarding.**")[1]?.split("\n## MCP\n")[0];
  const command = [...run.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((match) => match[1])[0];
  assert.ok(command, "built /onboarding step 2 must contain its real shell block");
  assert.match(onboarding, /NEXT: Before doing anything else, compare now with pending\.expiresAt from the earlier exit-8 JSON/);
  assert.ok(onboarding.includes(DECLINED));

  const home = join(work, "fake-cli-home");
  mkdirSync(join(home, ".agents/skills/tinycloud-cli"), { recursive: true });
  writeFileSync(join(home, ".agents/skills/tinycloud-cli/SKILL.md"), "installed");
  const cli = join(work, "fake-tinycloud");
  writeFileSync(cli, `#!/bin/sh
if [ "$*" = "--version" ]; then echo 1.6.3; exit 0; fi
if [ "$*" = "onboard --timeout 1s" ]; then
  printf '%s\\n' "$PENDING_JSON"
  exit 3
fi
exit 90
`, { mode: 0o700 });
  const script = command.replaceAll("'<TC_BIN>'", JSON.stringify(cli));
  for (const expiresAt of ["2099-01-01T00:00:00.000Z", "2000-01-01T00:00:00.000Z"]) {
    const result = spawnSync("sh", ["-c", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: home,
        PENDING_JSON: JSON.stringify({ pending: { step: 1, of: 2, approvalUrl: "https://openkey.example/link", expiresAt } }),
      },
    });
    assert.equal(result.status, 3, expiresAt);
    assert.match(result.stdout, /NEXT: Before doing anything else, compare now with pending\.expiresAt from the earlier exit-8 JSON/);
    assert.match(result.stdout, /If more than 2 minutes remain, do not run a command or create a link/);
    assert.match(result.stdout, /If 2 minutes or less remain, it's a real expiry/);
  }
});
test("Courier expiry uses the same recorded-expiry decision and never reads private pending state", () => {
  const courier = read("setup/courier.md");
  const section = courier.split("\n## Set up Courier once\n")[1].split("\n## ")[0];
  const expired = section.split("**`[approval-expired]`:")[1]?.split("\n  - ")[0];
  assert.match(section, /Use `pending\.expiresAt` from this JSON/);
  const exit3 = errors.split("\n").find((line) => line.startsWith("| 3 |"));
  assert.match(exit3, /If more than 2 minutes remain before `expiresAt`/);
  assert.match(exit3, /Create a new request only when 2 minutes or less remain before `expiresAt`/);
  assert.match(expired, /apply the shared exit-3 decline\/expiry rule/);
  assert.match(expired, /Never read `approval-pending\.json`; it contains private keys/);
});


// Where a command's real codes differ, the guide keeps its own rows. Every prose mention of exit 3, 5 or 8 outside the
// shared block and shell blocks is in one of these files, for the reason given.
const EXIT_EXCEPTIONS = {
  "setup/onboarding.md": "the guide's exit-8 pending-link instructions; shared block owns error decisions",
  "setup/courier.md": "Courier has its own exits: 0, 8, 2 and 1 with [code], including `[approval-expired]`",
  "skills/tc-apps/SKILL.md": "data commands: kv put --if-none-match exits 5 KV_ALREADY_EXISTS; layout.sh exits 3 when jq is missing",
  "skills/tc-publish/SKILL.md": "the publish sign-in's exit 3 and 8 handling, and share commands (3 AUTH_REQUIRED session, 5 PERMISSION_DENIED scope)",
  "skills/tc-secrets/SKILL.md": "secrets sign-in (3 APPROVAL_*_EXPIRED, 8 APPROVAL_*_UNAVAILABLE), reads (3 AUTH_REQUIRED, 5 PERMISSION_DENIED) and secrets wait (8 still missing)",
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
  "setup/onboarding.md": "the owner's approved instruction to tell the agent when they have approved",
  "skills/tc-publish/SKILL.md": "publish sign-in: the owner tells the agent when they have approved the link",
  "apps/tinychat/setup.md": "TinyChat's pack (authorize, then login --code)",
  "skills/tc-secrets/SKILL.md": "Secrets owner message asks the owner to say they are done after approving; no code",
  "skills/tc-apps/LEGACY-SQL.md": "older SQL index sign-in (auth login --paste) asks the owner to paste the code",
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
  for (const path of ["setup/courier.md", "skills/tinycloud-feed/SKILL.md", "skills/tc-apps/SKILL.md", "skills/tc-apps/SQL.md"]) {
    assert.doesNotMatch(read(path), DONE_WORDING, path);
    assert.doesNotMatch(read(path), CODE_WORDING, path);
  }
  assert.doesNotMatch(read("skills/tc-apps/announce.sh"), DONE_WORDING);
});

// OpenKey's short code lasts 5 minutes: CLI 1.6.3's `auth login --help` ("OpenKey return codes expire after 5 minutes")
// and OpenKey's apps/api/src/routes/delegation-codes.ts (CODE_TTL_MS = 5 * 60 * 1000).
test("every claim about how long the OpenKey code lasts says 5 minutes, as the pinned CLI does", () => {
  assert.ok(readFileSync(join(root, "node_modules/@tinycloud/cli/dist/legacy-entry.js"), "utf8").includes("OpenKey return codes expire after 5 minutes"));
  const claims = [];
  for (const path of [...walk("skills/tc-secrets"), "setup/secrets.md", "setup/agent.md", "apps/tinychat/setup.md"]) {
    for (const sentence of read(path).split(/(?<=[.:;])\s+/)) {
      if (!/\bcode\b/i.test(sentence)) continue;
      for (const match of sentence.matchAll(/\b(\d+) minutes\b/g)) claims.push([path, match[1], sentence.slice(0, 120)]);
    }
  }
  assert.ok(claims.length >= 2, JSON.stringify(claims));
  for (const [path, minutes, sentence] of claims) assert.equal(minutes, "5", `${path}: ${sentence}`);
  assert.doesNotMatch(read("skills/tc-secrets/SKILL.md"), /valid for 10 minutes/);
});

// TC-2398: Courier's [no-space] has two causes, told apart by stderr in the pinned CLI's Courier bundle.
const AUTO_SIGN_LINE = "Your TinyCloud space isn't set up yet. Please turn on \"Account bootstrap auto-sign\" in your OpenKey settings (https://openkey.so/dashboard/settings), then open this new link and approve, then tell me.";
const STILL_SETTING_UP = "  - **`[no-space]`, and stderr says OpenKey is still setting up the space**";
const NOT_SET_UP = "  - **`[no-space]`, and stderr says the space is not set up**";
// Courier 0.5.2 in CLI 1.6.3 prints the [no-space] messages below.
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
