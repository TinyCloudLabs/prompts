// Installs one TinyCloud agent skill from agents.tinycloud.xyz for the agent clients you name.
// Every file is checked against its sha256 in /skills/index.json before anything
// is written, then the skill folder is replaced as a whole.
//
//   mkdir -p "$HOME/.local/share/tinycloud" && curl -fsSL -o "$HOME/.local/share/tinycloud/install.js" https://agents.tinycloud.xyz/skills/install.js
//   node "$HOME/.local/share/tinycloud/install.js" <skill> --agent <client[,client…]|auto> [--scope user|project]
//
// <skill> is a short name from /skills/index.json (apps, secrets, publish, cli,
// courier, chat, mcp) or the skill's own name (tc-apps, …). Each client reads skills from
// the folders in the table below; most read the shared ".agents/skills" folder, so naming several
// of them installs one copy. --scope user (the default) installs for the whole computer account;
// --scope project installs into the project the command runs in. "auto" picks the clients that
// have a folder on this computer, or the shared folder when it finds none.
// Prints "SKILL_INSTALLED <name> <version> <folder>" for each folder and one "SKILL_SCOPE …"
// line saying who can see it, and "SKILL_INSTALL_FAILED <reason>" (exit 1) otherwise.
// The site build serves this file as /skills/install.js with SITE set to the
// site it is served from, so a Pages preview installs the preview's skills.
"use strict";
const { createHash, randomBytes } = require("node:crypto");
const { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { dirname, join, resolve, sep } = require("node:path");

const SITE = "https://agents.tinycloud.xyz";
// The skill folders clients read and the clients that read them. This is scripts/skill-clients.json, copied
// here because the installer is served and run as one file (a test keeps the copy equal to the file). "shared"
// is the ".agents/skills" convention, and every client except Claude Code gets that copy, because the setup
// guides read it. Claude Code does not read it, so it has its own folder, and three other clients get a folder
// of their own as well: Hermes reads ~/.hermes/skills (the shared folder only when its config lists it), Amp's
// documented user folder is ~/.config/agents/skills, and OpenClaw reads the shared user folder only with its
// default state folder, so it also gets a copy in its state folder's "skills". A folder with a null `project`
// is not written in project scope. "present" is the folder whose presence means the client is installed (for
// "auto"). Paths: "~/" is the home folder; "{VAR|default}" is the trimmed environment variable when it is not
// empty, else the default; project paths start at the project folder.
// BEGIN skill-clients.json
const TABLE = {
  "folders": {
    "shared": { "user": "~/.agents/skills", "project": ".agents/skills" },
    "claude": { "user": "{CLAUDE_CONFIG_DIR|~/.claude}/skills", "project": ".claude/skills" },
    "hermes": { "user": "~/.hermes/skills", "project": ".hermes/skills" },
    "amp": { "user": "~/.config/agents/skills", "project": ".agents/skills" },
    "openclaw": { "user": "{OPENCLAW_STATE_DIR|~/.openclaw}/skills", "project": null }
  },
  "clients": {
    "amp": { "label": "Amp", "folders": ["shared", "amp"], "present": "~/.config/amp" },
    "claude-code": { "label": "Claude Code", "folders": ["claude"], "present": "{CLAUDE_CONFIG_DIR|~/.claude}" },
    "codex": { "label": "Codex", "folders": ["shared"], "present": "~/.codex" },
    "copilot": { "label": "GitHub Copilot", "folders": ["shared"], "present": "~/.copilot" },
    "cursor": { "label": "Cursor", "folders": ["shared"], "present": "~/.cursor" },
    "gemini": { "label": "Gemini CLI", "folders": ["shared"], "present": "~/.gemini" },
    "hermes": { "label": "Hermes", "folders": ["shared", "hermes"], "present": "~/.hermes" },
    "omp": { "label": "OMP", "folders": ["shared"], "present": "~/.omp" },
    "openclaw": { "label": "OpenClaw", "folders": ["shared", "openclaw"], "present": "{OPENCLAW_STATE_DIR|~/.openclaw}" },
    "opencode": { "label": "OpenCode", "folders": ["shared"], "present": "~/.config/opencode" },
    "agents": { "label": "other clients that read .agents/skills", "folders": ["shared"], "present": null }
  }
};
// END skill-clients.json
const { folders: FOLDERS, clients: CLIENTS } = TABLE;
// A path from the table: the environment overrides filled in, then "~/" or an absolute path.
const tablePath = (template) => {
  const filled = template.replace(/\{([A-Z_]+)\|([^}]*)\}/g, (_, name, fallback) => process.env[name]?.trim() || fallback);
  return filled === "~" || filled.startsWith("~/") ? resolve(homedir(), filled.slice(2)) : resolve(filled);
};
const USAGE = `usage: node install.js <skill> --agent <${Object.keys(CLIENTS).join("|")}|auto>[,…] [--scope user|project]`;
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

