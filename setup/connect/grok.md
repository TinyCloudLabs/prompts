> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/connect/grok.md` and follow that text. Summaries drop the shell blocks you must run.

# Connect Grok to TinyCloud

Grok chat uses a custom hosted MCP connector with OpenKey OAuth. Grok Bot can instead use the CLI when its actual runtime can install and run it.

## Grok chat

1. Open [grok.com/connectors](https://grok.com/connectors) → **New Connector → Custom**.
2. Enter `https://mcp.tinycloud.xyz/mcp` and complete the native OAuth sign-in with OpenKey.
3. Continue the original request in a conversation; Grok discovers the connector's tools. Follow any actual TinyCloud access link as described below.

On Grok Business/Enterprise, a team admin must provision the connector first. [xAI's connector reference](https://docs.x.ai/grok/connectors) distinguishes built-in, catalog and custom connectors. This guide configures a custom one; it does not establish a TinyCloud catalog listing.

## Grok Bot is runtime-dependent

If Grok Bot has a persistent terminal that can install and run the CLI, fetch [onboarding](https://agents.tinycloud.xyz/onboarding.md), then the relevant [CLI task guide](https://agents.tinycloud.xyz/connect/cli). Before onboarding, tell the owner that Grok Bot shares command-line credentials across their Bots. Otherwise use its native MCP-by-URL setup with `https://mcp.tinycloud.xyz/mcp` **only if OAuth is available**. If neither route is supported, state that limitation; do not ask for a token in chat. See [xAI's computer and apps reference](https://docs.x.ai/grok-bot/computer-and-apps).

{{std:connect-hosted}}

{{std:connect-feedback}}
