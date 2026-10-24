# Personal records in TinyCloud (`tc-apps`)

Your agent keeps your records, like meals, weight, workouts, goals or todos, in your own TinyCloud storage, organised into apps it creates and extends as you go. Any agent on this computer, in any conversation, can find and read them.

## For the owner

- **What it does:** installs the TinyCloud CLI into a folder only this skill uses, and the `tc-apps` skill for your user, then carries out your request. For a meal, weight or recipe, TinyCloud's own app for it (Health Log or Recipes) logs it.
- **Paste into Claude Code, Codex or OpenCode:** `Fetch https://agents.tinycloud.xyz/apps with curl and follow it. Log this meal in my TinyCloud: breakfast, two eggs and a slice of toast, about 350 kcal.`
  - **Claude Code auto mode:** if it blocks a step, see [If Claude Code still blocks it](#if-claude-code-still-blocks-it).
  - **Codex:** its default sandbox blocks network access and writes outside the project, so the install can't run there. Approve the one escalation Codex asks for, or start Codex with full access (`codex --sandbox danger-full-access`).
- **You approve:** one OpenKey screen for the app, or two the first time on this computer. The first is your own sign-in to TinyCloud on this computer, for 7 days, so it lists access to your whole space: your data, and the delegations you've given. The second gives your agent access to just Health Log, for 7 days. Your agent tells you before they open. Otherwise it lets the agents on this computer keep your records in your TinyCloud, for 30 days. If you later ask questions over many records, the agent may ask for one more approval, for a fast, searchable copy of the same records. If your browser asks to connect to devices on your network, choose Allow. If OpenKey shows a code, paste it into the terminal where the sign-in is running. If your agent asks you for the code, you can paste it in the chat.
- **Undo:** see [Undo](#undo).

## Use it in Claude (web, iOS, Android)

Add `https://mcp.tinycloud.xyz/mcp` as a custom connector in Claude, sign in, and approve the connect and personal-record access links it shows you. Then ask naturally: “Log my weight: 80.5 kg today.” No local CLI or skill installation is needed for this connector.

To avoid approving each record-writing tool call, go to **Settings → Connectors → TinyCloud**, find `tinycloud_apps_write`, and choose **Always allow**. This does not replace the OpenKey access approval.

## For the agent

The owner sent you this page with a request, for example "Log my weight: 80.5 kg today." This page installs the TinyCloud CLI and the `tc-apps` skill. Then you carry out the request with the skill, in this same conversation: don't ask the owner to send it again.

What is and isn't secret: [the list on the shared setup page](https://agents.tinycloud.xyz/agent#what-is-and-isnt-secret).

If the owner only asked for setup or named no record, save one default record without asking, after sign-in is approved (skill §4) and not before: app `todos`, kind `todo`, key `xyz.tinycloud.agent-data/todos/todo/open/try-my-personal-apps`, value `{"v":1,"at":"<UTC>","data":{"title":"Try my personal apps"},"by":<client>}`, where `<UTC>` is the clock's time from `date -u +%FT%TZ` (skill §1; run it again if it is more than 5 minutes old), never an estimate. If the `todos` app or its `todo` kind doesn't exist yet, write their catalog records first (skill §2 rule 2): `xyz.tinycloud.agent-data/catalog/todos` = `{"app":"todos","title":"Todos","about":"Things to do.","created":"<TODAY>","by":<client>}` and `xyz.tinycloud.agent-data/catalog/todos/todo` = `{"app":"todos","kind":"todo","about":"One record per thing to do.","shape":"item","states":["open","done"],"v":1,"fields":{"title":"text: what to do"}}`. Write commands are in skill §6. Get that key and its done twin `xyz.tinycloud.agent-data/todos/todo/done/try-my-personal-apps` first (skill §5), and skip saving if either exists, so a todo the owner already ticked off isn't saved again. Afterwards tell the owner the key, that “What’s on my todo list?” shows it, and that you'll delete it on request (the skill's `kv delete`, §6).

Keep the owner's request, and note your client: `claude-code`, `codex` or `opencode`.

Run each block as one shell tool call from your project folder, exactly as written apart from `<client>`. Install nothing else: the only install is step 2's `npm install --prefix`; never `npm install -g`, `sudo` or `curl … | sh`. Don't use or change a `tc` on the `PATH`: other tools depend on it, and this skill needs its own.

## 1. Check

```sh
node --version
npm --version
printenv TC_BIN || "$HOME/.local/share/tc-apps/cli/node_modules/.bin/tc" --version
```

- `node` older than `v22.20.0`, or `node` or `npm` not found → stop and tell the owner: "TinyCloud setup needs Node.js 22.20 or later, with npm. Install or update it, then send your request again." Don't install Node.js yourself.
- The last line prints a path (the owner set `TC_BIN`) or exactly `1.3.4` → the CLI is ready: skip step 2 of §2, and run the other steps as written. Any other version, such as `1.3.0` or an older `1.2.5` from an earlier setup, means run all the steps of §2: step 2 installs `1.3.4` in place of it.
- Anything else, such as `No such file or directory` → run all the steps of §2.

## 2. Install

Tell the owner in one line that you're installing the TinyCloud CLI and the `tc-apps` skill. Then run these steps in order, each as its own shell call, exactly as written. The skill's files are fetched as plain files, checked against a checksum list and copied. Stop at the first step that fails.

If `agents.tinycloud.xyz` does not answer, stop and say so, as described below.

**Step 1. Folders.** The CLI's profile store, this skill's state folder, and a download folder.

```sh
mkdir -p -m 700 "${TC_HOME:-$HOME}/.tinycloud" "${TC_APPS_STATE:-$HOME/.local/state/tc-apps}" "$HOME/.local/share/tc-apps/skill"
```

**Step 2. The CLI,** unless §1 said it is ready. It goes into a private folder that only this skill uses.

```sh
npm install --prefix "$HOME/.local/share/tc-apps/cli" --no-audit --no-fund @tinycloud/cli@1.3.4
```

**Step 3. Download the skill's files** and their checksum list from this site. They are saved as plain files. Four are scripts: `tc-wrapper.sh`, which step 6 installs; `announce.sh`, which prints the owner's approval message; and `owner-grant.sh` and `owner-undo.sh`, which the owner runs in their own terminal for the approval and for Undo.

```sh
cd "$HOME/.local/share/tc-apps/skill" && curl -fsSL -O "https://agents.tinycloud.xyz/skills/apps/SHA256SUMS" -O "https://agents.tinycloud.xyz/skills/apps/SKILL.md" -O "https://agents.tinycloud.xyz/skills/apps/QUICKSTART.md" -O "https://agents.tinycloud.xyz/skills/apps/SQL.md" -O "https://agents.tinycloud.xyz/skills/apps/TINY-APPS.md" -O "https://agents.tinycloud.xyz/skills/apps/tc-wrapper.sh" -O "https://agents.tinycloud.xyz/skills/apps/announce.sh" -O "https://agents.tinycloud.xyz/skills/apps/owner-grant.sh" -O "https://agents.tinycloud.xyz/skills/apps/owner-undo.sh"
```

**Step 4. Check them.** Every file must print `OK`. Anything else: stop.

```sh
cd "$HOME/.local/share/tc-apps/skill" && { sha256sum -c SHA256SUMS || shasum -a 256 -c SHA256SUMS; }
```

**Step 5. Put the skill where your client looks for skills,** for your user, so every project folder sees it. Use the block for your client.

Claude Code:

```sh
cd "$HOME/.local/share/tc-apps/skill" && mkdir -p "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps" && cp SKILL.md QUICKSTART.md SQL.md TINY-APPS.md tc-wrapper.sh announce.sh owner-grant.sh owner-undo.sh "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps/"
```

Codex and OpenCode:

```sh
cd "$HOME/.local/share/tc-apps/skill" && mkdir -p "$HOME/.agents/skills/tc-apps" && cp SKILL.md QUICKSTART.md SQL.md TINY-APPS.md tc-wrapper.sh announce.sh owner-grant.sh owner-undo.sh "$HOME/.agents/skills/tc-apps/"
```

**Step 6. The helper script.** `cli-path` names the CLI (`TC_BIN` if the owner set it, otherwise the one from step 2). `tc` is the skill's `tc-wrapper.sh`, copied from the download: a short script that runs that CLI and quietly retries when TinyCloud drops a connection. The skill uses it when `TC_BIN` isn't set; with `TC_BIN` set, it runs that CLI directly.

```sh
printf '%s\n' "${TC_BIN:-$HOME/.local/share/tc-apps/cli/node_modules/.bin/tc}" > "$HOME/.local/share/tc-apps/cli-path" && cp "$HOME/.local/share/tc-apps/skill/tc-wrapper.sh" "$HOME/.local/share/tc-apps/tc" && chmod 755 "$HOME/.local/share/tc-apps/tc"
```

**Step 7. Check the CLI runs.** It prints `1.3.4`, or the version of the owner's `TC_BIN`.

```sh
"$HOME/.local/share/tc-apps/tc" --version
```

It takes about 30 s, almost all of it step 2.

If something goes wrong:
- **Codex:** its default sandbox blocks network access and writes outside the workspace, so steps 1 to 7 fail there. Run steps 1 to 7 as one shell call, joined with `&&`, with `sandbox_permissions: "require_escalated"`, the justification "Install the TinyCloud CLI and the tc-apps skill" and `yield_time_ms: 30000`. If it returns a session id, poll it with `write_stdin` until the command exits. The owner approves it once. If Codex can't escalate (for example a read-only sandbox with approvals off), stop and tell the owner to start Codex with `--sandbox danger-full-access` and send the request again.
- **Your client refuses a step or the sign-in,** for example Claude Code's auto mode with "Unauthorized Persistence", "Code from External" or "Instruction Poisoning". Show the owner the step, say that it installs the TinyCloud CLI and this skill for their user, or that the sign-in saves a key and a 30-day session in their TinyCloud profile folder, and ask them to allow it. Run it again only once they agree. If it is still blocked after they agree, show them <https://agents.tinycloud.xyz/apps#if-claude-code-still-blocks-it> and wait. Don't edit their settings files, and don't run the step another way.
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

## If Claude Code still blocks it

Claude Code's auto mode can refuse the install or the sign-in step, for example as "Code from External", "Instruction Poisoning" or "Unauthorized Persistence", because the setup runs code from npm and this site, writes a skill your agent reads, and saves a key and a sign-in on your computer. If it blocks the install, reply that you allow it, naming what it does: "Go ahead: install @tinycloud/cli from npm and the tc-apps skill from agents.tinycloud.xyz." If it blocks the sign-in, reply "Go ahead: save the TinyCloud sign-in in ~/.tinycloud."

**For coding agents:** if Claude Code refuses a step, show the owner this section and wait for their reply.

Owners can read about an optional Claude Code setting for the sign-in command at https://agents.tinycloud.xyz/owner.

## Undo

For the owner. Run these in your own terminal, not in an AI agent's shell: each revoke asks you to confirm `[y/N]` in that terminal, and an agent's shell can't answer it. Use a terminal where `TC_BIN` and `TC_HOME` have the values you started the client with, or are unset if you never set them.

The agent's access ends on its own: the Health Log grant after 7 days, and the `agent-data` sign-in after 30 days. To end it sooner, run the helper below in your own terminal. The current Health Log grant asks `[y/N]` there: answer `y`, then approve the OpenKey screen if one opens. `profile delete agent-meal` also asks `[y/N]`. Your `default` sign-in stays, because other TinyCloud tools use it. Undo revokes the grant recorded in `meal-grant.json`; do not edit that file.

```sh
sh "$HOME/.local/share/tc-apps/skill/owner-undo.sh"
```

`PROFILE_NOT_FOUND` means you never signed in to that one; that's fine. Without `jq`, copy the `delegationCid` from `meal-grant.json`, then run `delegation revoke -- <cid>` with the same client, in the same terminal. If `meal-grant.json` is gone, the Health Log grant still ends on its own after 7 days, and so does a grant that a renewal replaced. If the agent gave you a different state folder or client path, set `TC_APPS_STATE` or `TC_BIN` to those before running the helper.

To remove the rest, delete `~/.local/share/tc-apps`, `~/.local/state/tc-apps`, and the skill folder: `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-apps` or `~/.agents/skills/tc-apps`. Your records stay in your TinyCloud.
