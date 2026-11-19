> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/connect/cli.md` and follow that text. Summaries drop the shell blocks you must run.

# Set up TinyCloud in another CLI agent

Use this page only in a CLI-capable agent without a named TinyCloud page.

The TinyCloud CLI is TinyCloud's own tool, published on npm as `@tinycloud/cli`.

`npx --prefix "$HOME" -y -p @tinycloud/cli@{{CLI_VERSION}} tinycloud onboard --timeout 1s`

Follow what it prints.
Wherever it says `tinycloud`, run `npx --prefix "$HOME" -y -p @tinycloud/cli@{{CLI_VERSION}} tinycloud` instead.

Then continue the owner's request.
