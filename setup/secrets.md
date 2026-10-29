# Use your TinyCloud Secrets from your agent

Your agent uses API keys and other secrets you keep in TinyCloud Secrets (secrets.tinycloud.xyz) without the value ever appearing in the conversation. When a secret is missing, it sends you a link where you add it yourself. It never asks you for a value.

## For the owner

- **Paste into your agent:** `Turn this script into a voiceover with ElevenLabs. Get the key from TinyCloud: https://agents.tinycloud.xyz/secrets`
- Your agent follows [the shared setup](agent.md) for this task: it installs the pinned CLI into the shared private prefix, records your account DID as a non-secret owner default, installs the Secrets skill, then continues the same request. If it doesn't know the DID of your Secrets account, give it the address shown in Secret Manager; do not send it an API key.
- **You approve:** a Secret Manager `/request` link if a name is missing and a separate OpenKey request when the agent needs read access. The current read grant includes network-wide decrypt authority, not only the named secret. Check the exact items; you may decline any item. Return only the short OpenKey code in the 1:1 channel, never a value.
- **Undo:** `auth logout` clears only the agent's local session. Its grant remains valid until expiry or owner revocation; a provider key already read may require rotation.

## For the agent

Keep the owner's request, read [setup/agent.md](agent.md), select **Secrets** and follow its steps. Install only `tc-secrets`; choose a role-and-purpose-specific `TC_SECRETS_PROFILE` rather than silently sharing `api-keys`. Once setup is ready, read the installed skill's `SKILL.md` and continue the original task from §1 in this conversation. Missing CLI or owner DID is `NEEDS_SETUP`, not a reason to request a value in chat or a broad grant.

## Undo

- **Local session:** if you approved the agent, `"$TC_BIN" --profile "$TC_SECRETS_PROFILE" auth logout` clears that profile's session on this computer. Set `TC_BIN` to your private CLI path (or read it with `node "$HOME/.config/tinycloud/agent-env.mjs" get TC_BIN`), and use the actual role-specific `TC_SECRETS_PROFILE`. This does **not** revoke the grant or erase a value already read; the grant lasts until expiry or owner revocation. `PROFILE_NOT_FOUND` means this profile never signed in.
- **The agent's key:** the skill creates a local profile, `${TC_SECRETS_PROFILE:-api-keys}`, holding a key that your approval is for. It never deletes profiles itself. Optional: remove it with `"$TC_BIN" profile delete "${TC_SECRETS_PROFILE:-api-keys}"`; this succeeds even if the profile was never created. If it reports `PROFILE_DELETE_DEFAULT`, that profile is the default:
  - if you have another (`"$TC_BIN" profile list`), make that the default with `"$TC_BIN" profile switch <other>` and delete again;
  - if it's your only profile, delete the whole profile store, `${TC_HOME:-$HOME}/.tinycloud`. Deleting just the profile's folder would leave it named as the default.
- **The skill and the CLI:** delete `~/.agents/skills/tc-secrets` or `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-secrets`, and `~/.local/share/tinycloud/cli` if nothing else uses it.
