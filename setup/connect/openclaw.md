> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/connect/openclaw.md` and follow that text. Summaries drop the shell blocks you must run.

# Connect OpenClaw to TinyCloud

Use TinyCloud CLI in the OpenClaw execution environment when it has a persistent shell and installation permission. The chat channel does not determine where tools or credentials run.

## Preferred CLI route

Fetch [onboarding](https://agents.tinycloud.xyz/onboarding.md) raw and follow it in the active workspace/node, preserving the owner's request. Run the CLI and its skills on the same host; a skill present on the Gateway does not establish that its binary or sign-in exists on a paired node.

Use `--agent codex` in TinyCloud's installer for `~/.agents/skills`. [OpenClaw's skill reference](https://docs.openclaw.ai/tools/skills) includes that personal root for the default state; a custom `OPENCLAW_STATE_DIR` can exclude it. For that case, configure `skills.load.extraDirs` to include the installed directory, preserving existing settings. Confirm the active agent can load the skill. Node-hosted skills have separate roots and execution hosts; follow [node skill instructions](https://docs.openclaw.ai/nodes/mcp-and-skills) rather than assuming Gateway paths work remotely.

## Native remote MCP alternative

If the CLI cannot run but the Gateway's native OAuth MCP is available, configure it on the Gateway, preserving existing servers:

```sh
openclaw mcp set tinycloud '{"url":"https://mcp.tinycloud.xyz/mcp","transport":"streamable-http","auth":"oauth","oauth":{"scope":"tinycloud:mcp offline_access"}}'
openclaw mcp login tinycloud
```

Send only the actual login link returned by that command; the owner signs in with OpenKey. Check `openclaw mcp status --verbose` and `openclaw mcp doctor tinycloud --probe`, then use the [hosted approval workflow](https://agents.tinycloud.xyz/connect#approve-access-and-continue) and [MCP skill](https://agents.tinycloud.xyz/skills/mcp.md). Probes alone do not verify a record read or write. [OpenClaw's transport reference](https://docs.openclaw.ai/cli/mcp/transports) documents this OAuth route. Node-hosted MCP is different and does not run Gateway-managed OAuth; do not work around that by asking for a token in chat.

The native OAuth configuration above is shared, operator-managed access by default. Use it only in the intended owner's trust boundary; do not present it as isolated per-user access on a shared Gateway. Per-requester OAuth requires `gateway.publicOrigin` and a separate identity flow documented by OpenClaw. Setting a registry entry or reading status does not open an MCP session; `doctor --probe` performs the connection probe.

This is a custom configuration, not an official TinyCloud directory listing. Verify an authorized task operation before reporting success.

{{std:connect-cli}}

{{std:connect-feedback}}
