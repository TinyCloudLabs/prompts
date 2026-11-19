// An agent never runs sudo, and no skill or guide shows a shell block that names it: where another account must own a
// file, the Secrets skill says to stop and tell the owner.
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

// The body of each fenced block.
function fencedBlocks(text) {
  const blocks = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^```/.test(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length && !/^```/.test(lines[end])) end++;
    blocks.push(lines.slice(i + 1, end).join("\n"));
    i = end;
  }
  return blocks;
}

test("no shell block in a skill or guide names sudo", () => {
  const found = [];
  for (const dir of ["skills", "setup", "standard"]) {
    for (const file of markdownFiles(join(ROOT, dir))) {
      for (const block of fencedBlocks(readFileSync(file, "utf8"))) {
        if (/\bsudo\b/.test(block)) found.push(relative(ROOT, file));
      }
    }
  }
  assert.deepEqual(found, []);
});

test("the Secrets skill writes a key file only for the agent's own account and, for another account, tells the owner without a command", () => {
  const skill = readFileSync(join(ROOT, "skills/tc-secrets/SKILL.md"), "utf8");
  assert.doesNotMatch(skill, /\bsudo\b/i);
  assert.match(skill, /owned by your own account\. For another account's file, write nothing and tell the owner \(see below\)\./);
  assert.match(skill, /> I didn't write `<path>`\. It has to belong to `<user>`, and this session can't create files for another account\./);
});
