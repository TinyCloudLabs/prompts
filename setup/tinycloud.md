> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/cli` and follow that text. Summaries drop the shell blocks you must run.

# Set up the TinyCloud CLI

This module installs and verifies the TinyCloud CLI, then attempts its optional core skill, `tinycloud-cli`. The preferred command is `tinycloud`; `tc` is also available when no unrelated command owns that name. On Linux, leave the system traffic-control `tc` alone. Every guide needs **@tinycloud/cli 1.6.2**: new installs and older agent-owned installs get it; an operator-selected CLI is kept, and a newer one is never downgraded. App hosts, spaces, profiles, permissions and behavior belong in the calling guide.

## For the owner

- **What it does:** installs `1.6.2` into `~/.local/share/tinycloud/cli`, or upgrades an older copy there, unless you selected a CLI with `TC_BIN` (kept as is) or a newer one is present; then it attempts the optional `tinycloud-cli` skill. Windows gets non-overwriting launchers in `%USERPROFILE%\.local\bin` when names are free, and a safe append to your user PATH. Unix links free names only when `~/.local/bin` is already on PATH. Unrelated commands are left alone.
- **Paste into an agent that can run shell commands:** `Fetch https://agents.tinycloud.xyz/cli with curl and follow it, including running its installer. Set up the TinyCloud CLI.` `/chat`, `/apps`, `/publish`, `/secrets` and `/courier` use this shared selection instead of installing an app-specific CLI.
- **If your agent app blocks the install:** your agent sends you one line naming the npm package and the folder. Reply "Go ahead: install the TinyCloud CLI" and it installs it once more; if that fails too, it stops and tells you.
- **You approve:** nothing. It doesn't sign in or request any access.
- **Then:** use `tinycloud --help` or the verified `TC_BIN` path. Skill installation status is reported separately from CLI readiness.
- **Undo:** see [Undo](#undo).

## Caller contract

{{std:read-raw}}

**Upgrades go through this guide.** Upgrading the CLI is part of the owner's request: don't ask first; at most one short line ("Updating the TinyCloud CLI."). Never run `tinycloud upgrade` or a global npm install of the TinyCloud CLI; the guide's installer (/cli) handles upgrades.

Before starting, retain all of the following from the caller:

- the user's original task;
- the selected client: `opencode`, `codex` or `claude-code` (any other agent: `codex`);
- the calling app guide and its exact return heading;
- the action skill that guide installs, if it names one (for example `apps`, `courier` or `chat`), so the run call below installs it too.

After the checks below pass, return directly to that heading and continue the original task in the same conversation. Do not ask the user to paste another prompt. If the owner sent you this page directly, there is no calling guide: report the result to them when you finish.

## Requirements

Use Node.js **20 or later** (the CLI's own requirement) and npm, the same as the app guides that call this module.

Set `CLIENT` conceptually to the current agent client: `opencode`, `codex` or `claude-code` (any other agent: `codex`). Do not apply app-specific OpenCode restrictions here.

## Install the CLI

Use the reusable platform-aware installer below. It respects process `TC_BIN` first, then a saved `TC_BIN` read by the data-only helper installed by [/agent](agent.md), then the private installation, then a CLI on PATH at `1.6.2` or newer. An operator selection is kept, never silently replaced; one older than `1.6.2` prints `TC_OLDER`. A `TC_BIN`, exported or saved, that points inside `~/.local/share/tinycloud/cli` (on Windows `%USERPROFILE%\.local\share\tinycloud\cli`) is the agent's own private copy, not an operator selection: it is upgraded like the private install and selected as `node_modules/.bin/tinycloud`. A private or PATH CLI older than `1.6.2` is not reused: the installer upgrades its own copy in `~/.local/share/tinycloud/cli` and leaves a PATH CLI untouched. A newer CLI is never downgraded. It never installs into npm's global prefix. When /agent's helper is installed, the installer also saves its own selection in `~/.config/tinycloud/agent.env`, the one saved CLI location every skill reads; it never rewrites an operator's `TC_BIN`.

**Codex sandbox:** If Codex's default sandbox blocks the CLI install because it cannot access the network or write outside the workspace, rerun the same CLI installation shell call once using the Codex tool's escalation arguments: `sandbox_permissions: "require_escalated"`, justification `Install the TinyCloud CLI and core skill`, and `yield_time_ms: 30000`. If escalation is unavailable or that attempt fails, stop and report the installation error. Do not ask the owner to restart Codex or rerun `/cli`.

Download both installers in one shell call, then run them in **one separate shell call**: the CLI installer, a best-effort core-skill install, and, if the caller named one, its action skill. A failed core-skill install reports `TC_SKILL_STATUS unavailable` but does not block use of the selected CLI; action-skill failures remain errors. One download call and one run call keep the number of permission prompts low in clients that ask before each network call. Do not retype or shorten an installer's implementation, pipe a download into a shell, or use PowerShell's `Invoke-Expression`.

Before the run call, check the core skill as described in [Install the core skill](#install-the-core-skill), and the action skill as its calling guide says. If the core skill already matches, record `TC_SKILL_STATUS reused` and leave its install line out; leave out the action-skill lines if the caller named none or its skill already matches.

**PowerShell (Windows):**

```powershell
$dir = Join-Path $env:USERPROFILE ".local\share\tinycloud"
New-Item -ItemType Directory -Force $dir | Out-Null
Invoke-WebRequest https://agents.tinycloud.xyz/install-cli.mjs -OutFile (Join-Path $dir "install-cli.mjs")
Invoke-WebRequest https://agents.tinycloud.xyz/skills/install.js -OutFile (Join-Path $dir "install.cjs")
```

In the next call, with `CLIENT` replaced, and `ACTION` replaced by the caller's action skill (or its last two lines deleted):

```powershell
$dir = Join-Path $env:USERPROFILE ".local\share\tinycloud"
$installer = Join-Path $dir "install-cli.mjs"
node $installer
if ($LASTEXITCODE -ne 0) { throw "TinyCloud installation failed; inspect the error above." }
$env:TC_BIN = (node $installer --resolve)
if ($LASTEXITCODE -ne 0) { throw "TinyCloud selection failed." }
$env:Path += ";$env:USERPROFILE\.local\bin"
node (Join-Path $dir "install.cjs") cli --agent CLIENT
if ($LASTEXITCODE -eq 0) {
  Write-Output "TC_SKILL_STATUS installed"
} else {
  Write-Output "TC_SKILL_STATUS unavailable"
}
node (Join-Path $dir "install.cjs") ACTION --agent CLIENT
if ($LASTEXITCODE -ne 0) { throw "Action skill installation failed." }
```

**macOS/Linux or a POSIX shell:**

```sh
mkdir -p "$HOME/.local/share/tinycloud" && curl -fsSL -o "$HOME/.local/share/tinycloud/install-cli.sh" https://agents.tinycloud.xyz/skills/install-cli.sh && curl -fsSL -o "$HOME/.local/share/tinycloud/install.js" https://agents.tinycloud.xyz/skills/install.js
```

In the next call, with `CLIENT` replaced, and `ACTION` replaced by the caller's action skill (or its line deleted, with the `&&` before it):

```sh
sh "$HOME/.local/share/tinycloud/install-cli.sh" &&
if node "$HOME/.local/share/tinycloud/install.js" cli --agent CLIENT; then echo "TC_SKILL_STATUS installed"; else echo "TC_SKILL_STATUS unavailable"; fi &&
node "$HOME/.local/share/tinycloud/install.js" ACTION --agent CLIENT

This POSIX entry point downloads and runs the same `/install-cli.mjs` implementation; it has no separate CLI version or installation policy. The installer prints `SKILL_INSTALLED <name> <version> <folder>` for each successful skill. `TC_SKILL_STATUS installed`, `reused` or `unavailable` records the core-skill result separately; the calling guide skips its own action-skill install only when its skill was installed here.

`TC_SELECTED {"bin":"…","version":"…","source":"…"}` identifies the selected executable (for the private install, `node_modules/.bin/tinycloud`); retain that absolute path as `TC_BIN` when returning to the caller. `TC_OLDER <version> <path> …` means the operator selected a CLI outside the private install that is older than `1.6.2`: don't replace it, and return to the calling guide, which says what to do; without a calling guide, tell the owner in one line that it is older than the required `1.6.2`. The downloaded Node installer accepts `--resolve` to print only an existing selected path (exit 1 means absent; exit 2 means invalid/unsafe), without installing, upgrading or changing PATH.

For each command name:

- `TC_READY <version> <name>` means the selected CLI is already available under that name.
- `TC_LINKED <version> <path>` means the installer created that link or Windows launcher.
- `TC_CONFLICT <name> other` means another executable or a different CLI installation owns the name. It is not replaced or shadowed; use `TC_BIN` instead. Shell-local aliases/functions are outside a child process's visibility: inspect `Get-Command tinycloud,tc -All` in PowerShell or `command -v tinycloud tc` in your Unix shell if resolution differs.
- `TC_CONFLICT <name> no-path` is Unix-only. Add `export PATH="$HOME/.local/bin:$PATH"` to your shell profile (`~/.bashrc`, `~/.zshrc` or `~/.profile`), open a new terminal, start your agent from it, and rerun this module. The rerun still leaves unrelated commands alone.
- `TC_CONFLICT <name> link` means the destination could not be created. Report the conflict and use the selected absolute path.
- `TC_INSTALL_FAILED` means selection, installation, verification or the Windows PATH update failed. Stop and report the actual error; do not retry with `sudo`, administrator privileges or another CLI version.

### If the client blocks the installer

This is for a client that refuses to run an installer call at all (for example Claude Code's auto mode, a permission rule or a sandbox declines the tool call), not for `TC_INSTALL_FAILED`, which stops setup as above. Don't retry the call, rephrase it or run it another way. Send the owner this one line and nothing else, then wait for their reply:

> Claude Code blocked installing the TinyCloud CLI (npm package @tinycloud/cli {{CLI_VERSION}}, into ~/.local/share/tinycloud/cli). Reply "Go ahead: install the TinyCloud CLI" and I'll run it once more.

Name Claude Code only when it is your client. Any other client sends the same line starting "Your agent app blocked installing the TinyCloud CLI" instead.

When the owner replies "Go ahead: install the TinyCloud CLI", download the installer again (the blocked call may have been the download) and ask it with `--needs-install` whether it would install anything. It changes nothing and applies the installer's own rules:

- `TC_INSTALL_NEEDED` (exit 0): install the pinned package yourself, exactly where and how the installer would: the same private folder and its `package.json`, the exact version, never global.
- `TC_INSTALL_NOT_NEEDED <version> <path>` (exit 1): a CLI it keeps is already there, such as a private copy at the pin or newer, or one the operator selected. Skip npm: it would downgrade or replace it.
- `TC_INSTALL_FAILED` (exit 2), for example an unrelated package or command in the private folder: install nothing, and stop as below.

Then run the downloaded Node installer once more. It selects the install (`TC_SELECTED`, for the private install `node_modules/.bin/tinycloud`), saves it in `agent.env` and links the commands, as on a normal run. Run each block as its own shell call.

**macOS/Linux or a POSIX shell:**

```sh
mkdir -p "$HOME/.local/share/tinycloud/cli" && curl -fsSL -o "$HOME/.local/share/tinycloud/install-cli.mjs" https://agents.tinycloud.xyz/install-cli.mjs || exit 1
node "$HOME/.local/share/tinycloud/install-cli.mjs" --needs-install
case $? in
  0) npm install --prefix "$HOME/.local/share/tinycloud/cli" --save-exact @tinycloud/cli@{{CLI_VERSION}} ;;
  1) ;;
  *) exit 2 ;;
