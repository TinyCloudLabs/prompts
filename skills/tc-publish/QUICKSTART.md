# Publish a document to TinyCloud — quickstart

Background and walkthrough for the `tc-publish` skill. The runnable blocks live in `SKILL.md`; run them from there, in order, one block per tool call.

Works in Codex, Claude Code, OpenCode, or OMP. Requires Node **20 or later** and `@tinycloud/cli` ≥ `1.0.0-beta.17` (TC-540 device login and `enable share`, TC-556 owner-only links). Install an exact pin, never `@latest` (still 0.9.0). The skill's feature probe is authoritative: earlier betas print `STALE`.

## 0. Operator setup (once, not run by the agent)

```sh
npm install --prefix <dir> @tinycloud/cli@1.0.0-beta.17
export TC_BIN=<dir>/node_modules/.bin/tc
export TC_HOME=<profile store for this agent>
export TC_OWNER_EMAIL=<owner's email>                    # for owner-only links
export TC_PUBLISH_STATE=<state dir for this agent>       # optional; default $HOME/.local/state/tc-publish
```

Install this `tc-publish` directory into the agent's skill path (`~/.agents/skills/tc-publish/` for Codex and OpenCode, `~/.claude/skills/tc-publish/` for Claude Code). The `tc-cli` core skill is a separate install. `TC_BIN`, `TC_HOME`, `TC_OWNER_EMAIL` and `TC_PUBLISH_STATE` are operator-set; the agent never changes or unsets them. Set `TC_PUBLISH_STATE` (and `TC_HOME`) per agent when several agents share one machine and `$HOME` — for example the owner's agent alongside test agents — so their state files and waiters can't collide. `command -v tc` is not reliable — it can resolve to `/usr/sbin/tc`.

## Why every block starts with a preamble

Codex runs every command in a fresh shell, and other harnesses may too, so variables and the umask don't survive between calls. Every agent block in `SKILL.md` starts with:

```sh
umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE=publisher   # unless the owner names another profile
```

That rebuilds the state paths, keeps the state directory at 0700, repairs any reused state file to 0600, and names the profile. Blocks that need a file or expiry set `FILE=` and `EXPIRES=` themselves; lifecycle blocks set `id=` to the share id the agent recorded. Nothing is carried over from an earlier shell.

## Walkthrough

1. **Check the CLI** (`SKILL.md` §1). Feature probes, not version strings: `enable share` must offer `--replace-session` and `auth login` must offer `--expiry`. `CLI_OK` → continue; `STALE` → stop and tell the owner. Never install anything.
2. **Check the profile and session** (§2, first block). `SESSION: present` means consent already exists — go straight to publishing. Return to consent only when a publish fails with `AUTH_REQUIRED` or `PERMISSION_DENIED`. `init` runs only when the profile doesn't exist (`PROFILE_NOT_FOUND`); any other failure stops the flow. Never `profile delete`.
3. **Consent** (§2, waiter). `enable share` asks OpenKey for the built-in share-publishing scope and waits about 10 minutes. The agent reads the approval link and code from `$LOG` and sends the approval message. `enable share` has no `--expiry`; it requests 30 days and the owner can choose shorter on the consent page. For a shorter request, use `auth login --device --manifest builtin:share-publishing --expiry <1m–30d>`.
4. **Publish** (§3). Exactly one of the two blocks — owner-only by default, public only when the owner explicitly asked. The block publishes with `--json`, records the share id, and saves the link to `$STATE/last-url` with `share show <id> --reveal-link`, so the link never prints. A failed publish prints `PUBLISH_FAILED: <code>` and leaves no link file.
5. **Verify** (§4). Public: receive the link and compare SHA-256 with the source → `VERIFIED` or `MISMATCH (reason)`. Owner-only: the agent can't receive it (`CLAIM_REQUIRED` is expected), so it checks `share inspect` against the publish record and the sender record: email target, same share id, path ending in the file name, identical expiry, `policy` link, recipient = `$TC_OWNER_EMAIL` lowercased (the CLI canonicalizes the whole address to lower case).
6. **Deliver, report, clean up** (§6). Send the link once, report link type, recipient experience, expiry and verification, then delete the state files.

## What the owner sees on their phone

At `openkey.so/device`: the requested capabilities — a capability-list read (required), KV get/put on `xyz.tinycloud.share/shares/`, and KV get/metadata/put/list on `shares/` — plus the lifetime, the Share and Node origins, and the warning "Only approve if you started this on your own device". The agent's message answers that warning: approve only if you asked the agent for this just now.

