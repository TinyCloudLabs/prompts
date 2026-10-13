// Installs one TinyCloud agent skill from agents.tinycloud.xyz for one client.
// Every file is checked against its sha256 in /skills/index.json before anything
// is written, then the skill folder is replaced as a whole.
//
//   curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - <skill> --agent <claude-code|codex|opencode>
//
// <skill> is a short name from /skills/index.json (apps, secrets, publish, cli,
// courier, chat, mcp) or the skill's own name (tc-apps, …). Claude Code skills go
// into ${CLAUDE_CONFIG_DIR:-~/.claude}/skills, Codex and OpenCode skills into
// ~/.agents/skills. Prints "SKILL_INSTALLED <name> <version> <folder>" on success
// and "SKILL_INSTALL_FAILED <reason>" (exit 1) otherwise.
// The site build serves this file as /skills/install.js with SITE set to the
// site it is served from, so a Pages preview installs the preview's skills.
"use strict";
const { createHash } = require("node:crypto");
const { existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { dirname, join, resolve, sep } = require("node:path");

const SITE = "https://agents.tinycloud.xyz";
const ROOTS = {
  "claude-code": join(process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude"), "skills"),
  codex: join(homedir(), ".agents", "skills"),
  opencode: join(homedir(), ".agents", "skills"),
};
// A skill name is one plain folder name; file paths are relative, "/"-separated,
// and stay inside the skill's folder.
const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

async function get(path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) throw new Error(`unsafe URL path "${path}"`);
  const res = await fetch(SITE + path);
  if (!res.ok) throw new Error(`${SITE}${path}: HTTP ${res.status}`);
  return res;
}

function checkPath(base, path) {
  const unsafe =
    typeof path !== "string" ||
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    path.split("/").some((part) => part === "" || part === "." || part === "..") ||
    !resolve(base, path).startsWith(base + sep);
  if (unsafe) throw new Error(`unsafe file path "${path}"`);
}

const present = (path) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

async function main() {
  const [want, flag, agent, ...extra] = process.argv.slice(2);
  if (!want || flag !== "--agent" || !Object.hasOwn(ROOTS, agent) || extra.length) {
    throw new Error("usage: node install.js <skill> --agent claude-code|codex|opencode");
  }
  const { skills } = await (await get("/skills/index.json")).json();
  const skill = skills.find((s) => s.short === want || s.name === want);
  if (!skill) throw new Error(`no skill "${want}"; see ${SITE}/skills/index.json`);
  if (typeof skill.name !== "string" || !SKILL_NAME.test(skill.name)) throw new Error(`unsafe skill name "${skill.name}"`);

  const root = resolve(ROOTS[agent]);
  const dest = join(root, skill.name);
  const stage = join(root, `.${skill.name}.installing-${process.pid}`);
  const backup = join(root, `.${skill.name}.previous`);

  // An install that stopped between the two renames below left the earlier
  // skill at `backup`: put it back before anything else.
  if (!present(dest) && present(backup)) renameSync(backup, dest);
  rmSync(backup, { recursive: true, force: true });
  if (existsSync(root)) {
    for (const name of readdirSync(root)) if (name.startsWith(`.${skill.name}.installing-`)) rmSync(join(root, name), { recursive: true, force: true });
  }

  const files = [];
  for (const file of skill.files) {
    checkPath(stage, file.path);
    const body = Buffer.from(await (await get(file.url)).arrayBuffer());
    const sha256 = createHash("sha256").update(body).digest("hex");
    if (sha256 !== file.sha256) throw new Error(`${SITE}${file.url}: sha256 ${sha256}, index.json says ${file.sha256}`);
    files.push([file.path, body]);
  }

  // Write the new folder next to the old one, move the old one aside, move the
  // new one in, and only then delete the old one. If moving the new one in
  // fails, the old one goes back.
  try {
    for (const [path, body] of files) {
      mkdirSync(dirname(join(stage, path)), { recursive: true });
      writeFileSync(join(stage, path), body);
    }
    const hadOld = present(dest);
    if (hadOld) renameSync(dest, backup);
    try {
      renameSync(stage, dest);
    } catch (error) {
      if (hadOld) renameSync(backup, dest);
      throw error;
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  rmSync(backup, { recursive: true, force: true });
  console.log(`SKILL_INSTALLED ${skill.name} ${skill.version} ${dest}`);
}

main().catch((error) => {
  console.error(`SKILL_INSTALL_FAILED ${error.message}`);
  process.exitCode = 1;
});
