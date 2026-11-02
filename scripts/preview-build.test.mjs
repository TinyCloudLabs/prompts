// Builds the site twice in copies of the repository, so the shared _site the
// other tests read is left alone: once for production, once as a Pages preview.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://agents.tinycloud.xyz";
const PREVIEW = "https://abc.tinycloud-agents.pages.dev";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-preview-build-"));
after(() => rmSync(work, { recursive: true, force: true }));

const build = async (name, env) => {
  const dir = join(work, name);
  cpSync(root, dir, { recursive: true, filter: (src) => src === root || dirname(src) !== root || ![".git", "_site", "node_modules"].includes(basename(src)) });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CF_PAGES.*|SITE_URL)$/.test(key)));
  await promisify(execFile)(process.execPath, [join(dir, "scripts/build-site.mjs")], { env: { ...clean, ...env } });
  return join(dir, "_site");
};
let production, preview;
before(async () => {
  [production, preview] = await Promise.all([build("production", {}), build("preview", { CF_PAGES_BRANCH: "x", CF_PAGES_URL: PREVIEW })]);
});

const servedSkillFiles = (site) =>
  readdirSync(join(site, "skills"), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(site.length));

// Every file index.json lists is served with that size and checksum, and the
// skill's SHA256SUMS and agent-skills digest agree with it.
const assertIntegrity = (site) => {
  const index = JSON.parse(readFileSync(join(site, "skills/index.json"), "utf8"));
  const discovery = JSON.parse(readFileSync(join(site, ".well-known/agent-skills/index.json"), "utf8"));
  for (const skill of index.skills) {
    for (const file of skill.files) {
      const body = readFileSync(join(site, file.url));
      assert.equal(body.length, file.size, file.url);
      assert.equal(sha256(body), file.sha256, file.url);
    }
    assert.equal(readFileSync(join(site, `skills/${skill.short}/SHA256SUMS`), "utf8"), skill.files.map((f) => `${f.sha256}  ${f.path}\n`).join(""));
    const main = skill.files.find((f) => f.path === "SKILL.md");
    assert.equal(discovery.skills.find((s) => s.name === skill.name).digest, `sha256:${main.sha256}`, skill.name);
  }
  return index;
};

test("a preview's skills send agents to the preview, not production, under matching checksums", () => {
  for (const path of ["skills/apps.md", "skills/apps/SKILL.md"]) {
    const text = readFileSync(join(preview, path), "utf8");
    assert.ok(text.includes(`${PREVIEW}/onboarding`), `${path} has no ${PREVIEW}/onboarding`);
    assert.ok(!text.includes(`${SITE}/onboarding`), `${path} sends agents to production /onboarding`);
  }
  // install.js mentions production only in its usage comment; its SITE is the preview.
  const leaks = servedSkillFiles(preview).filter((p) => p !== "/skills/install.js" && readFileSync(join(preview, p), "utf8").includes(SITE));
  assert.deepEqual(leaks, []);
  assert.ok(readFileSync(join(preview, "skills/install.js"), "utf8").includes(`const SITE = "${PREVIEW}";`));
  const index = assertIntegrity(preview);
  for (const short of ["apps", "feed", "publish", "secrets", "cli", "courier"]) {
    assert.ok(index.skills.find((s) => s.short === short).changed.includes("SKILL.md"), `${short}: SKILL.md not listed as changed`);
  }
});

test("a production build serves the repository's skills byte for byte, pointing at production", () => {
  assert.ok(readFileSync(join(production, "skills/apps.md"), "utf8").includes(`${SITE}/onboarding`));
  assert.deepEqual(servedSkillFiles(production).filter((p) => readFileSync(join(production, p), "utf8").includes(PREVIEW)), []);
  const index = assertIntegrity(production);
  for (const [short, dir] of [["apps", "tc-apps"], ["feed", "tinycloud-feed"], ["publish", "tc-publish"], ["secrets", "tc-secrets"]]) {
    const skill = index.skills.find((s) => s.short === short);
    assert.equal(skill.changed, undefined, short);
    for (const file of skill.files) assert.ok(readFileSync(join(production, file.url)).equals(readFileSync(join(root, "skills", dir, file.path))), file.url);
  }
});

// Fetch tools that summarize a page keep its first lines and drop its shell
// blocks, so each served guide and skill opens with this line and its own URL.
const rawLine = (url) => `> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with \`curl -fsSL ${url}\` and follow that text. Summaries drop the shell blocks you must run.\n\n`;
const GUIDES = ["onboarding.md", "connect.md", "setup", "agent", "apps", "owner", "chat", "feed", "publish", "share", "secrets", "courier", "cli", "openkey"];
const afterFrontMatter = (text) => text.replace(/^---\n[\s\S]*?\n---\n\n/, "");

test("every served Markdown guide and skill opens with the read-raw line for its own URL, in production and on a preview", () => {
  for (const [site, base] of [[production, SITE], [preview, PREVIEW]]) {
    const guides = readdirSync(site, { withFileTypes: true }).filter((e) => e.isFile() && /^[a-z]+(\.md)?$/.test(e.name)).map((e) => e.name).sort();
    assert.deepEqual(guides, [...GUIDES].sort(), site);
    for (const guide of guides) assert.ok(readFileSync(join(site, guide), "utf8").startsWith(rawLine(`${base}/${guide}`)), `${base}/${guide}`);
    const { skills } = JSON.parse(readFileSync(join(site, "skills/index.json"), "utf8"));
    assert.deepEqual(skills.map((s) => s.short).sort(), ["apps", "chat", "cli", "courier", "feed", "mcp", "publish", "secrets"]);
    for (const { short } of skills) {
      for (const path of [`skills/${short}.md`, `skills/${short}/SKILL.md`]) {
        assert.ok(afterFrontMatter(readFileSync(join(site, path), "utf8")).startsWith(rawLine(`${base}/skills/${short}.md`)), `${base}/${path}`);
      }
    }
  }
});

test("the owner-facing HTML pages leave the read-raw line out", () => {
  for (const site of [production, preview]) {
    for (const page of readdirSync(site).filter((name) => name.endsWith(".html"))) {
      assert.doesNotMatch(readFileSync(join(site, page), "utf8"), /read this file raw/, `${site}/${page}`);
    }
    // Each html page's rendered body still starts with its title.
    for (const page of ["onboarding", "connect"]) assert.match(readFileSync(join(site, `${page}.html`), "utf8"), /<main>\n<h1 id="[^"]+">/, page);
  }
});
