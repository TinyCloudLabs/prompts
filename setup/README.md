# TinyCloud for your agent

Give your coding agent (Claude Code, Codex or OpenCode) abilities that keep your data in your own TinyCloud space. Each ability has one page. Every page says what it does, the one prompt or command to run, what you'll be asked to approve, and how to undo it.

You need a shell, Node.js 22.20 or later, and npm.

**Agents:** the owner sent you this page, maybe with a request. Pick the action below and follow its page now, in this conversation. [One shared setup entry](agent.md) installs the pinned CLI and only that action's skill; if the owner only asked for the CLI, follow [its module](tinycloud.md).

## Personal records: [/apps](tc-apps.md)

- **What it does:** your agent logs, tracks and looks up anything you keep records of, like meals, weight, workouts or todos, and organises them into apps as you go.
- **Paste into your agent:** `Never run npm install -g, npm i -g, sudo, or curl piped to a shell. Read https://agents.tinycloud.xyz/apps in full and follow it: fetch it with curl -fsSL https://agents.tinycloud.xyz/apps and read the whole output; do not run any other command, including npm or node checks or an install, before you have read it. Log this meal in my TinyCloud: breakfast, two eggs and a slice of toast, about 350 kcal. Set it up with TinyCloud. This installs @tinycloud/cli from npm into its own folder and the tc-apps skill from agents.tinycloud.xyz for your user, and saves a sign-in (a key and session in ~/.tinycloud). If an app of yours handles this, it asks you to approve 7-day access to just that app. Otherwise it asks for 30-day access to your records.`
- **You approve:** one OpenKey screen for the app, or two the first time on this computer: your own 7-day sign-in, which lists your whole space, then the app. For a meal, the app screen gives your agent access to just Health Log, for 7 days; otherwise, your records, for 30 days. If OpenKey shows a code, paste it into the terminal where the sign-in is running. If your agent asks you for the code, you can paste it in the chat.
- **Undo:** the end of [the page](tc-apps.md#undo) lists the commands.

## Meetings: [/chat](../apps/tinychat/setup.md)

- **What it does:** your agent answers questions about your TinyChat meetings: recaps, follow-ups and what was said, with references to the transcript.
- **Paste into your agent:** `How did my last meeting go? Check TinyCloud: https://agents.tinycloud.xyz/chat`
- **You approve:** a TinyChat sign-in in your browser that lets this computer read your TinyChat meetings, for 7 days.
- **Undo:** delete the `tinychat-retrieval` skill folder, and log out if you signed in; [§6 of the page](../apps/tinychat/setup.md#6-return-hand-off-update-or-remove) has both.

## Publish and share: [/publish](publish.md)

- **What it does:** your agent publishes a document or web page from your computer and sends you a link: private to you by default, or public when you ask.
- **Paste into your agent:** `Publish this report and send me a private link. Use TinyCloud: https://agents.tinycloud.xyz/publish`
- **You approve:** a separate OpenKey request for standing read/write access to your share folders (not just this report), for up to 30 days. Setup alone grants nothing.
- **Undo:** clearing the local login is not owner revocation. Link revocation has the limits on [the page](publish.md#undo).

## Share an artifact: [/share](share.md)

- **What it does:** your agent publishes a document or web page from your computer to your TinyCloud and gives you a link. You choose who can open it: anyone with the link, one email address, or everyone at a domain. Every share expires, and your agent can revoke it.
- **Paste into your agent:** `Share this with TinyCloud, and ask me who should be able to open it: https://agents.tinycloud.xyz/share`
- **You approve:** the same OpenKey request as [/publish](publish.md): standing publish access to your share folders, for up to 30 days. Setup alone grants nothing.
- **Undo:** same as [/publish](publish.md#undo).

## Secrets: [/secrets](secrets.md)

- **What it does:** your agent uses API keys you keep in TinyCloud Secrets without the value ever appearing in the conversation. If a key is missing, it sends you a link to add it.
- **Paste into your agent:** `Turn this script into a voiceover with ElevenLabs. Get the key from TinyCloud: https://agents.tinycloud.xyz/secrets`
- **You approve:** Secret Manager add if missing, then a separate OpenKey grant naming the secret plus network-wide decrypt authority. Setup grants nothing.
- **Undo:** `auth logout` is local only; [the page](secrets.md#undo) explains the distinction.

## Agent-to-agent threads: [/courier](courier.md)

- **What it does:** your agent and a colleague's agent send each other requests and answers over TinyCloud, inside rules you set.
- **Paste into your agent:** `Set up Courier for this task: https://agents.tinycloud.xyz/courier`
- **You approve:** a separate OpenKey grant for Courier's own key to keep messages and state in your `agents` space, for 30 days, and each pairing.
- **Undo:** `courier revoke` currently removes local peer state; older access lasts to expiry. [The page](courier.md#undo) explains the limits.

## Building blocks

- [/agent](agent.md): one setup entry for Secrets, publish/share and Courier. Installs one skill for the task, never a grant.
- [/cli](tinycloud.md): installs the CLI and core skill into a private prefix. Does not grant access.
- [/openkey](openkey.md): installs the standalone OpenKey CLI, for workflows that need it. No page here uses it. Nothing to approve.

## Skills

The pages install these for you. To install one yourself, replace `<skill>` and `<client>` (`claude-code`, `codex` or `opencode`):

```sh
curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - <skill> --agent <client>
```

`<skill>` is `apps`, `chat`, `publish`, `secrets`, `courier` or `cli`, from the pages above, or `mcp`. The installer checks every file against [`/skills/index.json`](https://agents.tinycloud.xyz/skills/index.json) and prints `SKILL_INSTALLED <name> <version> <folder>`. To read a skill, open `/skills/<skill>.md`, for example [`/skills/apps.md`](https://agents.tinycloud.xyz/skills/apps.md); its files, exactly as installed, are under `/skills/<skill>/`. To remove one, delete its folder.

`mcp` has no setup page: it's the skill that goes with the TinyCloud MCP server, `@tinycloud/mcp` 0.5.3, for agents that already run that server. Install it with the line above and `mcp` as `<skill>`; read it at [`/skills/mcp.md`](https://agents.tinycloud.xyz/skills/mcp.md).
