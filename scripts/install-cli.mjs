#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CLI_VERSION = "1.6.4";
const names = ["tinycloud", "tc"];
const marker = ":: TinyCloud CLI launcher ";
const real = (file) => { try { return realpathSync(file); } catch { return ""; } };
const present = (file) => { try { lstatSync(file); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } };
const options = (input = {}) => {
  const env = input.env || process.env;
  const platform = input.platform || process.platform;
  return { ...input, env, platform, home: input.home || (platform === "win32" ? env.USERPROFILE || env.HOME : env.HOME) || homedir(), log: input.log || console.log };
};

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.*)?$/;

// SemVer precedence: a release outranks its own prereleases; prerelease fields compare
// numerically when both are numbers, else as text, and a longer list of equal fields is higher.
function precedence(a, b) {
  for (let i = 1; i <= 3; i++) if (Number(a[i]) !== Number(b[i])) return Number(a[i]) - Number(b[i]);
  if (!a[4] || !b[4]) return !a[4] - !b[4];
  const x = a[4].split("."), y = b[4].split(".");
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    const [m, n] = [/^\d+$/.test(x[i]), /^\d+$/.test(y[i])];
    if (m && n) return Number(x[i]) - Number(y[i]);
    return m !== n ? (m ? -1 : 1) : x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
}

// The pinned version or newer: a prerelease of a later version counts, an earlier prerelease of the pin does not.
export function compatible(version, minimum = CLI_VERSION) {
  const match = VERSION.exec(version);
  return !!match && precedence(match, VERSION.exec(minimum)) >= 0;
}

const privatePrefix = (opts) => path.join(opts.home, ".local/share/tinycloud/cli");
// npm installs both names; `tc` prints a rename notice on stderr, so select `tinycloud`.
const privateBin = (opts) => path.join(privatePrefix(opts), "node_modules/.bin", opts.platform === "win32" ? "tinycloud.cmd" : "tinycloud");
const within = (file, directory, platform) => [[file, directory], [real(file), real(directory)]].some(([child, parent]) => {
  if (!child || !parent) return false;
  const relative = platform === "win32" ? path.relative(parent.toLowerCase(), child.toLowerCase()) : path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
});

function powershell(script, env) {
  const prelude = "$ErrorActionPreference = 'Stop'\n[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)\n";
  const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(prelude + script, "utf16le").toString("base64")], { env, encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || "PowerShell failed");
  return result.stdout.trim();
}

function versionOf(bin, opts) {
  if (opts.platform === "win32") {
    return powershell("& $env:TC_INSTALL_EXECUTABLE --version\nif ($LASTEXITCODE -ne 0) { throw 'CLI version check failed' }", { ...opts.env, TC_INSTALL_EXECUTABLE: bin });
  }
  const result = spawnSync(bin, ["--version"], { env: opts.env, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`Cannot run selected CLI: ${bin}`);
  return result.stdout.trim();
}

function ownedTarget(file, platform) {
  const resolved = real(file);
  if (resolved.replaceAll("\\", "/").includes("/node_modules/@tinycloud/cli/")) return file;
  if (platform !== "win32" || !/(?:\.(?:cmd|ps1)|[\\/](?:tc|tinycloud))$/i.test(file)) return null;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return null; }
  const line = text.split(/\r?\n/).find((line) => line.startsWith(marker));
  if (line) {
    try { const target = JSON.parse(Buffer.from(line.slice(marker.length), "base64").toString("utf8")); return typeof target === "string" && target !== file ? target : null; } catch { return null; }
  }
  // npm's Windows shims are regular files rather than symlinks.
  const manifest = path.join(path.dirname(file), "node_modules/@tinycloud/cli/package.json");
  const privateManifest = path.join(path.dirname(file), "../@tinycloud/cli/package.json");
  if (!/[@]tinycloud[\\/]cli[\\/]/.test(text)) return null;
  for (const candidate of [manifest, privateManifest]) {
    if (existsSync(candidate) && JSON.parse(readFileSync(candidate, "utf8")).name === "@tinycloud/cli") return file;
  }
  return null;
}

