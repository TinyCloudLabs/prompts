// The client table is one JSON file, scripts/skill-clients.json, and the installer carries a copy of it (it is served
// and run as a single file). The same file, byte for byte, lives in the js-sdk repo at packages/cli/src/skill, where
// `tinycloud skill save` reads it; each repo pins the file's sha256, so changing one table breaks a test until the
// other is changed on purpose, in the same sitting.
// Run: node --test scripts/skill-clients-table.test.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const bytes = readFileSync(join(ROOT, "scripts/skill-clients.json"));
// The js-sdk copy must have exactly these bytes. Update this hash only together with that file.
const PINNED_SHA256 = "67d809cdd93c6fd62a41d811e7ae8c72580308558849954d01158c8c9b4d3238";

test("skill-clients.json has the bytes the js-sdk copy was cut from", () => {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), PINNED_SHA256);
});

test("the table installs the ten clients, and every folder a client names exists", () => {
  const { folders, clients } = JSON.parse(bytes);
  assert.deepEqual(Object.keys(clients).filter((name) => name !== "agents"), [
    "amp", "claude-code", "codex", "copilot", "cursor", "gemini", "hermes", "omp", "openclaw", "opencode",
  ]);
  assert.equal(Object.keys(clients).at(-1), "agents");
  for (const [name, client] of Object.entries(clients)) {
    for (const folder of client.folders) assert.ok(Object.hasOwn(folders, folder), `${name} names the unknown folder ${folder}`);
  }
});

test("the copy inside install-skill.js is the file", () => {
  const source = readFileSync(join(ROOT, "scripts/install-skill.js"), "utf8");
  const match = source.match(/^\/\/ BEGIN skill-clients\.json\nconst TABLE = ([\s\S]*?);\n\/\/ END skill-clients\.json$/m);
  assert.ok(match, "install-skill.js has no BEGIN/END skill-clients.json block");
  assert.deepEqual(JSON.parse(match[1]), JSON.parse(bytes));
  // Key order drives the order of "auto" and of the output, so it must match too.
  assert.equal(JSON.stringify(JSON.parse(match[1])), JSON.stringify(JSON.parse(bytes)));
});
