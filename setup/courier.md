# Courier: threads between two agents

Courier lets your agent and another person's agent send each other requests, answers and tasks over TinyCloud. Each side writes only to its owner's own space. Text from the other agent is treated as a request from them, never as your instruction: your agent still asks you before anything your standing orders don't allow, such as merging, deploying or touching secrets.

## For the owner

- **What it does:** installs the TinyCloud CLI 1.2.2, which includes `tc courier`, into `~/.local/share/tinycloud/cli` (the same folder as [the CLI setup](tinycloud.md)) and the `courier` skill for your agent, then gives Courier its own key.
- **Run once,** in a terminal, with your client in the second line (`claude-code`, `codex` or `opencode`) and a short name for yourself in the last:

  ```sh
  npm install --prefix "$HOME/.local/share/tinycloud/cli" --no-audit --no-fund @tinycloud/cli@1.2.2 &&
  curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - courier --agent claude-code &&
  TC="${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tc}" &&
  "$TC" courier init --paste --handle <your-name>
  ```

  Every Courier command on this page runs that CLI as `"$TC"`, never a bare `tc`, which on Linux can be the system's traffic-control tool. In a new terminal, set it again first: `TC="${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tc}"`. The skill finds the CLI the same way.
- **Pair** with the other person, each in a terminal. You run `"$TC" courier pair start <their-name>` and send them what it prints. Whoever receives a piece passes it to `"$TC" courier pair accept --stdin`, which prints the next piece to send back, until the third one has been accepted. Then ask your agent to send them a request.
- **You approve:** `init` prints an OpenKey link. Sign in with your passkey and approve a grant for Courier's own key: it can keep messages under `xyz.tinycloud.courier/` in your `agents` space, for 30 days. Paste the `XXXX-XXXX` code OpenKey shows back into the terminal. Each pairing is your decision too; your agent never pairs on its own.
- **Undo:** see [Undo](#undo).

## For the agent

If the owner sent you this page, read the skill in full and follow it:

```sh
cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/courier/SKILL.md"
```

```sh
cat "$HOME/.agents/skills/courier/SKILL.md"
```

The first is for Claude Code, the second for Codex and OpenCode. `init`, `pair` and `revoke` are the owner's steps: if Courier isn't set up yet, show the owner the block under "For the owner" and ask them to run it.

## Undo

With `TC` set as above:

- **A pairing:** `"$TC" courier revoke <their-name>` stops renewing that peer's access. What they could already read lapses when its delegation expires, within 7 days.
- **Courier's key:** delete `${COURIER_HOME:-~/.courier}`, where Courier keeps its key and grant. The grant stays valid on TinyCloud until it expires.
- **The skill and the CLI:** delete `~/.agents/skills/courier` or `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/courier`, and `~/.local/share/tinycloud/cli` if nothing else uses it.
