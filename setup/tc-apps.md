> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/apps` and follow that text. Summaries drop the shell blocks you must run.

# Personal records in TinyCloud (`tc-apps`)

Your agent keeps your records, like meals, weight, workouts, goals or todos, in your own TinyCloud storage, organised into apps it creates and extends as you go. Each app has its own approval. It can also keep optional low-sensitivity context—facts, preferences, decisions and handoffs—so later sessions can pick up where you left off.

## For the owner

- **What it does:** reuses TinyCloud onboarding, reads the `tc-apps` skill and carries out your request. For a meal, weight or recipe, TinyCloud's own app for it (Health Log or Recipes) logs it.
- **Paste into your agent:** `Fetch https://agents.tinycloud.xyz/apps with curl and follow it. Log this meal in my TinyCloud: breakfast, two eggs and a slice of toast, about 350 kcal.`
- **You approve:** Health Log always has its own app-specific permission, even if onboarding is complete. The agent reuses only a live Health Log grant on its dedicated profile; otherwise it sends an OpenKey link for that app. Health Log table creation may need a separate schema permission. A sign-in may show a short code to paste back in chat; the app-permission link needs no code or separate terminal.
- **Undo:** see [Undo](#undo).
- **Health Log account and date:** nothing to set or confirm. The agent saves the account after you sign in. It uses the page-saved timezone when available, otherwise its host's local IANA zone, else UTC. If the account you approve is not the one this computer was set up with, the agent says so in one line.

## Without the CLI

An agent that can't run the CLI but supports remote MCP, such as Claude on the web, iOS or Android, can add `https://mcp.tinycloud.xyz/mcp` as a custom connector ([/connect](connect.md) has the steps), sign in, and approve the connect and personal-record access links it shows you. Then ask naturally: “Log my weight: 80.5 kg today.” No local CLI or skill installation is needed for this connector.

In Claude, to avoid approving each record-writing tool call, go to **Settings → Connectors → TinyCloud**, find `tinycloud_apps_write`, and choose **Always allow**. This does not replace the OpenKey access approval.

## For the agent

{{std:read-raw}}

Keep the owner's original request in this conversation and carry it out with the skill; don't ask the owner to send it again. Do not repeat onboarding or install another CLI. Generic apps keep the selected profile and reuse its existing grants; Health Log is the exception: it always uses its dedicated `agent-meal` profile and app-specific permission, even when onboarding is complete.

**For generic apps only, onboard first when needed.** When the generic app access check returns `onboard-first` (no profile on this computer has an owner or a session), fetch https://agents.tinycloud.xyz/onboarding raw, as above, and follow it now, keeping the owner's original request. Ask the owner first in one line ("I need to set up TinyCloud here to finish this. OK?") and wait for their yes; onboarding tells you the rest. It sends you back here; rerun the check and it reuses that access. Health Log follows its app-specific flow in `TINY-APPS.md` instead.

What is and isn't secret: [the list on the shared setup page](https://agents.tinycloud.xyz/agent#what-is-and-isnt-secret).

If the owner only asked for setup or named no record, save one default record without asking, after sign-in is approved (skill §1a, §3 and §4) and not before: app `todos`, kind `todo`, value `{"v":1,"at":"<UTC>","data":{"title":"Try my personal apps"},"by":<client>}`, where `<UTC>` is the clock's time from `date -u +%FT%TZ` (skill §1; run it again if it is more than 5 minutes old), never an estimate. Run skill §1a for `todos` first. If it prints `legacy`, an earlier version already keeps `todos` records for this owner: use the old layout (skill `LEGACY.md`, no new approval) with key `xyz.tinycloud.agent-data/todos/todo/open/try-my-personal-apps` and done twin `xyz.tinycloud.agent-data/todos/todo/done/try-my-personal-apps`, and, if they don't exist yet, the catalog records `xyz.tinycloud.agent-data/catalog/todos` and `xyz.tinycloud.agent-data/catalog/todos/todo`. Otherwise use the new layout in the `applications` space with key `xyz.tinycloud.tinyapps.todos/todo/open/try-my-personal-apps`, done twin `xyz.tinycloud.tinyapps.todos/todo/done/try-my-personal-apps`, and catalog records `xyz.tinycloud.tinyapps.todos/catalog` and `xyz.tinycloud.tinyapps.todos/catalog/todo`, followed by the discovery entry `xyz.tinycloud.tinyapps.catalog/todos/entry` = `{"v":1,"app":"todos","id":"xyz.tinycloud.tinyapps.todos","title":"Todos"}`. If the `todos` app or its `todo` kind doesn't exist yet, write the catalog records first (skill §2 rule 2): the app record is `{"app":"todos","title":"Todos","about":"Things to do.","created":"<TODAY>","by":<client>}` and the kind record is `{"app":"todos","kind":"todo","about":"One record per thing to do.","shape":"item","states":["open","done"],"v":1,"fields":{"title":"text: what to do"}}`. Write commands are in skill §6 (`LEGACY.md` §6 in the old layout). Get that key and its done twin first (skill §5), and skip saving if either exists, so a todo the owner already ticked off isn't saved again. Afterwards tell the owner the key, that “What’s on my todo list?” shows it, and that you'll delete it on request (the skill's `kv delete`, §6).

