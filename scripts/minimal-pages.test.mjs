import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CLI_VERSION } from "./install-cli.mjs";

// /onboarding.md and /connect/cli are the short pages: one npx command, no install or permission text.
// Run `node scripts/build-site.mjs` first, as for every test that reads `_site`.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = [
  { source: "setup/onboarding.md", served: "_site/onboarding.md" },
  { source: "setup/connect/cli.md", served: "_site/connect/cli.md" },
];
// `--prefix "$HOME"` makes npx ignore the agent's current folder: a project's node_modules/@tinycloud/cli and its
// .npmrc registry are not used. `-p <package> tinycloud` names the program, so no bin-rename notice appears.
const RUN = (pin) => `npx --prefix "$HOME" -y -p @tinycloud/cli@${pin} tinycloud`;
const COMMAND = (pin) => `${RUN(pin)} onboard --timeout 1s`;
const OPERATOR = '"$TC_BIN" onboard --timeout 1s';
const BANNER = /^> \*\*Agents: read this (file|page)[^\n]*\n\n/;

const body = (file) => readFileSync(join(root, file), "utf8").replace(BANNER, "");
const count = (text, needle) => text.split(needle).length - 1;

test("the stable pin is a plain release version, never a tag or a prerelease", () => {
  assert.match(CLI_VERSION, /^\d+\.\d+\.\d+$/);
});

for (const { source, served } of PAGES) {
  test(`${source} runs the one npx command, from $HOME, and honors the operator's TC_BIN`, () => {
    const text = body(source);
    assert.equal(count(text, COMMAND("{{CLI_VERSION}}")), 1, "the command appears once, as written");
    assert.equal(count(text, "npx"), 2, "the command, and the substitute for `tinycloud`");
    assert.equal(count(text, RUN("{{CLI_VERSION}}")), 2, "every npx run is the --prefix form: a bare `npx -y @tinycloud/cli` follows the project's node_modules and .npmrc");
    assert.equal(count(text, OPERATOR), 1);
    assert.equal(count(text, "onboard"), 2, "the npx command and the TC_BIN one, nothing else");
    assert.equal(text.match(/^```/gm), null, "no fenced shell block");
  });

  test(`${source} keeps the blocked-command rule and the exit-code table link`, () => {
    const text = body(source);
    assert.ok(text.includes("If your client blocks the command, stop and tell the owner. Don't run it another way."));
    assert.ok(text.includes("https://agents.tinycloud.xyz/agent#exit-codes-and-owner-lines"));
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
    assert.equal(count(text, COMMAND(CLI_VERSION)), 1);
    assert.equal(count(text, RUN(CLI_VERSION)), 2);
    assert.ok(text.match(/@tinycloud\/cli@[^\s`]+/g).every((spec) => spec === `@tinycloud/cli@${CLI_VERSION}`));
    assert.doesNotMatch(text, /\{\{|@latest|@next/);
  });
}

test("the exit-code table the pages link to is on /agent under that heading", () => {
  assert.match(readFileSync(join(root, "_site/agent"), "utf8"), /^## Exit codes and owner lines$/m);
});
