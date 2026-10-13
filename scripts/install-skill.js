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
const { createHash, randomBytes } = require("node:crypto");
const { lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } = require("node:fs");
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
// This run's own staging folder, backup and lock owner carry this tag.
const TAG = `${process.pid}-${randomBytes(6).toString("hex")}`;
// How long to wait for another install of the same skill to finish, and when its
// lock counts as abandoned even though its process id is in use: a held lock
// covers only writing and renaming files, which takes well under a second.
const LOCK_WAIT_MS = 60_000;
const LOCK_STALE_MS = 10 * 60_000;
const LOCK_UNOWNED_MS = 5_000;

// Fetches a path on SITE. Redirects are refused, so every byte comes from SITE.
async function get(path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) throw new Error(`unsafe URL path "${path}"`);
  const res = await fetch(SITE + path, { redirect: "manual" });
  if (res.status >= 300 && res.status < 400) throw new Error(`${SITE}${path}: redirects elsewhere (HTTP ${res.status}); refused`);
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

const age = (path) => {
  try {
    return Date.now() - lstatSync(path).mtimeMs;
  } catch {
    return null;
  }
};

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};

// The "<pid> <tag>" written into a lock folder, or null when it has none yet.
const lockOwner = (lock) => {
  try {
    return readFileSync(join(lock, "owner"), "utf8").trim();
  } catch {
    return null;
  }
};

// Takes the per-skill lock: a folder only one process can create. A lock whose
// process has exited, or that is older than any install takes, is broken.
async function lock(path, skill) {
  for (const deadline = Date.now() + LOCK_WAIT_MS; ; ) {
    try {
      mkdirSync(path);
      writeFileSync(join(path, "owner"), `${process.pid} ${TAG}\n`);
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const owner = lockOwner(path);
    const held = age(path);
    const pid = owner && Number(owner.split(" ")[0]);
    const stale = held !== null && (owner ? !alive(pid) || held > LOCK_STALE_MS : held > LOCK_UNOWNED_MS);
    if (stale) {
      // Move the stale lock aside, then check it was the one judged stale: if
      // another process replaced it in between, put that one back.
      const aside = `${path}.broken-${TAG}`;
      try {
        renameSync(path, aside);
      } catch {
        continue;
      }
      if (lockOwner(aside) === owner) rmSync(aside, { recursive: true, force: true });
      else {
        try {
          renameSync(aside, path);
        } catch {
          rmSync(aside, { recursive: true, force: true });
        }
      }
      continue;
    }
    if (Date.now() > deadline) throw new Error(`another install of ${skill} is still running (lock ${path})`);
    await new Promise((done) => setTimeout(done, 100));
  }
}

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
  const stage = join(root, `.${skill.name}.installing-${TAG}`);
  const backup = join(root, `.${skill.name}.previous-${TAG}`);
  const lockDir = join(root, `.${skill.name}.lock`);

  const files = [];
  for (const file of skill.files) {
    checkPath(stage, file.path);
    const body = Buffer.from(await (await get(file.url)).arrayBuffer());
    const sha256 = createHash("sha256").update(body).digest("hex");
    if (sha256 !== file.sha256) throw new Error(`${SITE}${file.url}: sha256 ${sha256}, index.json says ${file.sha256}`);
    files.push([file.path, body]);
  }

  // Everything below changes the skills folder, one install of this skill at a time.
  mkdirSync(root, { recursive: true });
  await lock(lockDir, skill.name);
  try {
    // Leftovers of installs whose process has exited: a backup is an earlier
    // skill that one of them moved aside and didn't get to put back.
    const leftovers = readdirSync(root)
      .map((name) => [name, name.match(new RegExp(`^\\.${skill.name}\\.(installing|previous)-(\\d+)-[0-9a-f]+$`))])
      .filter(([, m]) => m && !alive(Number(m[2])))
      .map(([name, m]) => ({ path: join(root, name), backup: m[1] === "previous", age: age(join(root, name)) }));
    const backups = leftovers.filter((l) => l.backup).sort((a, b) => a.age - b.age);
    if (age(dest) === null && backups.length) renameSync(backups[0].path, dest);
    for (const l of leftovers) rmSync(l.path, { recursive: true, force: true });

    // Write the new folder next to the old one, move the old one aside, move the
    // new one in, and only then delete the old one. If moving the new one in
    // fails, the old one goes back.
    try {
      for (const [path, body] of files) {
        mkdirSync(dirname(join(stage, path)), { recursive: true });
        writeFileSync(join(stage, path), body);
      }
      if (lockOwner(lockDir) !== `${process.pid} ${TAG}`) throw new Error(`lost the lock ${lockDir} to another install`);
      const hadOld = age(dest) !== null;
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
  } finally {
    if (lockOwner(lockDir) === `${process.pid} ${TAG}`) rmSync(lockDir, { recursive: true, force: true });
  }
  console.log(`SKILL_INSTALLED ${skill.name} ${skill.version} ${dest}`);
}

main().catch((error) => {
  console.error(`SKILL_INSTALL_FAILED ${error.message}`);
  process.exitCode = 1;
});
