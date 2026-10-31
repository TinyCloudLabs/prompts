# TinyCloud for your agent

Give your AI agent abilities that keep your data in your own TinyCloud space. Agents that can install and run the TinyCloud CLI use it; others that support remote MCP connect through /connect. Each ability has one page. Every page says what it does, the one prompt or command to run, what you'll be asked to approve, and how to undo it.

**New to TinyCloud, or want it set up first?** Start at [/onboarding](onboarding.md). It works in any agent: you sign in or create an account with OpenKey, approve two OpenKey screens, and your agent carries on with your request.

The CLI route needs Node.js 22.20 or later and npm. The hosted MCP has no meeting tools yet; meetings use the CLI route.

**Agents:** the owner sent you this page, maybe with a request. Start with [/onboarding](onboarding.md): it installs the CLI, signs the owner in and gives the starting grant, then sends you to the page below for the request. Most pages reuse that; publish/share and Secrets each have their own single approval.

## Personal records: [/apps](tc-apps.md)

- **What it does:** your agent logs, tracks and looks up anything you keep records of, like meals, weight, workouts or todos, and organises them into apps as you go.
- **Paste into your agent:** `Fetch https://agents.tinycloud.xyz/apps with curl and follow it. Log this meal in my TinyCloud: breakfast, two eggs and a slice of toast, about 350 kcal.`
- **You approve:** for Health Log, three OpenKey approvals the first time: opening it once in Share, then a sign-in link and an access link your agent sends. When OpenKey shows a code, paste it back to your agent in the chat. Each other app asks once, the first time you use it.
- **Undo:** the end of [the page](tc-apps.md#undo) lists the commands.

## Home feed: [/feed](https://agents.tinycloud.xyz/feed)

- **What it does:** your agent writes cards you asked for to TinyCloud Home, under its own bot folder.
- **Paste into your agent:** `Post the updates I ask for to my TinyCloud Home feed. Follow: https://agents.tinycloud.xyz/feed`
- **You approve:** one TinyCloud sign-in approval for `put` on that bot's `applications` feed folder only, following the agent client's documented flow. Create-only writes need `@tinycloud/cli@1.5.0` or later.
- **Undo:** revoke that bot's delegation through your TinyCloud account controls; local logout alone does not revoke the owner's grant.

## Meetings: [/chat](../apps/tinychat/setup.md)

- **What it does:** your agent answers questions about your TinyChat meetings: recaps, follow-ups and what was said, with references to the transcript.
- **Paste into your agent:** `How did my last meeting go? Check TinyCloud: https://agents.tinycloud.xyz/chat`
- **You approve:** after [/onboarding](onboarding.md), at most one OpenKey link that lets your agent read your TinyChat meetings for 30 days; send back the code it shows.
- **Undo:** delete the `tinychat-retrieval` skill folder; to end access sooner, revoke it at https://account.tinycloud.xyz/delegations. [§6 of the page](../apps/tinychat/setup.md#6-return-hand-off-update-or-remove) has both.

## Publish and share: [/publish](publish.md)

- **What it does:** your agent publishes a document or web page from your computer and sends you a link that anyone who has it can open. It asks you before it makes one.
- **Paste into your agent:** `Publish this report and send me a link. Use TinyCloud: https://agents.tinycloud.xyz/publish`
- **You approve:** its own single OpenKey approval to let your agent publish to your share folders, for up to 30 days; send back the code it shows.
- **Undo:** clearing the local login is not owner revocation. Link revocation has the limits on [the page](publish.md#undo).

## Share an artifact: [/share](share.md)

- **What it does:** your agent publishes a document or web page from your computer to your TinyCloud and gives you a link. Anyone with the link can open it, so your agent asks you first; sharing with an email address or a domain is not available yet. Every share expires, and your agent can revoke it.
- **Paste into your agent:** `Share this with TinyCloud: https://agents.tinycloud.xyz/share`
- **You approve:** the same OpenKey link as [/publish](publish.md), to let your agent publish to your share folders, for up to 30 days.
- **Undo:** same as [/publish](publish.md#undo).

## Secrets: [/secrets](secrets.md)

- **What it does:** your agent uses API keys you keep in TinyCloud Secrets without the value ever appearing in the conversation. If a key is missing, it sends you a link to add it.
- **Paste into your agent:** `Turn this script into a voiceover with ElevenLabs. Get the key from TinyCloud: https://agents.tinycloud.xyz/secrets`
- **You approve:** a Secret Manager link to add a missing key, and one OpenKey link to let your agent read the keys it names, for 30 days.
- **Undo:** `auth logout` is local only; [the page](secrets.md#undo) explains the distinction.

## Agent-to-agent threads: [/courier](courier.md)

- **What it does:** your agent and a colleague's agent send each other requests and answers over TinyCloud, inside rules you set.
- **Paste into your agent:** `Set up Courier for this task: https://agents.tinycloud.xyz/courier`
- **You approve:** a separate OpenKey grant for Courier's own key to keep messages and state in your `agents` space, for 30 days, and each pairing.
- **Undo:** `courier revoke` currently removes local peer state; older access lasts to expiry. [The page](courier.md#undo) explains the limits.

## Building blocks

- [/onboarding](onboarding.md): the one setup. Signs you in and gives the starting grant; most abilities reuse it.
- [/agent](agent.md): installs the one skill for Secrets, publish/share or Courier, after /onboarding.
- [/cli](tinycloud.md): installs the CLI and core skill into a private prefix. Does not grant access.
- [/openkey](openkey.md): installs the standalone OpenKey CLI, for workflows that need it. No page here uses it. Nothing to approve.

## Skills

The pages install these for you. To install one yourself, replace `<skill>` and `<client>` (`claude-code`, `codex` or `opencode`; any other agent uses `codex`):

```sh
curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - <skill> --agent <client>
```

`<skill>` is `apps`, `feed`, `chat`, `publish`, `secrets`, `courier` or `cli`, from the pages above, or `mcp`. The installer checks every file against [`/skills/index.json`](https://agents.tinycloud.xyz/skills/index.json) and prints `SKILL_INSTALLED <name> <version> <folder>`. To read a skill, open `/skills/<skill>.md`, for example [`/skills/feed.md`](https://agents.tinycloud.xyz/skills/feed.md); its files, exactly as installed, are under `/skills/<skill>/`. To remove one, delete its folder.

`mcp` is the skill that goes with the TinyCloud MCP server (`@tinycloud/mcp` 0.8.3), for agents that already run that server. Agents that support remote MCP connect to the hosted server at `https://mcp.tinycloud.xyz/mcp` instead and sign in with OpenKey; [`/connect`](https://agents.tinycloud.xyz/connect) has the steps. Install it with the line above and `mcp` as `<skill>`; read it at [`/skills/mcp.md`](https://agents.tinycloud.xyz/skills/mcp.md).
