# Read secrets from TinyCloud — quickstart

Background and walkthrough for the `tc-secrets` skill. The runnable blocks live in `SKILL.md`; run them from there, in order, one block per tool call.

Works in Codex, Claude Code, OpenCode, or OMP. Requires Node **20 or later** and an exact `@tinycloud/cli` pin that includes TC-599. Decryption also needs OpenKey with TC-598 live. Before those releases, sign-in succeeds but decryption is refused (`SECRET_DECRYPT_FAILED`).

## 0. Operator setup (once, not run by the agent)

```sh
npm install --prefix <dir> @tinycloud/cli@<pinned version>
export TC_BIN=<dir>/node_modules/.bin/tc
export TC_OWNER_DID=did:pkh:eip155:1:<owner address>    # the account that owns the secrets
export TC_HOME=<profile store for this agent>             # optional
export TC_SECRETS_PROFILE=api-keys                        # optional
export TC_SECRETS_STATE=<state dir for this agent>        # optional; default $HOME/.local/state/tc-secrets
```

Install this `tc-secrets` directory into the agent's skill path: `~/.agents/skills/tc-secrets/` for Codex and OpenCode, `~/.claude/skills/tc-secrets/` for Claude Code. The agent never changes or unsets these variables. If several agents share one `$HOME`, give each its own `TC_SECRETS_STATE`. They may share a profile only if they should read the same secrets.

The owner keeps the secrets in Secret Manager (secrets.tinycloud.xyz). The agent never asks for a value in chat.

## Walkthrough

1. **Check the CLI** (§1). Feature probes plus `TC_OWNER_DID`. `STALE` → stop and tell the owner; never install anything.
2. **Check access** (§2). Read each needed name into `/dev/null`:
   - `READABLE` → use it.
   - `AUTH_REQUIRED`, `PERMISSION_DENIED`, `PROFILE_NOT_FOUND`, or `TIMEOUT` (older CLIs hang on a missing grant) → consent.
   - `NOT_FOUND` → the owner adds the secret in Secret Manager first.
3. **Consent** (§3), in three steps:
   1. Create the key-only profile if it's missing.
   2. Write a manifest that asks for read and decrypt on exactly the listed names. Run `auth login --paste` once with stdin from `/dev/null` to get the OpenKey link, then decode the link and check it asks for exactly those names, a raw decrypt grant on the owner's network, and the capability read. Only then send the approval message.
   3. When the owner sends back the code, write it to a 0600 file and run the same login with the code on stdin.

   No background waiter is needed: the second run accepts the code the first run's link produced.
4. **Use** (§4). Capture the value with `secrets get NAME --raw` inside the one command that needs it, and pass it through the environment or stdin. Read it again in each command instead of caching it on disk.

## Why not the phone code?

OpenKey's device flow (the code you approve on your phone, used by `tc-publish`) deliberately rejects the `secrets` space and decryption. Anyone can start a device request and send its code to someone else, and a secret is the worst thing to phish. Secret access therefore goes through the OpenKey approval page. That page signs a delegation for this profile's key only, and returns it as a code the owner hands back to the agent.

## What the owner sees

At `openkey.so/delegate`, the owner signs in with their passkey and picks their key. The page then shows:

- the node (`https://tee.node.tinycloud.xyz`);
- "Returned to: This page, as a code to paste";
- the expiry;
- each capability: "Read secret values" and "Decrypt protected data" (both marked Sensitive), plus the required "Check your TinyCloud permissions".

After **Approve**, the page shows the code with "Only paste this code into a terminal you started yourself." The code is 7–10 KB of base64. Sending it back through chat is safe in the sense that it only works with this machine's profile key. It still belongs in a private channel, and harness private inputs (for example Paseo's Secret Bridge) keep it out of the transcript entirely.

## Never let a value leak

- `secrets get` without `--raw` prints JSON containing the value. Always capture with `--raw`.
- Command-line arguments are visible to other local users through the process list, so pass values through the environment or stdin. For HTTP headers, use `curl -H @-`.
- Nothing goes into notes, memory, commits, logs, or summaries. A missing secret is the owner's to add in Secret Manager.
