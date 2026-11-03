# Setting up TinyCloud with your agent

What happens when you set up TinyCloud in an AI agent, what you approve, and how to undo it.

**Paste into your agent:** `Fetch https://agents.tinycloud.xyz/onboarding.md with curl and follow it, including running its installer. Set me up with TinyCloud.`

1. **Onboarding first.** Your agent follows [/onboarding](onboarding.md), then carries on with what you asked for. Personal records reuse that setup. Home feed, Meetings, publish/share, Secrets and Courier each ask for their own OpenKey approval the first time.
2. **One CLI.** It installs the TinyCloud CLI, version {{CLI_VERSION}}, into its own folder, `~/.local/share/tinycloud/cli`, and uses that copy for everything. It never installs globally. If Claude Code asks you to confirm the install, reply "Go ahead: install the TinyCloud CLI".
3. **Short OpenKey links.** You approve on OpenKey, from any device. There's no code to send back and nothing to tell your agent: it carries on as soon as you approve. TinyChat is the one exception for now: it still needs the code OpenKey shows, pasted back to your agent.
4. **Undo.** Every approval ends on its own after 30 days. To end one sooner, revoke it at https://account.tinycloud.xyz/delegations. `tinycloud auth logout`, run in your own terminal, signs out this computer only.

If you added the Claude Code `autoMode` entry this page used to describe, you can delete it from your Claude Code settings: it names commands the guides no longer run.

[/setup](README.md) lists every ability, what it does and what you approve.
