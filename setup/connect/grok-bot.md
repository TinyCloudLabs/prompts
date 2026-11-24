> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/connect/grok-bot.md` and follow that text. Summaries drop the shell blocks you must run.

Read this page as raw text, not a summary; if your fetch tool summarizes it, fetch this page's `.md` URL itself.

# Set up TinyCloud in Grok Bot

Use this page only in Grok Bot with a persistent terminal.
Before you run anything, tell the owner that [Grok Bot shares command-line credentials across their Bots](https://docs.x.ai/grok-bot/computer-and-apps#one-computer-shared-by-all-your-bots).

The TinyCloud CLI is TinyCloud's own tool, published on npm as `@tinycloud/cli`.

Send the owner this message, then the link:

> I'll set up TinyCloud so I can act for you. You'll approve one screen in OpenKey, TinyCloud's sign-in service: sign in, then let me read, change and delete your apps' data, and see which spaces and apps you have, read-only.
> The approval lasts up to 30 days. You can end it at account.tinycloud.xyz/delegations.

`npx --prefix "$HOME" -y -p @tinycloud/cli@{{CLI_VERSION}} tinycloud onboard --timeout 1s`

Follow what it prints.
Wherever it says `tinycloud`, run `npx --prefix "$HOME" -y -p @tinycloud/cli@{{CLI_VERSION}} tinycloud` instead.

When it prints `"onboarded": true` or `Onboarded:`, fetch the guide for the owner's request and follow it: records, meals, weight, workouts or todos, https://agents.tinycloud.xyz/apps; sharing, https://agents.tinycloud.xyz/share; publishing, https://agents.tinycloud.xyz/publish; API keys or secrets, https://agents.tinycloud.xyz/secrets; meetings, https://agents.tinycloud.xyz/chat; the Feed, https://agents.tinycloud.xyz/feed; another person's agent, https://agents.tinycloud.xyz/courier; anything else, https://agents.tinycloud.xyz/setup (skip its /onboarding step: that's done).
