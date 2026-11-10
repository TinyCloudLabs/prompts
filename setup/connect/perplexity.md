> **Agents: read this page in full, not summarized.** If your fetch tool returned a summary, open the raw page at https://agents.tinycloud.xyz/connect/perplexity.md and follow that text.

# Connect Perplexity to TinyCloud

Add TinyCloud as a custom remote MCP connector with OpenKey OAuth and Streamable HTTP. A prompt link is setup guidance, not a preinstalled or officially listed plugin.

## Add the remote connector

1. Open **Plugins → Add custom → Add MCP connector**, then choose **Remote**. If your UI shows **Customize → Connectors**, add the custom remote connector there.
2. Enter **Name:** TinyCloud and **MCP Server URL:** `https://mcp.tinycloud.xyz/mcp`. Under **Advanced**, choose **Authentication: OAuth**, **Transport: Streamable HTTP**, and **Network access: Public** if shown. Dynamic client registration means no manually supplied client ID or secret.
3. Review the acknowledgement and click **Add**. Select the TinyCloud connector card, complete OpenKey sign-in, and enable it.
4. Continue the original request, then follow actual tool-returned access links below.

An Enterprise administrator may need to permit custom connectors. Follow [Perplexity's current custom-remote instructions](https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors) for the UI actually shown. Do not replace OAuth with an API key or infer success from the connector card.

{{std:connect-hosted}}

{{std:connect-cutover}}

{{std:connect-feedback}}