// `<skill> --agent <clients|auto> [--scope user|project]`, in either order.
function parseArgs(argv) {
  const args = { want: undefined, agent: undefined, scope: undefined };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--agent" || flag === "--scope") {
      const key = flag.slice(2);
      const value = argv[++i];
      if (args[key] !== undefined || value === undefined || value.startsWith("--")) throw new Error(USAGE);
      args[key] = value;
    } else if (flag.startsWith("--") || args.want !== undefined) {
      throw new Error(USAGE);
    } else {
      args.want = flag;
    }
  }
  if (!args.want || !args.agent) throw new Error(USAGE);
  const scope = args.scope ?? "user";
  if (scope !== "user" && scope !== "project") throw new Error(USAGE);
  return { want: args.want, agent: args.agent, scope };
}

// The folder the person is working in as a project: the nearest folder above the current one with a
// ".git" in it. The search stops at the home folder, and at the first folder that belongs to another account
// (for example /tmp), without reading what is in it, so a ".git" outside the person's own folders is never the
// project. With none found, the install refuses: it can't tell which folder is the project. A project install
// never goes into the home folder or the top of the disk, where it would be visible to everything for this account.
function projectRoot() {
  const cwd = resolve(process.cwd());
  // Real paths, so a home reached through a link is still the home.
  const real = (file) => { try { return realpathSync(file); } catch { return resolve(file); } };
  const home = real(homedir());
  const me = typeof process.getuid === "function" ? process.getuid() : null;
  const homeRefusal = (folder) => new Error(`--scope project found no project folder: ${folder} is the home folder or the top of the disk.`);
  let project = null;
  for (let up = cwd; ; up = dirname(up)) {
    if (me !== null && existsSync(up) && statSync(up).uid !== me) throw new Error(`${up} belongs to another account.`);
    if (existsSync(join(up, ".git"))) {
      project = up;
      break;
    }
    if (real(up) === home) {
      if (up === cwd) throw homeRefusal(up);
      break;
    }
    if (dirname(up) === up) break;
  }
  if (project !== null && (real(project) === home || dirname(project) === project)) throw homeRefusal(project);
  if (project === null) throw new Error(`--scope project found no project folder: there is no .git in ${cwd} or any folder above it.`);
  return project;
}

// In a folder another account can write to (for example /tmp), that account could pre-create the skills folder
// and swap the skill after it is installed. A project install refuses the project, or any folder already there
// on the way down to the skills folder, when it belongs to another account.
function assertOwnProject(project, root) {
  if (typeof process.getuid !== "function") return;
  const me = process.getuid();
  for (let dir = root; ; dir = dirname(dir)) {
    if (existsSync(dir) && statSync(dir).uid !== me) {
      throw new Error(`${dir} belongs to another account.`);
    }
    if (dir === project || dirname(dir) === dir) break;
  }
}

