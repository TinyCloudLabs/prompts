import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CLI_VERSION } from "./install-cli.mjs";

// /onboarding.md and /connect/cli are the five-line pages: one command, no install or permission text.
// Run `node scripts/build-site.mjs` first, as for every test that reads `_site`.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = [
  { source: "setup/onboarding.md", served: "_site/onboarding.md" },
  { source: "setup/connect/cli.md", served: "_site/connect/cli.md" },
];
const COMMAND = "npx -y @tinycloud/cli@{{CLI_VERSION}} onboard --timeout 1s";
const BANNER = /^> \*\*Agents: read this (file|page)[^\n]*\n\n/;

const body = (file) => readFileSync(join(root, file), "utf8").replace(BANNER, "");
const codeSpans = (text) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);

test("the stable pin is a plain release version, never a tag or a prerelease", () => {
  assert.match(CLI_VERSION, /^\d+\.\d+\.\d+$/);
});

for (const { source, served } of PAGES) {
  test(`${source} carries exactly one command: the npx onboard line`, () => {
    const text = body(source);
    assert.equal(text.split(COMMAND).length - 1, 1, "the command appears once, as written");
    assert.equal(text.match(/\bonboard\b/g).length, 1, "no other onboard invocation");
    // Every other command-looking span is the bare npx prefix the page tells the agent to substitute for `tinycloud`.
    const others = codeSpans(text).filter((span) => span !== COMMAND && span !== "@tinycloud/cli" && span !== "tinycloud");
    assert.deepEqual(others, ["npx -y @tinycloud/cli@{{CLI_VERSION}}"]);
    assert.equal(text.match(/^```/gm), null, "no fenced shell block");
  });

  test(`${source} has no sudo, no global install and no piped shell`, () => {
    for (const file of [source, served]) {
      const text = body(file);
      assert.doesNotMatch(text, /\bsudo\b/i, file);
      assert.doesNotMatch(text, /\bnpm\s+(install|i|add)\b|--global|\s-g\b|\byarn\s+global\b|\bpnpm\s+(add|install)\b/, file);
      assert.doesNotMatch(text, /\|\s*(sudo\s+)?(ba|z|da)?sh\b|\bInvoke-Expression\b|\biex\b/, file);
      assert.doesNotMatch(text, /install-cli|install\.js|\bcurl\b|\bwget\b/, file);
    }
  });

  test(`${source} is served with the stable pin filled in, and nothing else left to fill`, () => {
    const text = body(served);
    const pinned = `npx -y @tinycloud/cli@${CLI_VERSION}`;
    assert.equal(text.split(`${pinned} onboard --timeout 1s`).length - 1, 1);
    assert.equal(text.split(pinned).length - 1, 2, "the command and the substitute for `tinycloud`");
    assert.equal(text.match(/@tinycloud\/cli@[^\s`]+/g).every((spec) => spec === `@tinycloud/cli@${CLI_VERSION}`), true);
    assert.doesNotMatch(text, /\{\{|@latest|@next/);
  });
}
