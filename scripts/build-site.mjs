#!/usr/bin/env node
// Builds the agents.tinycloud.xyz site into _site/ for Cloudflare Pages.
// Every repository file is copied verbatim at its repo path; index.html,
// llms.txt, llms-full.txt, robots.txt, sitemap.xml, _headers and the
// agent-skills index are generated from whatever guides exist on the branch.
// No dependencies. Run: node scripts/build-site.mjs
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "_site");
// Absolute URLs point at production, except on Pages preview builds, where
// they point at the preview so a branch's example prompts can be tried as-is.
const PRODUCTION_BRANCH = "docs/initial-setup-split";
const preview = process.env.CF_PAGES_BRANCH && process.env.CF_PAGES_BRANCH !== PRODUCTION_BRANCH && process.env.CF_PAGES_URL;
const BASE = (process.env.SITE_URL || preview || "https://agents.tinycloud.xyz").replace(/\/$/, "");
const SKIP = new Set([".git", ".github", ".gitignore", ".smithers", "_site", "node_modules", "scripts"]);

// Abilities shown on the front page, in order. A card appears only when its
// guide exists on this branch, so unmerged abilities never link to a 404.
const ABILITIES = [
  {
    title: "Personal records",
    path: "setup/tc-apps.md",
    text: "Log, track and look up anything you keep records of, like weight, workouts or todos. Your agent organises them into apps as you go.",
    prompt: "Log my weight: 80.5 kg today. Set it up with TinyCloud:",
  },
  {
    title: "Publish",
    path: "skills/tc-publish/SKILL.md",
    text: "Publish a document or web page and get back a link, either private to you or public.",
    prompt: "Publish this report and send me a private link. Use TinyCloud:",
  },
  {
    title: "Secrets",
    path: "skills/tc-secrets/SKILL.md",
    text: "Use API keys you keep in TinyCloud Secrets. The value never appears in the conversation. If a key is missing, your agent sends you a link to add it.",
    prompt: "Turn this script into a voiceover with ElevenLabs. Get the key from TinyCloud:",
  },
  {
    title: "Meetings",
    path: "apps/tinychat/setup.md",
    text: "Ask about your TinyChat meetings: recaps, follow-ups and what was said.",
    prompt: "How did my last meeting go? Check TinyCloud:",
  },
];

// Guides an agent can be pointed at, grouped for llms.txt. Anything matching
// these patterns is listed automatically.
const GROUPS = [
  ["Entry guides", (p) => /^apps\/[^/]+\/setup\.md$/.test(p) || (/^setup\/[^/]+\.md$/.test(p) && !BLOCKS.has(p))],
  ["Skills", (p) => /^skills\/[^/]+\/[^/]+\.md$/.test(p)],
  ["Building blocks", (p) => BLOCKS.has(p)],
];
const BLOCKS = new Set(["setup/tinycloud.md", "setup/openkey.md"]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [relative(ROOT, full).split("\\").join("/")];
  });
}