Keep the owner's request, and note your client: `claude-code`, `codex` or `opencode` (any other agent: `codex`).

Run each block as one shell tool call. Use the same `TC_BIN` and `TC_HOME` as onboarding. Generic apps use the selected onboarding profile; Health Log always uses its dedicated `agent-meal` profile. Never change a conflicting `tc` or install a second CLI for a different record layout.

## 1. Reuse the CLI

If CLI onboarding has not completed in this conversation, read and follow https://agents.tinycloud.xyz/connect for the current client, then return here with the owner's original request. Preserve an operator-provided `TC_BIN`; a missing or broken override stops setup.

## 2. Carry on with the skill

Read and follow https://agents.tinycloud.xyz/skills/apps.md for the owner's request. Follow its linked references in order and keep `TC_APPS_STATE` unchanged.

If the client does not already have a local file that the skill requires, stop and tell the owner which file is unavailable. Do not download an installer or switch sources.

## Moving records from an earlier version

**CLI route:** earlier versions kept all apps together in `default`. They keep working through the CLI's legacy route until you ask your agent to "move my <app> records". Pause other writers while it moves. The agent reuses existing access or requests only missing permissions, shows a dry-run plan, and copies and compares records before switching. Any mismatch leaves the originals untouched. This CLI procedure is separate from the connector; updating the connector does not perform this migration.

For the agent: follow `SKILL.md` §9. Run `migrate.sh` yourself, with `--dry-run` first, then without it only after the owner accepts the plan in chat. The script needs `jq` and the same CLI selected above. It never deletes the old records. The discovery entry it writes switches the app on every computer that can read it, and the verified receipt in `<STATE>/migration/` switches this computer (`SKILL.md` §1a); an agent on another computer that can't read the entry can install that receipt at the owner's request. A move doesn't import old meal records into Health Log.

To go back, the owner asks in chat. Follow `SKILL.md` §9's going-back procedure; never delete the discovery entry or remove the receipt before newer records have been copied and read back.

## Exit codes and owner lines

The skill's own codes come first; the shared table covers the rest. Its owner lines are the shared ones, with `<what>` = "your <app> app" (for example "your Health Log app").

{{std:errors}}

## Undo

Access expires on the date shown at approval: onboarding and new app grants last up to 30 days; the older narrow Health Log grant uses 7 days. Revoke access at https://account.tinycloud.xyz/delegations to end it sooner. Local logout is not revocation.

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

To delete context records, ask an agent: "Forget my coffee order", or "Clear my TinyCloud context". Deleting a record removes it from your TinyCloud, so agents can't get it there again. An earlier copy stays in TinyCloud's storage, and an agent that already read it may have kept its own copy, so don't put anything in context you'd need permanently erased.