// Use the npm package entry directly on Windows: no cmd.exe argument interpolation.
// Unknown owner-supplied batch wrappers are intentionally not parsed as npm shims.
export function cliInvocation(bin, args, platform = process.platform) {
  if (platform !== "win32") return { file: bin, args };
  const visited = new Set();
  while (/\.(cmd|ps1)$/i.test(bin)) {
    if (visited.has(bin)) throw new Error("Cyclic TinyCloud launcher");
    visited.add(bin);
    const target = ownedTarget(bin, platform);
    if (target && target !== bin) { bin = target; continue; }
    if (target) {
      for (const manifest of [
        path.join(path.dirname(bin), "node_modules/@tinycloud/cli/package.json"),
        path.join(path.dirname(bin), "../@tinycloud/cli/package.json"),
      ]) {
        if (!existsSync(manifest)) continue;
        const pkg = JSON.parse(readFileSync(manifest, "utf8"));
        if (pkg.name !== "@tinycloud/cli") continue;
        const entry = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.tc || pkg.bin?.tinycloud;
        if (typeof entry !== "string") continue;
        return { file: process.execPath, args: [path.resolve(path.dirname(manifest), entry), ...args] };
      }
    }
    throw new Error("Use the TinyCloud npm executable or its JavaScript entry for Windows agent commands; custom batch wrappers cannot safely forward arbitrary arguments");
  }
  return /\.(?:mjs|cjs|js)$/i.test(bin) ? { file: process.execPath, args: [bin, ...args] } : { file: bin, args };
}

function sameCli(first, second, platform) {
  const left = real(first);
  const right = real(second);
  if (left && right && (platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right)) return true;
  if (platform !== "win32" || !ownedTarget(first, platform) || !ownedTarget(second, platform)) return false;
  // npm emits tc.cmd, tinycloud.cmd and .ps1 siblings for the same package.
  return path.dirname(first).toLowerCase() === path.dirname(second).toLowerCase();
}