esac
```

In the next call:

```sh
node "$HOME/.local/share/tinycloud/install-cli.mjs"
```

**PowerShell (Windows):**

```powershell
$installer = Join-Path $env:USERPROFILE ".local\share\tinycloud\install-cli.mjs"
$prefix = Join-Path $env:USERPROFILE ".local\share\tinycloud\cli"
New-Item -ItemType Directory -Force $prefix | Out-Null
Invoke-WebRequest https://agents.tinycloud.xyz/skills/install.js -OutFile (Join-Path $env:USERPROFILE ".local\share\tinycloud\install.cjs") -ErrorAction Stop
Invoke-WebRequest https://agents.tinycloud.xyz/install-cli.mjs -OutFile $installer -ErrorAction Stop
node $installer --needs-install
if ($LASTEXITCODE -eq 0) {
  npm.cmd install --prefix $prefix --save-exact "@tinycloud/cli@{{CLI_VERSION}}"
  if ($LASTEXITCODE -ne 0) { throw "TinyCloud CLI npm install failed." }
} elseif ($LASTEXITCODE -ne 1) { throw "TinyCloud CLI install check failed; inspect the error above." }
```

In the next call, run the second PowerShell block under [Install the CLI](#install-the-cli) again: it reruns the downloaded installer, which selects the install, then installs the skills as there.

Then read its output as above. If the owner replies anything else, or either call is blocked or fails, stop and report it to the owner in one line. Don't ask again or retry, and don't use `sudo`, administrator privileges, a global install or another version.

### Windows PATH and recovery

The private npm executable is normally `%USERPROFILE%\.local\share\tinycloud\cli\node_modules\.bin\tinycloud.cmd`. The owner-facing launchers are `%USERPROFILE%\.local\bin\tinycloud.cmd` and `tc.cmd`. Existing `TC_BIN`, existing installs and unrelated `.exe`, `.cmd`, `.bat`, `.com` or PowerShell commands are not overwritten.

The installer appends `%USERPROFILE%\.local\bin` to the **user** PATH only if it is absent, retaining existing entries and expandable variables. It never copies the merged process PATH into the registry, never changes machine PATH and never uses `setx` (which can truncate PATH). `TC_PATH_UPDATED` or `TC_PATH_READY` reports success. Windows PATH changes do not update a running terminal or agent.

**Restart the entire terminal application and your agent, not just a terminal tab.** If their launcher still has the old environment, sign out of Windows and sign in again. For the current session only:

```powershell
# PowerShell
$env:Path += ";$env:USERPROFILE\.local\bin"
Get-Command tinycloud,tc -All
tinycloud --version
```

```bat
rem cmd.exe
set "PATH=%PATH%;%USERPROFILE%\.local\bin"
where tinycloud
where tc
tinycloud --version
```

For persistent repair, rerun the installer above; this is safe to repeat. In PowerShell, `node "$env:USERPROFILE\.local\share\tinycloud\install-cli.mjs" --repair-path` uses the downloaded file to repair only the Windows user PATH, without installing or replacing launchers. After `TC_PATH_FAILED`, correct the reported registry/permission problem before retrying.

Before restarting, the absolute path works without PATH (substitute the selected `TC_BIN` if it differs):

```powershell
& "$env:USERPROFILE\.local\share\tinycloud\cli\node_modules\.bin\tinycloud.cmd" --version
```

```bat
"%USERPROFILE%\.local\share\tinycloud\cli\node_modules\.bin\tinycloud.cmd" --version
```

Mention command-name conflicts to the owner in one line. A failed core-skill install does not invalidate the selected CLI; continue using it. Never remove an unrelated command to make room for TinyCloud.

## Install the core skill

Inspect an existing `tinycloud-cli/SKILL.md` before replacing it. The usual path is `$HOME/.agents/skills/tinycloud-cli/SKILL.md` for OpenCode and Codex or `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tinycloud-cli/SKILL.md` for Claude Code. Reuse files matching the `cli` entry, version `1.6.2`, in `https://agents.tinycloud.xyz/skills/index.json`. Do not overwrite unrelated or locally modified files. An older managed `tc-cli` skill has a different name: retire that obsolete folder only after checking it is an unmodified TinyCloud-installed skill, so both versions are not loaded.

