# Use your TinyCloud Secrets from your agent

Your agent uses API keys and other secrets you keep in TinyCloud Secrets (secrets.tinycloud.xyz) without the value ever appearing in the conversation. When a secret is missing, it sends you a link where you add it yourself. It never asks you for a value.

## For the owner

- **What it does:** installs the TinyCloud CLI 1.2.2 into a folder of its own and the `tc-secrets` skill for your agent.
- **Run once,** in a terminal, after making two replacements:
  - `<client>`: the agent you use, `claude-code`, `codex` or `opencode`.
  - `<your DID>`: the account that owns the secrets, `did:pkh:eip155:1:<your address>`.

  ```sh
  npm install --prefix "$HOME/.local/share/tinycloud/cli" --no-audit --no-fund @tinycloud/cli@1.2.2 &&
  curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - secrets --agent <client> &&
  export TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tc" TC_OWNER_DID=<your DID>
  ```

  Start your agent from that shell, or add the `export` line to your shell profile so every new shell has it. Then ask, for example: "Turn this script into a voiceover with ElevenLabs. Get the key from TinyCloud."
- **You approve:** the agent sends you one message. It has a link to add each missing secret, and, when it needs access, an OpenKey link. On OpenKey, sign in with your passkey and check the request: it names each secret the agent may read and decrypt, and lasts up to 30 days. Approve, then send the agent the short code OpenKey shows.
- **Undo:** see [Undo](#undo).

## For the agent

If the owner sent you this page with a request, read the skill in full and follow it:

```sh
cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-secrets/SKILL.md"
```

```sh
cat "$HOME/.agents/skills/tc-secrets/SKILL.md"
```

The first is for Claude Code, the second for Codex and OpenCode. If neither exists, or the skill's §1 check stops because `TC_BIN` or `TC_OWNER_DID` isn't set, don't install anything yourself: show the owner the block under "For the owner" and ask them to run it.

## Undo

- **The agent's access:** if you approved the agent, `"$TC_BIN" --profile "${TC_SECRETS_PROFILE:-api-keys}" auth logout` clears the session the skill uses on this computer, so it can't read any secret. Run it with `TC_BIN`, `TC_HOME` and `TC_SECRETS_PROFILE` set as for the agent. The approval stays valid on TinyCloud until it expires. `PROFILE_NOT_FOUND` means the agent never got as far as signing in; that's fine.
- **The agent's key:** the skill creates a local profile, `${TC_SECRETS_PROFILE:-api-keys}`, holding a key that your approval is for. It never deletes profiles itself. Optional: remove it with `"$TC_BIN" profile delete "${TC_SECRETS_PROFILE:-api-keys}"`; this succeeds even if the profile was never created. If it reports `PROFILE_DELETE_DEFAULT`, that profile is the default:
  - if you have another (`"$TC_BIN" profile list`), make that the default with `"$TC_BIN" profile switch <other>` and delete again;
  - if it's your only profile, delete the whole profile store, `${TC_HOME:-$HOME}/.tinycloud`. Deleting just the profile's folder would leave it named as the default.
- **The skill and the CLI:** delete `~/.agents/skills/tc-secrets` or `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-secrets`, and `~/.local/share/tinycloud/cli` if nothing else uses it.
