> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/connect.md` and follow that text. Summaries drop the shell blocks you must run.

# Set up TinyCloud

Keep your personal records, such as weight, workouts, goals and todos, in your own TinyCloud storage. Use the same link in a runtime that can install and run the TinyCloud CLI, such as Claude Code, Codex or OpenCode, or a client with remote MCP and OAuth support. A product or bot name alone does not establish those capabilities; see the client-specific routes below.

**Paste this into your app or agent:**

> Fetch https://agents.tinycloud.xyz/connect.md with curl and follow it, including running its installer. Set up TinyCloud.

**For the assistant:** keep the owner's original request and continue it in this conversation. If you can install and run the TinyCloud CLI, use it: that's the preferred route. Otherwise, if you support remote MCP, connect the hosted server below. For an MCP agent, a link to this page alone is a setup request; give that app's steps without asking what the owner wants to do. Do not ask the owner to choose a different link or file format. The installer the prompt names is the CLI route's; an app that can only run code in a temporary sandbox doesn't run it, and connects through MCP instead.

## Agents that can run the CLI (preferred)

**Any agent that can install and run the TinyCloud CLI**, on the owner's computer or in its own workspace (for example Claude Code, Codex, OpenCode, Cursor, OpenClaw or Hermes): fetch [/onboarding](onboarding.md) yourself and follow it. It signs the owner in once, then sends you to the guide for their request. Do not ask the owner to paste another URL or repeat their request.

**After onboarding:** it routes personal records or health (meals, weight, workouts, todos) to [/apps](tc-apps.md); API keys and other secrets to [/secrets](secrets.md); publishing or sharing a document or page to [/publish](publish.md); TinyChat meetings to [/chat](../apps/tinychat/setup.md); Courier, threads with another person's agent, to [/courier](courier.md); anything else to [/setup](README.md), which lists every ability.

Those guides are the authority for prerequisites, installation, permissions, sign-in, troubleshooting and cleanup. If you can run the CLI, don't use the MCP steps below. Where a guide asks for your client, use yours; any other agent uses `codex` (its skills go in `~/.agents/skills`).

Optional, for Codex in workspace-write mode: if you trust the project, start Codex with `codex -c sandbox_workspace_write.network_access=true`. Commands Codex runs can then reach [any website](https://learn.chatgpt.com/docs/agent-approvals-security#network-access) without asking, so you'll see fewer network prompts. Your other sandbox and approval settings stay the same.

**Context:** “remember that …”, a question about what the owner told an agent before, or “pick up where I left off” → [/apps](tc-apps.md) too: its skill keeps the owner's context for every agent on this computer.

**Agents that can't run the CLI but support remote MCP with OAuth:** use the applicable steps below. Do not run the CLI setup in a temporary code sandbox. The hosted MCP keeps personal records (apps, key-value and SQL data) and reads named secrets. Meetings, sharing and publishing run through the CLI route.

Jump to [ChatGPT](#chatgpt), [Claude](#claude), [Grok](#grok), [Grok Bot](#grok-bot), [WhatsApp / Instinct](#whatsapp-and-instinct), [Perplexity](#perplexity), [Gemini](#gemini), [Meta Muse](#meta-muse), or [other MCP clients](#other-mcp-clients).

Client-specific guides: [ChatGPT](connect/chatgpt.md), [Claude](connect/claude.md), [Cursor](connect/cursor.md), [Gemini](connect/gemini.md), [Grok](connect/grok.md), [Meta Muse](connect/muse.md), [Perplexity](connect/perplexity.md), [OpenClaw](connect/openclaw.md), [Hermes](connect/hermes.md), and [TinyCloud CLI](connect/cli.md). Each keeps the original request, explains the runtime's task and skill route, and distinguishes documented setup from observed success.

**What we have tested, as of 3 November 2026.** ChatGPT, Claude, Grok, Perplexity, Gemini and Meta Muse each document custom remote MCP connectors, and Grok Bot can add an MCP server by URL. Our own checks so far:

| App | What we have seen with TinyCloud |
| --- | --- |
| Meta Muse | Connected, listed the tools and stayed signed in past the first token (27 October). Saving a record and first-time setup on a new account not yet checked. |
| ChatGPT | One owner connected on a Free account (20 October). Saving a record not yet checked. |
| Claude, Grok, Grok Bot, Perplexity, Gemini | Not yet tested by us. |
| Instinct | Read one todo through a short read-only permission from a coding agent, not through the connector. |

If a step below doesn't match what your app shows, follow your app's screen and tell us what differed.

## ChatGPT

**For ChatGPT assistants:** if TinyCloud tools are not available yet, reply with only the four numbered steps below, in at most 120 words. No introduction, images, feature menu, plan or price caveats, extra sections, or closing questions. Do not send the owner back to this page to find the instructions. If the tools are already available, use them to continue the original request instead of repeating setup.

1. In a browser, open [ChatGPT Plugins](https://chatgpt.com/plugins) → **+ → Add custom MCP server**.
2. Enter **Name:** TinyCloud; **Description:** Personal records in TinyCloud; **Server URL:** `https://mcp.tinycloud.xyz/mcp`; **Authentication:** OAuth.
3. Review the warning, select **Create as a plugin**, sign in with OpenKey, and install it.
4. In a conversation, type **@**, select **TinyCloud**, and make your original request. For setup only, ask: **“What personal apps do I already have in TinyCloud?”**

