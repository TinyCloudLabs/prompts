# Publish a document to TinyCloud — quickstart

Background and walkthrough for the `tc-publish` skill. The runnable blocks live in `SKILL.md`; run them from there, in order, one block per tool call.

Works in any agent that can install and run the TinyCloud CLI (for example Claude Code, Codex, OpenCode or OMP). Requires Node.js 22.20 or later and `@tinycloud/cli` ≥ `1.5.0-beta.22` (`tinycloud onboard`, and owner-only links through `auth request`). Install the exact pin below, never `@latest`. The skill's feature probe checks for `onboard` and `auth request --paste`; it can't tell beta.20 or beta.21 from beta.22, so the skill also reads the version.

## 0. Operator setup (once, not run by the agent)

```sh
npm install --prefix <dir> @tinycloud/cli@1.5.0-beta.23
export TC_BIN=<dir>/node_modules/.bin/tinycloud
export TC_HOME=<profile store for this agent>
export TC_OWNER_EMAIL=<owner's email>                    # for owner-only links
export TC_PUBLISH_STATE=<state dir for this agent>       # optional; default $HOME/.local/state/tc-publish
```

Install this `tc-publish` directory into the agent's skills folder (for example `~/.agents/skills/tc-publish/` for Codex and OpenCode, or `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-publish/` for Claude Code). The `tc-cli` core skill is a separate install. `TC_BIN`, `TC_HOME`, `TC_OWNER_EMAIL` and `TC_PUBLISH_STATE` are operator-set; the agent never changes or unsets them. Set `TC_PUBLISH_STATE` (and `TC_HOME`) per agent when several agents share one machine and `$HOME` — for example the owner's agent alongside test agents — so their state files can't collide. `command -v tc` is not reliable — it can resolve to `/usr/sbin/tc`.

