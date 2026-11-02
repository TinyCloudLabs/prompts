# Personal records in TinyCloud (`tc-apps`)

Your agent keeps your records, like meals, weight, workouts, goals or todos, in your own TinyCloud storage, organised into apps it creates and extends as you go. Each app has its own folder. Existing onboarding access is reused; an approval is requested only when the task needs access you have not already granted.

## For the owner

- **What it does:** reuses the TinyCloud CLI from onboarding and installs the `tc-apps` skill only if needed, then carries out your request. For a meal, weight or recipe, TinyCloud's own app for it (Health Log or Recipes) logs it.
- **Paste into your agent:** `Fetch https://agents.tinycloud.xyz/apps with curl and follow it. Log this meal in my TinyCloud: breakfast, two eggs and a slice of toast, about 350 kcal.`
  - **Claude Code:** it may stop before it installs the skill. Reply "Go ahead: install the tc-apps skill from agents.tinycloud.xyz." See [Confirming a step in Claude Code](#if-claude-code-still-blocks-it). It may also ask you to allow reading the skill and starting the approval helper; allow each one before its timer runs out.
  - **Codex:** before you paste, type `/permissions` and choose "Ask for approval", then approve each step it asks for.
- **You approve:** nothing more when onboarding already granted the requested app access. Health Log installation additionally needs permission to create its tables if that access is missing; the agent does not repeat your ordinary read/write grants. Otherwise it asks only for missing access and sends the actual OpenKey link. The older narrow catalog fallback uses a manual sign-in code in chat, but its access link completes automatically. The agent runs the commands and finishes the request; you never need a separate terminal.
- **Undo:** see [Undo](#undo).
- **Health Log account and date:** nothing to set or confirm. The agent saves the account after you sign in. It uses the page-saved timezone when available, otherwise its host's local IANA zone, else UTC. If the account you approve is not the one this computer was set up with, the agent says so in one line.

## Without the CLI

An agent that can't run the CLI but supports remote MCP, such as Claude on the web, iOS or Android, can add `https://mcp.tinycloud.xyz/mcp` as a custom connector ([/connect](connect.md) has the steps), sign in, and approve the connect and personal-record access links it shows you. Then ask naturally: “Log my weight: 80.5 kg today.” No local CLI or skill installation is needed for this connector.

In Claude, to avoid approving each record-writing tool call, go to **Settings → Connectors → TinyCloud**, find `tinycloud_apps_write`, and choose **Always allow**. This does not replace the OpenKey access approval.

## For the agent

**Read this page raw first.** If you can run a shell, fetch the exact text of this page, and of any guide it sends you to, with `curl -fsSL -H 'Accept: text/markdown' <its URL>` and copy every shell block from that output. A web-fetch tool that summarizes pages drops or rewrites the blocks, and they only work exactly as written.

**Send links exactly as printed.** Send the owner every link exactly as the CLI printed it, copied from the output: never retype, shorten or rebuild it.

Keep the owner's original request in this conversation and carry it out with the skill; don't ask the owner to send it again. **Already onboarded? Do not install another CLI or start another sign-in.** Keep the same selected CLI, profile, host and owner. The skill checks existing grants and actual read access before asking for anything more. A first record in an existing catalog needs only the write and read-back commands in skill §6; creating a new app also creates its catalog entries, not another CLI installation.

**Not onboarded yet? Onboard first.** When the skill's access check returns `onboard-first` (no profile on this computer has an owner or a session), fetch https://agents.tinycloud.xyz/onboarding raw, as above, and follow it now, keeping the owner's original request. The owner's request is the go-ahead: don't stop to ask or explain first; onboarding tells you the one line to send the owner. It sends you back here; rerun the check and it reuses that access. The skill's scoped sign-ins are only for an agent that cannot run onboarding: its CLI route is unavailable, the owner declines it, or your client blocks it.

What is and isn't secret: [the list on the shared setup page](https://agents.tinycloud.xyz/agent#what-is-and-isnt-secret).

If the owner only asked for setup or named no record, save one default record without asking, after sign-in is approved (skill §1a, §3 and §4) and not before: app `todos`, kind `todo`, value `{"v":1,"at":"<UTC>","data":{"title":"Try my personal apps"},"by":<client>}`, where `<UTC>` is the clock's time from `date -u +%FT%TZ` (skill §1; run it again if it is more than 5 minutes old), never an estimate. Run skill §1a for `todos` first. If it prints `legacy`, an earlier version already keeps `todos` records for this owner: use the old layout (skill `LEGACY.md`, no new approval) with key `xyz.tinycloud.agent-data/todos/todo/open/try-my-personal-apps` and done twin `xyz.tinycloud.agent-data/todos/todo/done/try-my-personal-apps`, and, if they don't exist yet, the catalog records `xyz.tinycloud.agent-data/catalog/todos` and `xyz.tinycloud.agent-data/catalog/todos/todo`. Otherwise use the new layout in the `applications` space with key `xyz.tinycloud.tinyapps.todos/todo/open/try-my-personal-apps`, done twin `xyz.tinycloud.tinyapps.todos/todo/done/try-my-personal-apps`, and catalog records `xyz.tinycloud.tinyapps.todos/catalog` and `xyz.tinycloud.tinyapps.todos/catalog/todo`, followed by the discovery entry `xyz.tinycloud.tinyapps.catalog/todos/entry` = `{"v":1,"app":"todos","id":"xyz.tinycloud.tinyapps.todos","title":"Todos"}`. If the `todos` app or its `todo` kind doesn't exist yet, write the catalog records first (skill §2 rule 2): the app record is `{"app":"todos","title":"Todos","about":"Things to do.","created":"<TODAY>","by":<client>}` and the kind record is `{"app":"todos","kind":"todo","about":"One record per thing to do.","shape":"item","states":["open","done"],"v":1,"fields":{"title":"text: what to do"}}`. Write commands are in skill §6 (`LEGACY.md` §6 in the old layout). Get that key and its done twin first (skill §5), and skip saving if either exists, so a todo the owner already ticked off isn't saved again. Afterwards tell the owner the key, that “What’s on my todo list?” shows it, and that you'll delete it on request (the skill's `kv delete`, §6).

Keep the owner's request, and note your client: `claude-code`, `codex` or `opencode` (any other agent: `codex`).

Run each block as one shell tool call. Use the same `TC_BIN`, `TC_HOME` and selected profile as onboarding. Never install globally, use `sudo`, change a conflicting `tc`, or install a second CLI for a different record layout.

## 1. Reuse the CLI

Follow [the shared CLI setup](tinycloud.md) only if it has not already completed in this conversation. It checks Node.js 20 or later with npm. New installs and older agent-owned installs use the pinned release, `1.5.2`; an operator-selected CLI is kept, and a newer one is never downgraded. Preserve an operator-provided `TC_BIN`; a missing or broken override is an explicit error, not permission to replace it. If it prints `TC_OLDER`, the operator selected a CLI older than `1.5.2`: tell the owner in one line that it is older than the required `1.5.2`, and stop. If Node.js or npm is missing or too old, stop and ask the owner to install or update it; do not install Node.js yourself.

Copy the selected absolute executable path from `TC_SELECTED` as `<TC_BIN>`. Use that one path for catalog apps, generic apps, legacy records and migrations. Later conversations find the same CLI the way every TinyCloud skill does: process `TC_BIN`, then the selection in `~/.config/tinycloud/agent.env`, then the shared private install. The old separate beta installation is no longer used. Preserve its files and the owner's profiles; do not delete older installs as part of setup.

The skill's §1 checks the selected CLI against `1.5.2` every conversation. If it prints `CLI_OLDER <version> <path>`, it stopped before any other TinyCloud command: follow the shared CLI setup once (even if it already ran in this conversation; it upgrades a CLI the agent installed), then run §1 again. That is for you only; don't tell the owner. If it prints `TC_OLDER`, stop with the one-line notice above.

## 2. Install only the skill

If the installed `tc-apps` skill is version `0.3.6` or newer and its helpers are present, skip installation and read it in §3. Otherwise use the site's existing checksum-verifying skill installer. Replace `<CLIENT>` with `claude-code`, `codex` or `opencode`; other agents use `codex`.

On macOS/Linux or an agent's Bash tool on Windows:

```sh
umask 077
D=$(mktemp -d) && curl -fsSL https://agents.tinycloud.xyz/skills/install.js -o "$D/install.cjs" && node "$D/install.cjs" apps --agent '<CLIENT>'
```

On Windows PowerShell:

```powershell
$D = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $D | Out-Null
Invoke-WebRequest https://agents.tinycloud.xyz/skills/install.js -OutFile (Join-Path $D 'install.cjs')
node (Join-Path $D 'install.cjs') apps --agent '<CLIENT>'
```

Require `SKILL_INSTALLED tc-apps 0.3.6 <folder>` (or a newer skill), then remove only the temporary download directory created by this step. The installer verifies every file before replacing the skill folder. A network, checksum or client-permission failure stops setup; do not switch download sources or bypass a denied step.

Keep `TC_APPS_STATE` unchanged. Do not sign in during installation; the installed skill checks the actual task's access first.

If something goes wrong:
- **Codex:** its default sandbox can block network access and writes outside the workspace. Use the client's documented approval flow for the installation. If escalation is unavailable or network access is blocked, tell the owner in one line to type `/permissions`, choose "Ask for approval", and send the request again. Don't send terminal commands or ask the owner to restart.
- **Claude Code (or your client) denies a step or asks to confirm it:** show the owner the step and what it does, then ask them to reply naming that step, as in [Confirming a step in Claude Code](#if-claude-code-still-blocks-it). Run it again only once they agree. Don't edit settings or run it another way.
- **A command, download or checksum check fails:** stop and report the error. Don't retry with other options, in another folder or from another source.

If installation was needed, continue only after the installer has printed `SKILL_INSTALLED` successfully.

## 3. Carry on with the skill

Read the installed skill in full, with the line for your client:

```sh
cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps/SKILL.md"
```

```sh
cat "$HOME/.agents/skills/tc-apps/SKILL.md"
```

Read the installed skill directly for this request, even if the client has not refreshed its skill list. Follow it now from §1. No restart is needed. In a future conversation that has not discovered the skill, the owner can paste the setup link again; read the existing installed skill and carry on.

<a id="if-claude-code-still-blocks-it"></a>

## Confirming a step in Claude Code

Claude Code can ask you to confirm a step before it runs. Reply with the step, for example: "Go ahead: install the tc-apps skill from agents.tinycloud.xyz." Name the step, because a reply without it may not be enough.

**For coding agents:** when Claude Code denies a step or asks the owner to confirm it, show them the step and the exact "Go ahead: …" reply from above for them to send, then wait for their answer.

Owners can read about an optional Claude Code setting for the sign-in command at https://agents.tinycloud.xyz/owner.

## Moving records from an earlier version

Earlier versions kept all apps together in `default`. They keep working until you ask your agent to "move my <app> records". Pause other writers while it moves. The agent reuses existing access or requests only missing permissions, shows a dry-run plan, and copies and compares records before switching. Any mismatch leaves the originals untouched.

For the agent: follow `SKILL.md` §9. Run `migrate.sh` yourself, with `--dry-run` first, then without it only after the owner accepts the plan in chat. The script needs `jq` and the same CLI selected above. It never deletes the old records. A verified receipt in `<STATE>/migration/` records the switch; an agent on another computer can install that receipt at the owner's request. A move doesn't import old meal records into Health Log.

To go back, the owner asks in chat. Follow `SKILL.md` §9's going-back procedure; never remove the receipt before newer records have been copied and read back.

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

If the owner asks to uninstall too, the agent removes this skill's install, state and client skill folder. The owner's records stay in TinyCloud.
