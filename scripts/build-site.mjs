#!/usr/bin/env node
// Builds the agents.tinycloud.xyz site into _site/ for Cloudflare Pages.
// Public URLs are short and flat; the repository layout is only for authoring:
// - /<page> (/setup, /apps, /chat, …): the guides in PAGES, as Markdown;
// - /connect: chat-app setup and a handoff to the unchanged /apps coding guide,
//   as HTML by default or Markdown via Accept; /connect.md is the same entry page.
// - /skills/<short>/<path>: every file of every skill in SKILLS, exactly as
//   installed, SKILL.md included;
// - /skills/<short>.md: the skill's SKILL.md to read on the web, with its
//   relative links pointed at /skills/<short>/;
// - /skills/index.json: each skill's name, version, description and files with
//   sha256 checksums, which /skills/install.js checks before installing;
// - _redirects: the earlier repository-path URLs, redirected to the short ones.
// Other repository files are copied at their repository path. index.html,
// llms.txt, llms-full.txt, robots.txt, sitemap.xml, _headers and the
// agent-skills discovery index are generated.
// Fetches pinned skill tarballs. Run: npm ci && npm run build
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { Marked } from "marked";
import { gfmHeadingId } from "marked-gfm-heading-id";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "_site");
const SITE = "https://agents.tinycloud.xyz";
// Absolute URLs point at production, except on Pages preview builds, where
// they point at the preview so a branch's guides and installs can be tried as-is.
const PRODUCTION_BRANCH = "main";
const preview = process.env.CF_PAGES_BRANCH && process.env.CF_PAGES_BRANCH !== PRODUCTION_BRANCH && process.env.CF_PAGES_URL;
const BASE = (process.env.SITE_URL || preview || SITE).replace(/\/$/, "");
// docs/: internal notes, kept in the repository, never published.
const SKIP = new Set([".git", ".github", ".gitignore", ".smithers", ".wrangler", "_site", "docs", "functions", "node_modules", "package.json", "package-lock.json", "README.md", "scripts", "skills"]);
// Coordinator runbooks: kept in the repository, never published.
const UNPUBLISHED = /^forward-tests.*\.md$/;

