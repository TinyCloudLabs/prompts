// Installs one TinyCloud agent skill from agents.tinycloud.xyz for the agent clients you name.
// Every file is checked against its sha256 in /skills/index.json before anything
// is written, then the skill folder is replaced as a whole.
//
//   mkdir -p "$HOME/.local/share/tinycloud" && curl -fsSL -o "$HOME/.local/share/tinycloud/install.js" https://agents.tinycloud.xyz/skills/install.js
//   node "$HOME/.local/share/tinycloud/install.js" <skill> --agent <client[,client…]|auto> [--scope user|project]
//
// <skill> is a short name from /skills/index.json (apps, secrets, publish, cli,
// courier, chat, mcp) or the skill's own name (tc-apps, …). Each client reads skills from
// the folders in FOLDERS below; most read the shared ".agents/skills" folder, so naming several
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
const { dirname, isAbsolute, join, relative: relativePath, resolve, sep } = require("node:path");

const SITE = "https://agents.tinycloud.xyz";
// The skill folders clients read (docs per client: README "Skill folders"). "shared" is the ".agents/skills"
// convention; Claude Code does not read it, so it has its own folder. Hermes reads neither without its
// own config, so it uses "agents" plus the config step in setup/connect/hermes.md.
const claudeConfigDir = () => process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude");
const FOLDERS = {
  shared: {
    readers: "Codex, Gemini CLI, Cursor, OpenCode, OMP, GitHub Copilot, Amp and OpenClaw",
    user: () => join(homedir(), ".agents", "skills"),
    project: (project) => join(project, ".agents", "skills"),
  },
  claude: { readers: "Claude Code", user: () => join(claudeConfigDir(), "skills"), project: (project) => join(project, ".claude", "skills") },
};
// For each client, alphabetical (no client is the default): the folder it reads, and the folder whose presence
// means it is installed (for "auto").
const CLIENTS = {
  amp: { folder: "shared", present: () => join(homedir(), ".config", "amp") },
  "claude-code": { folder: "claude", present: claudeConfigDir },
  codex: { folder: "shared", present: () => join(homedir(), ".codex") },
  copilot: { folder: "shared", present: () => join(homedir(), ".copilot") },
  cursor: { folder: "shared", present: () => join(homedir(), ".cursor") },
  gemini: { folder: "shared", present: () => join(homedir(), ".gemini") },
  omp: { folder: "shared", present: () => join(homedir(), ".omp") },
  openclaw: { folder: "shared", present: () => join(homedir(), ".openclaw") },
  opencode: { folder: "shared", present: () => join(homedir(), ".config", "opencode") },
  // Any other client that reads .agents/skills.
  agents: { folder: "shared", present: null },
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
// ".git" in it, else the current folder. A project install never goes into the home folder or the top of the
// disk, where it would be visible to everything for this account.
function projectRoot() {
  let project = resolve(process.cwd());
  for (let up = project; ; up = dirname(up)) {
    if (existsSync(join(up, ".git"))) {
      project = up;
      break;
    }
    if (dirname(up) === up) break;
  }
  // Real paths, so a home reached through a link is still the home.
  const real = (file) => { try { return realpathSync(file); } catch { return resolve(file); } };
  if (real(project) === real(homedir()) || dirname(project) === project) {
    throw new Error("--scope project installs into one project: run it from inside that project's folder, not your home folder or the top of the disk");
  }
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
      throw new Error(`${dir} belongs to another account. Run a project install from a project folder you own.`);
    }
    if (dir === project || dirname(dir) === dir) break;
  }
}

// The folders to write, each with the clients that read it, in the order named.
function pickTargets(agent, scope, project) {
  const auto = agent === "auto";
  const names = auto ? Object.keys(CLIENTS).filter((n) => CLIENTS[n].present && existsSync(CLIENTS[n].present())) : agent.split(",");
  if (auto && names.length === 0) names.push("agents");
  const targets = [];
  for (const name of names) {
    if (!Object.hasOwn(CLIENTS, name)) throw new Error(`no client "${name}". ${USAGE}`);
    const folder = CLIENTS[name].folder;
    const root = resolve(scope === "project" ? FOLDERS[folder].project(project) : FOLDERS[folder].user());
    if (!targets.some((t) => t.root === root)) targets.push({ root, folder });
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
    console.log(`SKILL_INSTALLED ${skill.name} ${skill.version} ${dest}`);
  }
  const readers = targets.map((t) => FOLDERS[t.folder].readers).join("; ");
  console.log(
    scope === "project"
      ? `SKILL_SCOPE project: only sessions started inside ${project} can use it (read by ${readers}). To install it for every folder on this computer account instead, run the installer again with --scope user.`
      : `SKILL_SCOPE user: any session on this computer account can use it, in any folder (read by ${readers}). To install it for one project only, run the installer again from that project's folder with --scope project.`,
  );
}

// A permission failure also names the folder that refused the write and the exact fix. The fix is for the owner
// to run, never an agent through sudo, and it is printed only for a folder strictly inside the owner's home (the
// home folder itself gets chmod only). Elsewhere, or for a name with control characters, no command is printed.
// The CLI works without the skill, so setup goes on.
const CONTROL = /[\u0000-\u001f\u007f]/;
const shown = (text) => text.replace(/[\u0000-\u001f\u007f]/g, "?");
function permissionFix(error) {
  if (!["EACCES", "EPERM", "EROFS"].includes(error?.code) || typeof error.path !== "string") return [];
  let folder = error.path;
  while (!existsSync(folder) && dirname(folder) !== folder) folder = dirname(folder);
  const again = "SKILL_FIX then run the same command again; it is safe to repeat. The CLI works without the skill.";
  // Real paths (symlinks resolved), so a folder that links out of the home gets no command.
  const real = (file) => { try { return realpathSync(file); } catch { return resolve(file); } };
  const home = real(homedir());
  const relative = relativePath(home, real(folder));
  const isHome = relative === "";
  const inside = relative !== "" && !relative.startsWith("..") && !isAbsolute(relative);
  const windows = process.platform === "win32";
  if (CONTROL.test(folder) || (!inside && !isHome) || (windows && isHome)) {
    return [`SKILL_FIX ${shown(folder)} refused the write; ask the person who manages this computer to give your user write access to it`, again];
  }
  if (windows) {
    return [`SKILL_FIX ${folder} refused the write; in PowerShell run: icacls '${folder.replace(/'/g, "''")}' /grant "\${env:USERNAME}:(OI)(CI)F" /T`, again];
  }
  const quoted = `'${folder.replace(/'/g, "'\\''")}'`;
  const other = isHome ? "" : `   (if it belongs to another user: sudo chown -R "$USER" ${quoted})`;
  return [`SKILL_FIX ${folder} refused the write; run this yourself: chmod u+rwx ${quoted}${other}`, again];
}

main().catch((error) => {
  // A later folder can fail after an earlier one was replaced: say so, so no one reports it as not installed.
  const already = updated.length === 0 ? "" : ` (already installed in: ${updated.map(shown).join(", ")})`;
  console.error(`SKILL_INSTALL_FAILED ${shown(String(error.message))}${already}`);
  for (const line of permissionFix(error)) console.error(line);
  process.exitCode = 1;
});
