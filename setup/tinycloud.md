> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/cli` and follow that text. Summaries drop the shell blocks you must run.

# Set up the TinyCloud CLI

This module installs and verifies the TinyCloud CLI, then attempts its optional core skill, `tinycloud-cli`. The preferred command is `tinycloud`; `tc` is also available when no unrelated command owns that name. On Linux, leave the system traffic-control `tc` alone. Every guide needs **@tinycloud/cli 1.6.6**: new installs and older agent-owned installs get it; an operator-selected CLI is kept, and a newer one is never downgraded. App hosts, spaces, profiles, permissions and behavior belong in the calling guide.

## For the owner

- **What it does:** installs `1.6.6` into `~/.local/share/tinycloud/cli`, or upgrades an older copy there, unless you selected a CLI with `TC_BIN` (kept as is) or a newer one is present; then it attempts the optional `tinycloud-cli` skill. Windows gets non-overwriting launchers in `%USERPROFILE%\.local\bin` when names are free, and a safe append to your user PATH. Unix links free names only when `~/.local/bin` is already on PATH. Unrelated commands are left alone.
- **Paste into an agent that can run shell commands:** `Fetch https://agents.tinycloud.xyz/cli with curl and follow it, including running its installer. Set up the TinyCloud CLI.` `/chat`, `/apps`, `/publish`, `/secrets` and `/courier` use this shared selection instead of installing an app-specific CLI.
- **You approve:** nothing. It doesn't sign in or request any access.
- **Then:** use `tinycloud --help` or the verified `TC_BIN` path. Skill installation status is reported separately from CLI readiness.

## Caller contract

{{std:read-raw}}

**Upgrades go through this guide.** Unless the owner already said yes, ask first in one line ("I need to update the TinyCloud CLI to finish this. OK?") and wait for their yes. Never run `tinycloud upgrade` or a global npm install of the TinyCloud CLI; the guide's installer (/cli) handles upgrades.

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

Use the reusable platform-aware installer below. It respects process `TC_BIN` first, then a saved `TC_BIN` read by the data-only helper installed by [/agent](agent.md), then the private installation, then a CLI on PATH at `1.6.6` or newer. An operator selection is kept, never silently replaced. A `TC_BIN`, exported or saved, that points inside `~/.local/share/tinycloud/cli` (on Windows `%USERPROFILE%\.local\share\tinycloud\cli`) is the agent's own private copy, not an operator selection: it is upgraded like the private install and selected as `node_modules/.bin/tinycloud`. A private or PATH CLI older than `1.6.6` is not reused: the installer upgrades its own copy in `~/.local/share/tinycloud/cli` and leaves a PATH CLI untouched. A newer CLI is never downgraded. It never installs into npm's global prefix. When /agent's helper is installed, the installer also saves its own selection in `~/.config/tinycloud/agent.env`, the one saved CLI location every skill reads; it never rewrites an operator's `TC_BIN`.

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
```
This POSIX entry point downloads and runs the same `/install-cli.mjs` implementation; it has no separate CLI version or installation policy. The installer prints `SKILL_INSTALLED <name> <version> <folder>` for each successful skill. `TC_SKILL_STATUS installed`, `reused` or `unavailable` records the core-skill result separately; the calling guide skips its own action-skill install only when its skill was installed here.

`TC_SELECTED {"bin":"…","version":"…","source":"…"}` identifies the selected executable (for the private install, `node_modules/.bin/tinycloud`); retain that absolute path as `TC_BIN` when returning to the caller. The downloaded Node installer accepts `--resolve` to print only an existing selected path (exit 1 means absent; exit 2 means invalid/unsafe), without installing, upgrading or changing PATH.

For each command name:

- `TC_READY <version> <name>` means the selected CLI is already available under that name.
- `TC_LINKED <version> <path>` means the installer created that link or Windows launcher.
- `TC_INSTALL_FAILED` means selection, installation, verification or the Windows PATH update failed. Stop and report the actual error.

## Install the core skill

Inspect an existing `tinycloud-cli/SKILL.md` before replacing it. The usual path is `$HOME/.agents/skills/tinycloud-cli/SKILL.md` for OpenCode and Codex or `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tinycloud-cli/SKILL.md` for Claude Code. Reuse files matching the `cli` entry, version `1.6.6`, in `https://agents.tinycloud.xyz/skills/index.json`. Do not overwrite unrelated or locally modified files. An older managed `tc-cli` skill has a different name: retire that obsolete folder only after checking it is an unmodified TinyCloud-installed skill, so both versions are not loaded.

This step is optional: it helps agents discover the CLI's commands but is not required to use the selected CLI.

If the skill already matches, record `TC_SKILL_STATUS reused`. Otherwise, try the install. If the installer fails or the client denies the optional install, record `TC_SKILL_STATUS unavailable`; keep using the selected CLI. If that still cannot run, record unavailable and continue; do not ask the owner to restart the client or rerun `/cli`.

### Optional standalone install

If the shared install call did not include this skill, use the already-downloaded `install.js` or download it as described in [Install the CLI](#install-the-cli). Then run:

```sh
if node "$HOME/.local/share/tinycloud/install.js" cli --agent CLIENT; then
  echo "TC_SKILL_STATUS installed"
else
  echo "TC_SKILL_STATUS unavailable"
fi
```

The installer downloads `tinycloud-cli` from `@tinycloud/cli@1.6.6` with this site's pinned resolver overlay and checks every file against `/skills/index.json`. Its shell blocks read process `TC_BIN` first, then the data-only `agent.env` selection, then the private installation before global npm. It replaces only `tinycloud-cli` and prints `SKILL_INSTALLED tinycloud-cli 1.6.6 <folder>` on success.

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

When `TC_SKILL_STATUS` is unavailable, tell the owner the CLI is ready but the skill could not be installed or verified; never claim the skill is installed.

Verify that the selected absolute path reports `1.6.6` or the newer/operator-selected version reported by `TC_SELECTED`. If `tinycloud` was `TC_READY` or `TC_LINKED`, verify `tinycloud --version` after refreshing PATH or restarting the terminal. Check `tinycloud-cli/SKILL.md` only when `TC_SKILL_STATUS` is `installed` or `reused`; if status is unavailable, the CLI remains usable but do not claim the skill is installed. Do not sign in, choose a profile or host, or request permissions here.

Return to the exact recorded app-guide heading and continue the original task in the same conversation. Do not ask the owner to restart the flow or paste another prompt.

## Exit codes and owner lines

Every guide and skill on this site carries this same table, three owner lines and the decline question. The installer's `TC_*` lines above are its own.

{{std:errors}}