function describe(path) {
  const text = readFileSync(join(ROOT, path), "utf8");
  const front = text.match(/^---\n([\s\S]*?)\n---\n/);
  const body = front ? text.slice(front[0].length) : text;
  const title = (body.match(/^# (.+)$/m) || [, path])[1].replace(/`/g, "");
  const fmDesc = front && front[1].match(/^description:\s*(.+)$/m);
  let desc = fmDesc ? fmDesc[1].trim().replace(/^["']|["']$/g, "") : "";
  if (!desc) {
    const para = body.split(/\n\s*\n/).find((b) => b.trim() && !/^(#|```|[-*>|])/.test(b.trim()));
    desc = para ? para.replace(/\s+/g, " ").trim() : "";
  }
  return { path, title, desc, text };
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const url = (p) => `${BASE}/${p}`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
const files = walk(ROOT);
for (const f of files) {
  mkdirSync(dirname(join(OUT, f)), { recursive: true });
  cpSync(join(ROOT, f), join(OUT, f));
}

const docs = files.filter((f) => f.endsWith(".md")).sort().map(describe);
const grouped = GROUPS.map(([name, test]) => [name, docs.filter((d) => test(d.path))]);
const listed = grouped.flatMap(([, ds]) => ds);
const abilities = ABILITIES.filter((a) => existsSync(join(ROOT, a.path)));

// llms.txt (llmstxt.org format)
const llms = [
  "# TinyCloud agent abilities",
  "",
  "> Setup guides and skills that give a coding agent (Claude Code, Codex, OpenCode) abilities backed by the owner's own TinyCloud space. Fetch the guide for the task and follow it in the same conversation. Every file is plain Markdown at a stable URL.",
  "",
  "Pick the entry guide or skill that matches the owner's request; entry guides install what they need and call the building blocks themselves. Guides need a shell, Node.js 22.20 or later and npm.",
  "",
  "## Abilities",
  "",
  ...abilities.map((a) => `- [${a.title}](${url(a.path)}): ${a.text} Example prompt: "${a.prompt} ${url(a.path)}"`),
  ...grouped.flatMap(([name, ds]) => (ds.length ? ["", `## ${name}`, "", ...ds.map((d) => `- [${d.title}](${url(d.path)}): ${d.desc}`)] : [])),
  "",
  "## Optional",
  "",
  `- [Full text](${url("llms-full.txt")}): every guide and skill above in one file.`,
  `- [Source repository](https://github.com/TinyCloudLabs/prompts): the same files on GitHub.`,
  "",
].join("\n");
writeFileSync(join(OUT, "llms.txt"), llms);

writeFileSync(
  join(OUT, "llms-full.txt"),
  [`# TinyCloud agent abilities: full text`, "", `> Every guide and skill listed in ${url("llms.txt")}, concatenated.`, ""]
    .concat(listed.map((d) => `\n---\nSource: ${url(d.path)}\n---\n\n${d.text.trimEnd()}\n`))
    .join("\n"),
);

// Agent Skills discovery index (agentskills.io discovery 0.2.0)
const skills = docs
  .filter((d) => /^skills\/[^/]+\/SKILL\.md$/.test(d.path))
  .map((d) => ({
    name: d.path.split("/")[1],
    type: "skill-md",
    description: d.desc,
    url: `/${d.path}`,
    digest: "sha256:" + createHash("sha256").update(readFileSync(join(ROOT, d.path))).digest("hex"),
  }));
mkdirSync(join(OUT, ".well-known/agent-skills"), { recursive: true });
writeFileSync(
  join(OUT, ".well-known/agent-skills/index.json"),
  JSON.stringify({ $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json", skills }, null, 2) + "\n",
);

const pages = ["", "llms.txt", "llms-full.txt", ...listed.map((d) => d.path)];
writeFileSync(
  join(OUT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages.map((p) => `  <url><loc>${esc(url(p))}</loc></url>`).join("\n") +
    "\n</urlset>\n",
);

const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Google-Extended"];
writeFileSync(
  join(OUT, "robots.txt"),
  [
    "# These pages are written for AI agents. Fetch them freely.",
    ...[...AI_BOTS, "*"].flatMap((ua) => ["", `User-agent: ${ua}`, "Content-Signal: search=yes, ai-input=yes, ai-train=no", "Allow: /"]),
    "",
    `Sitemap: ${url("sitemap.xml")}`,
    "",
  ].join("\n"),
);

writeFileSync(
  join(OUT, "_headers"),
  `/*
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff
  Cache-Control: public, max-age=300

/*.md
  Content-Type: text/markdown; charset=utf-8

/*.txt
  Content-Type: text/plain; charset=utf-8

/
  Link: </llms.txt>; rel="describedby"; type="text/plain", </.well-known/agent-skills/index.json>; rel="describedby"; type="application/json", </sitemap.xml>; rel="sitemap"; type="application/xml"
`,
);

const card = (a) => `      <li>
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.text)}</p>
        <p>Try: <code>${esc(`${a.prompt} ${url(a.path)}`)}</code></p>
      </li>`;
const desc = "Paste one line into your coding agent. It reads the setup from this site and does the job with your data, kept in your own TinyCloud space.";
writeFileSync(
  join(OUT, "index.html"),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Give your agent abilities · TinyCloud</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt">
  <style>
    body { font: 16px/1.55 system-ui, sans-serif; max-width: 46rem; margin: 2.5rem auto; padding: 0 1.25rem; color: #1a1a1a; }
    code { font: 0.9em ui-monospace, monospace; background: #f2f2f2; padding: 0.1em 0.3em; border-radius: 3px; overflow-wrap: anywhere; }
    ul.abilities { list-style: none; padding: 0; }
    ul.abilities li { border-top: 1px solid #ddd; padding: 0.25rem 0 0.75rem; }
    h3 { margin-bottom: 0.25rem; }
    a { color: #0b57d0; }
    footer { margin-top: 2.5rem; border-top: 1px solid #ddd; padding-top: 1rem; color: #555; }
  </style>
</head>
<body>
  <main>
    <h1>Give your agent abilities</h1>
    <p>${esc(desc)}</p>
    <p>Works with agents that can run commands: Claude Code, Codex and OpenCode. Needs Node.js 22.20 or later.</p>

    <h2>How it works</h2>
    <ol>
      <li><strong>Paste a prompt.</strong> Say what you want, then add a link to the ability.</li>
      <li><strong>Your agent reads the setup.</strong> It installs what it needs and shows you an OpenKey link, where you approve exactly what it may access.</li>
      <li><strong>It does the thing.</strong> Your agent finishes your request in the same conversation, with your data in your TinyCloud space.</li>
    </ol>

    <h2>Abilities</h2>
    <ul class="abilities">
${abilities.map(card).join("\n")}
    </ul>

    <h2>Building blocks</h2>
    <p>These are for agents. The guides above call them, so you don't need to link them yourself.</p>
    <ul>
${docs.filter((d) => BLOCKS.has(d.path)).map((d) => `      <li><a href="/${d.path}">${esc(d.title)}</a> (<code>/${d.path}</code>)</li>`).join("\n")}
    </ul>

    <h2>All guides</h2>
    <ul>
${listed.filter((d) => !BLOCKS.has(d.path)).map((d) => `      <li><a href="/${d.path}">${esc(d.title)}</a> (<code>/${d.path}</code>)</li>`).join("\n")}
    </ul>
  </main>
  <footer>Agents: start at <a href="/llms.txt">/llms.txt</a> for a plain-text index of every guide and skill on this site.</footer>
</body>
</html>
`,
);

// Without a 404 page, Pages serves index.html with 200 for missing paths.
writeFileSync(
  join(OUT, "404.html"),
  `<!doctype html>\n<meta charset="utf-8">\n<title>Not found · TinyCloud</title>\n<p>Not found. Agents: see <a href="/llms.txt">/llms.txt</a> for every guide and skill on this site.</p>\n`,
);

console.log(`built ${OUT}: ${files.length} files, ${listed.length} guides, ${skills.length} skills, ${abilities.length} abilities`);
