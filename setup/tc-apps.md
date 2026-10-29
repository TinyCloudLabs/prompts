# Personal records in TinyCloud (`tc-apps`)

Your agent keeps your records, like meals, weight, workouts, goals or todos, in your own TinyCloud storage, organised into apps it creates and extends as you go. Each app has its own folder and its own approval. Any agent on this computer, in any conversation, can find and read them.

## For the owner

- **What it does:** installs the `tc-apps` skill for your user, using the TinyCloud CLI and sign-in from [/onboarding](onboarding.md), then carries out your request. For a meal, weight or recipe, TinyCloud's own app for it (Health Log or Recipes) logs it.
- **Paste into your agent:** `Fetch https://agents.tinycloud.xyz/apps with curl and follow it. Log this meal in my TinyCloud: breakfast, two eggs and a slice of toast, about 350 kcal.`
  - **Claude Code:** it may ask you to confirm a step. See [Confirming a step in Claude Code](#if-claude-code-still-blocks-it).
  - **Codex:** its default sandbox can block the install. Approve the install escalation it asks for in chat; the agent performs the steps.
- **You approve:** nothing new after [/onboarding](onboarding.md): its starting grant covers your apps, Health Log and Recipes included. A fast, searchable copy of an app's records, or records from an earlier version, asks once with one OpenKey link; send back the code it shows. The agent runs every command and finishes the request; you never need a separate terminal.
- **Undo:** see [Undo](#undo).
- **Health Log account and date:** nothing to set or confirm. The agent saves the account after you sign in. It uses the page-saved timezone when available, otherwise its host's local IANA zone, else UTC. If the account you approve is not the one this computer was set up with, the agent says so in one line.

## Without the CLI

An agent that can't run the CLI but supports remote MCP, such as Claude on the web, iOS or Android, can add `https://mcp.tinycloud.xyz/mcp` as a custom connector ([/connect](connect.md) has the steps), sign in, and approve the connect and personal-record access links it shows you. Then ask naturally: “Log my weight: 80.5 kg today.” No local CLI or skill installation is needed for this connector.

In Claude, to avoid approving each record-writing tool call, go to **Settings → Connectors → TinyCloud**, find `tinycloud_apps_write`, and choose **Always allow**. This does not replace the OpenKey access approval.

## For the agent

The owner sent you this page with a request, for example "Log my weight: 80.5 kg today." This page installs the TinyCloud CLI and the `tc-apps` skill. Then you carry out the request with the skill, in this same conversation: don't ask the owner to send it again.

What is and isn't secret: [the list on the shared setup page](https://agents.tinycloud.xyz/agent#what-is-and-isnt-secret).

If the owner only asked for setup or named no record, save one default record without asking, after sign-in is approved (skill §1a, §3 and §4) and not before: app `todos`, kind `todo`, value `{"v":1,"at":"<UTC>","data":{"title":"Try my personal apps"},"by":<client>}`, where `<UTC>` is the clock's time from `date -u +%FT%TZ` (skill §1; run it again if it is more than 5 minutes old), never an estimate. Run skill §1a for `todos` first. If it prints `legacy`, an earlier version already keeps `todos` records for this owner: use the old layout (skill `LEGACY.md`, no new approval) with key `xyz.tinycloud.agent-data/todos/todo/open/try-my-personal-apps` and done twin `xyz.tinycloud.agent-data/todos/todo/done/try-my-personal-apps`, and, if they don't exist yet, the catalog records `xyz.tinycloud.agent-data/catalog/todos` and `xyz.tinycloud.agent-data/catalog/todos/todo`. Otherwise use the new layout in the `applications` space with key `xyz.tinycloud.tinyapps.todos/todo/open/try-my-personal-apps`, done twin `xyz.tinycloud.tinyapps.todos/todo/done/try-my-personal-apps`, and catalog records `xyz.tinycloud.tinyapps.todos/catalog` and `xyz.tinycloud.tinyapps.todos/catalog/todo`, followed by the discovery entry `xyz.tinycloud.tinyapps.catalog/todos/entry` = `{"v":1,"app":"todos","id":"xyz.tinycloud.tinyapps.todos","title":"Todos"}`. If the `todos` app or its `todo` kind doesn't exist yet, write the catalog records first (skill §2 rule 2): the app record is `{"app":"todos","title":"Todos","about":"Things to do.","created":"<TODAY>","by":<client>}` and the kind record is `{"app":"todos","kind":"todo","about":"One record per thing to do.","shape":"item","states":["open","done"],"v":1,"fields":{"title":"text: what to do"}}`. Write commands are in skill §6 (`LEGACY.md` §6 in the old layout). Get that key and its done twin first (skill §5), and skip saving if either exists, so a todo the owner already ticked off isn't saved again. Afterwards tell the owner the key, that “What’s on my todo list?” shows it, and that you'll delete it on request (the skill's `kv delete`, §6).

Keep the owner's request, and note your client: `claude-code`, `codex` or `opencode` (any other agent: `codex`).

Run each block as one shell tool call from your project folder, exactly as written. Where a step has a block for each client, run only the block for yours. Install nothing else: the only installs are step 2's and step 2b's `npm install --prefix`; never `npm install -g`, `sudo` or `curl … | sh`. Don't use or change a `tc` on the `PATH`: other tools depend on it, and this skill needs its own.

## 1. Check

```sh
node --version
npm --version
printenv TC_BIN || "$HOME/.local/share/tc-apps/cli/node_modules/.bin/tinycloud" --version
```

- `node` older than `v22.20.0`, or `node` or `npm` not found → stop and tell the owner: "TinyCloud setup needs Node.js 22.20 or later, with npm. Install or update it, then send your request again." Don't install Node.js yourself.
- The last line prints a path (the owner set `TC_BIN`) or exactly `1.3.5` → the CLI is ready: skip step 2 of §2, and run the other steps as written. Any other version, such as `1.3.4` from an earlier setup, means run all the steps of §2: step 2 installs `1.3.5` in place of it.
- Anything else, such as `No such file or directory` → run all the steps of §2.

## 2. Install

Tell the owner in one line that you're installing the TinyCloud CLI and the `tc-apps` skill. Then run these steps in order, each as its own shell call, exactly as written, using only your client's block where a step has one for each client. The skill's files are fetched as plain files, checked against a checksum list and copied. Stop at the first step that fails.

If `agents.tinycloud.xyz` does not answer, stop and say so, as described below.

**Step 1. Folders.** The CLI's profile store, this skill's state folder, and a download folder.

```sh
mkdir -p -m 700 "${TC_HOME:-$HOME}/.tinycloud" "${TC_APPS_STATE:-$HOME/.local/state/tc-apps}" "$HOME/.local/share/tc-apps/skill"
```

**Step 2. The CLI,** unless §1 said it is ready. It goes into a private folder that only this skill uses.

```sh
npm install --prefix "$HOME/.local/share/tc-apps/cli" --no-audit --no-fund @tinycloud/cli@1.3.5
```

**Step 2b. The CLI for the per-app layout,** in a folder of its own, next to the one above. Health Log, Recipes and an app that still keeps its records in the old layout keep using the CLI from step 2. The per-app layout needs `1.5.0-beta.2` (the `beta` tag): its create-only write and its browser sign-in are not in `1.3.5`. This step skips the install if that version is already there.

```sh
B="$HOME/.local/share/tc-apps/cli-beta/node_modules/.bin/tinycloud"; { [ -x "$B" ] && [ "$("$B" --version)" = 1.5.0-beta.2 ]; } || npm install --prefix "$HOME/.local/share/tc-apps/cli-beta" --no-audit --no-fund @tinycloud/cli@1.5.0-beta.2
```

**Step 3. Download the skill's files** and their checksum list from this site. They are saved as plain files. Seven are scripts: `tc-wrapper.sh`, which step 6 installs; `announce.sh`, which prints the owner's approval message; `layout.sh`, which tells the skill which layout an app uses; `healthlog-context.mjs`, which checks Health Log's account and date; and `owner-grant.sh`, `owner-undo.sh` and `migrate.sh`, which the agent runs for approval, Undo and an owner-requested move from the old layout. The owner approves links and returns codes in chat, never in a separate terminal.

```sh
cd "$HOME/.local/share/tc-apps/skill" && curl -fsSL -O "https://agents.tinycloud.xyz/skills/apps/SHA256SUMS" -O "https://agents.tinycloud.xyz/skills/apps/SKILL.md" -O "https://agents.tinycloud.xyz/skills/apps/LEGACY.md" -O "https://agents.tinycloud.xyz/skills/apps/LEGACY-SQL.md" -O "https://agents.tinycloud.xyz/skills/apps/QUICKSTART.md" -O "https://agents.tinycloud.xyz/skills/apps/SQL.md" -O "https://agents.tinycloud.xyz/skills/apps/TINY-APPS.md" -O "https://agents.tinycloud.xyz/skills/apps/tc-wrapper.sh" -O "https://agents.tinycloud.xyz/skills/apps/announce.sh" -O "https://agents.tinycloud.xyz/skills/apps/owner-grant.sh" -O "https://agents.tinycloud.xyz/skills/apps/owner-undo.sh" -O "https://agents.tinycloud.xyz/skills/apps/migrate.sh" -O "https://agents.tinycloud.xyz/skills/apps/layout.sh" -O "https://agents.tinycloud.xyz/skills/apps/healthlog-context.mjs"
```

**Step 4. Check them.** Every file must print `OK`. Anything else: stop.

```sh
cd "$HOME/.local/share/tc-apps/skill" && { sha256sum -c SHA256SUMS || shasum -a 256 -c SHA256SUMS; }
```

**Step 5. Put the skill where your client looks for skills,** for your user, so every project folder sees it. Run only the block for your client. Don't copy the skill into both folders.

Claude Code:

```sh
cd "$HOME/.local/share/tc-apps/skill" && mkdir -p "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps" && cp SKILL.md LEGACY.md LEGACY-SQL.md QUICKSTART.md SQL.md TINY-APPS.md tc-wrapper.sh announce.sh owner-grant.sh owner-undo.sh migrate.sh layout.sh healthlog-context.mjs "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps/"
```

Codex and OpenCode:

```sh
cd "$HOME/.local/share/tc-apps/skill" && mkdir -p "$HOME/.agents/skills/tc-apps" && cp SKILL.md LEGACY.md LEGACY-SQL.md QUICKSTART.md SQL.md TINY-APPS.md tc-wrapper.sh announce.sh owner-grant.sh owner-undo.sh migrate.sh layout.sh healthlog-context.mjs "$HOME/.agents/skills/tc-apps/"
```

**Step 6. The helper script.** `cli-path` names the CLI (`TC_BIN` if the owner set it, otherwise the one from step 2). `tinycloud` is the skill's `tc-wrapper.sh`, copied from the download: a short script that runs that CLI and quietly retries when TinyCloud drops a connection. An earlier `tc` copy in that folder keeps working. The skill uses it when `TC_BIN` isn't set; with `TC_BIN` set, it runs that CLI directly.

```sh
printf '%s\n' "${TC_BIN:-$HOME/.local/share/tc-apps/cli/node_modules/.bin/tinycloud}" > "$HOME/.local/share/tc-apps/cli-path" && cp "$HOME/.local/share/tc-apps/skill/tc-wrapper.sh" "$HOME/.local/share/tc-apps/tinycloud" && chmod 755 "$HOME/.local/share/tc-apps/tinycloud"
```

**Step 7. Check the CLIs run.** The first prints `1.3.5`, or the version of the owner's `TC_BIN`; the second prints `1.5.0-beta.2`, or the version of the owner's `TC_BETA_BIN`.

```sh
"$HOME/.local/share/tc-apps/tinycloud" --version
"${TC_BETA_BIN:-$HOME/.local/share/tc-apps/cli-beta/node_modules/.bin/tinycloud}" --version
```

It takes about 30 s, almost all of it step 2.

If something goes wrong:
- **Codex:** its default sandbox blocks network access and writes outside the workspace, so steps 1 to 7 can fail there. Run steps 1 to 7 as one shell call, joined with `&&`, with `sandbox_permissions: "require_escalated"`, the justification "Install the TinyCloud CLI and the tc-apps skill" and `yield_time_ms: 30000`. If it returns a session id, poll it with `write_stdin` until the command exits. The owner approves it once. If escalation is unavailable, report the blocked install in chat; don't send terminal commands or ask the owner to restart.
- **Claude Code (or your client) denies a step or the sign-in, or asks to confirm it.** Show the owner the step and what it does: it installs the TinyCloud CLI and this skill for their user, or the sign-in saves a key and a 30-day session in their TinyCloud profile folder. Ask them to reply naming the step, as in <https://agents.tinycloud.xyz/apps#if-claude-code-still-blocks-it>, and run it again only once they agree. Don't edit their settings files, and don't run the step another way.
- **A step fails, or step 4 doesn't print `OK` for every file:** stop and report the error. Don't retry it with other options or in another folder.
- **`agents.tinycloud.xyz` does not answer** (step 3 fails): stop and say so to the owner. Don't switch to another source.

Wait until step 7 has printed its version before §3: the skill doesn't exist until then.

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

For the owner. Earlier versions kept all apps together in your `default` space. They keep working until you ask your agent in chat to "move my <app> records". Pause other agents that write the app while it moves. Your agent requests the app's approval, runs the dry run, and shows you the plan in chat. Once you agree, it runs the move, reads the records back and compares them before switching. Any mismatch leaves the old records untouched.

For the agent: follow `SKILL.md` §9. Run `migrate.sh` yourself, with `--dry-run` first, then without it only after the owner accepts the plan in chat. The script needs `jq` and step 2b's CLI. It never deletes the old records. A verified receipt in `<STATE>/migration/` records the switch; an agent on another computer can install that receipt at the owner's request. A move doesn't import old meal records into Health Log.

To go back, the owner asks in chat. Follow `SKILL.md` §9's going-back procedure; never remove the receipt before newer records have been copied and read back.

## Undo

The agent's access ends on its own: the Health Log grant after 7 days, and each app's sign-in after 30 days. To end it sooner, ask your agent in chat to undo access.

For the agent: run this helper in a live interactive tool session. Relay each confirmation to the owner in chat and send their answer to that process's stdin. If OpenKey shows a link, relay it and send the code returned in chat to the same session. Never ask the owner to run a command. Keep the same CLI and state paths used at setup; do not edit `meal-grant.json`.

```sh
sh "$HOME/.local/share/tc-apps/skill/owner-undo.sh"
```

The helper ends the earlier `agent-data` sign-ins and revokes the recorded Health Log grant. To end every per-app local sign-in as requested, the agent runs:

```sh
B=${TC_BETA_BIN:-$HOME/.local/share/tc-apps/cli-beta/node_modules/.bin/tinycloud}
for p in $("$B" profile list 2>/dev/null | grep -o 'tinyapp-[a-z0-9-]*'); do "$B" --profile "$p" auth logout; done
```

`PROFILE_NOT_FOUND` means that profile is already absent. If `meal-grant.json` is gone, the grant still ends after 7 days, as does a replaced grant. Per-app approvals remain valid on TinyCloud until they expire; clearing a local session is not revocation. The `default` sign-in stays because other tools use it.

If the owner asks to uninstall too, the agent removes this skill's install, state and client skill folder. The owner's records stay in TinyCloud.
