> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/openkey` and follow that text. Summaries drop the shell blocks you must run.

# Use the standalone OpenKey CLI

## For the owner

- **What it does:** runs OpenKey's standalone CLI, `@openkey/cli` 0.1.5, only for a workflow that explicitly needs direct `openkey` commands. TinyCloud sign-ins and approvals use [/onboarding](onboarding.md) instead.
- **Paste into your agent:** `Fetch https://agents.tinycloud.xyz/openkey with curl and follow it. Set up the OpenKey CLI.`
- **You approve:** nothing until a calling workflow asks you to sign in.
- **Undo:** run the logout command below if you signed in; it revokes the session and deletes `~/.openkey/credentials.json`.

## For the agent

Keep the user's original task, current client, calling guide and exact return heading. Use this page only when the calling workflow explicitly needs direct OpenKey CLI commands.

## Check the pinned CLI

Node.js **20 or later** and npm are required. Run:

```sh
npx --prefix "$HOME" -y -p @openkey/cli@0.1.5 openkey --help
```

The published package reports `0.0.1` from `openkey --version`; the package pin above is `0.1.5`. Return directly to the calling heading after this check.

## Signing in, when a workflow asks

Every command except `logout` needs an OAuth client ID from the calling application or operator. There is no universal client ID, so never invent one:

```sh
npx --prefix "$HOME" -y -p @openkey/cli@0.1.5 openkey --client-id <CALLER_OAUTH_CLIENT_ID> login
```

`login` opens the browser on this computer for OpenKey's OAuth sign-in and waits for OpenKey to return to `127.0.0.1`. `--no-browser` prints the sign-in link instead, but the sign-in still has to finish in a browser on this same computer. It saves the session to `~/.openkey/credentials.json` and refreshes it when it expires. Use the same pinned `npx --prefix "$HOME"` form for `whoami`, `keys`, `sign <message>`, `token` and `logout`.

OpenKey owns the [CLI package](https://github.com/TinyCloudLabs/openkey/tree/54e3bfc5b7626e1a288e2cf54eed9a06ae3c0140/packages/cli) and its [package metadata](https://github.com/TinyCloudLabs/openkey/blob/54e3bfc5b7626e1a288e2cf54eed9a06ae3c0140/packages/cli/package.json).
