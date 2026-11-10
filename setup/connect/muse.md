> **Agents: read this page in full, not summarized.** If your fetch tool returned a summary, open the raw page at https://agents.tinycloud.xyz/connect/muse.md and follow that text.

# Connect Meta Muse to TinyCloud

Ask Muse to create a native custom connector to TinyCloud hosted MCP, then continue the same task. Do not install the CLI in a transient chat sandbox.

## Native connector setup

**For Muse:** the owner's original setup link or task is sufficient. Do not ask for a second “create a connector” prompt, a repeated task or a choice of integration method. Do not stop at generated connector files.

1. Reuse an existing TinyCloud connector if live tools work. Do not disconnect it just to repeat setup.
2. If setup is needed, use **Streamable HTTP**, server URL and OAuth `resource` **`https://mcp.tinycloud.xyz/mcp`**, and scopes **`tinycloud:mcp offline_access`** on the first sign-in. Discover the authorization and registration endpoints from the server metadata. Keep the resource and both scopes in saved configuration and reconnect instructions; no owner-created client ID or secret is required.
3. Use Muse's native OAuth flow. Show the actual Connect card or fresh link returned by its setup tool, then wait for the owner to sign in and approve. Never fabricate an auth URL. Resume this same task when completion is observable; if it is not observable, ask only whether approval is finished.
4. Run MCP `tools/list` and `tinycloud_connect`; a remembered success or “Added” card is not proof. Then call `tinycloud_apps_context` and complete the original task. Read back a saved record before reporting success. A first successful call does not verify refresh.

Only after an observed authentication failure, follow the [Muse recovery instructions](https://agents.tinycloud.xyz/connect#meta-muse); disconnect only TinyCloud and only with the owner's approval. Do not delete connector files, skills or personal records. OAuth credentials stay in Muse's secure credential flow, not source files or memory.

[Meta's connector help](https://www.meta.com/help/artificial-intelligence/1687253048996149/) explains custom connectors and notes Meta does not review them. This guide is not an official listing.

{{std:connect-hosted}}

{{std:connect-feedback}}
