> **Agents: read this page in full, not summarized.** If your fetch tool returned a summary, open the raw page at https://agents.tinycloud.xyz/connect/mistral.md and follow that text.

# Connect Mistral Vibe to TinyCloud

Add TinyCloud to Mistral Vibe Work (chat.mistral.ai, formerly Le Chat) as a custom MCP connector with OpenKey OAuth. A prompt link is setup guidance, not a preinstalled or marketplace connector.

## Add the connector

1. Open [Connectors](https://chat.mistral.ai/connections) → **New connector → Add custom connector**.
2. Enter **Connector name:** TinyCloud and **Server:** `https://mcp.tinycloud.xyz/mcp`. Wait until **Authentication** shows **OAuth2.1**. Leave **Advanced OAuth Settings** off: dynamic client registration means no client ID or secret.
3. Click **Add connector**. The page moves to OpenKey: sign in and choose **Allow**. Mistral then returns to the connector page, which shows the connection as **Valid** and lists the tools.
4. Click **Try now**, or mention TinyCloud in a chat, and continue the original request. Follow actual tool-returned access links below.

Mistral's sign-in does not request a refresh token, so it lasts 12 hours. When TinyCloud tools start failing with an authentication error, sign in again from the connector's page; do not delete the connector or any records.

The connector page sets each tool to **Ask** or **Allow**. Reading tools start on **Allow** and the others on **Ask**. Do not switch writing tools to **Allow** unless the owner wants that policy.

In a Team or Enterprise organization an administrator adds connectors; on Free, Pro and Student plans the account owner can. The Free plan's message limit can stop a chat partway through setup: say so and resume when it resets. See [Mistral's MCP connector instructions](https://docs.mistral.ai/vibe/work/web/connectors/mcp-connectors) for the UI actually shown.

{{std:connect-hosted}}

{{std:connect-feedback}}
