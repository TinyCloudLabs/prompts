# Read secrets from TinyCloud — quickstart

Background and walkthrough for the `tc-secrets` skill. The runnable blocks live in `SKILL.md`; run them from there, in order, one block per tool call.

Works in Codex, Claude Code, OpenCode, or OMP. Requires Node **20 or later** and `@tinycloud/cli@1.0.0-beta.23` or later; pin an exact version. Older CLIs can't request a usable decrypt grant: their links fail §3b's check, or decryption is refused (`SECRET_DECRYPT_FAILED`).

## 0. Operator setup (once, not run by the agent)

```sh
npm install --prefix <dir> @tinycloud/cli@1.0.0-beta.23
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
2. **Check access** (§2). First confirm the profile belongs to `TC_OWNER_DID`; a profile signed in to another account stops with `OWNER_MISMATCH`, and the agent never switches or resets it. Then read each needed name into `/dev/null`:
   - `READABLE` → use it.
   - `AUTH_REQUIRED`, `PERMISSION_DENIED`, `PROFILE_NOT_FOUND`, or `TIMEOUT` (older CLIs hang on a missing grant) → consent.
   - `NOT_FOUND` → §2 also prints `ADD_LINK`: Secret Manager with the missing names filled in, for example `https://secrets.tinycloud.xyz/app?secret=ELEVENLABS_API_KEY` (several names: `?secrets=A,B`). The agent sends that link; the owner enters the value there, and the agent checks again.
3. **Consent** (§3), in three steps:
   1. Create the key-only profile if it's missing.
   2. **Build and check the link.**
      - Write a manifest naming exactly the listed secrets.
      - Run `auth login --paste` once with stdin from `/dev/null`. The CLI prints the OpenKey link and stops with `PASTE_CODE_MISSING`.
      - The checker takes the line that holds only the URL. It accepts the link only if it requests exactly: `kv/get` on each named secret in the owner's `secrets` space, decrypt on the owner's default network, and the capability read.
      - It also requires this profile's key and node, no callback, and at most 30 days.
      - Only then send the approval message.
   3. When the owner sends back the code, write it to a fresh 0600 file and run the same login with the code on stdin. The result is parsed from the CLI's JSON (`SIGNED_IN`, `LOGIN_FAILED <code>` or `LOGIN_TIMEOUT`), and the code is deleted.

   No background waiter is needed: the second run accepts the code the first run's link produced.
4. **Use** (§4).
   - Capture the value with `secrets get NAME --raw` inside the one command that needs it, with stdin closed and stderr sent to a private file, so the CLI never stops to wait for a browser approval. Pass the value through the environment or stdin.
   - Read it again in each command instead of caching it on disk.
   - Shell capture drops trailing newlines, so for a multi-line value, pipe `--raw` into the consumer instead.

## Why not the phone code?

OpenKey's device flow (the code you approve on your phone, used by `tc-publish`) deliberately rejects the `secrets` space and decryption. Anyone can start a device request and send its code to someone else, and a secret is the worst thing to phish. Secret access therefore goes through the OpenKey approval page. That page signs a delegation for this profile's key only, and returns it as a code the owner hands back to the agent.

## What the owner sees

At `openkey.so/delegate`, the owner signs in with their passkey and picks their key. The page then shows:

- the node (`https://tee.node.tinycloud.xyz`);
- "Returned to: This page, as a code to paste";
- the expiry;
- each capability: "Read secret values" and "Decrypt protected data" (both marked Sensitive), plus the required "Check your TinyCloud permissions".

Reads are limited to the named secrets. The decrypt permission covers the owner's default encryption network, which is not limited to those names. So the approval message says so: the profile can only fetch the named secrets, but it could decrypt anything encrypted to that network that it gets from elsewhere.

After **Approve**, the page shows the code with "Only paste this code into a terminal you started yourself." The code is 7–10 KB of base64. Sending it back through chat is safe in the sense that it only works with this machine's profile key. It still belongs in a private channel, and harness private inputs (for example Paseo's Secret Bridge) keep it out of the transcript entirely.

## Never let a value leak

- `secrets get` without `--raw` prints JSON containing the value. Always capture with `--raw`.
- Command-line arguments are visible to other local users through the process list, so pass values through the environment or stdin. For HTTP headers, use `curl -H @-`.
- Nothing goes into notes, memory, commits, logs, or summaries. A missing secret is the owner's to add in Secret Manager, through the link the agent sends.
- Every block starts by turning off inherited shell tracing (`{ set +x; } 2>/dev/null`) and exit-on-error, sets `umask 077`, and repairs the modes of reused state files.