// Guides, by public URL. `redirectFrom` names other URLs that 301 to the page.
// `html` adds a rendered page and a Markdown alternate, both from the same text.
const PAGES = [
  { url: "setup", src: "setup/README.md" },
  { url: "agent", src: "setup/agent.md" },
  { url: "apps", src: "setup/tc-apps.md" },
  { url: "connect", src: "setup/connect.md", html: true },
  { url: "chat", src: "apps/tinychat/setup.md" },
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
// each of which must match exactly once, or a repository path whose file replaces it.
// `checkCli`: the build fails unless every served file of the skill runs the
// CLI through RESOLVER (Markdown) or defaultTc() (scripts), so it works with
// /cli's private install in ~/.local/share/tinycloud/cli: no other global npm
// lookup, no bare `tc` command in a shell code block, no script defaulting to `tc`.
// The released CLI and Courier skills contain one of these exact resolvers (courier 0.1.3 and
// CLI 1.2.3 end in `tc`; CLI 1.2.4 and later end in `tinycloud`). Replace it
// in every published Markdown file, including the core skill's reference pages.
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
  'if [ -z "${TC_BIN:-}" ] && [ -r "$ENV_HELPER" ]; then',
  '  TC_BIN=$(node "$ENV_HELPER" get TC_BIN) || { status=$?; [ "$status" -eq 1 ] || exit "$status"; }',
  'fi',
  'TC="${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tc}"',
  '[ -n "${TC_BIN:-}" ] || [ -x "$TC" ] || ! command -v npm >/dev/null || TC="$(npm prefix --global)/bin/tc"',
  '[ -x "$TC" ] || { echo "TC_NOT_FOUND: $TC is not executable; install the CLI from https://agents.tinycloud.xyz/cli or set TC_BIN" >&2; exit 1; }',
].join("\n");
const SHELL_BLOCK = /^```(?:bash|sh|shell)?\n[\s\S]*?^```$/gm;
// `tc` where a shell runs it: at the start of a line, after a pipe, in `$(…)` or in an array `=(…)`.
const BARE_TC = /(^[ \t]*|\|[ \t]*|\$\(|=\()tc(?=[ \t]|$)/gm;
const SKILLS = [
  { short: "apps", dir: "skills/tc-apps" },
  { short: "publish", dir: "skills/tc-publish" },
  { short: "secrets", dir: "skills/tc-secrets" },
  {
    short: "cli",
    version: "1.3.0",
    tarball: "https://registry.npmjs.org/@tinycloud/cli/-/cli-1.3.0.tgz",
    integrity: "sha512-Hrvls0XOjlcG2rBiL5QrVPiSqs7Nji7wHXRkLBNL7d41OZVIEkvzbv49FkpW3Z8GX2+XelpB6qerSZByb7sW/g==",
    dir: "package/skills/tc-cli",
    checkCli: true,
  },
  {
    short: "courier",
    version: "0.1.3",
    tarball: "https://registry.npmjs.org/@tinycloud/courier/-/courier-0.1.3.tgz",
    integrity: "sha512-7QVW0zeu+5A+cb8axFVO2iZPOGbGC0DC4JDPqq68aaOj8DzRt+8J0gwC9tPV3U2bGGES2mOTquWKiOJTHeiVuA==",
    dir: "package/skills/courier",
    checkCli: true,
  },
  {
    short: "chat",
    tarball: "https://tinycloud.chat/agents/tinychat-retrieval/0.1.1-onboarding.16/tinychat-retrieval-0.1.1-onboarding.16.tgz",
    integrity: "sha512-uO016ryrnG0A1OR2d0xJs3jRPd+oPorb0oloRApnG5T28qReZZ35bteZgWqPhqf1Nme/rHuRX3qdmuhtsagV2A==",
    dir: "package",
    checkCli: true,
    // The pack's scripts run `tc` from PATH, which on Linux is often the
    // traffic-control tool. They now run TC_BIN if set (nothing else), else the
    // `tinycloud` that agents.tinycloud.xyz/cli installs, else `tinycloud` on
    // PATH; with none of them, CLI_UNAVAILABLE says to run /cli. Never `tc`.
    changes: {
      "lib/retrieval.mjs": [
        ["import { constants, readFileSync } from 'node:fs';", "import { accessSync, constants, readFileSync } from 'node:fs';"],
        ["import { tmpdir } from 'node:os';", "import { homedir, tmpdir } from 'node:os';"],
        [
          "CLI_UNAVAILABLE: 'TinyCloud CLI was not found. Install the supported release or supply --tc.',",
          "CLI_UNAVAILABLE: 'TinyCloud CLI not found: run https://agents.tinycloud.xyz/cli or set TC_BIN.',",
        ],
        [
          "/** Only a literal executable and argument vector; never a shell or transcript-provided command. */\nexport function createTcRunner({ executable = 'tc',",
          [
            "/** The TinyCloud CLI to run: TC_BIN if set, else the `tinycloud` agents.tinycloud.xyz/cli installs, else `tinycloud` on PATH. Never `tc`. */",
            "export function defaultTc() {",
            "  if (process.env.TC_BIN) return process.env.TC_BIN;",
            "  const installed = join(homedir(), '.local/share/tinycloud/cli/node_modules/.bin/tinycloud');",
            "  const onPath = (process.env.PATH || '').split(':').filter(isAbsolute).map(dir => join(dir, 'tinycloud'));",
            "  for (const candidate of [installed, ...onPath]) { try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* next */ } }",
            "  return installed; // Missing: running it fails with ENOENT, reported as CLI_UNAVAILABLE.",
            "}",
            "",
            "/** Only a literal executable and argument vector; never a shell or transcript-provided command. */",
            "export function createTcRunner({ executable = defaultTc(),",
          ].join("\n"),
        ],
      ],
      "lib/setup.mjs": [
        ["import { createTcRunner } from './retrieval.mjs';", "import { createTcRunner, defaultTc } from './retrieval.mjs';"],
        ["manifestPath, executable = 'tc' })", "manifestPath, executable = defaultTc() })"],
      ],
      "lib/login.mjs": [
        ["import { spawn } from 'node:child_process';", "import { spawn } from 'node:child_process';\nimport { defaultTc } from './retrieval.mjs';"],
        ["CLI_UNAVAILABLE: 'TinyCloud CLI could not be started.',", "CLI_UNAVAILABLE: 'TinyCloud CLI not found: run https://agents.tinycloud.xyz/cli or set TC_BIN.',"],
        ["{ executable = 'tc', input }", "{ executable = defaultTc(), input }"],
      ],
      "scripts/retrieve.mjs": [
        ["--tc PATH (otherwise resolves tc on PATH; never uses a shell)", "--tc PATH (otherwise TC_BIN, then ~/.local/share/tinycloud/cli's tinycloud, then tinycloud on PATH; never tc, never a shell)"],
      ],
      "references/meetings.md": [
        ["otherwise the helper resolves `tc` through PATH.", "otherwise the helper runs `TC_BIN` if set, else the `tinycloud` that https://agents.tinycloud.xyz/cli installs in `~/.local/share/tinycloud/cli`, else `tinycloud` on the PATH, and never `tc`. With none of them it stops with `CLI_UNAVAILABLE`."],
      ],
    },
  },
  {
    short: "mcp",
    version: "0.5.3",
    tarball: "https://registry.npmjs.org/@tinycloud/mcp/-/mcp-0.5.3.tgz",
    integrity: "sha512-DRCQ7qDZUTIH2fK+6WJUQYY2krNQI+i3LE5AN/JNnGY8W70JHLfB2aH0R5xV96RCFUtgFqUDiY8ryRyFO0dMEQ==",
    dir: "package/skills/tinycloud-delegated-secrets",
  },
];

// Abilities shown on the front page, in order.
const ABILITIES = [
  {
    title: "Personal records",
    url: "apps",
    text: "Log, track and look up anything you keep records of, like meals, weight, workouts or todos. Your agent organises them into apps as you go.",
    prompt: "Never run npm install -g, npm i -g, sudo, or curl piped to a shell. Read https://agents.tinycloud.xyz/apps in full and follow it: fetch it with curl -fsSL https://agents.tinycloud.xyz/apps and read the whole output; do not run any other command, including npm or node checks or an install, before you have read it. Log this meal in my TinyCloud: breakfast, two eggs and a slice of toast, about 350 kcal. Set it up with TinyCloud, which saves a sign-in (a key and session in ~/.tinycloud). If an app of yours handles this, it asks you to approve 7-day access to just that app. Otherwise it asks for 30-day access to your records:",
  },
  {
    title: "Publish",
    url: "publish",
    text: "Publish a document or web page and get back a link, either private to you or public.",
    prompt: "Publish this report and send me a private link. Use TinyCloud:",
  },
  {
    title: "Secrets",
    url: "secrets",
    text: "Use API keys you keep in TinyCloud Secrets. The value never appears in the conversation. If a key is missing, your agent sends you a link to add it.",
    prompt: "Turn this script into a voiceover with ElevenLabs. Get the key from TinyCloud:",
  },
  {
    title: "Meetings",
    url: "chat",
    text: "Ask about your TinyChat meetings: recaps, follow-ups and what was said.",
    prompt: "How did my last meeting go? Check TinyCloud:",
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

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const url = (p) => `${BASE}/${p}`;

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
  if (skill.short === "cli" || skill.short === "courier") {
    files = files.map(([path, body]) => {
      if (!path.endsWith(".md")) return [path, body];
      const text = body.toString("utf8");
      if (!UPSTREAM_RESOLVERS.some((upstream) => text.includes(upstream))) return [path, body];
      changed.add(path);
      return [path, Buffer.from(UPSTREAM_RESOLVERS.reduce((out, upstream) => out.replaceAll(upstream, RESOLVER), text))];
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

// A guide as published: relative links become absolute public URLs, and on a
// preview every production URL points at the preview.
function render(src) {
  return readFileSync(join(ROOT, src), "utf8")
    .replace(/\]\((?!https?:|mailto:|#)([^)\s#]+)(#[^)\s]*)?\)/g, (_, target, hash = "") => {
      const to = route.get(posix.normalize(posix.join(posix.dirname(src), target)));
      if (!to) throw new Error(`${src}: links to ${target}, which is not published`);
      return `](${SITE}${to}${hash})`;
    })
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

const pages = PAGES.map((p) => {
  let text = render(p.src);
  if (p.url === "connect") {
    // Chat apps share the first-record recipe; coding agents fetch /apps unchanged.
    const recipe = render("setup/tc-apps.md").match(/^If the owner only asked for setup or named no record,[^\n]+$/m)?.[0];
    const marker = "<!-- setup-only-record -->";
    if (!recipe || text.split(marker).length !== 2) {
      throw new Error("connect: expected the /apps setup-only record recipe and one setup-only-record marker");
    }
    text = text.replace(marker, () => recipe);
  }
  write(p.html ? `${p.url}.md` : p.url, text);
  return { ...p, text, ...describe(text, p.url) };
});
const page = (name) => pages.find((p) => p.url === name);

for (const s of skills) {
  for (const f of s.files) write(f.url, f.body);
  write(`skills/${s.short}/SHA256SUMS`, s.files.map((f) => `${sha256(f.body)}  ${f.path}\n`).join(""));
  write(`skills/${s.short}.md`, s.text);
}
const installer = readFileSync(join(ROOT, "scripts/install-skill.js"), "utf8");
const siteLine = `const SITE = "${SITE}";`;
if (!installer.includes(siteLine)) throw new Error(`scripts/install-skill.js: no line ${siteLine}`);
write("skills/install.js", installer.replace(siteLine, `const SITE = "${BASE}";`));

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

// The /apps setup downloads the skill's files by name, checks them against SHA256SUMS and copies them
// by name, so those three lists must be the apps skill's file set, and SHA256SUMS must be index.json's checksums.
const appsGuide = readFileSync(join(ROOT, "setup/tc-apps.md"), "utf8");
const appsFiles = skills.find((s) => s.short === "apps").files.map((f) => f.path).sort();
const curlLine = appsGuide.match(/curl -fsSL((?: -O "[^"\n]*\/skills\/apps\/[^"\n]+")+)/);
if (!curlLine) throw new Error("setup/tc-apps.md: step 3 has no curl line for the apps skill's files");
const fetched = [...curlLine[1].matchAll(/\/skills\/apps\/([^"\n]+)"/g)].map((m) => m[1]);
if (!fetched.includes("SHA256SUMS") || JSON.stringify(fetched.filter((n) => n !== "SHA256SUMS").sort()) !== JSON.stringify(appsFiles)) {
  throw new Error(`setup/tc-apps.md step 3 downloads ${fetched}, but the apps skill's files are SHA256SUMS and ${appsFiles}`);
}
const copies = [...appsGuide.matchAll(/ cp ((?:[\w.-]+ )+)"[^"\n]*\/tc-apps\/"/g)];
if (copies.length !== 2 || copies.some(([, names]) => JSON.stringify(names.trim().split(" ").sort()) !== JSON.stringify(appsFiles))) {
  throw new Error(`setup/tc-apps.md step 5 must copy exactly ${appsFiles}, in both the Claude Code and the Codex/OpenCode block`);
}
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

// Earlier URLs (repository paths) keep working as redirects.
const redirects = [
  "/setup/index.md /setup 301",
  "/setup/index.html /setup 301",
  "/README.md /setup 301",
  ...PAGES.flatMap((p) => [`/${p.url}/ /${p.url} 301`, ...(p.redirectFrom || []).flatMap((from) => [`/${from} /${p.url} 301`, `/${from}/ /${p.url} 301`])]),
  ...[...new Map(PAGES.map((p) => [p.src, p.url]))].map(([src, to]) => `/${src} /${to} 301`),
  ...skills.filter((s) => s.name !== s.short).map((s) => `/skills/${s.name}/* /skills/${s.short}/:splat 301`),
];
write("_redirects", redirects.join("\n") + "\n");

const listedPages = pages.filter((p) => p.url !== "setup");
const llms = [
  "# TinyCloud agent abilities",
  "",
  "> Setup guides for chat apps and coding agents, backed by the owner's own TinyCloud space. Fetch the guide for the task and follow it in the same conversation. /connect serves HTML by default and Markdown when explicitly requested; other guides are plain Markdown.",
  "",
  `Start at ${url("connect")} for personal records in ChatGPT, Claude or a coding agent. ${url("setup")} lists every coding-agent ability, what it does, and what the owner approves. Only the coding-agent setup needs a local shell, Node.js 22.20 or later and npm.`,
  "",
  "## Abilities",
  "",
  ...ABILITIES.map((a) => `- [${a.title}](${url(a.url)}): ${a.text} Example prompt: "${a.prompt} ${url(a.url)}"`),
  "",
  "## Guides",
  "",
  `- [${page("setup").title}](${url("setup")}): ${page("setup").desc}`,
  ...listedPages.map((p) => `- [${p.title}](${url(p.url)}): ${p.desc}`),
  "",
  "## Skills",
  "",
  ...skills.map((s) => `- [${s.name}](${url(`skills/${s.short}.md`)}): ${s.desc}`),
  "",
  "## Optional",
  "",
  `- [Full text](${url("llms-full.txt")}): every guide and skill above in one file.`,
  `- [Skill index](${url("skills/index.json")}): every skill's version and files with sha256 checksums. Install one with \`curl -fsSL ${url("skills/install.js")} | node - <short name> --agent <claude-code|codex|opencode>\`.`,
  `- [Source repository](https://github.com/TinyCloudLabs/prompts): where the guides and TinyCloud's own skills are written.`,
  "",
].join("\n");
write("llms.txt", llms);

write(
  "llms-full.txt",
  [`# TinyCloud agent abilities: full text`, "", `> Every guide and skill listed in ${url("llms.txt")}, concatenated.`, ""]
    .concat(pages.map((p) => `\n---\nSource: ${url(p.url)}\n---\n\n${p.text.trimEnd()}\n`))
    .concat(skills.map((s) => `\n---\nSource: ${url(`skills/${s.short}.md`)}\n---\n\n${s.text.trimEnd()}\n`))
    .join("\n"),
);

const sitemapPaths = ["", ...pages.map((p) => p.url), "llms.txt", "llms-full.txt", ...skills.map((s) => `skills/${s.short}.md`)];
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemapPaths.map((p) => `  <url><loc>${esc(url(p))}</loc></url>`).join("\n") +
    "\n</urlset>\n",
);

const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Google-Extended"];
write(
  "robots.txt",
  [
    "# These pages are written for AI agents. Fetch them freely.",
    ...[...AI_BOTS, "*"].flatMap((ua) => ["", `User-agent: ${ua}`, "Content-Signal: search=yes, ai-input=yes, ai-train=no", "Allow: /"]),
    "",
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

/*.md
  Content-Type: text/markdown; charset=utf-8

/*.txt
  Content-Type: text/plain; charset=utf-8
${PAGES.filter((p) => !p.html).map((p) => p.url)
  .map((name) => `\n/${name}\n  Content-Type: text/markdown; charset=utf-8\n`)
  .join("")}
/
  Link: </llms.txt>; rel="describedby"; type="text/plain", </.well-known/agent-skills/index.json>; rel="describedby"; type="application/json", </sitemap.xml>; rel="sitemap"; type="application/xml"
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
const connect = page("connect");
const markdownRenderer = new Marked(gfmHeadingId());
write(
  "connect.html",
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(connect.title)} · TinyCloud</title>
  <meta name="description" content="${esc(connect.desc)}">
  <link rel="canonical" href="${esc(url("connect"))}">
  <link rel="alternate" type="text/markdown" href="/connect.md">
${style}
  <style>
    h2 { margin-top: 2.5rem; border-top: 1px solid #ddd; padding-top: 1rem; }
    h3 { margin-top: 1.75rem; }
    pre { background: #f2f2f2; padding: 1rem; border-radius: 4px; white-space: pre-wrap; overflow-wrap: anywhere; }
    pre code { padding: 0; }
    blockquote { margin: 1rem 0; padding: 0.25rem 1rem; border-left: 3px solid #0b57d0; background: #f2f2f2; overflow-wrap: anywhere; }
    li { margin: 0.4rem 0; }
  </style>
</head>
<body>
  <main>
${markdownRenderer.parse(connect.text)}
  </main>
</body>
</html>
`,
);

const card = (a) => `      <li>
        <h3><a href="/${a.url}">${esc(a.title)}</a></h3>
        <p>${esc(a.text)}</p>
        <p>Try: <code>${esc(`${a.prompt} ${url(a.url)}`)}</code></p>
      </li>`;
const desc = "Paste one line into your coding agent. It reads the setup from this site and does the job with your data, kept in your own TinyCloud space.";
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
${style}
</head>
<body>
  <main>
    <h1>Give your agent abilities</h1>
    <p>${esc(desc)}</p>
    <p>Works with agents that can run commands: Claude Code, Codex and OpenCode. Needs Node.js 22.20 or later.</p>
    <p>Everything starts at <a href="/setup"><code>${esc(url("setup"))}</code></a>: what each ability does, what to paste, what you approve and how to undo it.</p>

    <h2>How it works</h2>
    <ol>
      <li><strong>Paste a prompt.</strong> Say what you want, then add a link to the ability.</li>
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
  <footer>Agents: start at <a href="/setup">/setup</a>, or <a href="/llms.txt">/llms.txt</a> for a plain-text index of every guide and skill on this site.</footer>
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
// Other checked skills use their own explicit CLI selection.
const SCRIPT_TC = /\bexecutable\s*=\s*['"]tc['"]|\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync)\(\s*['"]tc\b|\breturn\s+['"]tc['"]/;
const wrongCli = skills
  .filter((s) => s.checkCli)
  .flatMap((s) =>
    s.files.flatMap((f) => {
      const text = f.body.toString("utf8");
      const lookups = text.split("npm prefix --global").length - 1;
      const upstream = UPSTREAM_RESOLVERS.some((resolver) => text.includes(resolver));
      const bare = (text.match(SHELL_BLOCK) || []).some((block) => new RegExp(BARE_TC.source, "m").test(block));
      const scriptDefault = /\.m?js$/.test(f.path) && SCRIPT_TC.test(text);
      return !upstream && lookups === text.split(RESOLVER).length - 1 && !bare && !scriptDefault ? [] : [f.url];
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
