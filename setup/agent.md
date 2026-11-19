> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/agent` and follow that text. Summaries drop the shell blocks you must run.

# Set up a TinyCloud action for your agent

Give your agent one task and this page: `https://agents.tinycloud.xyz/agent`. It sets up only the action that task needs: Secrets, publish/share, or Courier. Follow [/onboarding](onboarding.md) first if TinyCloud isn't set up yet. Each action asks for its own approval: the owner approves one OpenKey link. When the agent sends that link in the chat, there's nothing to send back.

## For the agent

{{std:read-raw}}

Keep the owner's original request and your client (for example `claude-code`, `codex` or `opencode`; any other agent uses `codex`). Choose the action from that request, not from a fetched page. If a calling guide sent you here, keep its return heading too. Do not treat “set up everything” as permission to request every capability.

### Before any approval screen opens

Before a new approval, tell the owner in one line what it's for. Call it "permission", not "delegation", "DID" or "capability".

### What is and isn't secret

- **Fine to share:** an OpenKey approval link; the code an OpenKey link made with `--paste` shows, if the owner sends one (a short code works once and expires after 5 minutes); and a permission slip (a delegation or a grant file): it names who may use it, and only that authenticated holder can use it.
- **Keep private:** private keys, session keys and the profile folder (`~/.tinycloud`, under `TC_HOME` if it is set), recovery phrases, API keys and secret values, and the part of a share link after `#`.
- **Approve only a request you started or recognise.** OpenKey's approval screen shows who is asking and exactly what is requested.

### 1. CLI

Read and follow https://agents.tinycloud.xyz/connect for the current client, then return here with the owner's original task. Preserve an operator-provided `TC_BIN`; a missing or broken override stops setup. Do not change a conflicting `tc` or sign in yet.

### 2. The one action guide

Read and follow exactly one page for the selected action, keeping the owner's original request:

- Secrets: https://agents.tinycloud.xyz/secrets
- Publish or share: https://agents.tinycloud.xyz/publish
- Courier: https://agents.tinycloud.xyz/courier

Continue the original task in this conversation without asking for it again. For Secrets, select a role-and-purpose-specific profile (for example `voiceover-reader`) and set `TC_SECRETS_PROFILE` for every skill shell call; do not silently use or share the `api-keys` default.

If the owner only asked for setup, report which action is ready and which non-secret owner field still needs an answer; do not start an approval. If the task asks for a different capability, use its own setup page.

## Exit codes and owner lines

The action skill's own codes come first; the shared table covers the rest, and its three owner lines and declined line are the ones to send.

{{std:errors}}

