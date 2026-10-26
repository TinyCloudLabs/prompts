# Personal records in TinyCloud (`tc-apps`)

Your agent keeps your records, like meals, weight, workouts, goals or todos, in your own TinyCloud storage, organised into apps it creates and extends as you go. Each app has its own folder and its own approval. Any agent on this computer, in any conversation, can find and read them.

## For the owner

- **What it does:** installs the TinyCloud CLI into a folder only this skill uses, and the `tc-apps` skill for your user, then carries out your request. For a meal, weight or recipe, TinyCloud's own app for it (Health Log or Recipes) logs it.
- **Paste into Claude Code, Codex or OpenCode:** `Fetch https://agents.tinycloud.xyz/apps with curl and follow it. Log this meal in my TinyCloud: breakfast, two eggs and a slice of toast, about 350 kcal.`
  - **Claude Code:** it may ask you to confirm a step. See [Confirming a step in Claude Code](#if-claude-code-still-blocks-it).
  - **Codex:** its default sandbox blocks network access and writes outside the project, so the install can't run there. Approve the one escalation Codex asks for, or start Codex with full access (`codex --sandbox danger-full-access`).
- **You approve:** for Health Log or Recipes, one OpenKey screen for the app, or two the first time on this computer. The first is your own sign-in to TinyCloud on this computer, for 7 days, so it lists access to your whole space: your data, and the delegations you've given. The second gives your agent access to just Health Log, for 7 days. Your agent tells you before they open. For any other record you track, such as workouts, goals or todos, one OpenKey screen per app, the first time you use it. It lets the agents on this computer keep that app's records in its own folder of your `applications` space, for 30 days, and nothing else; the next app asks again. OpenKey shows a code: paste it in the chat, or into your own terminal. If you later ask questions over many records of one app, the agent may ask for one more approval, for a fast, searchable copy of that app's records. If your browser asks to connect to devices on your network, choose Allow. If OpenKey shows a code, paste it into the terminal where the sign-in is running. If your agent asks you for the code, you can paste it in the chat.
- **Undo:** see [Undo](#undo).

## Use it in Claude (web, iOS, Android)

Add `https://mcp.tinycloud.xyz/mcp` as a custom connector in Claude, sign in, and approve the connect and personal-record access links it shows you. Then ask naturally: “Log my weight: 80.5 kg today.” No local CLI or skill installation is needed for this connector.

To avoid approving each record-writing tool call, go to **Settings → Connectors → TinyCloud**, find `tinycloud_apps_write`, and choose **Always allow**. This does not replace the OpenKey access approval.

## For the agent

The owner sent you this page with a request, for example "Log my weight: 80.5 kg today." This page installs the TinyCloud CLI and the `tc-apps` skill. Then you carry out the request with the skill, in this same conversation: don't ask the owner to send it again.

What is and isn't secret: [the list on the shared setup page](https://agents.tinycloud.xyz/agent#what-is-and-isnt-secret).

If the owner only asked for setup or named no record, save one default record without asking, after the `todos` app's sign-in is approved (skill §3 and §4) and not before: app `todos`, kind `todo`, key `xyz.tinycloud.tinyapps.todos/todo/open/try-my-personal-apps` in the `applications` space, value `{"v":1,"at":"<UTC>","data":{"title":"Try my personal apps"},"by":<client>}`, where `<UTC>` is the clock's time from `date -u +%FT%TZ` (skill §1; run it again if it is more than 5 minutes old), never an estimate. If skill §3a holds the `todos` app because an earlier version kept records for it, save nothing: tell the owner the app is held and how to move it (skill §9). If the `todos` app or its `todo` kind doesn't exist yet, write their catalog records first (skill §2 rule 2): `xyz.tinycloud.tinyapps.todos/catalog` = `{"app":"todos","title":"Todos","about":"Things to do.","created":"<TODAY>","by":<client>}` and `xyz.tinycloud.tinyapps.todos/catalog/todo` = `{"app":"todos","kind":"todo","about":"One record per thing to do.","shape":"item","states":["open","done"],"v":1,"fields":{"title":"text: what to do"}}`, then the app's discovery entry `xyz.tinycloud.tinyapps.catalog/todos/entry` = `{"v":1,"app":"todos","id":"xyz.tinycloud.tinyapps.todos","title":"Todos"}`. Write commands are in skill §6. Get that key and its done twin `xyz.tinycloud.tinyapps.todos/todo/done/try-my-personal-apps` first (skill §5), and skip saving if either exists, so a todo the owner already ticked off isn't saved again. Afterwards tell the owner the key, that “What’s on my todo list?” shows it, and that you'll delete it on request (the skill's `kv delete`, §6).

Keep the owner's request, and note your client: `claude-code`, `codex` or `opencode`.

Run each block as one shell tool call from your project folder, exactly as written. Where a step has a block for each client, run only the block for yours. Install nothing else: the only install is step 2's `npm install --prefix`; never `npm install -g`, `sudo` or `curl … | sh`. Don't use or change a `tc` on the `PATH`: other tools depend on it, and this skill needs its own.

## 1. Check

```sh
node --version
npm --version
printenv TC_BIN || "$HOME/.local/share/tc-apps/cli/node_modules/.bin/tinycloud" --version
```

- `node` older than `v22.20.0`, or `node` or `npm` not found → stop and tell the owner: "TinyCloud setup needs Node.js 22.20 or later, with npm. Install or update it, then send your request again." Don't install Node.js yourself.
- The last line prints a path (the owner set `TC_BIN`) or exactly `1.5.0-beta.2` → the CLI is ready: skip step 2 of §2, and run the other steps as written. Any other version, such as `1.3.5` from an earlier setup, means run all the steps of §2: step 2 installs `1.5.0-beta.2` in place of it.
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
npm install --prefix "$HOME/.local/share/tc-apps/cli" --no-audit --no-fund @tinycloud/cli@1.5.0-beta.2
```

**Step 3. Download the skill's files** and their checksum list from this site. They are saved as plain files. Five are scripts: `tc-wrapper.sh`, which step 6 installs; `announce.sh`, which prints the owner's approval message; and `owner-grant.sh`, `owner-undo.sh` and `migrate.sh`, which the owner runs in their own terminal for the approval, for Undo and for moving records from an earlier version.

```sh
cd "$HOME/.local/share/tc-apps/skill" && curl -fsSL -O "https://agents.tinycloud.xyz/skills/apps/SHA256SUMS" -O "https://agents.tinycloud.xyz/skills/apps/SKILL.md" -O "https://agents.tinycloud.xyz/skills/apps/QUICKSTART.md" -O "https://agents.tinycloud.xyz/skills/apps/SQL.md" -O "https://agents.tinycloud.xyz/skills/apps/TINY-APPS.md" -O "https://agents.tinycloud.xyz/skills/apps/tc-wrapper.sh" -O "https://agents.tinycloud.xyz/skills/apps/announce.sh" -O "https://agents.tinycloud.xyz/skills/apps/owner-grant.sh" -O "https://agents.tinycloud.xyz/skills/apps/owner-undo.sh" -O "https://agents.tinycloud.xyz/skills/apps/migrate.sh"
```

**Step 4. Check them.** Every file must print `OK`. Anything else: stop.

```sh
cd "$HOME/.local/share/tc-apps/skill" && { sha256sum -c SHA256SUMS || shasum -a 256 -c SHA256SUMS; }
```

**Step 5. Put the skill where your client looks for skills,** for your user, so every project folder sees it. Run only the block for your client. Don't copy the skill into both folders.

Claude Code:

```sh
cd "$HOME/.local/share/tc-apps/skill" && mkdir -p "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps" && cp SKILL.md QUICKSTART.md SQL.md TINY-APPS.md tc-wrapper.sh announce.sh owner-grant.sh owner-undo.sh migrate.sh "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps/"
```

Codex and OpenCode:

```sh
cd "$HOME/.local/share/tc-apps/skill" && mkdir -p "$HOME/.agents/skills/tc-apps" && cp SKILL.md QUICKSTART.md SQL.md TINY-APPS.md tc-wrapper.sh announce.sh owner-grant.sh owner-undo.sh migrate.sh "$HOME/.agents/skills/tc-apps/"
```

**Step 6. The helper script.** `cli-path` names the CLI (`TC_BIN` if the owner set it, otherwise the one from step 2). `tinycloud` is the skill's `tc-wrapper.sh`, copied from the download: a short script that runs that CLI and quietly retries when TinyCloud drops a connection. An earlier `tc` copy in that folder keeps working. The skill uses it when `TC_BIN` isn't set; with `TC_BIN` set, it runs that CLI directly.

```sh
printf '%s\n' "${TC_BIN:-$HOME/.local/share/tc-apps/cli/node_modules/.bin/tinycloud}" > "$HOME/.local/share/tc-apps/cli-path" && cp "$HOME/.local/share/tc-apps/skill/tc-wrapper.sh" "$HOME/.local/share/tc-apps/tinycloud" && chmod 755 "$HOME/.local/share/tc-apps/tinycloud"
```

**Step 7. Check the CLI runs.** It prints `1.5.0-beta.2`, or the version of the owner's `TC_BIN`.

```sh
"$HOME/.local/share/tc-apps/tinycloud" --version
```

It takes about 30 s, almost all of it step 2.

If something goes wrong:
- **Codex:** its default sandbox blocks network access and writes outside the workspace, so steps 1 to 7 fail there. Run steps 1 to 7 as one shell call, joined with `&&`, with `sandbox_permissions: "require_escalated"`, the justification "Install the TinyCloud CLI and the tc-apps skill" and `yield_time_ms: 30000`. If it returns a session id, poll it with `write_stdin` until the command exits. The owner approves it once. If Codex can't escalate (for example a read-only sandbox with approvals off), stop and tell the owner to start Codex with `--sandbox danger-full-access` and send the request again.
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

The first is for Claude Code, the second for Codex and OpenCode. Your client may not list the new skill until it restarts; you don't need it to.

Follow the skill now for the owner's request, from its §1.

**OpenCode only:** OpenCode loads skills when it starts, so new conversations in this window won't know the skill yet. Claude Code and Codex pick it up by themselves. When you've finished the request, add one line to your last message: "Restart OpenCode once, so new conversations can use your TinyCloud apps."

<a id="if-claude-code-still-blocks-it"></a>

## Confirming a step in Claude Code

Claude Code can ask you to confirm a step before it runs. Reply with the step, for example: "Go ahead: install the tc-apps skill from agents.tinycloud.xyz." Name the step, because a reply without it may not be enough.

**For coding agents:** when Claude Code denies a step or asks the owner to confirm it, show them the step and the exact "Go ahead: …" reply from above for them to send, then wait for their answer.

Owners can read about an optional Claude Code setting for the sign-in command at https://agents.tinycloud.xyz/owner.

## Moving records from an earlier version

For the owner. Earlier versions of this skill kept all apps together in your `default` space, under `xyz.tinycloud.agent-data/`. Those records stay there until you ask for them to be deleted. An app with records there is held: your agent reads and writes nothing for it until you move it, one app at a time, in your own terminal. Pause other agents that write the app, and update the skill on each of your computers first.

1. `sh "$HOME/.local/share/tc-apps/skill/migrate.sh" --dry-run <app>` prints the plan and writes nothing. Without an app name it lists the apps found. Add `--source-profile default` to read the old records with your own sign-in when the agent's earlier sign-in has expired.
2. Run it without `--dry-run`. It copies the records into the app's own folder, creating each key only if it does not exist yet, then reads them back and compares the keys, the count and the contents, lists the old place again to catch edits made meanwhile, and only then marks the app as moved and saves a receipt, `~/.local/state/tc-apps/migration/<app>.receipt.json`, with counts and a digest.
3. If anything differs, collides or is refused, it prints `NOT SWITCHED` and stops. The old records are untouched and nothing is deleted. Fix the cause and run it again: keys that already hold the same content are recognised.

The script only reads the old place and never deletes. It needs `jq`. It needs your agent's sign-in for the app first, so the agent requests that approval before it gives you the command. A move doesn't import old meal records into Health Log: they are moved as they are.

To go back, stop writing the app. Records written in `applications` since the move exist only there, so copy them to the old place first, create-only, and read each back before the old place is used again. If a key differs between the two places, keep both and ask which is right.

## Undo

For the owner. Run these in your own terminal, not in an AI agent's shell: each revoke asks you to confirm `[y/N]` in that terminal, and an agent's shell can't answer it. Use a terminal where `TC_BIN` and `TC_HOME` have the values you started the client with, or are unset if you never set them.

The agent's access ends on its own: the Health Log grant after 7 days, and each app's sign-in after 30 days. To end it sooner, run the helper below in your own terminal. The current Health Log grant asks `[y/N]` there: answer `y`, then approve the OpenKey screen if one opens. `profile delete agent-meal` also asks `[y/N]`. Your `default` sign-in stays, because other TinyCloud tools use it. Undo revokes the grant recorded in `meal-grant.json`; do not edit that file.

```sh
sh "$HOME/.local/share/tc-apps/skill/owner-undo.sh"
```

That helper ends the earlier `agent-data` sign-ins. To end every per-app sign-in on this computer, run this in the same terminal. It clears the local session of each `tinyapp-` profile; the approvals themselves stay valid on TinyCloud until they expire:

```sh
W=$HOME/.local/share/tc-apps; TC=${TC_BIN:-}; [ -n "$TC" ] || { TC=$W/tinycloud; [ -x "$TC" ] || TC=$W/tc; }
for p in $("$TC" profile list 2>/dev/null | grep -o 'tinyapp-[a-z0-9-]*'); do "$TC" --profile "$p" auth logout; done
```

`PROFILE_NOT_FOUND` means you never signed in to that one; that's fine. Without `jq`, copy the `delegationCid` from `meal-grant.json`, then run `delegation revoke -- <cid>` with the same client, in the same terminal. If `meal-grant.json` is gone, the Health Log grant still ends on its own after 7 days, and so does a grant that a renewal replaced. If the agent gave you a different state folder or client path, set `TC_APPS_STATE` or `TC_BIN` to those before running the helper.

To remove the rest, delete `~/.local/share/tc-apps`, `~/.local/state/tc-apps`, and the skill folder: `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-apps` or `~/.agents/skills/tc-apps`. Your records stay in your TinyCloud.
