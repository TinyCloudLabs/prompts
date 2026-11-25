import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// TC-4317: /apps told agents to stop when a skill file was not local, so Codex with no local
// tc-apps skill never reached the skill's own served fetches. Reads only built files (npm run build).
const site = join(dirname(fileURLToPath(import.meta.url)), "../_site");
const origin = "https://agents.tinycloud.xyz";
const prefix = `${origin}/skills/apps/`;
const files = ["TINY-APPS.md", "CONTEXT.md", "SQL.md", "layout.sh", "app-context.mjs"];
const read = (path) => readFileSync(join(site, path), "utf8");

test("the built /apps page does not stop on a local file the skill fetches from the site", () => {
  const page = read("apps");
  const stops = page.split(/\n\s*\n/).filter((paragraph) => /\bstop and tell the owner which file\b/i.test(paragraph));
  assert.ok(stops.length, "/apps keeps a stop for files that cannot be fetched");
  for (const paragraph of stops) {
    assert.ok(paragraph.includes(prefix), `the stop line must name the served fetch ${prefix}:\n${paragraph}`);
    assert.match(paragraph, /run the skill's blocks as written/i, "the stop line must send the agent to the skill's blocks first");
  }
  assert.doesNotMatch(page, /^If the client does not already have a local file that the skill requires, stop and tell/m);
  assert.match(page, /Do not download an installer/);
});

test("every file the apps route reads has a served copy, and its skill fallbacks point at built files", () => {
  const served = (name) => existsSync(join(site, "skills/apps", name));
  for (const name of files) assert.ok(served(name), `${prefix}${name} is built`);

  const skillText = ["SKILL.md", ...files].map((name) => read(`skills/apps/${name}`)).join("\n");
  const urls = new Set();
  for (const match of skillText.matchAll(/curl[^\n]*?https:\/\/agents\.tinycloud\.xyz\/skills\/apps\/([A-Za-z0-9._-]+)/g)) urls.add(match[1]);
  // Loop form: for f in a b; do curl ... "$prefix$f" ...
  for (const match of skillText.matchAll(/for f in ([^;\n]+); do curl[^\n]*skills\/apps\/\$f/g)) for (const name of match[1].split(/\s+/)) urls.add(name);
  assert.ok(urls.size, "the skill has served fetch fallbacks");
  for (const name of urls) assert.ok(served(name), `fallback ${prefix}${name} exists in the build`);
  for (const name of files.filter((file) => file !== "SQL.md")) assert.ok(urls.has(name), `the skill fetches ${name} from ${prefix}`);
});
