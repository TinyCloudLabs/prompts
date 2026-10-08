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
mkdir -p -m 700 "${TC_HOME:-$HOME}/.tinycloud" "${TC_APPS_STATE:-$HOME/.local/state/tc-apps}" "$HOME/.local/share/tc-apps"
npm install --prefix "$HOME/.local/share/tc-apps/cli" --no-audit --no-fund @tinycloud/cli@1.0.0
npx --yes skills@1.7.0 add https://github.com/TinyCloudLabs/prompts/archive/refs/heads/docs/initial-setup-split.tar.gz --skill tc-apps --agent <client> --global --copy --yes
cat > "$HOME/.local/share/tc-apps/tc" <<'EOF'
#!/bin/sh
# tc-apps: runs TinyCloud CLI 1.0.0. A kv or sql command that fails with NETWORK_ERROR (a dropped connection,
# "fetch failed") runs again, up to twice, after 2 s and 4 s; only the last attempt's error is shown.
CLI="$(dirname "$0")/cli/node_modules/.bin/tc"
case "$1" in kv|sql) ;; *) exec "$CLI" "$@" ;; esac
case " $* " in *" --stdin "*) IN=$(cat) ;; *) IN= ;; esac
exec 3>&1
for n in 1 2 3; do
  E=$(printf '%s\n' "$IN" | "$CLI" "$@" 2>&1 >&3 3>&-); c=$?
  [ $c -ne 0 ] && [ $n -lt 3 ] && case "$E" in *NETWORK_ERROR*) sleep $((n * 2)); continue ;; esac
  break
done
[ -z "$E" ] || printf '%s\n' "$E" >&2
exit $c
EOF
chmod 755 "$HOME/.local/share/tc-apps/tc"
```

- **The first line** creates the CLI's profile store, this skill's state folder, and the CLI's folder, if they don't exist yet.
- **The CLI** goes into a private folder that only this skill uses.
- **The skill** is installed for your user, so every project folder sees it: `~/.claude/skills/tc-apps/` for Claude Code, `~/.agents/skills/tc-apps/` for Codex and OpenCode.
- **The last lines** write `~/.local/share/tc-apps/tc`, a short script that runs the CLI and quietly retries when TinyCloud drops a connection. The skill uses it.
- It takes about 30 s.

If something goes wrong:
- **Codex:** the sandbox doesn't let npm or the skills installer write outside the workspace. It can write the profile store and the state folder only once they exist. Run the block with `sandbox_permissions: "require_escalated"`, the justification "Install the TinyCloud CLI and the tc-apps skill" and `yield_time_ms: 30000`. If it returns a session id, poll it with `write_stdin` until the command exits. The owner approves it once.
- **Your client refuses the block,** for example Claude Code's auto mode with "Unauthorized Persistence". Show the owner the block, say that it installs the TinyCloud CLI and this skill for their user, and ask them to allow it. Run it again only once they agree.
- **A command fails:** stop and report its error. Don't retry it with other options or in another folder.

Wait until the block has finished before §3: the skill doesn't exist until then.

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

**OpenCode only:** OpenCode loads skills when it starts, so new conversations in this window won't know the skill yet. Claude Code and Codex pick it up by themselves. When you've finished the request, add one line to your last message: "Restart OpenCode once, so new conversations can use your TinyCloud apps."