// The folders to write, each with the labels of the clients that read it, in the order named.
function pickTargets(agent, scope, project) {
  const auto = agent === "auto";
  const names = auto ? Object.keys(CLIENTS).filter((n) => CLIENTS[n].present && existsSync(tablePath(CLIENTS[n].present))) : agent.split(",");
  if (auto && names.length === 0) names.push("agents");
  const targets = [];
  for (const name of names) {
    if (!Object.hasOwn(CLIENTS, name)) throw new Error(`no client "${name}". ${USAGE}`);
    for (const folder of CLIENTS[name].folders) {
      const place = scope === "project" ? FOLDERS[folder].project : FOLDERS[folder].user;
      if (place === null) continue;
      const root = scope === "project" ? resolve(project, place) : tablePath(place);
      const target = targets.find((t) => t.root === root);
      if (target) {
        if (!target.readers.includes(CLIENTS[name].label)) target.readers.push(CLIENTS[name].label);
      } else {
        targets.push({ root, folder, readers: [CLIENTS[name].label] });
      }
    }
  }
  return targets;
}

// Replaces one skill folder inside one skills folder and returns the skill's folder.
async function installInto(root, skill, files) {
  const dest = join(root, skill.name);
  const stage = join(root, `.${skill.name}.installing-${TAG}`);
  const backup = join(root, `.${skill.name}.previous-${TAG}`);
  const lockDir = join(root, `.${skill.name}.lock`);

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
  return dest;
}

// Folders already replaced in this run.
const updated = [];

async function main() {
  const { want, agent, scope } = parseArgs(process.argv.slice(2));
  const project = scope === "project" ? projectRoot() : null;
  const targets = pickTargets(agent, scope, project);
  const { skills } = await (await get("/skills/index.json")).json();
  const skill = skills.find((s) => s.short === want || s.name === want);
  if (!skill) throw new Error(`no skill "${want}"; see ${SITE}/skills/index.json`);
  if (typeof skill.name !== "string" || !SKILL_NAME.test(skill.name)) throw new Error(`unsafe skill name "${skill.name}"`);

  // Check every file once, whatever the folders: a path that stays inside one skill folder stays inside all.
  const base = resolve(sep, "skill");
  const files = [];
  for (const file of skill.files) {
    checkPath(base, file.path);
    const body = Buffer.from(await (await get(file.url)).arrayBuffer());
    const sha256 = createHash("sha256").update(body).digest("hex");
    if (sha256 !== file.sha256) throw new Error(`${SITE}${file.url}: sha256 ${sha256}, index.json says ${file.sha256}`);
    files.push([file.path, body]);
  }

  for (const target of targets) {
    if (scope === "project") assertOwnProject(project, target.root);
  }
  for (const target of targets) {
    const dest = await installInto(target.root, skill, files);
    updated.push(dest);
    console.log(`SKILL_INSTALLED ${skill.name} ${skill.version} ${shown(dest)}`);
  }
  // Each client once: Amp, Hermes and OpenClaw have a folder of their own as well as the shared one.
  const listed = new Set();
  const readers = targets
    .map((t) => t.readers.filter((label) => !listed.has(label) && listed.add(label)).join(", "))
    .filter(Boolean)
    .join("; ");
  console.log(
    scope === "project"
      ? `SKILL_SCOPE project: only sessions started inside ${shown(project)} can use it (installed for ${readers}). --scope user installs it for every folder on this computer account.`
      : `SKILL_SCOPE user: any session on this computer account can use it, in any folder (installed for ${readers}). --scope project installs it for one project only.`,
  );
}

// Control characters in a name (C0 and C1, line and paragraph separators, bidi and zero-width marks) are shown as
// "?" so an odd folder name can't change what the output says or forge a line of it.
const shown = (text) => text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, "?");

main().catch((error) => {
  // A later folder can fail after an earlier one was replaced: say so, so no one reports it as not installed.
  const already = updated.length === 0 ? "" : ` (already installed in: ${updated.map(shown).join(", ")})`;
  console.error(`SKILL_INSTALL_FAILED ${shown(String(error.message))}${already}`);
  process.exitCode = 1;
});
