> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/apps` and follow that text. Summaries drop the shell blocks you must run.

# Personal records in TinyCloud (`tc-apps`)

Your agent keeps your records, like meals, weight, workouts, goals or todos, in your own TinyCloud storage, organised into apps it creates and extends as you go. Each app has its own approval. It can also keep optional low-sensitivity context—facts, preferences, decisions and handoffs—so later sessions can pick up where you left off.

## For the owner

- **What it does:** reuses the TinyCloud CLI from onboarding and installs the `tc-apps` skill for the supported agents found on this computer, then carries out your request. For a meal, weight or recipe, TinyCloud's own app for it (Health Log or Recipes) logs it.
- **Paste into your agent:** `Fetch https://agents.tinycloud.xyz/apps with curl and follow it, including running its installer. Log this meal in my TinyCloud: breakfast, two eggs and a slice of toast, about 350 kcal.`
  - **Claude Code:** it may stop before it installs the skill. Reply "Go ahead: install the tc-apps skill from agents.tinycloud.xyz." See [Confirming a step in Claude Code](#if-claude-code-still-blocks-it). It may also ask you to allow reading the skill and starting the approval helper; allow each one before its timer runs out.
  - **Codex:** approve the CLI and skill installation when Codex requests it. If its sandbox blocks a step, follow the shared CLI guide's blocked-install instructions.
- **You approve:** nothing more when onboarding already granted the requested app access. Health Log installation additionally needs permission to create its tables if that access is missing; the agent does not repeat ordinary read/write grants. Otherwise it asks only for missing access and sends the OpenKey link. The older scoped catalog fallback may also ask you to complete sign-in; for app approval links, use the line "Open this link and approve, then tell me." The agent runs commands and finishes your request; you never need a separate terminal.
- **Undo:** see [Undo](#undo).
- **Health Log account and date:** nothing to set or confirm. The agent saves the account after you sign in. It uses the page-saved timezone when available, otherwise its host's local IANA zone, else UTC. If the account you approve is not the one this computer was set up with, the agent says so in one line.

## Without the CLI

An agent that can't run the CLI but supports remote MCP, such as Claude on the web, iOS or Android, can add `https://mcp.tinycloud.xyz/mcp` as a custom connector ([/connect](connect.md) has the steps), sign in, and approve the connect and personal-record access links it shows you. Then ask naturally: “Log my weight: 80.5 kg today.” No local CLI or skill installation is needed for this connector.

In Claude, to avoid approving each record-writing tool call, go to **Settings → Connectors → TinyCloud**, find `tinycloud_apps_write`, and choose **Always allow**. This does not replace the OpenKey access approval.

## For the agent

{{std:read-raw}}

Keep the owner's original request in this conversation and carry it out with the skill; don't ask the owner to send it again. **Already onboarded? Do not install another CLI or start another sign-in.** Keep the same selected CLI, profile, host and owner. The skill checks existing grants and actual read access before asking for anything more. A first record in an existing catalog needs only the write and read-back commands in skill §6; creating a new app also creates its catalog entries, not another CLI installation.

**Not onboarded yet? Onboard first.** When the skill's access check returns `onboard-first` (no profile on this computer has an owner or a session), fetch https://agents.tinycloud.xyz/onboarding raw, as above, and follow it now, keeping the owner's original request. The owner's request is the go-ahead: don't stop to ask or explain first; onboarding tells you the one line to send the owner. It sends you back here; rerun the check and it reuses that access. The skill's scoped sign-ins are only for an agent that cannot run onboarding: its CLI route is unavailable, the owner declines it, or your client blocks it.

What is and isn't secret: [the list on the shared setup page](https://agents.tinycloud.xyz/agent#what-is-and-isnt-secret).

If the owner only asked for setup or named no record, save one default record without asking, after sign-in is approved (skill §1a, §3 and §4) and not before: app `todos`, kind `todo`, value `{"v":1,"at":"<UTC>","data":{"title":"Try my personal apps"},"by":<client>}`, where `<UTC>` is the clock's time from `date -u +%FT%TZ` (skill §1; run it again if it is more than 5 minutes old), never an estimate. Run skill §1a for `todos` first. If it prints `legacy`, an earlier version already keeps `todos` records for this owner: use the old layout (skill `LEGACY.md`, no new approval) with key `xyz.tinycloud.agent-data/todos/todo/open/try-my-personal-apps` and done twin `xyz.tinycloud.agent-data/todos/todo/done/try-my-personal-apps`, and, if they don't exist yet, the catalog records `xyz.tinycloud.agent-data/catalog/todos` and `xyz.tinycloud.agent-data/catalog/todos/todo`. Otherwise use the new layout in the `applications` space with key `xyz.tinycloud.tinyapps.todos/todo/open/try-my-personal-apps`, done twin `xyz.tinycloud.tinyapps.todos/todo/done/try-my-personal-apps`, and catalog records `xyz.tinycloud.tinyapps.todos/catalog` and `xyz.tinycloud.tinyapps.todos/catalog/todo`, followed by the discovery entry `xyz.tinycloud.tinyapps.catalog/todos/entry` = `{"v":1,"app":"todos","id":"xyz.tinycloud.tinyapps.todos","title":"Todos"}`. If the `todos` app or its `todo` kind doesn't exist yet, write the catalog records first (skill §2 rule 2): the app record is `{"app":"todos","title":"Todos","about":"Things to do.","created":"<TODAY>","by":<client>}` and the kind record is `{"app":"todos","kind":"todo","about":"One record per thing to do.","shape":"item","states":["open","done"],"v":1,"fields":{"title":"text: what to do"}}`. Write commands are in skill §6 (`LEGACY.md` §6 in the old layout). Get that key and its done twin first (skill §5), and skip saving if either exists, so a todo the owner already ticked off isn't saved again. Afterwards tell the owner the key, that “What’s on my todo list?” shows it, and that you'll delete it on request (the skill's `kv delete`, §6).

Keep the owner's request, and note your client: `claude-code`, `codex` or `opencode` (any other agent: `codex`).

Run each block as one shell tool call. Use the same `TC_BIN`, `TC_HOME` and selected profile as onboarding. Never install globally, use `sudo`, change a conflicting `tc`, or install a second CLI for a different record layout.

## 1. Reuse the CLI

Follow [the shared CLI setup](tinycloud.md) only if it has not already completed in this conversation, with `apps` as the action skill, so its one run call also installs this guide's skill. It checks Node.js 20 or later with npm. It installs the pinned release, `1.6.2`, or upgrades the agent's own older copy to it. Preserve an operator-provided `TC_BIN`; a missing or broken override is an explicit error, not permission to replace it. If it prints `TC_OLDER`, the operator selected a CLI older than `1.6.2`: tell the owner in one line that it is older than the required `1.6.2`, and stop. If Node.js or npm is missing or too old, stop and ask the owner to install or update it; do not install Node.js yourself.

Copy the selected absolute executable path from `TC_SELECTED` as `<TC_BIN>`. Use that one path for catalog apps, generic apps, legacy records and migrations. Later conversations find the same CLI the way every TinyCloud skill does: process `TC_BIN`, then the selection in `~/.config/tinycloud/agent.env`, then the shared private install. The old separate beta installation is no longer used. Preserve its files and the owner's profiles; do not delete older installs as part of setup.

**CLI rule (stable `1.6.2`): after this step, run skill §1's block (see §3 below) before any other TinyCloud command, including any `tinycloud` or `--version` check of your own; it selects the CLI and decides. Don't judge who installed the CLI yourself. Only a `TC_OLDER` line from skill §1 or /cli means the operator chose an older CLI: tell the owner in one line that it is older than the required `1.6.2`, and stop. Any other older CLI is yours, including one on `PATH` or linked from `~/.local/bin`: skill §1 prints `CLI_OLDER`; follow the shared CLI setup once, even if it already ran in this conversation, and rerun skill §1. Upgrading the CLI is part of the owner's request: don't ask first; at most one short line ("Updating the TinyCloud CLI."). Never run `tinycloud upgrade` or a global npm install of the TinyCloud CLI; the guide's installer (/cli) handles upgrades. A newer CLI is never downgraded. Don't install the CLI globally, with `sudo`, or by piping a download into a shell; /cli installs and upgrades the agent's own copy.**

## 2. Install the skill for each agent

Install the current `tc-apps` skill for this client and every other supported agent already configured on this computer. This also puts `CONTEXT.md` where the optional session-check line can read it. Use the official checksum-verifying installer, which keeps the selected CLI unchanged. Replace `<CLIENT>` with `claude-code`, `codex` or `opencode`; other agents use `codex`.

On macOS/Linux or an agent's Bash tool on Windows:

```sh
CLIENT='<CLIENT>'; umask 077
D=$(mktemp -d) || exit 1
curl -fsSL https://agents.tinycloud.xyz/skills/install.js -o "$D/install.cjs" || { rm -rf "$D"; exit 1; }
node "$D/install.cjs" apps --agent "$CLIENT" || { rm -rf "$D"; exit 1; }
case "$CLIENT" in claude-code) SKILL_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps" ;; *) SKILL_DIR="$HOME/.agents/skills/tc-apps" ;; esac
TARGETS=$(sh "$SKILL_DIR/session-check.sh" clients "$CLIENT") || { echo 'Could not list configured agents' >&2; rm -rf "$D"; exit 1; }
[ -n "$TARGETS" ] || { echo 'Could not list configured agents' >&2; rm -rf "$D"; exit 1; }
for target in $TARGETS; do
  [ "$target" = "$CLIENT" ] && continue
  node "$D/install.cjs" apps --agent "$target" || { rm -rf "$D"; exit 1; }
done
rm -rf "$D"
```

On Windows PowerShell:

```powershell
$ErrorActionPreference = 'Stop'
$Client = '<CLIENT>'
$D = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $D | Out-Null
Invoke-WebRequest https://agents.tinycloud.xyz/skills/install.js -OutFile (Join-Path $D 'install.cjs')
if ($env:CLAUDE_CONFIG_DIR) { $ClaudeDir = $env:CLAUDE_CONFIG_DIR } else { $ClaudeDir = Join-Path $HOME '.claude' }
if ($env:CODEX_HOME) { $CodexDir = $env:CODEX_HOME } else { $CodexDir = Join-Path $HOME '.codex' }
$OpenCodeDir = Join-Path $HOME '.config/opencode'
$Targets = @($Client)
if (Test-Path $ClaudeDir) { $Targets += 'claude-code' }
if (Test-Path $CodexDir) { $Targets += 'codex' }
if (Test-Path $OpenCodeDir) { $Targets += 'opencode' }
foreach ($Target in ($Targets | Sort-Object -Unique)) {
  node (Join-Path $D 'install.cjs') apps --agent $Target
  if ($LASTEXITCODE -ne 0) { Remove-Item -Recurse -Force $D; throw "Skill installation failed for $Target" }
}
Remove-Item -Recurse -Force $D
```

Require `SKILL_INSTALLED tc-apps 0.4.0 <folder>` (or a newer skill) for each target. The installer verifies every file before replacing a skill folder. A network, checksum or client-permission failure stops setup; do not switch download sources or bypass a denied step.

Keep `TC_APPS_STATE` unchanged. Do not sign in during installation; the installed skill checks the actual task's access first.

If something goes wrong:
- **Codex:** its default sandbox can block network access and writes outside the workspace. Use the client's documented approval flow for the installation. If escalation is unavailable or network access is blocked, tell the owner in one line to type `/permissions`, choose "Ask for approval", and send the request again. Don't send terminal commands or ask the owner to restart.
- **Claude Code (or your client) denies a step or asks to confirm it:** show the owner the step and what it does, then ask them to reply naming that step, as in [Confirming a step in Claude Code](#if-claude-code-still-blocks-it). Run it again only once they agree. Don't edit settings or run it another way.
- **A command, download or checksum check fails:** stop and report the error. Don't retry with other options, in another folder or from another source.

Continue only after the installer has printed `SKILL_INSTALLED tc-apps 0.4.0` (or a newer version) for every target.


## 3. Carry on with the skill

Read the installed skill with three shell calls in order; together they are the whole file. Use the shell, never your client's file-read tool: the skill folder is outside the project, and Claude Code asks the owner before its file-read tool opens a file there, while a shell read goes ahead. Three parts keep each output short enough to show in full. If your client still saves an output to a file, read that saved file, not the skill.

Claude Code uses its TinyCloud plugin path when set; otherwise it reads its user installation:

```sh
if [ -n "${CLAUDE_SKILL_DIR:-}" ] && [ -f "${CLAUDE_SKILL_DIR}/SKILL.md" ]; then sed '/^## 3\. Reuse access, find the app and read its catalog$/,$d' "${CLAUDE_SKILL_DIR}/SKILL.md"; else sed '/^## 3\. Reuse access, find the app and read its catalog$/,$d' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps/SKILL.md"; fi
```

```sh
if [ -n "${CLAUDE_SKILL_DIR:-}" ] && [ -f "${CLAUDE_SKILL_DIR}/SKILL.md" ]; then sed -n '/^## 3\. Reuse access, find the app and read its catalog$/,/^## 4\. Request only missing access$/p' "${CLAUDE_SKILL_DIR}/SKILL.md" | sed '$d'; else sed -n '/^## 3\. Reuse access, find the app and read its catalog$/,/^## 4\. Request only missing access$/p' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps/SKILL.md" | sed '$d'; fi
```

```sh
if [ -n "${CLAUDE_SKILL_DIR:-}" ] && [ -f "${CLAUDE_SKILL_DIR}/SKILL.md" ]; then sed -n '/^## 4\. Request only missing access$/,$p' "${CLAUDE_SKILL_DIR}/SKILL.md"; else sed -n '/^## 4\. Request only missing access$/,$p' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps/SKILL.md"; fi
```

Codex and OpenCode:

```sh
sed '/^## 3\. Reuse access, find the app and read its catalog$/,$d' "$HOME/.agents/skills/tc-apps/SKILL.md"
```

```sh
sed -n '/^## 3\. Reuse access, find the app and read its catalog$/,/^## 4\. Request only missing access$/p' "$HOME/.agents/skills/tc-apps/SKILL.md" | sed '$d'
```

```sh
sed -n '/^## 4\. Request only missing access$/,$p' "$HOME/.agents/skills/tc-apps/SKILL.md"
```

Your client may not list the new skill until it restarts; you don't need it to.

Follow the skill now for the owner's request, from its §1. When you've finished it, end your last message with §4's question.

**OpenCode only:** OpenCode loads skills when it starts, so new conversations in this window won't know the skill yet. Claude Code and Codex pick it up by themselves. When you've finished the request, add one line to your last message: "Restart OpenCode once, so new conversations can use your TinyCloud apps."

## 4. One question: check context in every session

Ask this once, at the end of your last message, after the owner's request is done; don't hold up the request for it. First run the check, with your client as `<client>` (`claude-code`, `codex` or `opencode`):

```sh
for d in "${CLAUDE_SKILL_DIR:-}" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps" "$HOME/.agents/skills/tc-apps"; do if [ -n "$d" ] && [ -f "$d/session-check.sh" ]; then sh "$d/session-check.sh" status '<client>'; break; fi; done
```

- `on` or `declined` → don't ask. Don't ask either if this conversation's context key list (`CONTEXT.md` §3) has `preference/session-check`.
- `off` → end your last message with this question, naming the agents on its `clients:` line:

  > One question: should new sessions of <Codex and Claude Code> on this computer check your TinyCloud context first, so they know what you've told any of your agents? Yes adds one marked line to their instructions; Undo removes it.

When the owner answers:
- **Yes** → run the same block with `add '<client>'` in place of `status '<client>'`. It adds one line, ending with `<!-- tinycloud-context -->`, at the end of each agent's instructions file, and changes no other line; it prints each file it changed. Never edit those files yourself.
  - **Codex:** the files are outside the workspace, so run it with `sandbox_permissions: "require_escalated"` and the justification "Add the TinyCloud context line to your agents' instructions".
  - It prints `could not change`, or your client blocks the step → don't run it another way. Give the owner the command for their own terminal: `for d in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps" "$HOME/.agents/skills/tc-apps"; do if [ -f "$d/session-check.sh" ]; then sh "$d/session-check.sh" add '<client>'; break; fi; done`.
  - Then, if the context app isn't approved on this computer yet (`CONTEXT.md` §3's list prints `PROFILE_NOT_FOUND`), get its approval: skill §4 with `context` and `Context`. Tell the owner in one line which files changed.
- **No** → run the same block with `decline` in place of `status '<client>'`. If the context app is approved on this computer, also save `preference/session-check`, "No session check", as `CONTEXT.md` §4 says, without a line to the owner. Don't ask again.
- Anything else → don't ask again in this conversation.

<a id="if-claude-code-still-blocks-it"></a>

## Confirming a step in Claude Code

Claude Code can ask you to confirm a step before it runs. Reply with the step, for example: "Go ahead: install the tc-apps skill from agents.tinycloud.xyz." Name the step, because a reply without it may not be enough.

**For coding agents:** when Claude Code denies a step or asks the owner to confirm it, show them the step and the exact "Go ahead: …" reply from above for them to send, then wait for their answer.

What you approve, and how to undo it, in one place for owners: https://agents.tinycloud.xyz/onboarding#undo.

## Moving records from an earlier version

Earlier versions kept all apps together in `default`. They keep working until you ask your agent to "move my <app> records". Pause other writers while it moves. The agent reuses existing access or requests only missing permissions, shows a dry-run plan, and copies and compares records before switching. Any mismatch leaves the originals untouched.

For the agent: follow `SKILL.md` §9. Run `migrate.sh` yourself, with `--dry-run` first, then without it only after the owner accepts the plan in chat. The script needs `jq` and the same CLI selected above. It never deletes the old records. The discovery entry it writes switches the app on every computer that can read it, and the verified receipt in `<STATE>/migration/` switches this computer (`SKILL.md` §1a); an agent on another computer that can't read the entry can install that receipt at the owner's request. A move doesn't import old meal records into Health Log.

To go back, the owner asks in chat. Follow `SKILL.md` §9's going-back procedure; never delete the discovery entry or remove the receipt before newer records have been copied and read back.

## Exit codes and owner lines

The skill's own codes come first; the shared table covers the rest. Its owner lines are the shared ones, with `<what>` = "your <app> app" (for example "your Health Log app").

{{std:errors}}

## Undo

Access expires on the date shown at approval: onboarding and new app grants normally use 30 days; the older narrow Health Log grant uses 7 days. Revoke access at https://account.tinycloud.xyz/delegations to end it sooner. Local logout is not revocation.

For the agent: identify the selected profile before undoing anything. A shared onboarding profile serves multiple apps: explain that scope before logging it out. Stop only still-running commands for that profile that you started in this conversation, using their recorded live sessions or PIDs, and observe their exit before logout; never kill by process name or pattern.

The helper below applies only to an older `agent-data`/`agent-meal` installation; never apply it to a shared onboarding profile. The owner's request in chat is the confirmation, so it asks nothing and needs no terminal. Keep the same CLI and state paths used at setup; do not edit `meal-grant.json`. Run it in the background, record its PID, and read its output until it shows `Done`, the no-recorded-grant result, or an error. If it prints an OpenKey link, send it to the owner; they approve there, and no code comes back. Never ask the owner to run a command.

```sh
TC_BIN='<TC_BIN>'; export TC_BIN; STATE="${TC_APPS_STATE:-$HOME/.local/state/tc-apps}"; umask 077
mkdir -p "$STATE"
for d in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps" "$HOME/.agents/skills/tc-apps"; do
  if [ -f "$d/owner-undo.sh" ]; then
    sh "$d/owner-undo.sh" > "$STATE/undo.out" 2>&1 &
    printf 'OWNER_UNDO_PID=%s\n' "$!"
    break
  fi
done
```

The helper ends the earlier `agent-data` sign-ins and revokes the recorded Health Log grant. To end every per-app local sign-in as requested, the agent runs:

```sh
B='<TC_BIN>'
for p in $("$B" profile list 2>/dev/null | grep -o 'tinyapp-[a-z0-9-]*'); do "$B" --profile "$p" auth logout; done
```

`PROFILE_NOT_FOUND` means that profile is already absent. If `meal-grant.json` is gone, the grant still ends after 7 days, as does a replaced grant. Per-app approvals remain valid on TinyCloud until they expire; clearing a local session is not revocation. The `default` sign-in stays because other tools use it.

To stop new sessions checking your TinyCloud context, run this before you delete the folders below. It removes only the lines that end with `<!-- tinycloud-context -->`, from `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` (or `AGENTS.override.md`) and `~/.config/opencode/AGENTS.md`, and changes nothing else. You can also delete that line yourself.

```sh
for d in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps" "$HOME/.agents/skills/tc-apps"; do if [ -f "$d/session-check.sh" ]; then sh "$d/session-check.sh" remove; break; fi; done
```

To remove the rest, delete any older `~/.local/share/tc-apps` copy, `~/.local/state/tc-apps`, and each skill copy: `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-apps` for Claude Code and `~/.agents/skills/tc-apps` for Codex and OpenCode. The setup copies it for every agent it finds on this computer, so delete both folders if both exist. If Claude Code has the skill from the TinyCloud plugin, run `/plugin uninstall tinycloud@tinycloudlabs` there too. Your records stay in your TinyCloud.

To delete context records, ask an agent: "Forget my coffee order", or "Clear my TinyCloud context". Deleting a record removes it from your TinyCloud and from every agent's view. TinyCloud's storage still keeps the old version until history collapse ships, so don't put anything in context you'd need erased.
