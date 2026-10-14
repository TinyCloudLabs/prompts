# Publish and share with TinyCloud

Your agent publishes a document or web page from your computer to your TinyCloud and sends you a link. Links are owner-only by default: only your email address can open them. The agent makes a public link, which anyone holding it can open, only when you ask for one.

## For the owner

- **What it does:** installs the TinyCloud CLI 1.2.3 into a folder of its own and the `tc-publish` skill for your agent.
- **Run once,** in a terminal, after making two replacements:
  - `<client>`: the agent you use, `claude-code`, `codex` or `opencode`.
  - `<your email>`: the address owner-only links go to, for example `you@example.com`.

  ```sh
  npm install --prefix "$HOME/.local/share/tinycloud/cli" --no-audit --no-fund @tinycloud/cli@1.2.3 &&
  curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - publish --agent <client> &&
  export TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud" TC_OWNER_EMAIL=<your email>
  ```

  Start your agent from that shell, or add the `export` line to your shell profile so every new shell has it. Then ask: "Publish this report and send me a private link."
- **You approve:** the first time, the agent sends you an OpenKey link and a code. On your phone or computer, check the code, sign in with your passkey and approve. It lets the agent publish files to your TinyCloud and manage their links, for up to 30 days; you can pick a shorter time on the same page.
- **Undo:** see [Undo](#undo).

## For the agent

If the owner sent you this page with a request, read the skill in full and follow it:

```sh
cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-publish/SKILL.md"
```

```sh
cat "$HOME/.agents/skills/tc-publish/SKILL.md"
```

The first is for Claude Code, the second for Codex and OpenCode. If neither exists, or the skill's §1 check prints `TC_NOT_FOUND`, don't install anything yourself: show the owner the block under "For the owner" and ask them to run it.

## Undo

These are your steps, run in a terminal with `TC_BIN` set as in the setup block. If you also set `TC_HOME` for the agent, set it here too; the setup block doesn't, so by default the agent's profiles are in `~/.tinycloud`. Use the profile name you gave the agent instead of `publisher`, if you named one.

- **A link:** ask your agent to revoke it. Every link also expires on its own: owner-only links after 7 days and public links after 24 hours, unless you asked for another time.
- **The agent's access:** if you approved the agent, `"$TC_BIN" --profile publisher auth logout` clears its session on this computer. The approval stays valid on TinyCloud until it expires. If the agent never created the profile, this reports `PROFILE_NOT_FOUND`, which is fine.
- **The agent's key:** the first time it runs, the agent creates a local profile, `publisher`, holding a key that your approval is for. It never deletes profiles itself. Remove it with `"$TC_BIN" profile delete publisher`; this succeeds even if the profile was never created. If it reports `PROFILE_DELETE_DEFAULT`, `publisher` is the default profile:
  - if you have another (`"$TC_BIN" profile list`), make that the default with `"$TC_BIN" profile switch <other>` and delete again;
  - if `publisher` is your only profile, delete the whole profile store, `${TC_HOME:-$HOME}/.tinycloud`. Deleting just the profile's folder would leave `publisher` named as the default.
- **The skill and the CLI:** delete `~/.agents/skills/tc-publish` or `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-publish`, and `~/.local/share/tinycloud/cli` if nothing else uses it.
