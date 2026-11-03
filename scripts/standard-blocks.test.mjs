// The shared blocks in standard/blocks.md: expanded into guides and skills at build time, never
// published, and the build fails when a copy bypasses them. Builds copies of the repository.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://agents.tinycloud.xyz";
const PREVIEW = "https://abc.tinycloud-agents.pages.dev";
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-standard-blocks-"));
after(() => rmSync(work, { recursive: true, force: true }));

const build = async (name, env, edit) => {
  const dir = join(work, name);
  cpSync(root, dir, { recursive: true, filter: (src) => src === root || dirname(src) !== root || ![".git", "_site", "node_modules"].includes(basename(src)) });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  edit?.(dir);
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CF_PAGES.*|SITE_URL)$/.test(key)));
  await promisify(execFile)(process.execPath, [join(dir, "scripts/build-site.mjs")], { env: { ...clean, ...env } });
  return join(dir, "_site");
};
// The build's stderr when it fails; fails the test when the build succeeds.
const stderrOf = async (name, edit) => {
  try {
    await build(name, {}, edit);
  } catch (error) {
    return error.stderr;
  }
  assert.fail(`${name}: the build should fail`);
};

const parts = readFileSync(join(root, "standard/blocks.md"), "utf8").split(/^<!-- std:([a-z][a-z0-9-]*) -->\n/m).slice(1);
const blocks = new Map();
for (let i = 0; i < parts.length; i += 2) blocks.set(parts[i], parts[i + 1].trim());
const readRaw = blocks.get("read-raw");

let production, preview;
before(async () => {
  [production, preview] = await Promise.all([build("production", {}), build("preview", { CF_PAGES_BRANCH: "x", CF_PAGES_URL: PREVIEW })]);
});

const served = (site) => readdirSync(site, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(site.length + 1));
const GUIDES = ["agent", "courier", "onboarding.md", "publish", "secrets", "apps", "cli"];

test("every guide that names a block serves its text once, and no marker survives, on production and on a preview", () => {
  for (const site of [production, preview]) {
    for (const guide of [...GUIDES, "share"]) assert.equal(readFileSync(join(site, guide), "utf8").split(readRaw).length, 2, `${guide}: the read-raw block, once`);
    for (const file of served(site)) assert.ok(!readFileSync(join(site, file)).includes("{{std:"), `${file}: a marker survived`);
  }
});

test("production and a preview expand a block identically", () => {
  for (const guide of GUIDES) {
    assert.equal(readFileSync(join(preview, guide), "utf8").replaceAll(PREVIEW, "<site>"), readFileSync(join(production, guide), "utf8").replaceAll(SITE, "<site>"), guide);
  }
});

test("standard/ is not served and no index lists it", () => {
  for (const site of [production, preview]) {
    for (const file of served(site)) assert.ok(!/(^|\/)(standard|blocks)(\/|\.md$)/.test(file), `${file} is served`);
    for (const index of ["llms.txt", "llms-full.txt", "sitemap.xml", "skills/index.json", "index.html"]) {
      assert.ok(!/standard\/blocks|<!-- std:/.test(readFileSync(join(site, index), "utf8")), `${index} mentions the block source`);
    }
  }
});

test("a repo-authored skill that carries a marker is expanded, listed as changed and checksummed as served", async () => {
  const site = await build("skill-marker", {}, (dir) => {
    const file = join(dir, "skills/tc-apps/TINY-APPS.md");
    writeFileSync(file, `${readFileSync(file, "utf8").trimEnd()}\n\n{{std:read-raw}}\n`);
  });
  const apps = JSON.parse(readFileSync(join(site, "skills/index.json"), "utf8")).skills.find((s) => s.short === "apps");
  assert.ok(apps.changed.includes("TINY-APPS.md"));
  const body = readFileSync(join(site, "skills/apps/TINY-APPS.md"));
  assert.ok(body.toString("utf8").includes(readRaw));
  assert.equal(apps.files.find((f) => f.path === "TINY-APPS.md").sha256, createHash("sha256").update(body).digest("hex"));
});

test("the build fails on an unknown marker, a marker that isn't alone, an unused block, a bad block and a pasted copy", async () => {
  const guide = (dir, change) => {
    const file = join(dir, "setup/publish.md");
    writeFileSync(file, change(readFileSync(file, "utf8")));
  };
  const addBlock = (dir, extra) => writeFileSync(join(dir, "standard/blocks.md"), `${readFileSync(join(dir, "standard/blocks.md"), "utf8")}\n${extra}\n`);
  const errors = await Promise.all([
    stderrOf("unknown", (dir) => guide(dir, (t) => t.replace("{{std:read-raw}}", "{{std:no-such-block}}"))),
    stderrOf("inline", (dir) => guide(dir, (t) => t.replace("{{std:read-raw}}", "See {{std:read-raw}} here.\n\n{{std:read-raw}}"))),
    stderrOf("unused", (dir) => addBlock(dir, "<!-- std:spare -->\nNothing carries this.")),
    stderrOf("relative", (dir) => addBlock(dir, "<!-- std:rel -->\nSee [the CLI](tinycloud.md).")),
    stderrOf("pasted", (dir) => guide(dir, (t) => t.replace("{{std:read-raw}}", readRaw))),
  ]);
  assert.match(errors[0], /\{\{std:no-such-block\}\} isn't in standard\/blocks\.md/);
  assert.match(errors[1], /must be alone on its line/);
  assert.match(errors[2], /no guide or skill carries \{\{std:spare\}\}/);
  assert.match(errors[3], /std:rel has a relative link/);
  assert.match(errors[4], /setup\/publish\.md: carries the text of std:read-raw instead of \{\{std:read-raw\}\}/);
});
