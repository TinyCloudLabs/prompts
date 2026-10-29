# Personal records in TinyCloud (`tc-apps`)

Your agent keeps your records, like meals, weight, workouts, goals or todos, in your own TinyCloud storage, organised into apps it creates and extends as you go. Each app has its own folder. Any agent on this computer, in any conversation, can find and read them.

## For the owner

- **What it does:** installs the `tc-apps` skill for your user, using the TinyCloud CLI and sign-in from [/onboarding](onboarding.md), then carries out your request. For a meal, weight or recipe, TinyCloud's own app for it (Health Log or Recipes) logs it.
- **Paste into your agent:** `Fetch https://agents.tinycloud.xyz/apps with curl and follow it. Log this meal in my TinyCloud: breakfast, two eggs and a slice of toast, about 350 kcal.`
  - **Claude Code:** it may ask you to confirm a step. See [Confirming a step in Claude Code](#if-claude-code-still-blocks-it).
  - **Codex:** its default sandbox can block the install. Approve the install escalation it asks for in chat; the agent performs the steps.
- **You approve:** nothing new after [/onboarding](onboarding.md): its starting grant covers your apps, Health Log and Recipes included. A fast, searchable copy of an app's records, or records from an earlier version, asks once with one OpenKey link; send back the code it shows. The agent runs every command and finishes the request; you never need a separate terminal.
- **Undo:** see [Undo](#undo).
- **Health Log account and date:** nothing to set or confirm. The agent saves the account you signed in with at /onboarding. It uses the page-saved timezone when available, otherwise its host's local IANA zone, else UTC. If the account this computer is signed in with changes, the agent says so in one line.

## Without the CLI

An agent that can't run the CLI but supports remote MCP, such as Claude on the web, iOS or Android, can add `https://mcp.tinycloud.xyz/mcp` as a custom connector ([/connect](connect.md) has the steps), sign in, and approve the connect and personal-record access links it shows you. Then ask naturally: “Log my weight: 80.5 kg today.” No local CLI or skill installation is needed for this connector.

In Claude, to avoid approving each record-writing tool call, go to **Settings → Connectors → TinyCloud**, find `tinycloud_apps_write`, and choose **Always allow**. This does not replace the OpenKey access approval.

## For the agent

The owner sent you this page with a request, for example "Log my weight: 80.5 kg today." This page installs the `tc-apps` skill; the TinyCloud CLI and the owner's sign-in come from [/onboarding](onboarding.md). Then you carry out the request with the skill, in this same conversation: don't ask the owner to send it again.

What is and isn't secret: [the list on the shared setup page](https://agents.tinycloud.xyz/agent#what-is-and-isnt-secret).

If the owner only asked for setup or named no record, save one default record without asking, after skill §1a and §3 have run and not before: app `todos`, kind `todo`, value `{"v":1,"at":"<UTC>","data":{"title":"Try my personal apps"},"by":<client>}`, where `<UTC>` is the clock's time from `date -u +%FT%TZ` (skill §1; run it again if it is more than 5 minutes old), never an estimate. Run skill §1a for `todos` first. If it prints `legacy`, an earlier version already keeps `todos` records for this owner: use the old layout (skill `LEGACY.md`) with key `xyz.tinycloud.agent-data/todos/todo/open/try-my-personal-apps` and done twin `xyz.tinycloud.agent-data/todos/todo/done/try-my-personal-apps`, and, if they don't exist yet, the catalog records `xyz.tinycloud.agent-data/catalog/todos` and `xyz.tinycloud.agent-data/catalog/todos/todo`. Otherwise use the new layout in the `applications` space with key `xyz.tinycloud.tinyapps.todos/todo/open/try-my-personal-apps`, done twin `xyz.tinycloud.tinyapps.todos/todo/done/try-my-personal-apps`, and catalog records `xyz.tinycloud.tinyapps.todos/catalog` and `xyz.tinycloud.tinyapps.todos/catalog/todo`, followed by the discovery entry `xyz.tinycloud.tinyapps.catalog/todos/entry` = `{"v":1,"app":"todos","id":"xyz.tinycloud.tinyapps.todos","title":"Todos"}`. If the `todos` app or its `todo` kind doesn't exist yet, write the catalog records first (skill §2 rule 2): the app record is `{"app":"todos","title":"Todos","about":"Things to do.","created":"<TODAY>","by":<client>}` and the kind record is `{"app":"todos","kind":"todo","about":"One record per thing to do.","shape":"item","states":["open","done"],"v":1,"fields":{"title":"text: what to do"}}`. Write commands are in skill §6 (`LEGACY.md` §6 in the old layout). Get that key and its done twin first (skill §5), and skip saving if either exists, so a todo the owner already ticked off isn't saved again. Afterwards tell the owner the key, that “What’s on my todo list?” shows it, and that you'll delete it on request (the skill's `kv delete`, §6).

Keep the owner's request, and note your client: `claude-code`, `codex` or `opencode` (any other agent: `codex`).

Run each block as one shell tool call from your project folder, exactly as written. Where a step has a block for each client, run only the block for yours. Install nothing else: this page installs only the skill's files, and the TinyCloud CLI comes from [/onboarding](onboarding.md); never `npm install -g`, `sudo` or `curl … | sh`. Don't use or change a `tc` on the `PATH`: other tools depend on it.

## 1. Check

```sh
node --version
npm --version
"${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud}" onboard --help > /dev/null && echo CLI_READY
```

- `node` older than `v22.20.0`, or `node` or `npm` not found → stop and tell the owner: "TinyCloud setup needs Node.js 22.20 or later, with npm. Install or update it, then send your request again." Don't install Node.js yourself.
- The last line is `CLI_READY` → skip step 2 of §2, and run the other steps as written.
- Anything else, such as `No such file or directory` → run all the steps of §2.

## 2. Install

Tell the owner in one line that you're installing the `tc-apps` skill. Then run these steps in order, each as its own shell call, exactly as written, using only your client's block where a step has one for each client. The skill's files are fetched as plain files, checked against a checksum list and copied. Stop at the first step that fails.

If `agents.tinycloud.xyz` does not answer, stop and say so, as described below.

**Step 1. Folders.** This skill's state folder, and a download folder.

```sh
mkdir -p -m 700 "${TC_APPS_STATE:-$HOME/.local/state/tc-apps}" "$HOME/.local/share/tc-apps/skill"
```

**Step 2. TinyCloud,** unless §1 printed `CLI_READY`. Fetch [/onboarding](onboarding.md) and follow it: it installs the TinyCloud CLI and signs the owner in. Then come back here for step 3, and keep the owner's request.

**Step 3. Download the skill's files** and their checksum list from this site. They are saved as plain files. Three are scripts: `layout.sh`, which tells the skill which layout an app uses; `healthlog-context.mjs`, which checks Health Log's account and owner-local date; and `migrate.sh`, which the agent runs to move an app from the old layout when the owner asks.

```sh
cd "$HOME/.local/share/tc-apps/skill" && curl -fsSL -O "https://agents.tinycloud.xyz/skills/apps/SHA256SUMS" -O "https://agents.tinycloud.xyz/skills/apps/SKILL.md" -O "https://agents.tinycloud.xyz/skills/apps/LEGACY.md" -O "https://agents.tinycloud.xyz/skills/apps/LEGACY-SQL.md" -O "https://agents.tinycloud.xyz/skills/apps/QUICKSTART.md" -O "https://agents.tinycloud.xyz/skills/apps/SQL.md" -O "https://agents.tinycloud.xyz/skills/apps/TINY-APPS.md" -O "https://agents.tinycloud.xyz/skills/apps/migrate.sh" -O "https://agents.tinycloud.xyz/skills/apps/layout.sh" -O "https://agents.tinycloud.xyz/skills/apps/healthlog-context.mjs"
```

**Step 4. Check them.** Every file must print `OK`. Anything else: stop.

```sh
cd "$HOME/.local/share/tc-apps/skill" && { sha256sum -c SHA256SUMS || shasum -a 256 -c SHA256SUMS; }
```

**Step 5. Put the skill where your client looks for skills,** for your user, so every project folder sees it. Run only the block for your client. Don't copy the skill into both folders.

Claude Code:

```sh
cd "$HOME/.local/share/tc-apps/skill" && mkdir -p "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps" && cp SKILL.md LEGACY.md LEGACY-SQL.md QUICKSTART.md SQL.md TINY-APPS.md migrate.sh layout.sh healthlog-context.mjs "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps/"
```

Codex, OpenCode and other agents:

```sh
cd "$HOME/.local/share/tc-apps/skill" && mkdir -p "$HOME/.agents/skills/tc-apps" && cp SKILL.md LEGACY.md LEGACY-SQL.md QUICKSTART.md SQL.md TINY-APPS.md migrate.sh layout.sh healthlog-context.mjs "$HOME/.agents/skills/tc-apps/"
```

If something goes wrong:
- **Codex:** its default sandbox blocks network access and writes outside the workspace, so steps 1 to 5 fail there. Run steps 1, 3, 4 and 5 as one shell call, joined with `&&`, with `sandbox_permissions: "require_escalated"`, the justification "Install the tc-apps skill" and `yield_time_ms: 30000`. If it returns a session id, poll it with `write_stdin` until the command exits. The owner approves it once. If escalation is unavailable, report the blocked install in chat; don't send terminal commands or ask the owner to restart.
- **Claude Code (or your client) denies a step, or asks to confirm it.** Show the owner the step and what it does: it installs this skill for their user. Ask them to reply naming the step, as in <https://agents.tinycloud.xyz/apps#if-claude-code-still-blocks-it>, and run it again only once they agree. Don't edit their settings files, and don't run the step another way.
- **A step fails, or step 4 doesn't print `OK` for every file:** stop and report the error. Don't retry it with other options or in another folder.
- **`agents.tinycloud.xyz` does not answer** (step 3 fails): stop and say so to the owner. Don't switch to another source.

Wait until step 5 has finished before §3: the skill doesn't exist until then.

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

For the owner. Earlier versions of this skill kept all apps together in your `default` space, under `xyz.tinycloud.agent-data/`. Those records stay there until you ask for them to be deleted. An app with records there keeps working as before until you ask your agent to move it: say "move my <app> records". Your agent asks once for access to that space with one OpenKey link, shows you the plan, and moves the app after you say it looks right, one app at a time. Pause other agents that write the app while it moves.

1. `migrate.sh --dry-run <app>` prints the plan and writes nothing. Without an app name it lists the apps found.
2. Without `--dry-run`, it copies the records into the app's own folder, creating each key only if it does not exist yet, then reads them back and compares the keys, the count and the contents, lists the old place again to catch edits made meanwhile, and only then marks the app as moved and saves a receipt, `~/.local/state/tc-apps/migration/<app>.receipt.json`, with counts and a digest.
3. If anything differs, collides or is refused, it prints `NOT SWITCHED` and stops. The old records are untouched and nothing is deleted. Fix the cause and run it again: keys that already hold the same content are recognised.

The script only reads the old place and never deletes. It needs `jq`. The app switches to its own folder only when the script has printed success and its receipt exists; any other result leaves the app exactly as it was. Copy the receipt to your other computers before you use the app there: it holds counts and a digest, no keys. A move doesn't import old meal records into Health Log: they are moved as they are.

To go back, the owner asks in chat. The agent follows `SKILL.md` §9's going-back procedure; it never removes the receipt before newer records have been copied and read back.

## Undo

For the owner. Every approval ends on its own after 30 days. To end one sooner, revoke it at https://account.tinycloud.xyz/delegations.

If the owner asks to uninstall too, the agent removes this skill's download folder, state and client skill folder. The owner's records stay in TinyCloud.
