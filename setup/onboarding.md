> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/onboarding.md` and follow that text. Summaries drop the shell blocks you must run.

# Set up TinyCloud

Use this page only in an agent that can run commands.

The TinyCloud CLI is TinyCloud's own tool, published on npm as `@tinycloud/cli`.

`npx --prefix "$HOME" -y -p @tinycloud/cli@{{CLI_VERSION}} tinycloud onboard --timeout 1s`

If the operator set `TC_BIN`, run `"$TC_BIN" onboard --timeout 1s` instead.
Follow what it prints. If it exits with an error, follow the exit-code table at https://agents.tinycloud.xyz/agent#exit-codes-and-owner-lines.
Wherever it says `tinycloud`, run `npx --prefix "$HOME" -y -p @tinycloud/cli@{{CLI_VERSION}} tinycloud` instead, or `"$TC_BIN"` if it's set.
If your client blocks the command, stop and tell the owner. Don't run it another way.

When the CLI says setup is ready, continue the owner's original request.
