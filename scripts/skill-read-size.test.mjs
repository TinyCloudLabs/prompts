// TC-2431: agents read installed skill files with the shell, in parts of at most 25,000 bytes, so a client
// shows each output in full instead of saving it to a file (which made Claude Code open the skill with its
// file-read tool and ask the owner). Runs every documented read against the BUILT (installed) files and checks
// that each part fits and that the parts, in order, are the whole file.
// Builds a copy of the repository, so the shared _site other tests read is left alone.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const CAP = 25000;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(realpathSync(tmpdir()), "tc-skill-read-size-"));
after(() => rmSync(work, { recursive: true, force: true }));
let site;
before(async () => {
  const dir = join(work, "repo");
  cpSync(root, dir, { recursive: true, filter: (src) => src === root || dirname(src) !== root || ![".git", "_site", "node_modules"].includes(basename(src)) });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CF_PAGES.*|SITE_URL)$/.test(key)));
  await promisify(execFile)(process.execPath, [join(dir, "scripts/build-site.mjs")], { env });
  site = join(dir, "_site");
});

const SHORT = { "tc-apps": "apps", "tc-secrets": "secrets", "tc-publish": "publish" };
const built = (skill, file) => readFileSync(join(site, "skills", SHORT[skill], file));
// The served guides and skills that tell an agent how to read an installed skill file.
const SOURCES = ["apps", "agent", "publish", "secrets", "share", "skills/apps/SKILL.md", "skills/apps/LEGACY.md", "skills/apps/TINY-APPS.md"];
const PATH_RE = /skills\/(tc-apps|tc-secrets|tc-publish)\/([A-Z][A-Z-]*\.md)/;

// Each one-line ```sh block that reads an installed skill file, grouped per source, file and client, in order.
const documentedReads = () => {
  const groups = new Map();
  for (const source of SOURCES) {
    const text = readFileSync(join(site, source), "utf8");
    for (const [, body] of text.matchAll(/```sh\n([\s\S]*?)```/g)) {
      const line = body.trim();
      const m = line.match(PATH_RE);
      if (!m || line.includes("\n") || !/\b(sed|cat)\b/.test(line)) continue;
      const client = line.includes(".claude") && line.includes(".agents") ? "both" : line.includes(".claude") ? "claude" : "agents";
      const key = `${source} ${m[1]}/${m[2]} ${client}`;
      if (!groups.has(key)) groups.set(key, { source, skill: m[1], file: m[2], client, lines: [] });
      groups.get(key).lines.push(line);
    }
  }
  return [...groups.values()];
};

const runPart = (line, skill, file) => {
  const home = mkdtempSync(join(work, "home-"));
  for (const base of [".claude/skills", ".agents/skills"]) {
    mkdirSync(join(home, base, skill), { recursive: true });
    cpSync(join(site, "skills", SHORT[skill], file), join(home, base, skill, file));
  }
  const out = spawnSync("/bin/sh", ["-c", line], { env: { PATH: process.env.PATH, HOME: home }, maxBuffer: 1 << 24 });
  assert.equal(out.status, 0, `${line}\n${out.stderr}`);
  return out.stdout;
};

test("every documented shell read of an installed skill file prints parts of at most 25,000 bytes that make up the whole built file", () => {
  const groups = documentedReads();
  for (const want of ["apps tc-apps/SKILL.md claude", "apps tc-apps/SKILL.md agents", "skills/apps/SKILL.md tc-apps/TINY-APPS.md both", "agent tc-secrets/SKILL.md both", "agent tc-publish/SKILL.md both"]) {
    assert.ok(groups.some((g) => `${g.source} ${g.skill}/${g.file} ${g.client}` === want), `no documented read for ${want}`);
  }
  for (const g of groups) {
    const whole = built(g.skill, g.file);
    const parts = g.lines.map((line) => runPart(line, g.skill, g.file));
    const label = `${g.source}: ${g.skill}/${g.file} (${g.client})`;
    parts.forEach((part, i) => assert.ok(part.length <= CAP, `${label} part ${i + 1} is ${part.length} bytes, over ${CAP}`));
    assert.ok(Buffer.concat(parts).equals(whole), `${label}: the ${parts.length} parts are not the whole file`);
  }
});

test("no guide reads an installed skill file over 25,000 bytes in one piece, or with the client's file-read tool", () => {
  for (const source of SOURCES) {
    const text = readFileSync(join(site, source), "utf8");
    for (const m of text.matchAll(/\bcat "[^"]*skills\/(tc-apps|tc-secrets|tc-publish)\/([A-Z][A-Z-]*\.md)"/g)) {
      assert.ok(built(m[1], m[2]).length <= CAP, `${source} cats ${m[1]}/${m[2]} (${built(m[1], m[2]).length} bytes) in one piece`);
    }
    assert.doesNotMatch(text, /Read its installed `SKILL\.md` by path/, source);
  }
});
