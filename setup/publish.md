# Publish and share with TinyCloud

Your agent publishes a document or web page from your computer to your TinyCloud and sends you a link. Links are owner-only by default: only your email address can open them. The agent makes a public link, which anyone holding it can open, only when you ask for one.

## For the owner

- **What it does:** installs the TinyCloud CLI 1.2.2 into a folder of its own and the `tc-publish` skill for your agent.
- **Run once,** in a terminal, with your email address in the last line and your client in the second (`claude-code`, `codex` or `opencode`):

  ```sh
  npm install --prefix "$HOME/.local/share/tinycloud/cli" --no-audit --no-fund @tinycloud/cli@1.2.2 &&
  curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - publish --agent claude-code &&
  export TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tc" TC_OWNER_EMAIL=you@example.com
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

The first is for Claude Code, the second for Codex and OpenCode. If neither exists, or the skill's §1 check stops because `TC_BIN` isn't set, don't install anything yourself: show the owner the block under "For the owner" and ask them to run it.

## Undo

- **A link:** ask your agent to revoke it. Every link also expires on its own: owner-only links after 7 days and public links after 24 hours, unless you asked for another time.
- **The agent's access:** `"$TC_BIN" --profile publisher auth logout`, with `TC_BIN` and `TC_HOME` set as for the agent, clears its session on this computer; use the profile name you gave the agent instead, if you named one. The approval stays valid on TinyCloud until it expires.
- **The skill and the CLI:** delete `~/.agents/skills/tc-publish` or `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-publish`, and `~/.local/share/tinycloud/cli` if nothing else uses it.
