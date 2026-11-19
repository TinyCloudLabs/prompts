> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/connect/grok-bot.md` and follow that text. Summaries drop the shell blocks you must run.

# Set up TinyCloud in Grok Bot

Use this page only in Grok Bot with a persistent terminal.
Before you run anything, tell the owner that [Grok Bot shares command-line credentials across their Bots](https://docs.x.ai/grok-bot/computer-and-apps#one-computer-shared-by-all-your-bots).

The TinyCloud CLI is TinyCloud's own tool, published on npm as `@tinycloud/cli`.

`npx -y @tinycloud/cli@{{CLI_VERSION}} onboard --timeout 1s`

Follow what it prints.
Wherever it says `tinycloud`, run `npx -y @tinycloud/cli@{{CLI_VERSION}}` instead.

Save the TinyCloud skill so you remember how to use it. Run these as two separate commands:

`mkdir -p "$HOME/.local/share/tinycloud" && curl -fsSL -o "$HOME/.local/share/tinycloud/install.js" https://agents.tinycloud.xyz/skills/install.js`

`node "$HOME/.local/share/tinycloud/install.js" cli --agent codex`

Then continue the owner's request.
