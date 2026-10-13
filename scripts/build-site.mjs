#!/usr/bin/env node
// Builds the agents.tinycloud.xyz site into _site/ for Cloudflare Pages.
// Public URLs are short and flat; the repository layout is only for authoring:
// - /<page> (/setup, /apps, /chat, …): the guides in PAGES, as Markdown;
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
// No dependencies; fetches the pinned skill tarballs. Run: node scripts/build-site.mjs
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "_site");
const SITE = "https://agents.tinycloud.xyz";
// Absolute URLs point at production, except on Pages preview builds, where
// they point at the preview so a branch's guides and installs can be tried as-is.
const PRODUCTION_BRANCH = "main";
const preview = process.env.CF_PAGES_BRANCH && process.env.CF_PAGES_BRANCH !== PRODUCTION_BRANCH && process.env.CF_PAGES_URL;
const BASE = (process.env.SITE_URL || preview || SITE).replace(/\/$/, "");
const SKIP = new Set([".git", ".github", ".gitignore", ".smithers", "_site", "functions", "node_modules", "overrides", "README.md", "scripts", "skills"]);
// Coordinator runbooks: kept in the repository, never published.
const UNPUBLISHED = /^forward-tests.*\.md$/;

// Guides, by public URL. `aliases` serve the same page under other names.
const PAGES = [
  { url: "setup", src: "setup/README.md" },
  { url: "apps", src: "setup/tc-apps.md" },
  { url: "chat", src: "apps/tinychat/setup.md" },
  { url: "publish", src: "setup/publish.md", aliases: ["share"] },
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
// `privateCli`: the released skill picks the CLI from a global npm install
// (`X="$(npm prefix --global)/bin/tc"`), but /cli installs it into
// ~/.local/share/tinycloud/cli. Every such line in every file of the skill then
// tries TC_BIN, then that folder, then the global install.
const PRIVATE_CLI = "$HOME/.local/share/tinycloud/cli/node_modules/.bin/tc";
const GLOBAL_CLI = /\b(TC|TC_BIN)="\$\(npm prefix --global\)\/bin\/tc"/g;
const usePrivateCli = (text) => text.replace(GLOBAL_CLI, (_, v) => `${v}="\${TC_BIN:-${PRIVATE_CLI}}"; [ -x "$${v}" ] || ${v}="$(npm prefix --global)/bin/tc"`);
const SKILLS = [
  { short: "apps", dir: "skills/tc-apps" },
  { short: "publish", dir: "skills/tc-publish" },
  { short: "secrets", dir: "skills/tc-secrets" },
  {
    short: "cli",
    version: "1.2.2",
    tarball: "https://registry.npmjs.org/@tinycloud/cli/-/cli-1.2.2.tgz",
    integrity: "sha512-lfORrJL1qnu+tw5vI5J1O/SKaazpJeZJUnwCSYJwHMOwATGNnGhk62s38Jq6Zj7vU+Xeg1xz7LJpN/Sc7IM5Bw==",
    dir: "package/skills/tc-cli",
    privateCli: true,
    changes: { "INSTALL.md": "overrides/tc-cli/INSTALL.md" },
  },
  {
    short: "courier",
    version: "0.1.2",
    tarball: "https://registry.npmjs.org/@tinycloud/courier/-/courier-0.1.2.tgz",
    integrity: "sha512-jlh6FBPIs7OGAdo7zBdLgq7yP5LR7UBU/WtqvclBJNBa2u/rGIbuKg2Xh3NZZ2TcQDeGUEmfWq55wwsgdckiLg==",
    dir: "package/skills/courier",
    privateCli: true,
    changes: { "SKILL.md": [["so call\nthe npm global bin when unsure:", "so call\nthe CLI by its path when unsure:"]] },
  },
  {
    short: "chat",
    tarball: "https://tinycloud.chat/agents/tinychat-retrieval/0.1.1-onboarding.16/tinychat-retrieval-0.1.1-onboarding.16.tgz",
    integrity: "sha512-uO016ryrnG0A1OR2d0xJs3jRPd+oPorb0oloRApnG5T28qReZZ35bteZgWqPhqf1Nme/rHuRX3qdmuhtsagV2A==",
    dir: "package",
  },
  {
    short: "mcp",
    version: "0.5.2",
    tarball: "https://registry.npmjs.org/@tinycloud/mcp/-/mcp-0.5.2.tgz",
    integrity: "sha512-h+Me7RFxaxf32ZBxczsj2fA1ERs0TgD4dDajYmZ/89pbwRv5zwuAiHGxtN2+HOtM3IIRu62fIgaui3+SdedX9Q==",
    dir: "package/skills/tinycloud-delegated-secrets",
  },
];

// Abilities shown on the front page, in order.
const ABILITIES = [
  {
    title: "Personal records",
    url: "apps",
    text: "Log, track and look up anything you keep records of, like weight, workouts or todos. Your agent organises them into apps as you go.",
    prompt: "Log my weight: 80.5 kg today. Set it up with TinyCloud:",
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
  if (skill.privateCli) {
    for (const [i, [path, body]] of files.entries()) {
      if (!/\.(md|txt|sh)$/.test(path)) continue;
      const text = body.toString("utf8");
      const fixed = usePrivateCli(text);
      if (fixed !== text) {
        files[i] = [path, Buffer.from(fixed)];
        changed.add(path);
      }
    }
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

const pages = PAGES.map((p) => {
  const text = render(p.src);
  for (const name of [p.url, ...(p.aliases || [])]) write(name, text);
  return { ...p, text, ...describe(text, p.url) };
});
const page = (name) => pages.find((p) => p.url === name);

for (const s of skills) {
  for (const f of s.files) write(f.url, f.body);
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
  "/setup/ /setup 301",
  "/setup/index.md /setup 301",
  "/setup/index.html /setup 301",
  "/README.md /setup 301",
  ...[...new Map(PAGES.map((p) => [p.src, p.url]))].map(([src, to]) => `/${src} /${to} 301`),
  ...skills.filter((s) => s.name !== s.short).map((s) => `/skills/${s.name}/* /skills/${s.short}/:splat 301`),
];
write("_redirects", redirects.join("\n") + "\n");

const listedPages = pages.filter((p) => p.url !== "setup");
const llms = [
  "# TinyCloud agent abilities",
  "",
  "> Setup guides and skills that give a coding agent (Claude Code, Codex, OpenCode) abilities backed by the owner's own TinyCloud space. Fetch the guide for the task and follow it in the same conversation. Every file is plain Markdown at a short, stable URL.",
  "",
  `Start at ${url("setup")}: it lists every guide, what each does, and what the owner approves. Guides need a shell, Node.js 22.20 or later and npm.`,
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
${PAGES.flatMap((p) => [p.url, ...(p.aliases || [])])
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

// Every served skill file that picks the CLI from the global npm install must
// try TC_BIN and /cli's private install first.
const FALLBACK = /\b(TC|TC_BIN)="\$\{TC_BIN:-\$HOME\/\.local\/share\/tinycloud\/cli\/node_modules\/\.bin\/tc\}"; \[ -x "\$\1" \] \|\| \1="\$\(npm prefix --global\)\/bin\/tc"/g;
const globalOnly = skills.flatMap((s) =>
  s.files.flatMap((f) => {
    const text = f.body.toString("utf8");
    const all = text.match(/npm prefix --global/g)?.length || 0;
    return all === (text.match(FALLBACK)?.length || 0) ? [] : [f.url];
  }),
);
if (globalOnly.length) throw new Error(`skill files that run the CLI from the global npm install only:\n  ${globalOnly.join("\n  ")}`);

// Every link in a served Markdown file must reach a served file: relative
// links, and absolute ones to this site. Code is skipped.
const served = new Set(
  readdirSync(OUT, { recursive: true })
    .map((p) => p.split("\\").join("/"))
    .filter((p) => statSync(join(OUT, p)).isFile())
    .map((p) => `/${p}`),
);
const markdown = [...served].filter((p) => p.endsWith(".md") || PAGES.some((pg) => [pg.url, ...(pg.aliases || [])].includes(p.slice(1))));
const broken = markdown.flatMap((from) => {
  const text = readFileSync(join(OUT, from), "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  return [...text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].flatMap(([, target]) => {
    const site = [BASE, SITE].find((b) => target.startsWith(`${b}/`));
    if (!site && (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#"))) return [];
    const path = decodeURIComponent(new URL(site ? target.slice(site.length) : target, `http://site${from}`).pathname);
    return served.has(path) || (path === "/" && served.has("/index.html")) ? [] : [`${from} → ${target}`];
  });
});
if (broken.length) throw new Error(`links to paths this site doesn't serve:\n  ${broken.join("\n  ")}`);

console.log(`built ${OUT}: ${pages.length} guides, ${skills.length} skills (${skills.map((s) => `${s.name} ${s.version}`).join(", ")}), ${copied.length} copied files`);
