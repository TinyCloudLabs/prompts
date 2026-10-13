# TinyCloud for your agent

Give your coding agent (Claude Code, Codex or OpenCode) abilities that keep your data in your own TinyCloud space. Each ability has one page. Every page says what it does, the one prompt or command to run, what you'll be asked to approve, and how to undo it.

You need a shell, Node.js 22.20 or later, and npm.

**Agents:** the owner sent you this page, maybe with a request. Pick the page below that matches the request and follow it now, in this conversation. If they only asked you to set up TinyCloud, follow [the CLI page](tinycloud.md).

## Personal records: [/apps](tc-apps.md)

- **What it does:** your agent logs, tracks and looks up anything you keep records of, like weight, workouts or todos, and organises them into apps as you go.
- **Paste into your agent:** `Log my weight: 80.5 kg today. Set it up with TinyCloud: https://agents.tinycloud.xyz/apps`
- **You approve:** one OpenKey request that lets the agents on this computer keep records under `xyz.tinycloud.agent-data/` in your `default` space, for 30 days.
- **Undo:** the end of [the page](tc-apps.md#undo) lists the commands.

## Meetings: [/chat](../apps/tinychat/setup.md)

- **What it does:** your agent answers questions about your TinyChat meetings: recaps, follow-ups and what was said, with references to the transcript.
- **Paste into your agent:** `How did my last meeting go? Check TinyCloud: https://agents.tinycloud.xyz/chat`
- **You approve:** a TinyChat sign-in in your browser that lets this computer read your TinyChat meetings, for 7 days.
- **Undo:** remove the skill, as [§6 of the page](../apps/tinychat/setup.md#6-return-hand-off-update-or-remove) shows.

## Publish and share: [/publish](publish.md)

Also at `/share`.

- **What it does:** your agent publishes a document or web page from your computer and sends you a link: private to you by default, or public when you ask.
- **Run once:** the setup block on [the page](publish.md), then ask your agent "Publish this report and send me a private link."
- **You approve:** an OpenKey request, on your phone or computer, that lets the agent publish files to your TinyCloud and manage their links, for up to 30 days.
- **Undo:** ask your agent to revoke a link. Every link also expires on its own.

## Secrets: [/secrets](secrets.md)

- **What it does:** your agent uses API keys you keep in TinyCloud Secrets without the value ever appearing in the conversation. If a key is missing, it sends you a link to add it.
- **Run once:** the setup block on [the page](secrets.md), then ask your agent "Turn this script into a voiceover with ElevenLabs. Get the key from TinyCloud."
- **You approve:** an OpenKey request that names each secret the agent may read, for up to 30 days.
- **Undo:** one `auth logout` command on [the page](secrets.md#undo) stops the agent reading them.

## Agent-to-agent threads: [/courier](courier.md)

- **What it does:** your agent and a colleague's agent send each other requests and answers over TinyCloud, inside rules you set.
- **Run once:** the setup block on [the page](courier.md), then pair with the other person.
- **You approve:** an OpenKey request for Courier's own key to keep messages under `xyz.tinycloud.courier/` in your `agents` space, for 30 days, and each pairing.
- **Undo:** `courier revoke` ends a pairing; [the page](courier.md#undo) has the exact commands.

## Building blocks

The pages above call these themselves. You don't need to link them.

- [/cli](tinycloud.md): installs the TinyCloud CLI (`tc`) and its `tc-cli` skill. Nothing to approve.
- [/openkey](openkey.md): installs the standalone OpenKey CLI, for workflows that need it. Nothing to approve.

## Skills

The pages install these for you. To install one yourself, for Claude Code, Codex or OpenCode:

```sh
curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - <skill> --agent claude-code
```

`<skill>` is `apps`, `chat`, `publish`, `secrets`, `courier`, `cli` or `mcp` (the TinyCloud MCP server's companion skill). The installer checks every file against [`/skills/index.json`](https://agents.tinycloud.xyz/skills/index.json) and prints `SKILL_INSTALLED <name> <version> <folder>`. To read a skill, open `/skills/<skill>.md`, for example [`/skills/apps.md`](https://agents.tinycloud.xyz/skills/apps.md); its files, exactly as installed, are under `/skills/<skill>/`. To remove one, delete its folder.