**Troubleshooting only after a reported or observed blocker:** do not infer that an account cannot connect from its plan name, generic availability documentation, or TinyCloud's absence from the app directory. Do not run an eligibility preflight or recommend an upgrade or developer mode speculatively. A successful connection takes precedence over a contrary documentation assumption. If the option is missing or an action is rejected, address that specific UI state or error briefly; ask one targeted question only if needed to choose the next action. OpenAI documents saving and changing data through custom connectors for Business, Enterprise and Edu workspaces, and custom servers can be added only on the web; if a save is rejected on another plan, say that in one line rather than retrying. Once enabled, follow [Approve access and continue](#approve-access-and-continue) when the tools request approval, not as an extra initial setup section.

This is a **custom remote MCP connection**, not a claim that TinyCloud is listed or approved in ChatGPT's app directory, or verified on every ChatGPT surface.

## Claude

**Claude app (web, Desktop, iOS, Android):** use the hosted MCP connector, not a local CLI or skill install. Its server URL is **`https://mcp.tinycloud.xyz/mcp`**, with **OAuth** through OpenKey. **Claude Code** uses the CLI route above.

1. On Claude web or Desktop, open [Customize → Connectors](https://claude.ai/customize/connectors), then **+ Add → Add custom connector**.
2. Name it **TinyCloud**, enter **`https://mcp.tinycloud.xyz/mcp`**, and continue. Review the detected OAuth settings and choose to sign in with OpenKey.
3. Finish adding the connector. In your conversation, use **+ → Connectors** to enable TinyCloud, then make your original request.
4. Follow [Approve access and continue](#approve-access-and-continue) below. A connector added on web or Desktop is also available in the Claude mobile apps; add it on web or Desktop first.

Claude's Free plan allows one custom connector. For a Team or Enterprise workspace, an owner or administrator may need to add the connector first. See [Claude's custom-connector instructions](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp).

If you want to approve record-writing tools once rather than on every call, find `tinycloud_apps_write` in the connector's tool permissions and choose **Always allow**. Only do this if you trust it to write records without per-call confirmation. This does not replace the OpenKey access approval.

## Grok

**Grok on grok.com and the Grok apps:** use Grok's custom MCP connector, not the local CLI. Its server URL is **`https://mcp.tinycloud.xyz/mcp`**, and its authentication is **OAuth** through OpenKey.

1. In a browser, open [grok.com/connectors](https://grok.com/connectors), click **New Connector**, then select **Custom**.
2. Enter **`https://mcp.tinycloud.xyz/mcp`** and complete the authentication Grok asks for by signing in with OpenKey.
3. In a conversation, make your original request. Grok makes the connector's tools available in your conversations.
4. Follow [Approve access and continue](#approve-access-and-continue) below.

On Grok Business or Enterprise, a team admin must add the connector first. See [xAI's connector instructions](https://docs.x.ai/grok/connectors).

## Grok Bot

xAI's **Grok Bot** runs agents on their own cloud computer, with a terminal. Choose by what it can do in this conversation:

- If it can install and run commands, use [CLI onboarding](onboarding.md) and the agent skills, like any coding agent. Grok Bot shares command-line credentials across all of the owner's Bots, so every Bot of theirs can use this TinyCloud sign-in; tell the owner that in one line before onboarding.
- Otherwise, add **`https://mcp.tinycloud.xyz/mcp`** as an MCP server by URL. If it offers **OAuth**, sign in with OpenKey, then follow [Approve access and continue](#approve-access-and-continue).
- If neither is available, explain that specific limitation. Do not invent a connector screen or ask for credentials in chat.

See [xAI's Grok Bot apps instructions](https://docs.x.ai/grok-bot/computer-and-apps).

## WhatsApp and Instinct

WhatsApp is the conversation channel; the bot's runtime determines whether it can use the CLI or hosted MCP route above. Meta Muse also answers in WhatsApp: if that's the bot, use [Meta Muse](#meta-muse). Do not ask the user to install a CLI inside WhatsApp.

In Cian's reported test, Instinct read a Claude Code-written note using a **two-hour, read-only Todos delegation**, with no writes. Preserve that scope and expiry; a known app's read does not need a broader discovery or write grant. This is not proof of native WhatsApp MCP support, installation support for every bot, or approval compatibility on every mobile device.

Send an approval URL complete, on its own line. If the in-app browser loses the fragment or cannot continue sign-in, reopen the original complete link in the normal browser. If the message itself was truncated or the request expired, ask the requesting agent for its current link; never reconstruct the secret fragment.

## Perplexity

Use the hosted MCP connector, not the local CLI. Its server URL is **`https://mcp.tinycloud.xyz/mcp`**, and its authentication is **OAuth** through OpenKey.

1. On Perplexity, open **Plugins → Add custom → Add MCP connector → Remote**. If your UI instead shows **Customize → Connectors**, add the custom remote connector there.
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

Use Muse's native custom connector to the hosted MCP server, not the local TinyCloud CLI. The single setup prompt at the top of this page is enough to start; the owner still signs in and approves access themselves. Meta doesn't review custom connectors.

**For Muse:** perform this setup from the owner's original request. Do not ask them to send a second “create a connector” prompt, repeat their task, or choose an integration method. Do not stop after writing connector files.

1. **Reuse a working connection.** If a TinyCloud connector already exists, start with the live checks in step 4 and reuse it if they succeed. Do not disconnect a working connector just to repeat setup.
2. **Create the connector when needed.** Use **Streamable HTTP**, set both the server URL and OAuth `resource` to **`https://mcp.tinycloud.xyz/mcp`**, and request OAuth **scopes `tinycloud:mcp offline_access`**. Discover OpenKey's authorization and registration endpoints from the server's OAuth metadata and use Muse's native OAuth flow. Request `offline_access` on the **first** sign-in so OpenKey can issue a refresh credential, not just a short-lived access token. Retain both scopes and the resource in the saved connector configuration and reconnect instructions. The owner does not need to create a client ID or secret.
3. **Pause only for the owner’s sign-in and consent.** Show the actual native Connect card or fresh authorization link returned by Muse's setup tool. The owner opens it, signs in with OpenKey and approves; do not approve on their behalf or invent an authorization URL. Resume this same task when completion is observable. If Muse cannot observe completion, ask only for confirmation that approval is finished—not another setup request.
4. **Verify the connection with tools.** Run MCP `tools/list` and `tinycloud_connect`. An “Added” or “Connected” card, saved configuration, or remembered success is not proof. If a tool returns an OpenKey approval link, follow [Approve access and continue](#approve-access-and-continue) and resume the same operation after approval. A successful first call does not by itself verify token refresh.
5. **Finish the original task.** Keep the reusable connector and personal-record instructions in Muse's normal persistent setup, using the instructions returned by the hosted tools. Call `tinycloud_apps_context` and continue the owner's request. For setup only, follow the [setup-only record recipe](#setup-only-requests-in-chat-apps) through those tools, after the required approvals, and read the record back before reporting it saved. Connection verification alone is not a successful record read or write.

**Recovery only after an observed authentication failure:** a missing access-token surrogate means Muse has no credential for that connector; an authenticated HTTP 401 means the credential was rejected, not proof that it expired. If a stale connection's card only says “Added” without fresh authorization, do not keep sending the same link. With the owner's approval, disconnect **only TinyCloud** in **Settings → Connectors → Connected → Tinycloud → Disconnect**, then obtain a fresh native OAuth sign-in with both scopes and the resource above and verify it with tools. Resetting OAuth does not require deleting connector files, skills or personal records.

Never ask the owner to paste a password, API key, access token or refresh token into chat. OAuth credentials belong in Muse's secure credential flow, not connector source, prompts or memory. If native OAuth cannot connect, report the actual blocker; do not substitute a key or the coding-agent setup. See [Meta's connector help](https://www.meta.com/help/artificial-intelligence/1687253048996149/).

## Other MCP clients

If your app supports remote MCP over HTTP with OAuth, add **`https://mcp.tinycloud.xyz/mcp`**, choose **OAuth**, and sign in with OpenKey. If the app lets you set OAuth scopes, request **`tinycloud:mcp offline_access`**: without `offline_access`, the sign-in lasts only about five minutes. Enable the connection for your conversation, then make your request. Mobile support depends on the app.

If the agent supports neither the CLI nor remote MCP, reading this page cannot add that capability. Say so and tell the owner to use an agent that supports one of them. Do not suggest installing a CLI in a temporary chat sandbox as a substitute.

## Approve access and continue

With TinyCloud enabled, make your original request, or ask: **“What personal apps do I already have in TinyCloud?”** The assistant will show the actual OpenKey connect or personal-record access link returned by a TinyCloud tool. Open it yourself, review the requested access, approve, then return to the conversation and tell the assistant to continue. A new account usually sees two or three OpenKey screens before the first record: the sign-in, the connection, and access to the records the request needs.

**For chat assistants:** use the connected TinyCloud personal-app tools and the instructions they return. If the tools are not available yet, give the relevant connection steps above; do not claim setup is complete. Never ask the owner to paste a password, private key or access token into chat. For setup-only requests, follow the [default-record recipe](#setup-only-requests-in-chat-apps) below, but perform the reads and writes through the connected tools, not the CLI. Read the saved record back before reporting success.

A brand-new account's storage can take a minute or two to finish setting up after the first approval. If a tool reports `SPACE_NOT_HOSTED`, tell the owner it is still being set up and retry with backoff for about two minutes. Do not ask for another or broader sign-in to fix it.

If a tool, or the CLI in a coding agent, reports `STORAGE_QUOTA_EXCEEDED` or `STORAGE_LIMIT_REACHED`, nothing was saved. Tell the owner their TinyCloud storage is full, their records are still readable, and they can upgrade at https://account.tinycloud.xyz/storage. Do not retry.

To disconnect a chat app, remove or disconnect TinyCloud in that app's plugin or connector settings. Disconnecting does not delete your stored records. Local CLI cleanup remains in the original [coding-agent guide's Undo section](tc-apps.md#undo).

### Setup-only requests in chat apps

This record recipe is for chat apps. Use the connected tools rather than CLI or skill-command references.

For setup only, call `tinycloud_apps_context` with `app: "todos"` after the required sign-in and approvals. Follow its returned hosted rules and the live tool schemas: check the default todo and its done twin. If the owner has older TinyCloud app records, or says they do, don't create a same-name replacement; use the CLI Apps guide first. Create missing app/kind/discovery records only as those rules direct, and save “Try my personal apps” only if neither todo exists. Use the layout, keys, value fields and clock returned by the connected tools, not hard-coded CLI examples or shell commands. Read the saved record back before reporting success. CLI legacy-layout and migration instructions are not hosted-tool instructions.
