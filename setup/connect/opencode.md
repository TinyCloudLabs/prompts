> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/connect/opencode.md` and follow that text. Summaries drop the shell blocks you must run.

# Set up TinyCloud in OpenCode

Use this page only in OpenCode.

The TinyCloud CLI is TinyCloud's own tool, published on npm as `@tinycloud/cli`.

`npx -y @tinycloud/cli@{{CLI_VERSION}} onboard --timeout 1s`

Follow what it prints.
Wherever it says `tinycloud`, run `npx -y @tinycloud/cli@{{CLI_VERSION}}` instead.

Then continue the owner's request.
