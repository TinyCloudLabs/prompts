#!/usr/bin/env node
// Builds the agents.tinycloud.xyz site into _site/ for Cloudflare Pages.
// Public URLs are short and flat; the repository layout is only for authoring:
// - /<page> (/setup, /apps, /chat, …): the guides in PAGES, as Markdown;
// - /onboarding and /connect (the `html` pages): HTML by default, Markdown via
//   Accept or at /<page>.md. /onboarding sets up the owner's profile, sign-in and
//   starting grant, then routes to the goal guide; /connect sends agents that can
//   run the CLI to /onboarding and gives remote MCP clients their connector steps.
// - /skills/<short>/<path>: every file of every skill in SKILLS, exactly as
//   installed, SKILL.md included;
// - /skills/<short>.md: the skill's SKILL.md to read on the web, with its
//   relative links pointed at /skills/<short>/;
// - /skills/index.json: each skill's name, version, description and files with
//   sha256 checksums, which /skills/install.js checks before installing;
// - _redirects: the earlier repository-path URLs, redirected to the short ones,
//   and each Markdown guide's URL with .md added (/apps.md → /apps).
// Other repository files are copied at their repository path. index.html,
// llms.txt, llms-full.txt, robots.txt, sitemap.xml, _headers, the agent-skills
// index, AI Catalog and website-only Poppy manifest are generated.
// Fetches pinned skill tarballs. Run: npm ci && npm run build
import { createHash } from "node:crypto";
import { isUtf8 } from "node:buffer";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { Marked } from "marked";
import { gfmHeadingId } from "marked-gfm-heading-id";
import { CLI_VERSION } from "./install-cli.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "_site");
const SITE = "https://agents.tinycloud.xyz";
// Absolute URLs point at production, except on Pages preview builds, where
// they point at the preview so a branch's guides and installs can be tried as-is.
const PRODUCTION_BRANCH = "main";
const preview = process.env.CF_PAGES_BRANCH && process.env.CF_PAGES_BRANCH !== PRODUCTION_BRANCH && process.env.CF_PAGES_URL;
const BASE = (process.env.SITE_URL || preview || SITE).replace(/\/$/, "");
// docs/: internal notes, kept in the repository, never published.
const SKIP = new Set([".git", ".github", ".gitignore", ".smithers", ".wrangler", "_site", "docs", "functions", "matrix", "node_modules", "package.json", "package-lock.json", "README.md", "scripts", "skills"]);
// Coordinator runbooks: kept in the repository, never published.
const UNPUBLISHED = /^forward-tests.*\.md$/;
// Fetch tools such as Claude Code's WebFetch can hand the agent a summary that
// keeps a page's first lines and drops its shell blocks. So every served
// Markdown guide and skill opens with this line, above its title (a skill:
// right after its front matter), naming its own Markdown URL: /<page>, /<page>.md
// for the html pages, /skills/<short>.md for a skill's SKILL.md. The guides and
// this repository's skills spell it out with the production URL, rewritten on a
// preview like every other; released skills get it at build time. The build
// fails without it. The html pages' rendered HTML, which owners see, leaves it out.
const banner = (path, base = SITE) =>
  `> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with \`curl -fsSL ${base}/${path}\` and follow that text. Summaries drop the shell blocks you must run.\n\n`;
const frontMatter = (text) => text.match(/^---\n[\s\S]*?\n---\n\n*/)?.[0] ?? "";
const opensWithBanner = (text, path) => text.slice(frontMatter(text).length).startsWith(banner(path, BASE));

// Guides, by public URL. `redirectFrom` names other URLs that 301 to the page.
// `html` adds a rendered page and a Markdown alternate, both from the same text.
// `unlisted`: served at its URL, but left out of llms.txt, llms-full.txt, sitemap.xml and the index page, and disallowed in robots.txt.
const PAGES = [
  { url: "onboarding", src: "setup/onboarding.md", html: true, redirectFrom: ["owner", "owner.md", "setup/owner.md"] },
  { url: "setup", src: "setup/README.md" },
  { url: "agent", src: "setup/agent.md" },
  { url: "apps", src: "setup/tc-apps.md" },
  { url: "connect", src: "setup/connect.md", html: true },
  { url: "chat", src: "apps/tinychat/setup.md" },
  { url: "feed", src: "skills/tinycloud-feed/creating-a-post.md" },
  { url: "publish", src: "setup/publish.md" },
  { url: "share", src: "setup/share.md" },
  { url: "secrets", src: "setup/secrets.md" },
  { url: "courier", src: "setup/courier.md" },
  { url: "cli", src: "setup/tinycloud.md" },
  { url: "openkey", src: "setup/openkey.md" },
];

// Every TinyCloud agent skill. Skills authored here are read from `dir`; the
// others are taken from the exact release their owning repository published,
// checked against its sha512 `integrity`, so every build serves the same files.
// `version` is used when SKILL.md has no metadata.version: the package's version.
// `changes` adjusts a released file for this site: either [find, replace] pairs,
// each of which must match exactly once (find is a string or a RegExp), or a
// repository path whose file replaces it. On a preview, as in the guides, every
// production URL in a skill's text files points at the preview, before the
// files' checksums are taken.
// `checkCli`: the build fails unless every served file of the skill runs the
// CLI through RESOLVER (Markdown) or defaultTc() (scripts), so it works with
// /cli's private install in ~/.local/share/tinycloud/cli: no other global npm
// lookup, no bare `tc` command in a shell code block, no script defaulting to `tc`.
// The released Courier skill preamble uses one of these exact resolvers. Keep the
// site's data-only operator selection behavior in every served Markdown file.
// The CLI skill has none since 1.5.0: its examples run `tinycloud` from the PATH.
const upstreamResolver = (bin) => [
  `TC="\${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/${bin}}"   # TC_BIN, else where agents.tinycloud.xyz/cli installs it`,
  `[ -n "\${TC_BIN:-}" ] || [ -x "$TC" ] || ! command -v npm >/dev/null || TC="$(npm prefix --global)/bin/${bin}"   # else a global npm install`,
  '[ -x "$TC" ] || { echo "TC_NOT_FOUND: $TC is not executable; install the CLI from https://agents.tinycloud.xyz/cli or set TC_BIN" >&2; exit 1; }',
].join("\n");
const UPSTREAM_RESOLVERS = [upstreamResolver("tc"), upstreamResolver("tinycloud")];
const RESOLVER = [
  '{ set +x; } 2>/dev/null; umask 077',
  'ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"',
  '[ ! -L "$ENV_HELPER" ] || { echo AGENT_ENV_HELPER_CONFLICT >&2; exit 1; }',
  'if [ "${TC_BIN+x}" != x ] && [ -r "$ENV_HELPER" ]; then',
  '  if TC_BIN=$(node "$ENV_HELPER" get TC_BIN); then :',
  '  else status=$?; [ "$status" -eq 1 ] || exit "$status"; unset TC_BIN; fi',
  'fi',
  'TC="${TC_BIN-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud}"',
  '[ "${TC_BIN+x}" = x ] || [ -x "$TC" ] || ! command -v npm >/dev/null || TC="$(npm prefix --global)/bin/tinycloud"',
  '[ -x "$TC" ] || { echo "TC_NOT_FOUND: $TC is not executable; install the CLI from https://agents.tinycloud.xyz/cli or set TC_BIN" >&2; exit 1; }',
].join("\n");
const courierSetup = readFileSync(join(ROOT, "setup/courier.md"), "utf8")
  .split("\n## Set up Courier once\n")[1]?.split("\n## ")[0];
