> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/connect/cursor.md` and follow that text. Summaries drop the shell blocks you must run.

# Connect Cursor to TinyCloud

Use the TinyCloud CLI from Cursor Agent when it can install and run commands in a persistent workspace. A remote MCP configuration is an alternative, not an official marketplace listing.

## Cursor Agent: preferred CLI route

Fetch [onboarding](https://agents.tinycloud.xyz/onboarding.md) raw and follow it with the owner's original task. Cursor's terminal/workspace must permit the installer and network access. A temporary code runner without persistent command execution does not meet that requirement.

Use the task guide's `--agent codex` selection: it installs into `~/.agents/skills`, which [Cursor discovers locally](https://cursor.com/docs/skills). Local skills are not automatically copied to Cloud Agents or remote workers. Install and read the relevant skill in the actual execution environment, or use Cursor's documented project/sync mechanism without putting credentials in the repository. Do not assume a successful local install proves the cloud agent can see it.

## Remote MCP alternative

Only if this runtime cannot use the CLI and supports remote OAuth MCP, merge this entry into `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global), preserving existing servers:

```json
{"mcpServers":{"TinyCloud":{"url":"https://mcp.tinycloud.xyz/mcp"}}}
```

Enable TinyCloud in **Customize**, authenticate through native OpenKey OAuth, and continue the original request. [Cursor's MCP reference](https://cursor.com/docs/mcp) documents Streamable HTTP, PKCE, protected-resource discovery and public dynamic registration. If OAuth scope controls are available, include `tinycloud:mcp offline_access` for refresh; do not invent a static client ID, secret or bearer header. For this alternative use the [hosted approval and tool workflow](https://agents.tinycloud.xyz/connect#approve-access-and-continue) and [MCP skill](https://agents.tinycloud.xyz/skills/mcp.md), not local CLI commands.

Verify with an actual authorized operation; configuration and tool discovery alone do not prove data access.

{{std:connect-cli}}

{{std:connect-feedback}}
