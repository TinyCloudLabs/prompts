> **Agents: read this page in full, not summarized.** If your fetch tool returned a summary, open the raw page at https://agents.tinycloud.xyz/connect/claude.md and follow that text.

# Connect Claude to TinyCloud

Claude web, Desktop and mobile use the hosted custom connector with OpenKey OAuth. Claude Code is a different runtime: use CLI onboarding instead.

## Add the connector

1. On web or Desktop, open [Customize → Connectors](https://claude.ai/customize/connectors) → **+ Add → Add custom connector**.
2. Name it **TinyCloud**, enter `https://mcp.tinycloud.xyz/mcp`, and continue. Review detected OAuth settings and sign in with OpenKey. Use automatic client registration if the default client-identity option is rejected; do not invent a client ID or secret.
3. Finish adding it, then enable TinyCloud in this conversation under **+ → Connectors** and continue the original request. Add on web or Desktop first; the connector can then be used on mobile.
4. Follow the approval workflow below only when a tool returns an access request.

For Team/Enterprise, the workspace owner may first need **Organization settings → Connectors → Add → Custom → Web**. Claude documents one custom connector for Free accounts. See [Claude's custom-connector instructions](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) and [OAuth behavior](https://claude.com/docs/connectors/building/authentication). This is a custom connector, not a claim of directory approval. Do not enable “Always allow” writing tools unless the owner wants that policy.

**Claude Code:** fetch its [one-page quickstart](https://agents.tinycloud.xyz/connect/claude-code.md), not these chat-connector steps. Its installer writes skills to `~/.claude/skills` or `CLAUDE_CONFIG_DIR`. Keep the original task.

{{std:connect-hosted}}

{{std:connect-feedback}}