if (!courierSetup) throw new Error("Courier guide is missing executable remote setup.");
const COURIER_SETUP = `## Set up Courier once\n${courierSetup.trim()}`;
const SHELL_BLOCK = /^```(?:bash|sh|shell)?\n[\s\S]*?^```$/gm;
// `tc` where a shell runs it: at the start of a line, after a pipe, in `$(…)` or in an array `=(…)`.
const BARE_TC = /(^[ \t]*|\|[ \t]*|\$\(|=\()tc(?=[ \t]|$)/gm;
const SKILLS = [
  { short: "apps", dir: "skills/tc-apps" },
  { short: "feed", dir: "skills/tinycloud-feed" },
  { short: "publish", dir: "skills/tc-publish" },
  { short: "secrets", dir: "skills/tc-secrets" },
  {
    short: "cli",
    version: "1.6.1",
    tarball: "https://registry.npmjs.org/@tinycloud/cli/-/cli-1.6.1.tgz",
    integrity: "sha512-XtLjcg1CZw55ofF+M3fzXAsuMCFHSPknY9nm+4FDkE2/9hcO7Goes9Xq4EvBX/6VDJ5CgdouAmM4LzRPQYyEOw==",
    dir: "package/skills/tinycloud-cli",
    checkCli: true,
    changes: {
      "SKILL.md": [
        [
          /^Need more than onboarding grants\? Ask once[^\n]*$/m,
          "Need more than onboarding grants? Keep the selected owner, profile and host. Ask once with `tinycloud auth request --cap SPEC --grant --no-popup --expiry 30d`. Send the complete short URL on its own line and keep the command running; it retrieves approval automatically. Re-run the identical command after interruption. Do not add `--paste`: that explicitly selects the older manual-code flow and long link. See [AUTH.md](AUTH.md).",
        ],
        [
          "Install a catalog app on the onboarding profile:\n\n1. `tinycloud apps install xyz.tinycloud.sample.healthlog` installs",
          "Catalog installation requires `tinycloud.sql/schema` as well as the app's data permissions. The onboarding grant does not include that installation permission; obtain the app's required installation access before running this command:\n\n1. `tinycloud apps install xyz.tinycloud.sample.healthlog` installs",
        ],
        [
          "TinyCloud's agent guides use Node.js 22.20 or later. Check [release.json](release.json) for the CLI range this skill describes.",
          "TinyCloud's agent guides use Node.js 20 or later and CLI `1.6.1`: https://agents.tinycloud.xyz/cli installs it, or upgrades a CLI the agent installed. Check [release.json](release.json) for the CLI range this skill describes.",
        ],
      ],
      "release.json": [['"cli": ">=1.0.0-beta.17 <2.0.0"', '"cli": ">=1.6.1 <2.0.0"']],
      "AUTH.md": [
        [
          /^Keep the user's existing profiles:[^\n]*$/m,
          "Keep the user's existing profiles and onboarding grant. Request only missing permissions with `tinycloud auth request --cap SPEC --grant --no-popup --expiry 30d` (or `--manifest FILE --grant --no-popup`). Send the actual short URL on its own line and keep the command running; no return code is needed. Re-run the identical command/profile after interruption. The explicit `--paste` fallback described below still uses a long manual-code URL; do not select it for normal mobile or chat approvals.",
        ],
      ],
      "INSTALL.md": [
        [
          "curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - cli --agent claude-code\ncurl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - courier --agent claude-code",
          "mkdir -p \"$HOME/.local/share/tinycloud\" && curl -fsSL -o \"$HOME/.local/share/tinycloud/install.js\" https://agents.tinycloud.xyz/skills/install.js\nnode \"$HOME/.local/share/tinycloud/install.js\" cli --agent claude-code\nnode \"$HOME/.local/share/tinycloud/install.js\" courier --agent claude-code",
        ],
        [
          "To remove the CLI, run `npm uninstall --global @tinycloud/cli`.",
          "To remove the CLI, follow the Undo steps at https://agents.tinycloud.xyz/cli: it is installed in a private prefix, not globally.",
        ],
      ],
    },
  },
  {
    short: "courier",
    version: "0.5.1",
    tarball: "https://registry.npmjs.org/@tinycloud/courier/-/courier-0.5.1.tgz",
    integrity: "sha512-5vsqn+fxwd6GRoWQWS8jj/zsm0ZqyyXgyd0nqyatAfDDZcxHGp9XbCPupCnEa2CbsDtTVDy2V11CoI9DLALtAg==",
    dir: "package/skills/courier",
    checkCli: true,
    changes: {
      "SKILL.md": [
        [
          "Offer only `same-owner`, `anyone`, and `named` invitation modes.\nNamed recipients require an exact Courier `did:key` or a verified paired handle;\nemail addresses and decorative names are refused.",
          "Offer exactly two invitation modes: `same-owner` and `anyone`.\nFollow the two-choice flow in the Courier guide, https://agents.tinycloud.xyz/courier.",
        ],
        [
          /^`init`, `pair` and `revoke` are human steps: the owner approves the agent grant\nin OpenKey and decides who to pair with\. Setup takes no code to copy back:\n[\s\S]*?otherwise use `init --resume`\.$/m,
          "Courier uses its own COURIER_HOME and one restricted Courier approval; do not create a second TinyCloud CLI profile. Set COURIER_LINK_ORIGIN=https://courier.tinycloud.xyz for invitation viewing; this does not change the API host. Use the executable remote setup below only when setup is missing.\n\n" + COURIER_SETUP,
        ],
      ],
      "start.md": [
        [
          "Start Courier for me using the installed courier command. Reuse my existing Courier profile and restricted grant. If setup is required, use the normal courier init approval flow; do not request my owner key or broader permissions.",
          "Start Courier for me using the selected TinyCloud CLI, with every command run as \"$TC\" courier. Reuse my ready Courier home and restricted grant. If setup is missing, use the remote setup below: request one Courier approval, give me its exact openkeyUrl with one plain line, then collect my approval with courier init --wait --timeout 60s and run it again while it exits 8 (still pending, not a failure). Import a code only if I send one back in chat. Keep the same COURIER_HOME and do not create another TinyCloud CLI profile, request my owner key, or substitute an onboarding grant. Set COURIER_LINK_ORIGIN=https://courier.tinycloud.xyz for the invitation viewer, and preserve every returned invitation URL exactly.",
        ],
        [
          "use courier join '<exact link>' --consent instead of creating or selecting another chat.",
          "use courier join '<exact link>' --consent --wait 60 instead of creating or selecting another chat. Each call waits at most a minute; while the issuer hasn't finished pairing it exits 1 with [invite-pending], so run the same join again in the same turn without asking me, at most 10 times in a row.",
        ],
        [
          "Offer exactly these invitation choices: connect another agent of my same owner, invite anyone holding the link, or invite a named recipient. My selection is consent to issue that invitation. Use courier invite --session <id> --mode same-owner|anyone|named --consent. Named mode needs --recipient with an exact Courier did:key or a verified paired handle; an email address or display name is not verified and must not be substituted. Keep the issuer serving while the recipient joins. Give me the one handoff link. If serving is interrupted, resume courier invite serve <invitationId> for that same invitation.",
          "Offer exactly two invitation choices: same-owner, another agent I control; or anyone, a bearer invitation whose first valid claim wins. My selection is consent to issue that invitation. Use courier invite --session <id> --mode same-owner|anyone --consent --wait 1: it returns within seconds with the handoff link and then exits 1 with [invite-pending], which is expected; the invitation is kept. Give me its exact handoff link at once. Then, in the same turn and without asking me, keep the issuer serving that same invitation with courier invite serve <invitationId> --wait 60, rerunning it while it exits 1 with [invite-pending] (nobody has joined yet), at most 10 serve runs in a row; the invite call's own [invite-pending] doesn't count. Never pipe these commands through tail, head or a filter.",
        ],
      ],
    },
  },
  {
    short: "chat",
    tarball: "https://tinycloud.chat/agents/tinychat-retrieval/0.1.1-onboarding.25/tinychat-retrieval-0.1.1-onboarding.25.tgz",
    integrity: "sha512-o+kAbwivfO7kKQUyoaOlrYIREX7RUpb8X91SeBa/SjQkP01PcpmIei5n8N6B15UaFu8ftrajjgRt2eeUxtjG2Q==",
    dir: "package",
    // No `changes`: since 0.1.1-onboarding.25 the pack runs TC_BIN, else the
    // `tinycloud` that /onboarding installs, else `tinycloud` on PATH. Never `tc`.
    checkCli: true,
  },
  {
    short: "mcp",
    version: "0.8.6",
    tarball: "https://registry.npmjs.org/@tinycloud/mcp/-/mcp-0.8.6.tgz",
    integrity: "sha512-yhmfXbAA/BFtNPlIyhKzN6TQxmXNbYx79lybf+sEblnO+q6syvgO7O1ZDD9jol060AE67E8cQs0dL0Tp/9Cefw==",
    dir: "package/skills/tinycloud-delegated-secrets",
  },
];

// Abilities shown on the front page, in order. `task` follows the owner prompt's fetch line, which
// fetches `fetch` when the guide's Markdown lives at another URL than its page (/onboarding.md).
const ABILITIES = [
  {
    title: "Set up TinyCloud",
    url: "onboarding",
    fetch: "onboarding.md",
    text: "Your agent sets you up so it can act for you in your own TinyCloud: you sign in (or create an account) with OpenKey and approve what it may do.",
    task: "Set me up with TinyCloud.",
  },
  {
    title: "Personal records",
    url: "apps",
    text: "Log, track and look up anything you keep records of, like meals, weight, workouts or todos. Your agent organises them into apps as you go; each app has its own folder in your TinyCloud.",
    task: "Log this meal in my TinyCloud: breakfast, two eggs and a slice of toast, about 350 kcal.",
  },
  {
    title: "Home feed",
    url: "feed",
    text: "Connect your agent to TinyCloud Home once; it posts the cards you ask for and reads your answers.",
    task: "Post the updates I ask for to my TinyCloud Home feed.",
  },
  {
    title: "Publish",
    url: "publish",
    text: "Publish a document or web page and get back a link that anyone who has it can open. Your agent asks you first.",
    task: "Publish this report and send me a link.",
  },
  {
    title: "Secrets",
    url: "secrets",
    text: "Use API keys you keep in TinyCloud Secrets. The value never appears in the conversation. If a key is missing, your agent sends you a link to add it.",
    task: "Turn this script into a voiceover with ElevenLabs. Get the key from TinyCloud.",
  },
  {
    title: "Meetings",
    url: "chat",
    text: "Ask about your TinyChat meetings: recaps, follow-ups and what was said.",
    task: "How did my last meeting go?",
  },
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
// The setup guide pins the parser the agent installs. A stale pin would serve
// a different executable than the one the guide tells agents to trust.
const envHelperHash = sha256(readFileSync(join(ROOT, "scripts/agent-env.mjs")));
const envGuide = readFileSync(join(ROOT, "setup/agent.md"), "utf8");
const envPins = [...envGuide.matchAll(/(?:const pin = )"([a-f0-9]{64})"/g)].map((match) => match[1]);
if (envPins.length !== 1 || envPins[0] !== envHelperHash) {
  throw new Error("setup/agent.md agent-env.mjs pin differs from served helper");
}

// Guide and skill blocks stop with CLI_OLDER/TC_OLDER below the installer's pin, and text that names the
// package's version (`@tinycloud/cli 1.6.1`, `@tinycloud/cli@1.6.1`) names the pin. Markdown is served as
// written, so each spells the pin out and must spell the installer's. Text may instead write {{CLI_VERSION}},
// which render() fills in from install-cli.mjs (as /cli's blocked-install line and fallback commands do).
const pinFiles = [...new Set([...PAGES.map((p) => p.src), ...SKILLS.filter((s) => !s.tarball).flatMap((s) => walk(s.dir))])].filter((p) => p.endsWith(".md"));
const stalePins = pinFiles.flatMap((path) =>
  [...readFileSync(join(ROOT, path), "utf8").matchAll(/awk -F\. -v p=(\S+) |older than the pinned (\S+);|@tinycloud\/cli[@ ](\d+\.\d+\.\d+(?:-[0-9A-Za-z.]*[0-9A-Za-z])?)/g)]
    .map((match) => match[1] ?? match[2] ?? match[3])
    .filter((pin) => pin !== CLI_VERSION)
    .map((pin) => `${path}: ${pin}`),
);
if (stalePins.length) throw new Error(`CLI version pins that differ from install-cli.mjs's ${CLI_VERSION}:\n  ${stalePins.join("\n  ")}`);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const url = (p) => `${BASE}/${p}`;
// Every owner prompt names the guide to fetch raw and the installer it runs: Claude Code's auto mode
// runs a downloaded installer when the owner's own prompt asked for it, and may refuse it otherwise.
const ownerPrompt = (path, task) => `Fetch ${url(path)} with curl and follow it, including running its installer. ${task}`;
const abilityPrompt = (a) => ownerPrompt(a.fetch ?? a.url, a.task);

function walk(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = dir ? `${dir}/${name}` : name;
    if ((!dir && SKIP.has(name)) || UNPUBLISHED.test(name)) return [];
    return statSync(join(ROOT, path)).isDirectory() ? walk(path) : [path];
  });
}

// Title and one-paragraph description of a Markdown document.
function describe(text, fallbackTitle) {
  const front = text.match(/^---\n([\s\S]*?)\n---\n/);
  const body = front ? text.slice(front[0].length) : text;
  const title = (body.match(/^# (.+)$/m) || [, fallbackTitle])[1].replace(/`/g, "");
  const fmDesc = front && front[1].match(/^description:\s*(.+)$/m);
  let desc = fmDesc ? fmDesc[1].trim().replace(/^["']|["']$/g, "") : "";
  if (!desc) {
    const para = body.split(/\n\s*\n/).find((b) => b.trim() && !/^(#|```|[-*>|<])/.test(b.trim()));
    desc = para ? para.replace(/\s+/g, " ").trim() : "";
  }
  return { title, desc, front: front ? front[1] : "" };
}

// Regular files in a tar archive, by path.
function untar(buf) {
  const files = new Map();
  let longName = null;
  for (let off = 0; off + 512 <= buf.length; ) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const str = (start, len) => header.subarray(start, start + len).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(str(124, 12).trim() || "0", 8);
    const type = str(156, 1) || "0";
    const data = buf.subarray(off + 512, off + 512 + size);
    const prefix = str(345, 155);
    const name = longName ?? (prefix ? `${prefix}/${str(0, 100)}` : str(0, 100));
    longName = null;
    if (type === "L") longName = data.toString("utf8").replace(/\0.*$/s, "");
    else if (type === "x") longName = data.toString("utf8").match(/^\d+ path=(.*)$/m)?.[1] ?? null;
    else if (type === "0" || type === "7") files.set(name, Buffer.from(data));
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

async function loadSkill(skill) {
  let files;
  if (skill.tarball) {
    const res = await fetch(skill.tarball);
    if (!res.ok) throw new Error(`${skill.tarball}: HTTP ${res.status}`);
    const tgz = Buffer.from(await res.arrayBuffer());
    const integrity = "sha512-" + createHash("sha512").update(tgz).digest("base64");
    if (integrity !== skill.integrity) throw new Error(`${skill.tarball}: integrity ${integrity}, expected ${skill.integrity}`);
    files = [...untar(gunzipSync(tgz))]
      .filter(([path]) => path.startsWith(`${skill.dir}/`))
      .map(([path, body]) => [path.slice(skill.dir.length + 1), body]);
  } else {
    files = walk(skill.dir).map((path) => [path.slice(skill.dir.length + 1), readFileSync(join(ROOT, path))]);
  }
  files.sort(([a], [b]) => (a < b ? -1 : 1));
  const changed = new Set();
  for (const [path, change] of Object.entries(skill.changes || {})) {
    const i = files.findIndex(([p]) => p === path);
    if (i < 0) throw new Error(`${skill.short}: changes ${path}, which isn't in ${skill.tarball || skill.dir}`);
    if (typeof change === "string") {
      files[i] = [path, readFileSync(join(ROOT, change))];
    } else {
      let text = files[i][1].toString("utf8");
      for (const [find, replace] of change) {
        if (text.split(find).length !== 2) throw new Error(`${skill.short}: ${path} must contain ${JSON.stringify(find)} exactly once`);
        text = text.replace(find, () => replace);
      }
      files[i] = [path, Buffer.from(text)];
    }
    changed.add(path);
  }
  if (skill.tarball) {
    files = files.map(([path, body]) => {
      if (path !== "SKILL.md") return [path, body];
      changed.add(path);
      const text = body.toString("utf8");
      const front = frontMatter(text);
      return [path, Buffer.from(front + banner(`skills/${skill.short}.md`) + text.slice(front.length))];
    });
  }
  if (skill.short === "courier") {
    files = files.map(([path, body]) => {
      if (path !== "start.md") return [path, body];
      changed.add(path);
      const prompt = body.toString("utf8").replace(/\bcourier (?=start|init|join|invite|read|send)/g, '"$TC" courier ');
      return [path, Buffer.from(`${prompt.trimEnd()}\n\n${COURIER_SETUP}\n`)];
    });
  }
  if (skill.short === "courier") {
    files = files.map(([path, body]) => {
      if (!path.endsWith(".md")) return [path, body];
      let text = body.toString("utf8");
      text = UPSTREAM_RESOLVERS.reduce((out, upstream) => out.replaceAll(upstream, RESOLVER), text);
      if (skill.short === "cli") {
        text = text.replace(SHELL_BLOCK, (block) => {
          const commands = /(^[ \t]*|\|[ \t]*|\$\(|&&[ \t]*|;[ \t]*|=\()tinycloud(?=[ \t]|$)/gm;
          if (!commands.test(block)) return block;
          return block.replace(/\n/, `\n${RESOLVER}\n`).replace(commands, '$1"$TC"');
        });
      }
      if (text !== body.toString("utf8")) changed.add(path);
      return [path, Buffer.from(text)];
    });
  }
  if (BASE !== SITE) {
    files = files.map(([path, body]) => {
      if (!body.includes(SITE) || !isUtf8(body)) return [path, body];
      changed.add(path);
      return [path, Buffer.from(body.toString("utf8").replaceAll(SITE, BASE))];
    });
  }
  const main = files.find(([path]) => path === "SKILL.md");
  if (!main) throw new Error(`${skill.short}: no SKILL.md in ${skill.tarball || ""}${skill.dir}`);
  const text = main[1].toString("utf8");
  const { title, desc, front } = describe(text, skill.short);
  const fmVersion = front.match(/^metadata:\s*\n(?:[ \t]+.*\n)*?[ \t]+version:\s*["']?([^"'\n]+)["']?/m)?.[1];
  if (fmVersion && skill.version && fmVersion !== skill.version) throw new Error(`${skill.short}: SKILL.md version ${fmVersion}, configured ${skill.version}`);
  const version = fmVersion || skill.version;
  if (!version) throw new Error(`${skill.short}: no metadata.version in SKILL.md and no configured version`);
  return {
    ...skill,
    changed: [...changed].sort(),
    name: front.match(/^name:\s*(\S+)/m)?.[1] || posix.basename(skill.dir),
    version,
    title,
    desc,
    // SKILL.md as /skills/<short>.md, one folder up from its companion files.
    text: text.replace(/\]\((?![a-z][a-z0-9+.-]*:|#|\/)([^)\s]+)\)/gi, (_, target) => `](${skill.short}/${target})`),
    files: files.map(([path, body]) => ({ path, body, url: `/skills/${skill.short}/${path}` })),
  };
}

const skills = await Promise.all(SKILLS.map(loadSkill));
const copied = walk("").filter((f) => !PAGES.some((p) => p.src === f));

// Repository path → public path, for rewriting the guides' relative links.
const route = new Map(copied.map((f) => [f, `/${f}`]));
for (const p of PAGES) if (!route.has(p.src)) route.set(p.src, `/${p.url}`);
for (const s of skills) if (!s.tarball) for (const f of s.files) route.set(`${s.dir}/${f.path}`, f.path === "SKILL.md" ? `/skills/${s.short}.md` : f.url);

// A guide as published: relative links become absolute public URLs, {{CLI_VERSION}} becomes
// install-cli.mjs's pin, and on a preview every production URL points at the preview.
function render(src) {
  return readFileSync(join(ROOT, src), "utf8")
    .replace(/\]\((?!https?:|mailto:|#)([^)\s#]+)(#[^)\s]*)?\)/g, (_, target, hash = "") => {
      const to = route.get(posix.normalize(posix.join(posix.dirname(src), target)));
      if (!to) throw new Error(`${src}: links to ${target}, which is not published`);
      return `](${SITE}${to}${hash})`;
    })
    .replaceAll("{{CLI_VERSION}}", CLI_VERSION)
    .replaceAll(SITE, BASE);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
const write = (path, content) => {
  mkdirSync(dirname(join(OUT, path)), { recursive: true });
  writeFileSync(join(OUT, path), content);
};

for (const f of copied) {
  mkdirSync(dirname(join(OUT, f)), { recursive: true });
  cpSync(join(ROOT, f), join(OUT, f));
}
write("agent-env.mjs", readFileSync(join(ROOT, "scripts/agent-env.mjs")));
write("install-cli.mjs", readFileSync(join(ROOT, "scripts/install-cli.mjs")));

const pages = PAGES.map((p) => {
  const text = render(p.src);
  write(p.html ? `${p.url}.md` : p.url, text);
  return { ...p, text, ...describe(text, p.url) };
});
const page = (name) => pages.find((p) => p.url === name);

for (const s of skills) {
  for (const f of s.files) write(f.url, f.body);
  write(`skills/${s.short}/SHA256SUMS`, s.files.map((f) => `${sha256(f.body)}  ${f.path}\n`).join(""));
  write(`skills/${s.short}.md`, s.text);
}
const unbannered = [
  ...pages.map((p) => [p.html ? `${p.url}.md` : p.url, p.text]),
  ...skills.flatMap((s) => [
    [`skills/${s.short}.md`, s.text],
    [`skills/${s.short}.md`, s.files.find((f) => f.path === "SKILL.md").body.toString("utf8")],
  ]),
].filter(([path, text]) => !opensWithBanner(text, path));
if (unbannered.length) throw new Error(`guides and skills that don't open with the read-raw line for their own URL:\n  ${unbannered.map(([path]) => path).join("\n  ")}`);
const installer = readFileSync(join(ROOT, "scripts/install-skill.js"), "utf8");
const siteLine = `const SITE = "${SITE}";`;
if (!installer.includes(siteLine)) throw new Error(`scripts/install-skill.js: no line ${siteLine}`);
write("skills/install.js", installer.replace(siteLine, `const SITE = "${BASE}";`));
// Preserve the published POSIX entry point while sharing one installer policy
// with Windows. Download and execution remain separate agent tool calls.
write("skills/install-cli.sh", `#!/bin/sh
set -eu
INSTALL_DIR=$(mktemp -d)
trap 'rm -rf "$INSTALL_DIR"' EXIT
curl -fsSL "${BASE}/install-cli.mjs" -o "$INSTALL_DIR/install.mjs"
node "$INSTALL_DIR/install.mjs"
`);

write(
  "skills/index.json",
  JSON.stringify(
    {
      installer: "/skills/install.js",
      skills: skills.map((s) => ({
        name: s.name,
        short: s.short,
        version: s.version,
        description: s.desc,
        source: s.tarball ? `${s.tarball}#${s.dir}` : `https://github.com/TinyCloudLabs/prompts/tree/main/${s.dir}`,
        ...(s.changed.length ? { changed: s.changed } : {}),
        files: s.files.map((f) => ({ path: f.path, url: f.url, size: f.body.length, sha256: sha256(f.body) })),
      })),
    },
    null,
    2,
  ) + "\n",
);

const servedIndex = JSON.parse(readFileSync(join(OUT, "skills/index.json"), "utf8"));
for (const s of servedIndex.skills) {
  const sums = readFileSync(join(OUT, `skills/${s.short}/SHA256SUMS`), "utf8").trimEnd().split("\n");
  const want = s.files.map((f) => `${f.sha256}  ${f.path}`);
  if (JSON.stringify(sums) !== JSON.stringify(want)) throw new Error(`skills/${s.short}/SHA256SUMS differs from the sha256 entries in skills/index.json`);
}

// Agent Skills discovery index (agentskills.io discovery 0.2.0)
write(
  ".well-known/agent-skills/index.json",
  JSON.stringify(
    {
      $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
      skills: skills.map((s) => ({
        name: s.name,
        type: "skill-md",
        description: s.desc,
        url: `/skills/${s.short}/SKILL.md`,
        digest: "sha256:" + sha256(s.files.find((f) => f.path === "SKILL.md").body),
      })),
    },
    null,
    2,
  ) + "\n",
);

write(
  ".well-known/api-catalog",
  JSON.stringify(
    {
      linkset: [
        {
          anchor: url(""),
          item: [
            {
              href: "https://mcp.tinycloud.xyz/mcp",
              title: "TinyCloud hosted MCP service",
              type: "application/json",
            },
          ],
          "service-doc": [
            {
              href: "https://docs.tinycloud.xyz/cli/mcp",
              type: "text/html",
              title: "TinyCloud MCP connection guide",
            },
          ],
        },
      ],
    },
    null,
    2,
  ) + "\n",
);
const skillQueries = {
  index: [
    "Which public TinyCloud agent skills are available?",
    "What files, versions, and checksums does each TinyCloud skill include?",
  ],
  apps: [
    "How can my agent log a meal or workout in my TinyCloud records?",
    "How do I create and extend an app for tracking personal records?",
  ],
  feed: [
    "How can my agent post an owner-requested card to TinyCloud Home?",
    "How do I add an update to my TinyCloud Home feed?",
  ],
  publish: [
    "How can my agent publish a report and return a link?",
    "How does my agent ask before it makes a link anyone can open?",
  ],
  secrets: [
    "How can my agent use a stored API key without showing its value?",
    "How do I ask the owner to add a missing secret?",
  ],
  cli: [
    "How do I install TinyCloud CLI and access authorized data?",
    "How can I store or share data with the TinyCloud CLI?",
  ],
  courier: [
    "How can two paired agents exchange a request using Courier?",
    "How do I track a Courier task and assess a peer's request?",
  ],
  chat: [
    "How can my agent recap a TinyChat meeting?",
    "How do I find a phrase in my connected meeting transcripts?",
  ],
  mcp: [
    "How can a remote client connect to hosted TinyCloud MCP?",
    "Which delegated TinyCloud tools are available over MCP?",
  ],
};

write(
  ".well-known/ai-catalog.json",
  JSON.stringify(
    {
      specVersion: "1.0",
      host: {
        displayName: "TinyCloud",
        identifier: BASE,
        documentationUrl: url("setup"),
      },
      entries: [
        {
          identifier: "urn:air:agents.tinycloud.xyz:skills:index",
          displayName: "TinyCloud Agent Skills Index",
          type: "application/json",
          url: url("skills/index.json"),
          representativeQueries: skillQueries.index,
        },
        ...skills.map((s) => ({
          identifier: `urn:air:agents.tinycloud.xyz:skill:${s.short}`,
          displayName: s.title,
          type: "text/markdown",
          url: url(`skills/${s.short}.md`),
          representativeQueries: skillQueries[s.short],
        })),
      ],
    },
    null,
    2,
  ) + "\n",
);
// The public documentation host offers only signed-out web browsing under Poppy.
write(
  ".well-known/poppy.json",
  JSON.stringify(
    {
      protocol_version: "0.1",
      organization: {
        name: "TinyCloud",
        domain: new URL(BASE).hostname,
      },
      web: {},
    },
    null,
    2,
  ) + "\n",
);

// Earlier URLs (repository paths) keep working as redirects.
const redirects = [
  "/setup/index.md /setup 301",
  "/setup/index.html /setup 301",
  "/README.md /setup 301",
  ...PAGES.flatMap((p) => [`/${p.url}/ /${p.url} 301`, ...(p.redirectFrom || []).flatMap((from) => [`/${from} /${p.url} 301`, `/${from}/ /${p.url} 301`])]),
  // Agents guess a Markdown guide's URL with `.md` added (/apps.md). An html page's .md is a real file.
  ...PAGES.filter((p) => !p.html).map((p) => `/${p.url}.md /${p.url} 301`),
  ...[...new Map(PAGES.map((p) => [p.src, p.url]))].map(([src, to]) => `/${src} /${to} 301`),
  ...skills.filter((s) => s.name !== s.short).map((s) => `/skills/${s.name}/* /skills/${s.short}/:splat 301`),
];
write("_redirects", redirects.join("\n") + "\n");

const indexed = pages.filter((p) => !p.unlisted);
const listedPages = indexed.filter((p) => p.url !== "setup");

const llms = [
  "# TinyCloud agent abilities",
  "",
  "> Setup guides for any AI agent, backed by the owner's own TinyCloud space: the TinyCloud CLI when the agent can install and run it, otherwise the hosted MCP. Fetch the guide for the task and follow it in the same conversation. /onboarding and /connect serve HTML by default and Markdown when explicitly requested; other guides are plain Markdown.",
  "",
  `Start at ${url("onboarding")} to set up TinyCloud for the owner; it then sends you to the guide for the owner's goal. Agents that can install and run the TinyCloud CLI use it (Node.js 20 or later and npm); agents that support remote MCP connect through ${url("connect")}. ${url("setup")} lists every ability, what it does, and what the owner approves.`,
  "",
  "Read every guide raw: if you can run a shell, fetch it with `curl -fsSL -H 'Accept: text/markdown' <its URL>` and copy its shell blocks from that output. A web-fetch tool that summarizes pages drops or rewrites the blocks, and they only work exactly as written.",
  "",
  "Send the owner every link exactly as the CLI printed it, copied from the output: never retype, shorten or rebuild it.",
  "",
  "## Abilities",
  "",
  ...ABILITIES.map((a) => `- [${a.title}](${url(a.url)}): ${a.text} Example prompt: "${abilityPrompt(a)}"`),
  "",
  "## Guides",
  "",
  `- [${page("setup").title}](${url("setup")}): ${page("setup").desc}`,
  // /onboarding is where setup starts, so its guide entry carries the set-up example too.
  ...listedPages.map((p) => `- [${p.title}](${url(p.url)}): ${p.desc}${p.url === "onboarding" ? ` Example prompt: "${abilityPrompt(ABILITIES.find((a) => a.url === "onboarding"))}"` : ""}`),
  "",
  "## Skills",
  "",
  ...skills.map((s) => `- [${s.name}](${url(`skills/${s.short}.md`)}): ${s.desc}`),
  "",
  "## Optional",
  "",
  `- [Full text](${url("llms-full.txt")}): every guide and skill above in one file.`,
  `- [Skill index](${url("skills/index.json")}): every skill's version and files with sha256 checksums. Install one by downloading the installer, then running it in a separate shell call: \`mkdir -p "$HOME/.local/share/tinycloud" && curl -fsSL -o "$HOME/.local/share/tinycloud/install.js" ${url("skills/install.js")}\`, then \`node "$HOME/.local/share/tinycloud/install.js" <short name> --agent <claude-code|codex|opencode>\` (any other agent: \`codex\`).`,
  `- [Source repository](https://github.com/TinyCloudLabs/prompts): where the guides and TinyCloud's own skills are written.`,
  "",
].join("\n");
write("llms.txt", llms);

write(
  "llms-full.txt",
  [`# TinyCloud agent abilities: full text`, "", `> Every guide and skill listed in ${url("llms.txt")}, concatenated.`, ""]
    .concat(indexed.map((p) => `\n---\nSource: ${url(p.url)}\n---\n\n${p.text.trimEnd()}\n`))
    .concat(skills.map((s) => `\n---\nSource: ${url(`skills/${s.short}.md`)}\n---\n\n${s.text.trimEnd()}\n`))
    .join("\n"),
);

const sitemapPaths = ["", ...indexed.map((p) => p.url), "llms.txt", "llms-full.txt", ...skills.map((s) => `skills/${s.short}.md`)];
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemapPaths.map((p) => `  <url><loc>${esc(url(p))}</loc></url>`).join("\n") +
    "\n</urlset>\n",
);

const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Google-Extended"];
const disallow = pages.filter((p) => p.unlisted).map((p) => `Disallow: /${p.url}`);
write(
  "robots.txt",
  [
    "# These pages are written for AI agents. Fetch them freely.",
    ...[...AI_BOTS, "*"].flatMap((ua) => ["", `User-agent: ${ua}`, "Content-Signal: search=yes, ai-input=yes, ai-train=no", "Allow: /", ...disallow]),
    "",
    `Agentmap: ${url(".well-known/ai-catalog.json")}`,
    `Sitemap: ${url("sitemap.xml")}`,
    "",
  ].join("\n"),
);

write(
  "_headers",
  `/*
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff
  Cache-Control: public, max-age=300
  Link: </llms.txt>; rel="describedby"; type="text/plain", </.well-known/agent-skills/index.json>; rel="describedby"; type="application/json", </.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"; profile="https://www.rfc-editor.org/info/rfc9727", </.well-known/ai-catalog.json>; rel="describedby"; type="application/json", </sitemap.xml>; rel="sitemap"; type="application/xml"
  Agentmap: ${url(".well-known/ai-catalog.json")}

/*.md
  Content-Type: text/markdown; charset=utf-8

/*.txt
  Content-Type: text/plain; charset=utf-8
${PAGES.filter((p) => !p.html).map((p) => p.url)
  .map((name) => `\n/${name}\n  Content-Type: text/markdown; charset=utf-8\n`)
  .join("")}

/.well-known/api-catalog
  Content-Type: application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"

/.well-known/ai-catalog.json
  Content-Type: application/json

/.well-known/poppy.json
  Content-Type: application/json

`,
);

const style = `  <style>
    body { font: 16px/1.55 system-ui, sans-serif; max-width: 46rem; margin: 2.5rem auto; padding: 0 1.25rem; color: #1a1a1a; }
    code { font: 0.9em ui-monospace, monospace; background: #f2f2f2; padding: 0.1em 0.3em; border-radius: 3px; overflow-wrap: anywhere; }
    ul.abilities { list-style: none; padding: 0; }
    ul.abilities li { border-top: 1px solid #ddd; padding: 0.25rem 0 0.75rem; }
    h3 { margin-bottom: 0.25rem; }
    a { color: #0b57d0; }
    footer { margin-top: 2.5rem; border-top: 1px solid #ddd; padding-top: 1rem; color: #555; }
  </style>`;
// Each html page: rendered HTML at /<url>, its Markdown at /<url>.md (functions/<url>.js negotiates).
const markdownRenderer = new Marked(gfmHeadingId());
for (const p of pages.filter((p) => p.html)) {
  write(
    `${p.url}.html`,
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(p.title)} · TinyCloud</title>
  <meta name="description" content="${esc(p.desc)}">
  <link rel="canonical" href="${esc(url(p.url))}">
  <link rel="alternate" type="text/markdown" href="/${p.url}.md">
${style}
  <style>
    h2 { margin-top: 2.5rem; border-top: 1px solid #ddd; padding-top: 1rem; }
    h3 { margin-top: 1.75rem; }
    pre { background: #f2f2f2; padding: 1rem; border-radius: 4px; white-space: pre-wrap; overflow-wrap: anywhere; }
    pre code { padding: 0; }
    blockquote { margin: 1rem 0; padding: 0.25rem 1rem; border-left: 3px solid #0b57d0; background: #f2f2f2; overflow-wrap: anywhere; }
    li { margin: 0.4rem 0; }
    table { border-collapse: collapse; }
    th, td { border-top: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  </style>
</head>
<body>
  <main>
${markdownRenderer.parse(p.text.slice(banner(`${p.url}.md`, BASE).length))}
  </main>
</body>
</html>
`,
  );
}

const card = (a) => `      <li>
        <h3><a href="/${a.url}">${esc(a.title)}</a></h3>
        <p>${esc(a.text)}</p>
        <p>Try: <code>${esc(abilityPrompt(a))}</code></p>
      </li>`;
const desc = "Paste one line into your AI agent. It reads the setup from this site and does the job with your data, kept in your own TinyCloud space.";
write(
  "index.html",
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Give your agent abilities · TinyCloud</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt">
  <link rel="ai-catalog" type="application/json" href="${esc(url(".well-known/ai-catalog.json"))}">
${style}
</head>
<body>
  <main>
    <h1>Give your agent abilities</h1>
    <p>${esc(desc)}</p>
    <p>Works with any agent that can install and run the TinyCloud CLI (Node.js 20 or later), and with agents that support remote MCP through <a href="/connect">/connect</a>.</p>
    <p>Everything starts at <a href="/onboarding"><code>${esc(url("onboarding"))}</code></a>. <a href="/setup">/setup</a> lists what each ability does, what to paste, what you approve and how to undo it.</p>

    <h2>How it works</h2>
    <ol>
      <li><strong>Paste a prompt.</strong> It links the ability's page, asks your agent to run its installer, and says what you want.</li>
      <li><strong>Your agent reads the setup.</strong> It installs what it needs and shows you an OpenKey link, where you approve exactly what it may access.</li>
      <li><strong>It does the thing.</strong> Your agent finishes your request in the same conversation, with your data in your TinyCloud space.</li>
    </ol>

    <h2>Abilities</h2>
    <ul class="abilities">
${ABILITIES.map(card).join("\n")}
    </ul>

    <h2>All guides</h2>
    <ul>
${listedPages.map((p) => `      <li><a href="/${p.url}">${esc(p.title)}</a> (<code>/${p.url}</code>)</li>`).join("\n")}
    </ul>

    <h2>Skills</h2>
    <p>The guides install these for you. Each links to its <code>SKILL.md</code>.</p>
    <ul>
${skills.map((s) => `      <li><a href="/skills/${s.short}.md">${esc(s.name)}</a> ${esc(s.version)}</li>`).join("\n")}
    </ul>
  </main>
  <footer>Agents: start at <a href="/onboarding">/onboarding</a>, or <a href="/llms.txt">/llms.txt</a> for a plain-text index of every guide and skill on this site.</footer>
</body>
</html>
`,
);

// Without a 404 page, Pages serves index.html with 200 for missing paths.
write(
  "404.html",
  `<!doctype html>\n<meta charset="utf-8">\n<title>Not found · TinyCloud</title>\n<p>Not found. Agents: see <a href="/setup">/setup</a> for every guide on this site.</p>\n`,
);

// Every released CLI/Courier Markdown block has the persisted-selection
// resolver; no upstream process/private/global-only resolver may survive.
// Other checked skills use their own explicit CLI selection. On a preview, the
// resolvers' install URL points at the preview, like the rest of the skill.
const servedResolver = RESOLVER.replaceAll(SITE, BASE);
const servedUpstream = UPSTREAM_RESOLVERS.map((resolver) => resolver.replaceAll(SITE, BASE));
const SCRIPT_TC = /\bexecutable\s*=\s*['"]tc['"]|\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync)\(\s*['"]tc\b|\breturn\s+['"]tc['"]/;
const wrongCli = skills
  .filter((s) => s.checkCli)
  .flatMap((s) =>
    s.files.flatMap((f) => {
      const text = f.body.toString("utf8");
      const lookups = text.split("npm prefix --global").length - 1;
      const upstream = servedUpstream.some((resolver) => text.includes(resolver));
      const bare = (text.match(SHELL_BLOCK) || []).some((block) => new RegExp(BARE_TC.source, "m").test(block));
      const scriptDefault = /\.m?js$/.test(f.path) && SCRIPT_TC.test(text);
      return !upstream && lookups === text.split(servedResolver).length - 1 && !bare && !scriptDefault ? [] : [f.url];
    }),
  );
if (wrongCli.length) throw new Error(`skill files that don't run the CLI through TC_BIN and the private install:\n  ${wrongCli.join("\n  ")}`);

// Every link in a served Markdown file must reach a served file: relative
// links, and absolute ones to this site. Code is skipped.
const served = new Set(
  readdirSync(OUT, { recursive: true })
    .map((p) => p.split("\\").join("/"))
    .filter((p) => statSync(join(OUT, p)).isFile())
    .map((p) => `/${p}`),
);
const markdown = [...served].filter((p) => p.endsWith(".md") || PAGES.some((pg) => pg.url === p.slice(1)));
const broken = markdown.flatMap((from) => {
  const text = readFileSync(join(OUT, from), "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  return [...text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].flatMap(([, target]) => {
    const site = [BASE, SITE].find((b) => target.startsWith(`${b}/`));
    if (!site && (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#"))) return [];
    const path = decodeURIComponent(new URL(site ? target.slice(site.length) : target, `http://site${from}`).pathname);
    return served.has(path) || served.has(`${path}.html`) || (path === "/" && served.has("/index.html")) ? [] : [`${from} → ${target}`];
  });
});
if (broken.length) throw new Error(`links to paths this site doesn't serve:\n  ${broken.join("\n  ")}`);

console.log(`built ${OUT}: ${pages.length} guides, ${skills.length} skills (${skills.map((s) => `${s.name} ${s.version}`).join(", ")}), ${copied.length} copied files`);
