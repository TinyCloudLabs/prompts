# Set up `tc-apps`

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
- The last line prints a path (the owner set `TC_BIN`) or `1.0.0` → the CLI is ready: leave out the `npm install` line in §2.
- Anything else, such as `No such file or directory` → run §2 as written.

## 2. Install

Tell the owner in one line that you're installing the TinyCloud CLI and the `tc-apps` skill. Then run:

```sh
mkdir -p -m 700 "${TC_HOME:-$HOME}/.tinycloud" "${TC_APPS_STATE:-$HOME/.local/state/tc-apps}"
npm install --prefix "$HOME/.local/share/tc-apps/cli" --no-audit --no-fund @tinycloud/cli@1.0.0
npx --yes skills@1.7.0 add https://github.com/TinyCloudLabs/prompts/archive/refs/heads/feat/tc-apps.tar.gz --skill tc-apps --agent <client> --global --copy --yes
```

- **The first line** creates the CLI's profile store and this skill's state folder if they don't exist yet.
- **The CLI** goes into a private folder that only this skill uses.
- **The skill** is installed for your user, so every project folder sees it: `~/.claude/skills/tc-apps/` for Claude Code, `~/.agents/skills/tc-apps/` for Codex and OpenCode.
- It takes about 30 s.

If something goes wrong:
- **Codex:** the sandbox doesn't let npm or the skills installer write outside the workspace. It can write the two folders from the first line only once they exist. Run the block with `sandbox_permissions: "require_escalated"`, the justification "Install the TinyCloud CLI and the tc-apps skill" and `yield_time_ms: 30000`. If it returns a session id, poll it with `write_stdin` until the command exits. The owner approves it once.
- If a command fails, stop and report its error. Don't retry it with other options or in another folder.

## 3. Carry on with the skill

Read the installed skill in full, with the line for your client:

```sh
cat "$HOME/.claude/skills/tc-apps/SKILL.md"
```

```sh
cat "$HOME/.agents/skills/tc-apps/SKILL.md"
```

The first is for Claude Code, the second for Codex and OpenCode. Your client may not list the new skill until it restarts; you don't need it to.

Follow the skill now for the owner's request, from its §1.
