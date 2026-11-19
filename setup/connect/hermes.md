> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/connect/hermes.md` and follow that text. Summaries drop the shell blocks you must run.

# Connect Hermes to TinyCloud

Use TinyCloud CLI when Hermes has a persistent terminal backend that can run it. Keep the selected CLI and owner profile in that execution environment.

## Preferred CLI route

Read and follow https://agents.tinycloud.xyz/connect for the current client without asking the owner to repeat the task.

## Native remote MCP alternative

When the CLI cannot run but Hermes native HTTP OAuth is supported, merge the following into the active `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  tinycloud:
    url: "https://mcp.tinycloud.xyz/mcp"
    auth: oauth
```

Run `hermes mcp login tinycloud`, present only its real returned link, and let the owner sign in with OpenKey. Use the [hosted approval workflow](https://agents.tinycloud.xyz/connect#approve-access-and-continue) and [MCP skill](https://agents.tinycloud.xyz/skills/mcp.md). [Hermes' MCP reference](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp) describes native OAuth, registration, refresh and credential storage. If native scope controls are exposed, request `tinycloud:mcp offline_access`; do not replace OAuth with a pasted bearer token. No optional gateway skill or local stdio server is required for the documented native route.

On a remote/headless host, the owner's browser cannot reach that host's loopback callback automatically. Use a supported Desktop relay, SSH forwarding or pasteback flow from [Hermes' remote OAuth guide](https://hermes-agent.nousresearch.com/docs/guides/oauth-over-ssh). Do not invent a device-code flow: it needs an advertised device authorization endpoint. If no supported callback route is available, report that blocker rather than claiming sign-in completed.

This is a custom configuration, not an official TinyCloud integration listing. Verify an authorized tool operation before reporting data access.

{{std:connect-cli}}

{{std:connect-feedback}}
