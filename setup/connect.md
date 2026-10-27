# Set up TinyCloud

Keep your personal records, such as weight, workouts, goals and todos, in your own TinyCloud storage. Use the same link in ChatGPT, Claude, Grok, Perplexity, Gemini or Meta Muse, or in an agent with a shell, such as Claude Code, Codex, OpenCode, Cursor, OpenClaw or Hermes.

**Paste this into your app or agent:**

> Set up TinyCloud using https://agents.tinycloud.xyz/connect

**For the assistant:** keep the owner's original request and continue it in this conversation. Use the route for the environment you are running in. In a chat app, a link to this page alone is a setup request; give that app's steps without asking what the owner wants to do. Do not ask the owner to choose a different link or file format.

## Coding agents

**Claude Code, Codex, OpenCode, Cursor, OpenClaw, Hermes, or any agent with a shell on the owner's computer:** fetch and read the coding-agent setup guide for the owner's original request in full, then follow it exactly for that request. Fetch that guide yourself; do not ask the owner to paste another URL or repeat their request.

**Which guide:** personal records or health (meals, weight, workouts, todos), or setup only → [/apps](tc-apps.md); API keys and other secrets → [/secrets](secrets.md); publishing or sharing a document or page → [/publish](publish.md); TinyChat meetings → [/chat](../apps/tinychat/setup.md); Courier, threads with another person's agent → [/courier](courier.md); anything else → [/setup](README.md), which lists every ability.

That guide is the authority for all prerequisites, installation commands, permissions, sign-in, first-record behavior, troubleshooting and cleanup. This page does not replace or modify any of those instructions. Do not reconstruct the setup from a summary or use the chat-app MCP instructions below for this route. If you are not Claude Code, Codex or OpenCode, use Codex's choice wherever the guide asks for your client or gives a step per client: Codex's skills go in `~/.agents/skills`.

**ChatGPT, Claude chat, Grok, Perplexity, Gemini, Meta Muse and other chat apps:** use the instructions below instead. Do not run the coding-agent setup in a chat app's temporary code sandbox.