export function commandFiles(name, opts) {
  const windows = opts.platform === "win32";
  const delimiter = windows ? ";" : ":";
  const extensions = windows ? [...new Set(["", ...(opts.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").toLowerCase().split(";"), ".ps1"])] : [""];
  const directories = (opts.searchPath ?? opts.env.PATH ?? opts.env.Path ?? "").split(delimiter).map((dir) => dir.replace(/^"|"$/g, ""));
  if (windows) directories.unshift(process.cwd());
  const files = [];
  for (const directory of directories) {
    for (const extension of extensions) {
      const file = path.resolve(directory || ".", name + extension);
      if (!present(file)) continue;
      if (!windows) { try { accessSync(file, constants.X_OK); } catch { continue; } }
      files.push(file);
    }
  }
  return [...new Set(files)];
}

export function resolveCli(input = {}) {
  const opts = options(input);
  let selected = opts.env.TC_BIN;
  let source = "TC_BIN";
  if (selected === undefined) {
    const helper = path.join(opts.home, ".config/tinycloud/agent-env.mjs");
    const saved = opts.env.TC_AGENT_ENV || path.join(opts.home, ".config/tinycloud/agent.env");
    if (present(saved) && !existsSync(helper)) throw new Error("Saved CLI selection exists but the /agent data-only helper is missing; repair /agent first");
    if (existsSync(helper)) {
      const result = spawnSync(process.execPath, [helper, "get", "TC_BIN"], { env: opts.env, encoding: "utf8" });
      if (result.status !== 0 && result.status !== 1) throw new Error(result.stderr.trim() || "Unsafe saved CLI selection");
      if (result.status === 0) { selected = result.stdout.trim(); source = "agent-env"; }
    }
  }
  // A path into the private install is the agent's own copy, not an operator boundary, whether it was
  // saved in agent.env or exported (as /cli's PowerShell flow does): it is selected and upgraded like the private install.
  if (selected !== undefined && path.isAbsolute(selected) && within(selected, privatePrefix(opts), opts.platform)) selected = undefined;
  if (selected !== undefined) {
    if (!path.isAbsolute(selected) || /[\x00-\x1f]/.test(selected)) throw new Error("TC_BIN must be an absolute executable path");
    const version = versionOf(selected, opts);
    if (!VERSION.test(version)) throw new Error(`Selected CLI at ${selected} reports "${version}", not a TinyCloud CLI version. Preserve TC_BIN and fix that installation explicitly.`);
    // An operator selection is kept even when older than the pin; installCli reports it.
    return { bin: selected, version, source };
  }
  if (opts.platform === "win32" && opts.searchPath === undefined) {
    const persistent = windowsPaths(opts.env);
    opts.searchPath = [opts.env.PATH || opts.env.Path, persistent.machine, persistent.user].filter(Boolean).join(";");
    opts.searchPath = opts.searchPath.replace(/%([^%]+)%/g, (all, name) => Object.entries(opts.env).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? all);
  }
  const candidates = [privateBin(opts), ...names.flatMap((name) => commandFiles(name, opts))];
  for (const candidate of [...new Set(candidates)]) {
    if (!existsSync(candidate)) continue;
    if (opts.platform === "win32" && !/\.(?:cmd|exe|com)$/i.test(candidate)) continue;
    const target = ownedTarget(candidate, opts.platform);
    if (!target) continue;
    const version = versionOf(target, opts);
    // The agent's own private copy is selected at any version so installCli upgrades it in place;
    // another CLI on PATH is reused only at the pin or newer.
    if (candidate === privateBin(opts) ? VERSION.test(version) : compatible(version)) return { bin: target, version, source: candidate === privateBin(opts) ? "private" : "PATH" };
  }
  return null;
}

export function appendUserPath(current, directory, env = process.env) {
  const key = (value) => path.win32.normalize(value.trim().replace(/^"|"$/g, "").replace(/%([^%]+)%/g, (all, name) => Object.entries(env).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? all)).replace(/[\\/]+$/, "").toLowerCase();
  if ((current || "").split(";").some((entry) => key(entry) === key(directory))) return current || "";
  return `${current || ""}${current && !current.endsWith(";") ? ";" : ""}${directory}`;
}

export function windowsPaths(env = process.env) {
  return JSON.parse(powershell(`$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')
try { $userPath = if ($key) { [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } else { '' } }
finally { if ($key) { $key.Close() } }
@{ user = $userPath; machine = [Environment]::GetEnvironmentVariable('Path', 'Machine') } | ConvertTo-Json -Compress`, env));
}

export function repairWindowsPath(input = {}) {
  const opts = options(input);
  if (opts.platform !== "win32") throw new Error("--repair-path is Windows-only");
  const directory = path.join(opts.home, ".local/bin");
  const current = windowsPaths(opts.env).user;
  const next = appendUserPath(current, directory, opts.env);
  // Refuse detected intervening edits instead of writing a stale user PATH.
  const updated = powershell(`$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
try {
  $old = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  if ($old -cne [string]$env:TC_INSTALL_OLD_PATH) { throw 'User PATH changed concurrently; rerun the installer' }
  $found = $old -ceq [string]$env:TC_INSTALL_NEW_PATH
  if (-not $found) {
    $kind = if ($key.GetValueNames() -contains 'Path') { $key.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
    $key.SetValue('Path', [string]$env:TC_INSTALL_NEW_PATH, $kind)
  }
} finally { $key.Close() }
# Notify Explorer and other environment-aware launchers. Existing terminals retain their old PATH.
Add-Type -Namespace TinyCloud -Name EnvironmentNotice -MemberDefinition '[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Auto, SetLastError = true)] public static extern System.IntPtr SendMessageTimeout(System.IntPtr hWnd, uint Msg, System.UIntPtr wParam, string lParam, uint flags, uint timeout, out System.UIntPtr result);'
$result = [UIntPtr]::Zero
[void][TinyCloud.EnvironmentNotice]::SendMessageTimeout([IntPtr]0xffff, 0x1a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)
if ($found) { 'TC_PATH_READY' } else { 'TC_PATH_UPDATED' }`, { ...opts.env, TC_INSTALL_OLD_PATH: current, TC_INSTALL_NEW_PATH: next });
  opts.log(updated);
  opts.log('PowerShell (current session): $env:Path += ";$env:USERPROFILE\\.local\\bin"');
  opts.log('cmd.exe (current session): set "PATH=%PATH%;%USERPROFILE%\\.local\\bin"');
  opts.log("Restart your terminal application and agent (not only a tab). If the launcher still has an old PATH, sign out of Windows and sign in again.");
}

export function windowsShim(target) {
  if (/[\r\n\x00"]/.test(target)) throw new Error("Unsupported Windows executable path");
  const command = `${/\.ps1$/i.test(target) ? 'powershell.exe -NoProfile -File ' : ''}"${target.replaceAll("%", "%%")}" %*`;
  return `@echo off\r\n${marker}${Buffer.from(JSON.stringify(target)).toString("base64")}\r\nsetlocal DisableDelayedExpansion\r\n${command}\r\n`;
}

export function linkCommands(selected, input = {}) {
  const opts = options(input);
  const windows = opts.platform === "win32";
  const directory = path.join(opts.home, ".local/bin");
  const onPath = (opts.env.PATH || opts.env.Path || "").split(windows ? ";" : ":").includes(directory);
  if (windows || onPath) mkdirSync(directory, { recursive: true });
  for (const name of names) {
    const destination = path.join(directory, name + (windows ? ".cmd" : ""));
    // Check every location, including Windows persistent PATH and Linux traffic control
    // outside a non-admin PATH. Appending our directory must not claim someone else's name.
    const searchPath = [opts.searchPath ?? opts.env.PATH ?? opts.env.Path ?? "", directory].join(windows ? ";" : ":");
    const conflicts = commandFiles(name, { ...opts, searchPath });
    if (!windows && name === "tc") for (const file of ["/usr/sbin/tc", "/sbin/tc"]) if (existsSync(file)) conflicts.push(file);
    if (present(destination) && !conflicts.includes(destination)) conflicts.push(destination);
    let blocked = false;
    let ready = false;
    for (const file of conflicts) {
      const target = ownedTarget(file, opts.platform);
      if (sameCli(target || file, selected.bin, opts.platform)) ready = true;
      else { blocked = true; break; }
    }
    if (blocked) { opts.log(`TC_CONFLICT ${name} other`); continue; }
    if (ready) { opts.log(`TC_READY ${selected.version} ${name}`); continue; }
    if (!windows && !onPath) { opts.log(`TC_CONFLICT ${name} no-path`); continue; }
    try {
      if (windows) writeFileSync(destination, windowsShim(selected.bin), { flag: "wx" });
      else symlinkSync(selected.bin, destination);
      opts.log(`TC_LINKED ${selected.version} ${destination}`);
    } catch (error) {
      opts.log(`TC_CONFLICT ${name} link (${error.code || error.message})`);
    }
  }
}

// What installCli keeps: an operator selection at any version, else the private copy or a PATH CLI at the pin or
// newer. Null means it installs the pin into the private prefix, which must then hold nothing unrelated.
// /cli's blocked-install fallback asks the same question (--needs-install) before it runs that npm install
// itself, so it never downgrades a newer copy or installs over another package.
export function keptCli(input = {}) {
  const opts = options(input);
  const selected = resolveCli(opts);
  if (selected && compatible(selected.version)) return selected;
  // Never modify an operator's binary. An older private copy is upgraded in place; an older PATH CLI stays untouched beside the new private copy.
  if (selected && (selected.source === "TC_BIN" || selected.source === "agent-env")) {
    opts.log(`TC_OLDER ${selected.version} ${selected.bin} is older than the pinned ${CLI_VERSION}; keeping this operator-selected CLI`);
    return selected;
  }
  const prefix = privatePrefix(opts);
  for (const name of names) {
    for (const extension of opts.platform === "win32" ? ["", ".cmd", ".ps1"] : [""]) {
      const file = path.join(prefix, "node_modules/.bin", name + extension);
      if (present(file) && !ownedTarget(file, opts.platform)) throw new Error(`Unrelated private executable exists: ${file}`);
    }
  }
  const manifest = path.join(prefix, "node_modules/@tinycloud/cli/package.json");
  if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name !== "@tinycloud/cli") throw new Error("Unrelated package occupies the private CLI directory");
  const project = path.join(prefix, "package.json");
  const others = existsSync(project) ? Object.keys(JSON.parse(readFileSync(project, "utf8")).dependencies || {}).filter((name) => name !== "@tinycloud/cli") : [];
  if (others.length) throw new Error(`Unrelated packages occupy the private CLI directory: ${others.join(", ")}`);
  return null;
}

export function installCli(input = {}) {
  const opts = options(input);
  if (opts.platform === "win32") {
    const persistent = windowsPaths(opts.env);
    opts.searchPath = [opts.env.PATH || opts.env.Path, persistent.machine, persistent.user].filter(Boolean).join(";");
    opts.searchPath = opts.searchPath.replace(/%([^%]+)%/g, (all, name) => Object.entries(opts.env).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? all);
  }
  let selected = keptCli(opts);
  if (!selected) {
    const prefix = privatePrefix(opts);
    mkdirSync(prefix, { recursive: true });
    // --save-exact: the private package.json records the pin itself, as /cli's blocked-install fallback writes it.
    if (opts.platform === "win32") {
      powershell("& $env:TC_INSTALL_NPM install --prefix $env:TC_INSTALL_PREFIX --save-exact --no-audit --no-fund $env:TC_INSTALL_PACKAGE\nif ($LASTEXITCODE -ne 0) { throw 'npm install failed' }", { ...opts.env, TC_INSTALL_NPM: path.join(path.dirname(process.execPath), "npm.cmd"), TC_INSTALL_PREFIX: prefix, TC_INSTALL_PACKAGE: `@tinycloud/cli@${CLI_VERSION}` });
    } else {
      const result = spawnSync("npm", ["install", "--prefix", prefix, "--save-exact", "--no-audit", "--no-fund", `@tinycloud/cli@${CLI_VERSION}`], { env: opts.env, stdio: "inherit" });
      if (result.error || result.status !== 0) throw new Error("npm install failed");
    }
    const bin = privateBin(opts);
    const version = versionOf(bin, opts);
    if (version !== CLI_VERSION) throw new Error(`Installed CLI version ${version} does not match ${CLI_VERSION}`);
    selected = { bin, version, source: "installed" };
  }
  opts.log(`TC_SELECTED ${JSON.stringify(selected)}`);
  // One saved location: where /agent installed its data-only helper, agent.env names the agent's own
  // selection for later sessions. An operator selection (process or saved TC_BIN) is never rewritten, and a
  // process TC_BIN, even one demoted to the private install, leaves agent.env alone: it may hold an operator's path.
  const helper = path.join(opts.home, ".config/tinycloud/agent-env.mjs");
  if (opts.env.TC_BIN === undefined && selected.source !== "agent-env" && existsSync(helper)) {
    const saved = spawnSync(process.execPath, [helper, "get", "TC_BIN"], { env: opts.env, encoding: "utf8" });
    if (saved.status !== 0 && saved.status !== 1) throw new Error(saved.stderr.trim() || "Unsafe saved CLI selection");
    if (saved.status === 1 || saved.stdout.trim() !== selected.bin) {
      const result = spawnSync(process.execPath, [helper, "set", "TC_BIN", selected.bin], { env: opts.env, encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr.trim() || "Cannot save the selected CLI in agent.env");
    }
  }
  linkCommands(selected, opts);
  if (opts.platform === "win32") {
    try { repairWindowsPath(opts); }
    catch (error) { opts.log(`TC_PATH_FAILED ${error.message}`); opts.log('After fixing registry permissions, rerun the downloaded Node installer with --repair-path'); throw error; }
  }
  return selected;
}

if (process.argv[1] && real(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, ...rest] = process.argv.slice(2);
    if (rest.length || (action && !["--resolve", "--repair-path", "--needs-install"].includes(action))) throw new Error("Usage: node install-cli.mjs [--resolve|--repair-path|--needs-install]");
    if (action === "--resolve") {
      const selected = resolveCli();
      if (selected) console.log(selected.bin);
      else process.exitCode = 1;
    } else if (action === "--needs-install") {
      // Exit 0: the pin goes into the private prefix; exit 1: a CLI the installer keeps is already there. Changes nothing.
      const kept = keptCli();
      if (kept) { console.log(`TC_INSTALL_NOT_NEEDED ${kept.version} ${kept.bin}`); process.exitCode = 1; }
      else console.log(`TC_INSTALL_NEEDED ${CLI_VERSION} ${privatePrefix(options())}`);
    } else if (action === "--repair-path") repairWindowsPath();
    else installCli();
  } catch (error) {
    console.error(`TC_INSTALL_FAILED ${error.message}`);
    process.exitCode = 2;
  }
}
