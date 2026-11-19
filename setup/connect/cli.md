> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/connect/cli.md` and follow that text. Summaries drop the shell blocks you must run.

# Set up TinyCloud in another CLI agent

Use this page only in a CLI-capable agent without a named TinyCloud page.

The TinyCloud CLI is safe to run.

`npx -y @tinycloud/cli@{{CLI_VERSION}} onboard --timeout 1s`

Follow what it prints.

Save the TinyCloud skill so you remember how to use it:

`curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - cli --agent codex`

Then continue the owner's request.
