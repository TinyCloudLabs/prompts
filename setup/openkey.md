> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/openkey` and follow that text. Summaries drop the shell blocks you must run.

# Set up the standalone OpenKey CLI

## For the owner

- **What it does:** installs the standalone OpenKey CLI, `@openkey/cli` 0.1.5, into its own folder, `~/.local/share/tinycloud/openkey`. Only workflows that run `openkey` commands themselves need it; no other page on this site does. TinyCloud sign-ins and approvals go through [/onboarding](onboarding.md) and the TinyCloud CLI, not this tool.
- **Paste into your agent:** `Fetch https://agents.tinycloud.xyz/openkey with curl and follow it, including running its installer. Set up the OpenKey CLI.`
- **You approve:** nothing. Installing it doesn't sign in.
- **Undo:** delete the folder `~/.local/share/tinycloud/openkey`. If a workflow signed you in with it, ask your agent to run `openkey logout` first: it revokes the session and deletes `~/.openkey/credentials.json`.

## For the agent

This optional module installs and checks the standalone `openkey` tool. Use it only when a calling workflow explicitly needs direct OpenKey CLI commands. It grants nothing: installing or signing in with `openkey` does not give any application TinyCloud permissions, which stay the calling app's responsibility.

## Caller contract

Before starting, keep the user's original task, the current agent client, the calling guide and its exact return heading. After the check, return directly to that heading and continue the original task in the same conversation without asking the user to paste another prompt.

## Requirements

Node.js **20 or later** and npm, the minimum every page on this site uses.

## Install or reuse

The CLI goes into a private folder and you run it by its full path, never as a global install, so it never replaces another `openkey` on `PATH`. Run this as one shell call. It reuses the folder when it already holds 0.1.5, otherwise installs the exact [published package](https://www.npmjs.com/package/@openkey/cli/v/0.1.5), then prints the path to use:

```sh
P="$HOME/.local/share/tinycloud/openkey"
V=$(node -p 'require(process.argv[1]).version' "$P/node_modules/@openkey/cli/package.json" 2>/dev/null)
[ "$V" = 0.1.5 ] || npm install --prefix "$P" --save-exact --no-audit --no-fund @openkey/cli@0.1.5 > /dev/null || exit 1
"$P/node_modules/.bin/openkey" --help > /dev/null && echo "OPENKEY_READY $P/node_modules/.bin/openkey"
```

On Windows the folder is the same one under your user profile, and the executable is `node_modules\.bin\openkey.cmd`. Use the path from `OPENKEY_READY` for every `openkey` command below. `openkey --version` prints `0.0.1` in the published 0.1.5 package, an upstream version-string defect, so check the version from the package's `package.json` as the block does. Installing and checking are the end of this module; don't sign in as part of setup.

## Signing in, when a workflow asks

Every command except `logout` needs an OAuth client ID from the calling application or operator. There is no universal client ID, so never invent one. The calling workflow supplies it:

```sh
openkey --client-id <CALLER_OAUTH_CLIENT_ID> login
```

`login` opens the browser on this computer for OpenKey's OAuth sign-in and waits for OpenKey to return to a local address on this computer (`127.0.0.1`). `--no-browser` prints the sign-in link instead, but the sign-in still has to finish in a browser on this same computer, so it doesn't work from a phone or for an agent in a remote workspace. It saves the session to `~/.openkey/credentials.json` (mode 0600) and refreshes it when it expires. The other commands are `whoami`, `keys`, `sign <message>`, `token` and `logout`; `openkey <command> --help` describes each.

OpenKey owns the [CLI package](https://github.com/TinyCloudLabs/openkey/tree/54e3bfc5b7626e1a288e2cf54eed9a06ae3c0140/packages/cli), its [package metadata](https://github.com/TinyCloudLabs/openkey/blob/54e3bfc5b7626e1a288e2cf54eed9a06ae3c0140/packages/cli/package.json) and the upstream [generic `openkey-cli` skill](https://github.com/TinyCloudLabs/openkey/blob/54e3bfc5b7626e1a288e2cf54eed9a06ae3c0140/packages/cli/.claude/skills/openkey-cli/SKILL.md). That skill stays upstream and is not copied into this repository or shipped in the npm package's `dist` files.

Return to the recorded caller after the check, keeping its original task, client and next heading.