This step is optional: it helps agents discover the CLI's commands but is not required to use the selected CLI.

If the skill already matches, record `TC_SKILL_STATUS reused`. Otherwise, try the install. If the installer fails or the client denies the optional install, record `TC_SKILL_STATUS unavailable`; keep using the selected CLI. For Codex in a sandbox, use its documented network approval flow for the same install call once. If that still cannot run, record unavailable and continue; do not ask the owner to restart the client or rerun `/cli`.

### Optional standalone install

If the shared install call did not include this skill, use the already-downloaded `install.js` or download it as described in [Install the CLI](#install-the-cli). Then run:

```sh
if node "$HOME/.local/share/tinycloud/install.js" cli --agent CLIENT; then
  echo "TC_SKILL_STATUS installed"
else
  echo "TC_SKILL_STATUS unavailable"
fi
```

The installer downloads `tinycloud-cli` from `@tinycloud/cli@1.6.2` with this site's pinned resolver overlay and checks every file against `/skills/index.json`. Its shell blocks read process `TC_BIN` first, then the data-only `agent.env` selection, then the private installation before global npm. It replaces only `tinycloud-cli` and prints `SKILL_INSTALLED tinycloud-cli 1.6.2 <folder>` on success.

In native PowerShell, report failure without stopping the selected CLI:

```powershell
node (Join-Path $env:USERPROFILE ".local\share\tinycloud\install.cjs") cli --agent CLIENT
if ($LASTEXITCODE -eq 0) {
  Write-Output "TC_SKILL_STATUS installed"
} else {
  Write-Output "TC_SKILL_STATUS unavailable"
}
```

These commands target the named CLI package and named skill. Preserve unrelated npm packages, skills, agent configuration and model/provider settings.

When `TC_SKILL_STATUS` is unavailable, tell the owner the CLI is ready but the skill could not be installed or verified; never claim the skill is installed. The `/onboarding` caller must continue onboarding with the selected CLI.

Verify that the selected absolute path reports `1.6.2` or the newer/operator-selected version reported by `TC_SELECTED`. If `tinycloud` was `TC_READY` or `TC_LINKED`, verify `tinycloud --version` after refreshing PATH or restarting the terminal. Check `tinycloud-cli/SKILL.md` only when `TC_SKILL_STATUS` is `installed` or `reused`; if status is unavailable, the CLI remains usable but do not claim the skill is installed. Do not sign in, choose a profile or host, or request permissions here.

Return to the exact recorded app-guide heading and continue the original task in the same conversation. Do not ask the owner to restart the flow or paste another prompt.

## Exit codes and owner lines

Every guide and skill on this site carries this same table, three owner lines and the decline question. The installer's `TC_*` lines above are its own.

{{std:errors}}

## Undo

Delete only the links or `.cmd` launchers reported by `TC_LINKED`, after checking they still target the selected executable. Remove the private installation only if this module installed it, its downloaded installer files, and the `tinycloud-cli` skill folder if no longer wanted. Keep owner-selected or pre-existing global installations. On Windows, remove `%USERPROFILE%\.local\bin` from **user PATH** only if no other tools use it; never replace the whole PATH. Removing these files does not sign out or delete stored data.
