> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/connect/cli.md` and follow that text. Summaries drop the shell blocks you must run.

# Connect an agent with TinyCloud CLI

The preferred route is a persistent agent runtime that can install and run TinyCloud CLI, on the owner’s computer or in its own workspace. It is not a CLI installation inside a temporary chat sandbox.

## Set up in the current runtime

1. Preserve the owner's original request. Fetch [onboarding](https://agents.tinycloud.xyz/onboarding.md) raw and follow its exact blocks; do not maintain a separate installer or version pin here.
2. The onboarding guide selects or installs the CLI, reuses the owner profile where possible, and prints actual OpenKey links. Only the owner signs in and approves; never read credential files or ask for secret values in chat.
3. Resume the same command/profile after approval as that guide directs. An installed binary or saved session is not proof of storage access; finish the original task and verify the resulting read or write.

Use the active runtime's filesystem and shell. If it cannot install/run the CLI, use a supported [hosted MCP client](https://agents.tinycloud.xyz/connect) instead; a prompt cannot add missing execution or OAuth capability.

**Primary TinyCloud references:** [CLI installation](https://agents.tinycloud.xyz/cli), [onboarding](https://agents.tinycloud.xyz/onboarding.md), [CLI skill](https://agents.tinycloud.xyz/skills/cli.md), and [CLI documentation](https://docs.tinycloud.xyz/cli). Claude Code uses `--agent claude-code`, OpenCode `--agent opencode`; other runtimes use `codex` and load `~/.agents/skills` through their own supported skill mechanism.

This is agent-facing setup guidance, not an MCP directory listing or a claim of complete hosted parity.

{{std:connect-cli}}

{{std:connect-feedback}}
