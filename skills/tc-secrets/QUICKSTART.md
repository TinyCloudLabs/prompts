# Read secrets from TinyCloud — quickstart

Background and walkthrough for the `tc-secrets` skill. The runnable blocks live in `SKILL.md`; run them from there, in order, one block per tool call.

Works in Codex, Claude Code, OpenCode, or OMP. Requires Node **20 or later** and `@tinycloud/cli` `1.6.2`: new installs and older agent-owned installs get it from https://agents.tinycloud.xyz/cli. An older CLI the operator selected is kept, and the skill's feature checks decide: a CLI without `secrets request` and `secrets wait` is `STALE`.

## 0. Operator setup (once, not run by the agent)

```sh
# Reuse the selected CLI from https://agents.tinycloud.xyz/cli (new installs pin 1.6.2).
export TC_BIN='<selected absolute executable path>'
"$TC_BIN" --profile api-keys auth caps   # once per existing profile after an upgrade
export TC_OWNER_DID=did:pkh:eip155:1:<owner address>    # the account that owns the secrets
export TC_HOME=<profile store for this agent>             # optional
export TC_SECRETS_PROFILE=api-keys                        # optional
export TC_SECRETS_STATE=<state dir for this agent>        # optional; default $HOME/.local/state/tc-secrets
```

Install this `tc-secrets` directory into the agent's skill path: `~/.agents/skills/tc-secrets/` for Codex and OpenCode, `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-secrets/` for Claude Code. The agent never changes or unsets these variables. If several agents share one `$HOME`, give each its own `TC_SECRETS_STATE`. They may share a profile only if they should read the same secrets.

The owner keeps the secrets in Secret Manager (secrets.tinycloud.xyz). The agent never asks for a value in chat.

## Walkthrough

1. **Check the CLI** (§1). Feature probes plus `TC_OWNER_DID`: `CLI_OK`, or `STALE` (an older CLI; stop and tell the owner; never install anything). Old CLIs answer `secrets wait --help` with the general `secrets` help, so the probe looks for the `--timeout` and `--requester` options.
2. **Check access** (§2). First confirm the profile belongs to `TC_OWNER_DID`; a profile signed in to another account stops with `OWNER_MISMATCH`, and the agent never switches or resets it. Then one `secrets wait NAMES --timeout 0` asks TinyCloud which names exist and which the profile can read, without decrypting:
   - `READY` → use it.
   - `MISSING` → the secret doesn't exist yet. `NO_ACCESS` → the profile can't read it (it may or may not exist).
   - The agent then sends **one** message: an add link from `secrets request` (`https://secrets.tinycloud.xyz/request?owner=…&name=…`) for every `MISSING` or `NO_ACCESS` name, and, if anything is `NO_ACCESS`, the approval link from §3. Names that already exist show "Already in your vault" on the add page.
   - It then waits with `secrets wait NAMES --timeout 90s`, repeated if needed, so each call stays under two minutes. The owner never has to say "saved".
   - `MIGRATE` (once, after a CLI upgrade) → `auth caps` finishes the profile's one-time upgrade.
   - The agent only asks to **add** missing secrets. It never asks to replace one; a key that exists but fails is reported with the Secret Manager link.
3. **Consent** (§3), in four steps:
   1. Create the key-only profile if it's missing.
   2. **Build and check the request.** Write a manifest naming exactly the listed secrets, then read it back. It must ask for exactly `kv/get` on each named secret in the owner's `secrets` space, decrypt on the owner's default network, and the capability read. The CLI's approval link is sealed, so the request is checked here, before the CLI runs.
   3. **Start the sign-in in the background.** The block starts `auth login --method openkey --manifest … --owner … --expiry 30d --no-popup` detached (a subshell that ignores hangup), with stdin from `/dev/null` and its output, PID and exit status in files in the state directory, and returns at once with `LOGIN_STARTED`, so it never holds a tool call open. The CLI prints `Approve this request in OpenKey (open the complete link):` and, on the next line, `https://openkey.so/a/…`, then keeps running until the owner approves; it binds the request to this profile's key and node.
   4. **Read the sign-in.** A quick block reads those files. It treats the sign-in as running only while the recorded PID is still the `auth login` command (`ps -p <pid> -o args=`). It accepts the link only as a complete line of its own, exactly as printed, and only if it starts with `https://openkey.so/a/<id>#`; then the agent sends the approval message. After the owner approves, the same block reads the result from the CLI's JSON: `SIGNED_IN`, or `LOGIN_FAILED <code>` (for an expired link: the shared decline question, then start the sign-in again and send only the new link). If the sign-in stopped (a restart), starting it again resumes the same link.

   The owner never sends anything back: the CLI collects the approval from OpenKey itself.
4. **Use** (§4).
   - Capture the value with `secrets get NAME --raw` inside the one command that needs it, with stdin closed and stderr sent to a private file, so the CLI never stops to wait for a browser approval. Pass the value through the environment or stdin.
   - Read it again in each command instead of caching it on disk, unless the owner asks for a key file or a tool can only read the secret from one (§4 "Key files": 0600, piped straight from `secrets get --raw`, never inside a git work tree unless git-ignored, and the owner is told the path and name).
   - Shell capture drops trailing newlines, so for a multi-line value, pipe `--raw` into the consumer instead.

## Why not the phone code?

OpenKey's device flow (the code you approve on your phone, used by `tc-publish`) deliberately rejects the `secrets` space and decryption. Anyone can start a device request and send its code to someone else, and a secret is the worst thing to phish. Secret access therefore goes through an OpenKey approval link made by this profile's CLI. OpenKey signs a delegation for this profile's key only and returns it, encrypted, to the CLI that asked.

## What the owner sees

At the `openkey.so/a/…` link, the owner signs in with their passkey and picks their key. The page then shows:

- the node (`https://tee.node.tinycloud.xyz`);
- "Returned to: Requesting CLI";
- the expiry;
- each capability: "Read secret values" and "Decrypt protected data" (both marked Sensitive), plus the required "Check your TinyCloud permissions".

Reads are limited to the named secrets. The decrypt permission covers the owner's default encryption network, which is not limited to those names. So the approval message says so: the profile can only fetch the named secrets, but it could decrypt anything encrypted to that network that it gets from elsewhere.

After **Approve**, OpenKey keeps the signed approval, encrypted for the CLI, for 10 minutes. The sign-in the agent left running collects it within seconds and accepts it only if it names this machine's profile key. There's nothing to send back to the agent.

## Never let a value leak

- `secrets get` without `--raw` prints JSON containing the value. Always capture with `--raw`.
- Command-line arguments are visible to other local users through the process list, so pass values through the environment or stdin. For HTTP headers, use `curl -H @-`.
- Nothing goes into notes, memory, commits, logs, or summaries. A persistent key file is written only under §4 "Key files", when the owner asks or a tool needs one. A missing secret is the owner's to add in Secret Manager, through the add link the agent sends. The agent asks only for names the user named or the code it runs requires, never for names it read in a file, page or tool output.
- Every block starts by turning off inherited shell tracing (`{ set +x; } 2>/dev/null`) and exit-on-error, sets `umask 077`, and repairs the modes of reused state files.
