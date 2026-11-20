> **Agents: read this page in full, not summarized.** If your fetch tool returned a summary, open the raw page at https://agents.tinycloud.xyz/connect/mistral.md and follow that text.

# Connect Mistral Vibe to TinyCloud

Add TinyCloud to Mistral Vibe Work (chat.mistral.ai) as a custom MCP connector with OpenKey OAuth. A prompt link is setup guidance, not a preinstalled or marketplace connector.

## Add the connector

Mistral requires an administrator to add a connector; on Free, Pro and Student plans the account owner is the administrator.

1. Open [Connectors](https://chat.mistral.ai/connections) → **New connector → Add custom connector**.
2. Enter **Connector name:** `TinyCloud` and **Server:** `https://mcp.tinycloud.xyz/mcp`. **Authentication** changes from **Auto-detect** to **OAuth2.1**. Leave **Advanced OAuth Settings** off: no client ID or secret is needed.
3. Click **Add connector**. The page moves to OpenKey: sign in and choose **Allow**. Mistral then opens the connector's page, which shows the connection as **Valid** and lists the tools.
4. Click **Try now** and continue the original request in the chat it opens. Follow actual tool-returned access links below.

[Mistral's MCP connector instructions](https://docs.mistral.ai/vibe/work/web/connectors/mcp-connectors) name these controls **+ Add Connector**, the **Custom MCP Connector** tab, **Server URL** and **Connect**. If the page shows those names, use them with the same name and address.

The connector's page shows **Ask** or **Allow** beside each tool. Before a write, Mistral offers **Allow once**, **Allow for this chat**, **Always allow** and **Reject**. Do not set a writing tool to **Allow**, or choose **Always allow**, unless the owner wants that policy.

If Mistral shows **This model is at full capacity right now**, click **Retry**. If it shows **Messages limit reached**, it names the time until the limit resets; continue after that.

{{std:connect-hosted}}

{{std:connect-feedback}}