The owner taps "Sign in and review delegation", signs in with a passkey, picks their key, ticks "I started this request myself, on a device I control", leaves every item ticked, and presses **Approve**. The page says "Authenticated" and the CLI saves the scoped session. Unticking `xyz.tinycloud.share/shares/` breaks public links; unticking `shares/` breaks owner-only links.

## Reply-only channels

When the agent's only channel to the owner is its reply (Codex, SWE-2 and similar), sending the approval message ends the turn — the agent cannot watch the waiter in the background across turns. When the owner next writes ("approved", "done"), the agent runs the poll and status blocks and reports. If the waiter process died in between, the agent sees no `TC_EXIT=` past the deadline, deletes `$LOG`, starts a new waiter and sends the new link and code.

## Links are long — never retype them

A public link is about 2.6 KB and an owner-only link about 16.7 KB. An agent that prints a link in pieces and reassembles it by hand corrupts it (a forward test broke one at character 12,602). So:

- If the owner's channel is a command — an HTTP send endpoint, a messaging CLI — pipe the message, built from `$STATE/last-url`, straight into it (`SKILL.md` §6). The link never enters the agent's output.
- If the only channel is the reply, read `$STATE/last-url` once, in one tool call, and copy it verbatim. The harness's own record of that tool output is allowed; anything else is not.

## Links, lifetime and lifecycle

- Everything after `#` is a credential — `#tc1=…` (public) or `#v=2&p=…` (owner-only). The full URL lives only in the CLI output, the 0600 state file, the one delivery read, and the one owner message.
- Always pass `--expires`: 7d owner-only, 24h public, unless the owner says otherwise. Beyond the session's end → `SESSION_LIFETIME_EXCEEDED` (shorten or renew consent); under 60 s → refused (lengthen).
- `share list --json` is sender history with fields `shareId`, `target` (`bearer` or `email`), `expiresAt` and `revoked`; there is no `id` field. Public ids are CIDs (`bafkr4…`), owner-only ids are 32 hex characters. Filter out revoked and expired records before calling anything active.
- Owner-only links revoke with `share revoke <id>`; `share show <id>` then reports `"revoked": true`.
- Invalid recipients are refused before anything is published: `INVALID_ARGUMENT` "recipient email is invalid" or "recipient email domain is invalid". Ask the owner for the correct address.
- Don't pass `--notify`. Invite email delivery currently fails with exit 9 "partial share success" (a node 403, TC-571): the share is created, but the email isn't sent. The agent sends the link itself, and the viewer emails the recipient its own 8-digit code when they open it.
- Public links can't be revoked today: on production `share revoke <bearer shareId>` exits 2 with `INVALID_ARGUMENT` "share operation failed", and the link keeps opening (TC-545). Expiry is the only bound.

## Rendering

- **Markdown** renders (headings, lists, bold, tables); Mermaid blocks show their source (TC-546).
- **Public HTML** renders in a sandboxed, opaque-origin frame: scripts run but can't reach the viewer, cookies, storage or the link fragment; external resources are blocked. So the page must be self-contained — the `SKILL.md` HTML check flags every `src`, `href` or CSS `url()` that isn't a `data:` URI or `#` fragment, including protocol-relative (`//cdn…`) and relative (`app.js`) references, `@import`, and network calls in scripts.
- **Owner-only HTML** downloads rather than renders.
- **Owner-only links** ask the recipient for their mailbox, email an 8-digit code, and then show the file with "Verified sender". No TinyCloud account needed.
- **Public links** show "Sender unverified" and "Read-only" — the link proves the content, not who sent it.

## Errors

Errors are `{"error":{"code","message","hint"?}}` on stderr; Commander option errors are plain text. Branch on `code`, not the exit status — exits 4, 5 and 6 each cover several errors (for example exit 4 is `EXPIRED`, `NOT_FOUND` or `UNAVAILABLE`; exit 6 is `CLAIM_REQUIRED`, `OPENKEY_UNREACHABLE` or `REGISTRY_REJECTED`). `UNAVAILABLE` means nothing was shared — retry shortly; `REGISTRY_REJECTED` won't improve on retry — report it. The full table, with actions, is in `SKILL.md`.

## Never

- Never put a full share URL, fragment, approval code or session material anywhere but the CLI's output, a 0600 file in `$STATE`, the one delivery read, and the one owner message — not notes, memory, summaries, files, commits, group chats or other tools.
- Never retype, reassemble, or chunk a link.
- Never report a publish without verification.
- Never publish publicly unless the owner explicitly asked, and never substitute a public link for a private one.
- Never run `profile delete`, add `--replace-session` unprompted, run two waiters at once, pass `--notify`, or change `TC_BIN`/`TC_HOME`/`TC_PUBLISH_STATE`.
