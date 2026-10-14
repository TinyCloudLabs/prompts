# Personal records in TinyCloud (`tc-apps`)

Your agent keeps your records, like weight, workouts, goals or todos, in your own TinyCloud storage, organised into apps it creates and extends as you go. Any agent on this computer, in any conversation, can find and read them.

## For the owner

- **What it does:** installs the TinyCloud CLI 1.2.3 into a folder only this skill uses and the `tc-apps` skill for your user, then carries out your request.
- **Paste into Claude Code, Codex or OpenCode:** `Log my weight: 80.5 kg today. Set it up with TinyCloud: https://agents.tinycloud.xyz/apps`
  - **Codex:** its default sandbox blocks network access and writes outside the project, so the install can't run there. Approve the one escalation Codex asks for, or start Codex with full access (`codex --sandbox danger-full-access`).
- **You approve:** your agent shows you an OpenKey link and code. Check the code, sign in with your passkey and approve: it lets the agents on this computer keep records under `xyz.tinycloud.agent-data/` in your `default` space, for 30 days. If you later ask questions over many records, the agent may ask for one more approval, for a SQL index of the same records.
- **Undo:** see [Undo](#undo).

## Use it in Claude (web, iOS, Android)

Add `https://mcp.tinycloud.xyz/mcp` as a custom connector in Claude, sign in, and approve the connect and personal-record access links it shows you. Then ask naturally: “Log my weight: 80.5 kg today.” No local CLI or skill installation is needed for this connector.

To avoid approving each record-writing tool call, go to **Settings → Connectors → TinyCloud**, find `tinycloud_apps_write`, and choose **Always allow**. This does not replace the OpenKey access approval.

## For the agent

The owner sent you this page with a request, for example "Log my weight: 80.5 kg today." This page installs the TinyCloud CLI and the `tc-apps` skill. Then you carry out the request with the skill, in this same conversation: don't ask the owner to send it again.

Keep the owner's request, and note your client: `claude-code`, `codex` or `opencode`.

Run each block as one shell tool call from your project folder, exactly as written apart from `<client>`. Install nothing else. Don't use or change a `tc` on the `PATH`: other tools depend on it, and this skill needs its own.

## 1. Check

```sh
node --version
npm --version
printenv TC_BIN || "$HOME/.local/share/tc-apps/cli/node_modules/.bin/tc" --version
```

- `node` older than `v22.20.0`, or `node` or `npm` not found → stop and tell the owner: "TinyCloud setup needs Node.js 22.20 or later, with npm. Install or update it, then send your request again." Don't install Node.js yourself.
- The last line prints a path (the owner set `TC_BIN`) or `1.2.3` → the CLI is ready: leave out the whole `npm install` line in §2, and run the rest of §2 as written.
- Anything else, such as `No such file or directory` → run §2 as written.

## 2. Install

Tell the owner in one line that you're installing the TinyCloud CLI and the `tc-apps` skill. Then run:

```sh
mkdir -p -m 700 "${TC_HOME:-$HOME}/.tinycloud" "${TC_APPS_STATE:-$HOME/.local/state/tc-apps}" "$HOME/.local/share/tc-apps" &&
npm install --prefix "$HOME/.local/share/tc-apps/cli" --no-audit --no-fund @tinycloud/cli@1.2.3 &&
curl -fsSL https://agents.tinycloud.xyz/skills/install.js -o "$HOME/.local/share/tc-apps/install-skill.js" &&
D=$(node "$HOME/.local/share/tc-apps/install-skill.js" apps --agent <client>) && echo "$D" &&
printf '%s\n' "${TC_BIN:-$HOME/.local/share/tc-apps/cli/node_modules/.bin/tc}" > "$HOME/.local/share/tc-apps/cli-path" &&
cp "${D#SKILL_INSTALLED * * }/tc-wrapper.sh" "$HOME/.local/share/tc-apps/tc" &&
chmod 755 "$HOME/.local/share/tc-apps/tc" && echo INSTALLED
```

- **The first line** creates the CLI's profile store, this skill's state folder, and the CLI's folder, if they don't exist yet.
- **The CLI** goes into a private folder that only this skill uses.
- **The skill** comes from this site: the installer, saved as `~/.local/share/tc-apps/install-skill.js`, checks every file against the site's `/skills/index.json` before it writes anything. It's installed for your user, so every project folder sees it: `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-apps/` for Claude Code, `~/.agents/skills/tc-apps/` for Codex and OpenCode. The installer prints `SKILL_INSTALLED tc-apps <version> <folder>`.
- **The last lines** write `cli-path`, which names the CLI (`TC_BIN` if the owner set it, otherwise the one in `~/.local/share/tc-apps/cli`), and copy the skill's `tc-wrapper.sh` to `~/.local/share/tc-apps/tc`: a short script that runs that CLI and quietly retries when TinyCloud drops a connection. The skill uses the script when `TC_BIN` isn't set; with `TC_BIN` set, it runs that CLI directly.
- **Each line runs only if the one before it worked.** The block ends by printing `INSTALLED`.
- It takes about 30 s.

If something goes wrong:
- **Codex:** its default sandbox blocks network access and writes outside the workspace, so npm, the download and the installer fail there. Run the block with `sandbox_permissions: "require_escalated"`, the justification "Install the TinyCloud CLI and the tc-apps skill" and `yield_time_ms: 30000`. If it returns a session id, poll it with `write_stdin` until the command exits. The owner approves it once. If Codex can't escalate (for example a read-only sandbox with approvals off), stop and tell the owner to start Codex with `--sandbox danger-full-access` and send the request again.
- **Your client refuses the block,** for example Claude Code's auto mode with "Unauthorized Persistence". Show the owner the block, say that it installs the TinyCloud CLI and this skill for their user, and ask them to allow it. Run it again only once they agree.
- **A command fails, or the block doesn't print `INSTALLED`:** stop and report the error. Don't retry it with other options or in another folder.

Wait until the block has finished before §3: the skill doesn't exist until then.

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

## Undo

For the owner. Run these in a terminal where `TC_BIN` and `TC_HOME` have the values you started the client with, or are unset if you never set them: `TC_BIN` picks the CLI (otherwise the setup's `~/.local/share/tc-apps/tc`), and the CLI reads `TC_HOME` to find its profiles.

If you signed in, each command clears one local session. The approvals stay valid on TinyCloud until they expire, after 30 days. `PROFILE_NOT_FOUND` means you never signed in to that one; that's fine.

```sh
"${TC_BIN:-$HOME/.local/share/tc-apps/tc}" --profile agent-data auth logout
"${TC_BIN:-$HOME/.local/share/tc-apps/tc}" --profile agent-data-sql auth logout
```

To remove the rest, delete `~/.local/share/tc-apps`, `~/.local/state/tc-apps`, and the skill folder: `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-apps` or `~/.agents/skills/tc-apps`. Your records stay in your TinyCloud.
