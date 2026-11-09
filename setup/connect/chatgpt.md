> **Agents: read this page in full, not summarized.** If your fetch tool returned a summary, open the raw page at https://agents.tinycloud.xyz/connect/chatgpt.md and follow that text.

# Connect ChatGPT to TinyCloud

Use a custom remote MCP plugin in ChatGPT with OpenKey OAuth. This is not an official TinyCloud directory listing; pasting this guide does not install a plugin.

**For the assistant:** preserve the original request. If TinyCloud tools are already available, continue it rather than repeating setup. Otherwise reply with **only these four numbered steps, at most 120 words**: no introduction, images, feature menu, speculative plan or price caveats, or closing question.

1. In a browser, open [ChatGPT Plugins](https://chatgpt.com/plugins) → **+ → Add custom MCP server**.
2. Enter **Name:** TinyCloud; **Description:** Personal records in TinyCloud; **Server URL:** `https://mcp.tinycloud.xyz/mcp`; **Authentication:** OAuth.
3. Review the warning, choose **Create as a plugin**, sign in with OpenKey, and install it.
4. In a conversation, type **@**, select **TinyCloud**, and continue your original request. For setup only: **“What personal apps do I already have in TinyCloud?”**

[OpenAI's custom MCP instructions](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt) describe web setup and workspace administration. Troubleshoot only a reported or observed blocker: do not infer failure from the account's plan label or TinyCloud's absence from the directory, recommend an upgrade speculatively, or reconnect a working plugin. If a write is rejected, report that action's actual error; do not claim it saved. OAuth credentials belong in ChatGPT's native flow, not custom headers or chat.

{{std:connect-hosted}}

{{std:connect-feedback}}