Jump to [ChatGPT](#chatgpt), [Claude](#claude), [Grok](#grok), [Perplexity](#perplexity), [Gemini](#gemini), [Meta Muse](#meta-muse), or [other chat apps](#other-chat-apps).

## ChatGPT

**For ChatGPT assistants:** if TinyCloud tools are not available yet, reply with only the four numbered steps below, in at most 120 words. No introduction, images, feature menu, plan or price caveats, extra sections, or closing questions. Do not send the owner back to this page to find the instructions. If the tools are already available, use them to continue the original request instead of repeating setup.

1. In a browser, open [ChatGPT Plugins](https://chatgpt.com/plugins) → **+ → Add custom MCP server**.
2. Enter **Name:** TinyCloud; **Description:** Personal records in TinyCloud; **Server URL:** `https://mcp.tinycloud.xyz/mcp`; **Authentication:** OAuth.
3. Review the warning, select **Create as a plugin**, sign in with OpenKey, and install it.
4. In a conversation, type **@**, select **TinyCloud**, and make your original request. For setup only, ask: **“What personal apps do I already have in TinyCloud?”**

**Troubleshooting only after a reported or observed blocker:** do not infer that an account cannot connect from its plan name, generic availability documentation, or TinyCloud's absence from the app directory. Do not run an eligibility preflight or recommend an upgrade or developer mode speculatively. A successful connection takes precedence over a contrary documentation assumption. If the option is missing or an action is rejected, address that specific UI state or error briefly; ask one targeted question only if needed to choose the next action. Once enabled, follow [Approve access and continue](#approve-access-and-continue) when the tools request approval, not as an extra initial setup section.

## Claude

Use the hosted MCP connector, not the local CLI. Its server URL is **`https://mcp.tinycloud.xyz/mcp`**, and its authentication is **OAuth** through OpenKey.

1. On Claude web or Desktop, open [Customize → Connectors](https://claude.ai/customize/connectors), then **+ Add → Add custom connector**.
2. Name it **TinyCloud**, enter **`https://mcp.tinycloud.xyz/mcp`**, and continue. Review the detected OAuth settings and choose to sign in with OpenKey.
3. Finish adding the connector. In your conversation, use **+ → Connectors** to enable TinyCloud, then make your original request.
4. Follow [Approve access and continue](#approve-access-and-continue) below. Once connected, you can also use it in Claude's mobile apps.

For a managed workspace, an owner or administrator may need to add the connector first. See [Claude's custom-connector instructions](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp).

If you want to approve record-writing tools once rather than on every call, find `tinycloud_apps_write` in the connector's tool permissions and choose **Always allow**. Only do this if you trust it to write records without per-call confirmation. This does not replace the OpenKey access approval.

## Grok

Use the hosted MCP connector, not the local CLI. Its server URL is **`https://mcp.tinycloud.xyz/mcp`**, and its authentication is **OAuth** through OpenKey.

1. In a browser, open [grok.com/connectors](https://grok.com/connectors), click **New Connector**, then select **Custom**.
2. Enter **`https://mcp.tinycloud.xyz/mcp`** and complete the authentication Grok asks for by signing in with OpenKey.
3. In a conversation, make your original request. Grok makes the connector's tools available in your conversations.
4. Follow [Approve access and continue](#approve-access-and-continue) below.

On Grok Business or Enterprise, a team admin must add the connector first. See [xAI's connector instructions](https://docs.x.ai/grok/connectors).

## Perplexity

Use the hosted MCP connector, not the local CLI. Its server URL is **`https://mcp.tinycloud.xyz/mcp`**, and its authentication is **OAuth** through OpenKey.

1. On Perplexity, open **Account settings → Connectors**, click **+ Custom connector**, and select **Remote**.
2. Enter **Name:** TinyCloud; **MCP Server URL:** `https://mcp.tinycloud.xyz/mcp`; **Authentication:** OAuth; **Transport:** Streamable HTTP. No client ID or secret is needed: TinyCloud registers the client itself.
3. Check the acknowledgement box and click **Add**. Then click the TinyCloud connector card, sign in with OpenKey, and enable it.
4. Make your original request, then follow [Approve access and continue](#approve-access-and-continue) below.

In an Enterprise organization, an admin may need to allow members to add custom connectors. See [Perplexity's custom-connector instructions](https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors).

## Gemini

Use the hosted MCP connector as a Gemini custom app, not the local CLI. Its server URL is **`https://mcp.tinycloud.xyz/mcp`**, and its authentication is **OAuth** through OpenKey.

1. On a computer, open [gemini.google.com](https://gemini.google.com), then **Settings → Connected Apps**.
2. Under **Custom apps**, choose **Add a custom app** and enter **`https://mcp.tinycloud.xyz/mcp`**. TinyCloud supports dynamic client registration, so leave the credentials under **Advanced features** empty.
3. Click **Next**, follow the on-screen instructions, and sign in with OpenKey.
4. In a chat, enter **@**, select the TinyCloud app, and make your original request. Then follow [Approve access and continue](#approve-access-and-continue) below. Once connected, it also works in the Gemini mobile app.

If **Custom apps** is missing: Google offers it to personal Google Accounts, 18 or over and in the US, with Keep Activity on. See [Google's custom-app instructions](https://support.google.com/gemini/answer/17209137).

## Meta Muse

Use a custom connector to the hosted MCP server, not the local CLI. Its server URL is **`https://mcp.tinycloud.xyz/mcp`**, and its authentication is **OAuth** through OpenKey. Muse creates a custom connector when you ask for one in chat; Meta doesn't review custom connectors.

1. Ask Muse: **“Create a custom connector for TinyCloud's remote MCP server, `https://mcp.tinycloud.xyz/mcp`, with OAuth sign-in.”**
2. When the sign-in opens, sign in with OpenKey and approve.
3. Make your original request, then follow [Approve access and continue](#approve-access-and-continue) below.

**For Muse:** TinyCloud needs no API key, token or password. Don't ask the owner for one or store one. If you can't connect with OAuth, say so; don't substitute a key or the coding-agent setup. See [Meta's connector help](https://www.meta.com/help/artificial-intelligence/1687253048996149/).

## Other chat apps

If your app supports remote MCP over HTTP with OAuth, add **`https://mcp.tinycloud.xyz/mcp`**, choose **OAuth**, and sign in with OpenKey. Enable the connection for your conversation, then make your request. Mobile support depends on the app.

If the app has no custom remote MCP support, reading this page cannot add that capability. Say so and direct the owner to one of the apps above. Do not suggest installing a CLI in a temporary chat sandbox as a substitute.

## Approve access and continue

With TinyCloud enabled, make your original request, or ask: **“What personal apps do I already have in TinyCloud?”** The assistant will show the actual OpenKey connect or personal-record access link returned by a TinyCloud tool. Open it yourself, review the requested access, approve, then return to the conversation and tell the assistant to continue.

**For chat assistants:** use the connected TinyCloud personal-app tools and the instructions they return. If the tools are not available yet, give the relevant connection steps above; do not claim setup is complete. Never ask the owner to paste a password, private key or access token into chat. For setup-only requests, follow the [default-record recipe](#setup-only-requests-in-chat-apps) below, but perform the reads and writes through the connected tools, not the CLI. Read the saved record back before reporting success.

A brand-new account's storage can take a minute or two to finish setting up after the first approval. If a tool reports `SPACE_NOT_HOSTED`, tell the owner it is still being set up and retry with backoff for about two minutes. Do not ask for another or broader sign-in to fix it.

If a tool, or the CLI in a coding agent, reports `STORAGE_QUOTA_EXCEEDED` or `STORAGE_LIMIT_REACHED`, nothing was saved. Tell the owner their TinyCloud storage is full, their records are still readable, and they can upgrade at https://account.tinycloud.xyz/storage. Do not retry.

To disconnect a chat app, remove or disconnect TinyCloud in that app's plugin or connector settings. Disconnecting does not delete your stored records. Local CLI cleanup remains in the original [coding-agent guide's Undo section](tc-apps.md#undo).

### Setup-only requests in chat apps

This record recipe is for chat apps. Use the connected tools rather than CLI or skill-command references.

If the owner only asked for setup or named no record, save one default record without asking, after sign-in is approved (skill §4) and not before: app `todos`, kind `todo`, key `xyz.tinycloud.agent-data/todos/todo/open/try-my-personal-apps`, value `{"v":1,"at":"<UTC>","data":{"title":"Try my personal apps"},"by":<client>}`, where `<UTC>` is the clock's time from `date -u +%FT%TZ` (skill §1; run it again if it is more than 5 minutes old), never an estimate. If the `todos` app or its `todo` kind doesn't exist yet, write their catalog records first (skill §2 rule 2): `xyz.tinycloud.agent-data/catalog/todos` = `{"app":"todos","title":"Todos","about":"Things to do.","created":"<TODAY>","by":<client>}` and `xyz.tinycloud.agent-data/catalog/todos/todo` = `{"app":"todos","kind":"todo","about":"One record per thing to do.","shape":"item","states":["open","done"],"v":1,"fields":{"title":"text: what to do"}}`. Write commands are in skill §6. Get that key and its done twin `xyz.tinycloud.agent-data/todos/todo/done/try-my-personal-apps` first (skill §5), and skip saving if either exists, so a todo the owner already ticked off isn't saved again. Afterwards tell the owner the key, that “What’s on my todo list?” shows it, and that you'll delete it on request (the skill's `kv delete`, §6).