The agent publishes from the profile [TinyCloud onboarding](https://agents.tinycloud.xyz/onboarding) set up: the CLI's default profile, or `TC_PROFILE` if that is set.

## Why every block starts with a preamble

Codex runs every command in a fresh shell, and other harnesses may too, so variables and the umask don't survive between calls. Every agent block in `SKILL.md` starts with:

```sh
umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
```

That rebuilds the state paths, keeps the state directory at 0700 and repairs any reused state file to 0600. Blocks that need a file or expiry set `FILE=` and `EXPIRES=` themselves; lifecycle blocks set `id=` to the share id the agent recorded. Nothing is carried over from an earlier shell.

## Walkthrough

1. **Check the CLI** (`SKILL.md` §1). Feature probes, not version strings: the CLI must offer `onboard`, and `auth request` must offer `--paste`. `CLI_OK` → continue; `STALE` → stop and tell the owner. Never install anything.
2. **Check the onboarding profile** (§2, first block). `SESSION: present` means onboarding is done. If the profile isn't onboarded or its session has ended, the agent follows https://agents.tinycloud.xyz/onboarding first, then comes back. `STORAGE_QUOTA_EXCEEDED` and `UPLOAD_FAILED` are never permission problems. The agent never creates or deletes a profile.
3. **Ask for publishing** (§2). The first time you want an owner-only or email link, the agent sends you one OpenKey link. Approve it and send back the code OpenKey shows; it lasts up to 30 days. If you already approved it, the agent asks for nothing.
4. **Publish** (§3). Exactly one of the two blocks: owner-only by default, public only when the owner explicitly asked. The block publishes with `--json`, records the share id, and saves the link to `$STATE/last-url` with `share show <id> --reveal-link`, so the link never prints. A failed publish prints `PUBLISH_FAILED: <code>` and leaves no link file. Run EXACTLY the block; do not write your own `share publish` command.
5. **Verify** (§4). Public: receive the link and compare SHA-256 with the source → `VERIFIED` or `MISMATCH (reason)`. Owner-only: the agent can't receive it (`CLAIM_REQUIRED` is expected), so it checks `share inspect` against the publish record and the sender record: email target, same share id, same stored path, display name equal to the file name, identical expiry, `policy` link, recipient = `$TC_SHARE_TO` lowercased (the CLI canonicalizes the whole address to lower case).
6. **Deliver, report, clean up** (§6). Hand the link to the owner in the reply with the recipient and expiry, and nowhere else; report with the template for the link type (either link type can be revoked any time before it expires), then delete the state files.

## What the owner sees

OpenKey shows what the agent asks for in plain words; approve it and send the agent the code it shows.

## Links are long — never retype them

A public link is about 2.6 KB and an owner-only link about 16.7 KB. An agent that prints a link in pieces and reassembles it by hand corrupts it (a forward test broke one at character 12,602). So:

- If the owner's channel is a command — an HTTP send endpoint, a messaging CLI — pipe the message, built from `$STATE/last-url`, straight into it (`SKILL.md` §6). The link never enters the agent's output.
- If the only channel is the reply, read `$STATE/last-url` once, in one tool call, and copy it verbatim. The harness's own record of that tool output is allowed; anything else is not.

## Links, lifetime and lifecycle

- Everything after `#` is a credential — `#tc1=…` (public) or `#v=2&p=…` (owner-only). The full URL lives only in the CLI output, the 0600 state file, the one delivery read, and the one owner message.
- Always pass `--expires`: owner-only = the session's remaining lifetime minus 1 h (computed by the §3 block; `6d` only if the session's expiry can't be read); public 24h; unless the owner says otherwise. `SESSION_LIFETIME_EXCEEDED` with "exceeds session expiry": the share would outlive the session → use a shorter `--expires`, never a longer one; under 1 h of session left → the agent renews it through onboarding. With "must be at least 60 seconds from now" → use the smallest allowed value, never beyond the session end minus 1 h.
- `share list --json` is sender history with fields `shareId`, `target` (`bearer` or `email`), `expiresAt` and `revoked`; there is no `id` field. Public ids are CIDs (`bafkr4…`), owner-only ids are 32 hex characters. Filter out revoked and expired records before calling anything active.
- Owner-only links revoke with `share revoke <id>`; `share show <id>` then reports `"revoked": true`.
- Invalid recipients are refused before anything is published: `INVALID_ARGUMENT` "recipient email is invalid" or "recipient email domain is invalid". Ask the owner for the correct address.
- Permission: the first time, you approve one OpenKey link and send the code back to your agent. It covers owner-only links, email links (TinyCloud emails the invitation) and public links, for up to 30 days.
- File names with spaces, `..` or symbols are stored under a readable safe name that keeps the extension (`Q3 plan (draft).md` → `Q3-plan-draft.md`). Public links show the stored name, owner-only links the original.
- Public links can be revoked: `share revoke <bearer shareId>` stops the link opening (`SHARE_REVOKED`). Copies already downloaded can't be recalled.

## Rendering

- **Markdown** renders (headings, lists, bold, tables). Mermaid diagrams render with their labels, in a sandbox, on a white card that stays readable in dark mode. A diagram that can't render shows its source. Very long documents can be cut off when printed from the viewer; "Download original" gives the full file.
- **Public HTML** renders in a sandboxed, opaque-origin frame: scripts run but can't reach the viewer, cookies, storage or the link fragment; external resources are blocked. So the page must be self-contained — the `SKILL.md` HTML check flags every `src`, `href` or CSS `url()` that isn't a `data:` URI or `#` fragment, including protocol-relative (`//cdn…`) and relative (`app.js`) references, `@import`, and network calls in scripts.
- **Owner-only HTML** downloads rather than renders.
- **Owner-only links** ask the recipient for their mailbox, email an 8-digit code, and then show the file with "Verified sender". No TinyCloud account needed.
- **Public links** show "Sender unverified" and "Read-only" — the link proves the content, not who sent it.

## Errors

Errors are `{"error":{"code","message","hint"?}}` on stderr; Commander option errors are plain text. Branch on `code`, not the exit status — exits 4, 5 and 6 each cover several errors (for example exit 4 is `EXPIRED`, `NOT_FOUND` or `UNAVAILABLE`; exit 6 is `CLAIM_REQUIRED`, `OPENKEY_UNREACHABLE` or `REGISTRY_REJECTED`). `UNAVAILABLE` means nothing was shared — retry shortly; `REGISTRY_REJECTED` won't improve on retry — report it. The full table, with actions, is in `SKILL.md`.

## Never

- Never put a full share URL, fragment or session material anywhere but the CLI's output, a 0600 file in `$STATE`, the one delivery read, and the one owner message — not notes, memory, summaries, files, commits, group chats or other tools.
- Never retype, reassemble, or chunk a link.
- Never report a publish without verification.
- Never publish publicly unless the owner explicitly asked, and never substitute a public link for a private one.
- Never run `profile delete` or `init`, sign in on another profile, make an open link for a named recipient or an "only you" link before the owner replies "Yes, make an open link", or change `TC_BIN`/`TC_HOME`/`TC_PUBLISH_STATE`.
- Never publish HTML that fails the self-contained check unless the owner, told what will break, explicitly says to publish anyway.
