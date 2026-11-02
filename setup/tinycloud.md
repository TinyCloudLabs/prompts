# Set up the TinyCloud CLI

This module installs and verifies only the TinyCloud CLI and its core skill, `tinycloud-cli`. The preferred command is `tinycloud`; `tc` is also available when no unrelated command owns that name. On Linux, leave the system traffic-control `tc` alone. Every guide needs **@tinycloud/cli 1.6.0**: new installs and older agent-owned installs get it; an operator-selected CLI is kept, and a newer one is never downgraded. App hosts, spaces, profiles, permissions and behavior belong in the calling guide.

## For the owner

- **What it does:** installs `1.6.0` into `~/.local/share/tinycloud/cli`, or upgrades an older copy there, unless you selected a CLI with `TC_BIN` (kept as is) or a newer one is present; then it installs the `tinycloud-cli` skill. Windows gets non-overwriting launchers in `%USERPROFILE%\.local\bin` when names are free, and a safe append to your user PATH. Unix links free names only when `~/.local/bin` is already on PATH. Unrelated commands are left alone.
- **Paste into an agent that can run shell commands:** `Set up the TinyCloud CLI: https://agents.tinycloud.xyz/cli`. `/chat`, `/apps`, `/publish`, `/secrets` and `/courier` use this shared selection instead of installing an app-specific CLI.
- **You approve:** nothing. It doesn't sign in or request any access.
- **Then:** in a new terminal, `tinycloud --help` lists the commands.
- **Undo:** see [Undo](#undo).

## Caller contract

**Read this page raw first.** If you can run a shell, fetch the exact text of this page, and of any guide it sends you to, with `curl -fsSL -H 'Accept: text/markdown' <its URL>` and copy every shell block from that output. A web-fetch tool that summarizes pages drops or rewrites the blocks, and they only work exactly as written.

**Send links exactly as printed.** Send the owner every link exactly as the CLI printed it, copied from the output: never retype, shorten or rebuild it.

Before starting, retain all of the following from the caller:

- the user's original task;
- the selected client: `opencode`, `codex` or `claude-code` (any other agent: `codex`);
- the calling app guide and its exact return heading.

After the checks below pass, return directly to that heading and continue the original task in the same conversation. Do not ask the user to paste another prompt. If the owner sent you this page directly, there is no calling guide: report the result to them when you finish.

## Requirements

Use Node.js **20 or later** (the CLI's own requirement) and npm, the same as the app guides that call this module.

Set `CLIENT` conceptually to the current agent client: `opencode`, `codex` or `claude-code` (any other agent: `codex`). Do not apply app-specific OpenCode restrictions here.

## Install the CLI

Use the reusable platform-aware installer below. It respects process `TC_BIN` first, then a saved `TC_BIN` read by the data-only helper installed by [/agent](agent.md), then the private installation, then a CLI on PATH at `1.6.0` or newer. An operator selection is kept, never silently replaced; one older than `1.6.0` prints `TC_OLDER`. A `TC_BIN`, exported or saved, that points inside `~/.local/share/tinycloud/cli` (on Windows `%USERPROFILE%\.local\share\tinycloud\cli`) is the agent's own private copy, not an operator selection: it is upgraded like the private install and selected as `node_modules/.bin/tinycloud`. A private or PATH CLI older than `1.6.0` is not reused: the installer upgrades its own copy in `~/.local/share/tinycloud/cli` and leaves a PATH CLI untouched. A newer CLI is never downgraded. It never installs into npm's global prefix. When /agent's helper is installed, the installer also saves its own selection in `~/.config/tinycloud/agent.env`, the one saved CLI location every skill reads; it never rewrites an operator's `TC_BIN`.

Download the installer, then run it as a **separate shell call**. Do not retype or shorten its implementation, pipe a download into a shell, or use PowerShell's `Invoke-Expression`.

**PowerShell (Windows):**

```powershell
$installer = Join-Path $env:USERPROFILE ".local\share\tinycloud\install-cli.mjs"
New-Item -ItemType Directory -Force (Split-Path -Parent $installer) | Out-Null
Invoke-WebRequest https://agents.tinycloud.xyz/install-cli.mjs -OutFile $installer
```

In the next call:

```powershell
$installer = Join-Path $env:USERPROFILE ".local\share\tinycloud\install-cli.mjs"
node $installer
if ($LASTEXITCODE -ne 0) { throw "TinyCloud installation failed; inspect the error above." }
$env:TC_BIN = (node $installer --resolve)
if ($LASTEXITCODE -ne 0) { throw "TinyCloud selection failed." }
$env:Path += ";$env:USERPROFILE\.local\bin"
```

**macOS/Linux or a POSIX shell:**

```sh
mkdir -p "$HOME/.local/share/tinycloud" && curl -fsSL -o "$HOME/.local/share/tinycloud/install-cli.sh" https://agents.tinycloud.xyz/skills/install-cli.sh
```

In the next call:

```sh
sh "$HOME/.local/share/tinycloud/install-cli.sh"
```

This POSIX entry point downloads and runs the same `/install-cli.mjs` implementation; it has no separate CLI version or installation policy.

`TC_SELECTED {"bin":"…","version":"…","source":"…"}` identifies the selected executable (for the private install, `node_modules/.bin/tinycloud`); retain that absolute path as `TC_BIN` when returning to the caller. `TC_OLDER <version> <path> …` means the operator selected a CLI outside the private install that is older than `1.6.0`: don't replace it, and return to the calling guide, which says what to do; without a calling guide, tell the owner in one line that it is older than the required `1.6.0`. The downloaded Node installer accepts `--resolve` to print only an existing selected path (exit 1 means absent; exit 2 means invalid/unsafe), without installing, upgrading or changing PATH.

For each command name:

- `TC_READY <version> <name>` means the selected CLI is already available under that name.
- `TC_LINKED <version> <path>` means the installer created that link or Windows launcher.
- `TC_CONFLICT <name> other` means another executable or a different CLI installation owns the name. It is not replaced or shadowed; use `TC_BIN` instead. Shell-local aliases/functions are outside a child process's visibility: inspect `Get-Command tinycloud,tc -All` in PowerShell or `command -v tinycloud tc` in your Unix shell if resolution differs.
- `TC_CONFLICT <name> no-path` is Unix-only. Add `export PATH="$HOME/.local/bin:$PATH"` to your shell profile (`~/.bashrc`, `~/.zshrc` or `~/.profile`), open a new terminal, start your agent from it, and rerun this module. The rerun still leaves unrelated commands alone.
- `TC_CONFLICT <name> link` means the destination could not be created. Report the conflict and use the selected absolute path.
- `TC_INSTALL_FAILED` means selection, installation, verification or the Windows PATH update failed. Stop and report the actual error; do not retry with `sudo`, administrator privileges or another CLI version.

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

Mention command-name conflicts to the owner in one line and continue with the core skill only after successful selection and installation. Never remove an unrelated command to make room for TinyCloud.

## Install the core skill

Inspect an existing `tinycloud-cli/SKILL.md` before replacing it. The usual path is `$HOME/.agents/skills/tinycloud-cli/SKILL.md` for OpenCode and Codex or `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tinycloud-cli/SKILL.md` for Claude Code. Reuse files matching the `cli` entry, version `1.6.0`, in `https://agents.tinycloud.xyz/skills/index.json`. Do not overwrite unrelated or locally modified files. An older managed `tc-cli` skill has a different name: retire that obsolete folder only after checking it is an unmodified TinyCloud-installed skill, so both versions are not loaded.

This step is required: the skill is how you know the CLI's commands. If the skill is missing or is a replaceable mismatch, download the skill installer, then run it, as two separate shell calls:

```sh
mkdir -p "$HOME/.local/share/tinycloud" && curl -fsSL -o "$HOME/.local/share/tinycloud/install.js" https://agents.tinycloud.xyz/skills/install.js
```

```sh
node "$HOME/.local/share/tinycloud/install.js" cli --agent CLIENT
```

In native PowerShell, download the same installer rather than relying on the `curl` alias or a JavaScript pipeline:

```powershell
$skillInstaller = Join-Path $env:USERPROFILE ".local\share\tinycloud\install.cjs"
New-Item -ItemType Directory -Force (Split-Path -Parent $skillInstaller) | Out-Null
Invoke-WebRequest https://agents.tinycloud.xyz/skills/install.js -OutFile $skillInstaller
```

In the next call:

```powershell
$skillInstaller = Join-Path $env:USERPROFILE ".local\share\tinycloud\install.cjs"
node $skillInstaller cli --agent CLIENT
if ($LASTEXITCODE -ne 0) { throw "Core skill installation failed." }
```

The installer downloads `tinycloud-cli` from `@tinycloud/cli@1.6.0` with this site's pinned resolver overlay and checks every file against `/skills/index.json`. Its shell blocks read process `TC_BIN` first, then the data-only `agent.env` selection, then the private installation before global npm. It replaces only `tinycloud-cli` and prints `SKILL_INSTALLED tinycloud-cli 1.6.0 <folder>`; any failure stops setup.

These commands target the named CLI package and named skill. Preserve unrelated npm packages, skills, agent configuration and model/provider settings.

## Verify and return

Verify the selected absolute path from `TC_SELECTED`: `"<TC_BIN>" --version` in POSIX or `& "<TC_BIN>" --version` in PowerShell. New and upgraded installs report `1.6.0`; a newer or operator-selected CLI keeps its version. A selection that reports no version is an error, never replaced. If `tinycloud` was `TC_READY` or `TC_LINKED`, verify `tinycloud --version` after refreshing PATH or restarting the terminal. Check the selected client's `tinycloud-cli/SKILL.md` is readable and matches the pinned skill. Do not sign in, choose a profile or host, or request permissions here.

Return to the exact recorded app-guide heading and continue there without another user prompt.

## Undo

Delete only the links or `.cmd` launchers reported by `TC_LINKED`, after checking they still target the selected executable. Remove the private installation only if this module installed it, its downloaded installer files, and the `tinycloud-cli` skill folder if no longer wanted. Keep owner-selected or pre-existing global installations. On Windows, remove `%USERPROFILE%\.local\bin` from **user PATH** only if no other tools use it; never replace the whole PATH. Removing these files does not sign out or delete stored data.
