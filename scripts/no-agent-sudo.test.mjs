// An agent never runs sudo. The one fenced command that names it is the line the Secrets skill tells the agent to
// send the owner for a key file another account must own; every other shell block in a skill or guide has none.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith(".md") ? [path] : [];
  });
}

// Fenced blocks as { before: the paragraph just above, body }.
function fencedBlocks(text) {
  const blocks = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^```/.test(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length && !/^```/.test(lines[end])) end++;
    let before = i - 1;
    while (before >= 0 && lines[before].trim() === "") before--;
    blocks.push({ before: lines[before] ?? "", body: lines.slice(i + 1, end).join("\n") });
    i = end;
  }
  return blocks;
}

test("the only shell block that names sudo is the command the Secrets skill has the agent send the owner", () => {
  const found = [];
  for (const dir of ["skills", "setup", "standard"]) {
    for (const file of markdownFiles(join(ROOT, dir))) {
      for (const block of fencedBlocks(readFileSync(file, "utf8"))) {
        if (/\bsudo\b/.test(block.body)) found.push({ file: relative(ROOT, file), ...block });
      }
    }
  }
  assert.deepEqual(found.map((block) => block.file), ["skills/tc-secrets/SKILL.md"]);
  assert.match(found[0].before, /Send the owner this command to run in their own terminal/);
  assert.match(found[0].before, /never run `sudo`/);
});

test("the Secrets skill says the agent never runs sudo and points the other-account case at the owner", () => {
  const skill = readFileSync(join(ROOT, "skills/tc-secrets/SKILL.md"), "utf8");
  assert.match(skill, /You never run `sudo`\. If another account must own the file, write nothing: give the owner the command/);
});
