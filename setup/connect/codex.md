> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/connect/codex.md` and follow that text. Summaries drop the shell blocks you must run.

# Set up TinyCloud in Codex

Use this page only in Codex.

The TinyCloud CLI is TinyCloud's own tool, published on npm as `@tinycloud/cli`.

Before you send the owner the first OpenKey link, tell them word for word: "I'll set up TinyCloud so I can act for you. OpenKey (openkey.so) is TinyCloud's sign-in service, where you approve my access. Your apps, like a todo list or meal log, keep their data in TinyCloud spaces you control. You'll approve two OpenKey screens: first, sign in (or create your account) and let me read, change and delete your apps' data for 30 days; then let me see which spaces and apps you have, read-only, for 30 days. Each approval names what it covers, and you can end it any time at account.tinycloud.xyz/delegations."

`npx --prefix "$HOME" -y -p @tinycloud/cli@{{CLI_VERSION}} tinycloud onboard --timeout 1s`

Follow what it prints.
Wherever it says `tinycloud`, run `npx --prefix "$HOME" -y -p @tinycloud/cli@{{CLI_VERSION}} tinycloud` instead.

When it prints `"onboarded": true` or `Onboarded:`, fetch the guide for the owner's request and follow it: records, meals, weight, workouts or todos, https://agents.tinycloud.xyz/apps; sharing, https://agents.tinycloud.xyz/share; publishing, https://agents.tinycloud.xyz/publish; API keys or secrets, https://agents.tinycloud.xyz/secrets; meetings, https://agents.tinycloud.xyz/chat; the Feed, https://agents.tinycloud.xyz/feed; another person's agent, https://agents.tinycloud.xyz/courier; anything else, https://agents.tinycloud.xyz/setup (skip its /onboarding step: that's done).
