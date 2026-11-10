# Publish a document to TinyCloud — quickstart

Background and walkthrough for the `tc-publish` skill. The runnable blocks live in `SKILL.md`; run them from there, in order, one block per tool call.

Works in Codex, Claude Code, OpenCode, or OMP. Requires Node **20 or later** and `@tinycloud/cli` `1.6.4`: new installs and older agent-owned installs get it from https://agents.tinycloud.xyz/cli. An older CLI the operator selected is kept, and the skill's feature probe is authoritative: an older CLI that fails it prints `STALE`.

## 0. Operator setup (once, not run by the agent)

```sh
# Reuse the selected CLI from https://agents.tinycloud.xyz/cli (new installs pin 1.6.4).
export TC_BIN='<selected absolute executable path>'
export TC_HOME=<profile store for this agent>
export TC_PUBLISH_STATE=<state dir for this agent>       # optional; default $HOME/.local/state/tc-publish
```

Install this `tc-publish` directory into the agent's skill path (`~/.agents/skills/tc-publish/` for Codex and OpenCode, `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-publish/` for Claude Code). The `tinycloud-cli` core skill is separate. Preserve operator-set `TC_BIN`, `TC_HOME`, `TC_OWNER_EMAIL` and `TC_PUBLISH_STATE`; the agent never changes or unsets them. Set `TC_PUBLISH_STATE` (and `TC_HOME`) per agent when several agents share one machine and `$HOME`, so their state files and sign-ins can't collide. `command -v tc` is not reliable — it can resolve to `/usr/sbin/tc`.

## Why every block starts with a preamble

Codex runs every command in a fresh shell, and other harnesses may too, so variables and the umask don't survive between calls. Every agent block in `SKILL.md` starts with:

```sh
umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # unless the owner names another profile
```

That rebuilds the state paths, keeps the state directory at 0700, repairs any reused state file to 0600, and names the profile. Blocks that need a file or expiry set `FILE=` and `EXPIRES=` themselves; lifecycle blocks set `id=` to the share id the agent recorded. Nothing is carried over from an earlier shell.

## Walkthrough

1. **Check the CLI** (`SKILL.md` §1). Feature probes, not version strings: `onboard` must exist and `auth login` must offer `--expiry`. `CLI_OK` → continue; `STALE` → stop and tell the owner. Never install anything.
2. **Check the profile and session** (§2, first block). `SESSION: present` means consent already exists — go straight to publishing. Return to consent only when a publish fails with `AUTH_REQUIRED`, and only once: `STORAGE_QUOTA_EXCEEDED` and `UPLOAD_FAILED` are never consent problems. `init` runs only when the profile doesn't exist (`PROFILE_NOT_FOUND`); any other failure stops the flow. Never `profile delete`.
3. **Sign-in** (§2). The first time, you approve one OpenKey link; nothing to send back. It lasts up to 30 days. The agent writes the permission list to `$STATE/share-publishing.json` and starts `auth login --method openkey --manifest … --expiry 30d` detached in the background (its process id and exit code go to `$STATE/login.pid` and `$STATE/login.rc`), because it keeps running until you approve and a foreground tool call would be stopped by the client's time limit (2 minutes in Claude Code). The check block reads the link from `$STATE/login.err` (only an `https://openkey.so/a/…#…` link is accepted) and says whether the process is still running; the agent sends the link with one line, and when you say you're done reads `$STATE/login.out` for `"authenticated": true`.
4. **Ask, then publish** (§3). Before every publish the agent asks: "Anyone with the link can open it. Make a link?" It publishes only after a yes; on a no, nothing is published and the file stays on the computer. The block publishes with `--to anyone` and `--json`, records the share id, and saves the link to `$STATE/last-url` with `share show <id> --reveal-link`, so the link never prints. A failed publish prints `PUBLISH_FAILED: <code>` and leaves no link file. Run EXACTLY the block; do not write your own `share publish` command.
5. **Verify** (§4). Receive the link and compare SHA-256 with the source → `VERIFIED` or `MISMATCH (reason)`.
6. **Deliver, report, clean up** (§6). Hand the link to the owner in the reply with the expiry, and nowhere else; report with the template (the link can be revoked any time before it expires), then delete the state files.

## What the owner sees

The link opens OpenKey's approval page on any device, phone included. It lists the requested capabilities — a capability-list read (required), KV get/put on `xyz.tinycloud.share/shares/`, and KV get/metadata/put/list on `shares/` and `artifacts/` — and the lifetime. The owner signs in with a passkey and presses **Approve**; no code is shown or needed. Unticking `xyz.tinycloud.share/shares/` breaks links.

## Keeping the sign-in running

`auth login` collects the approval itself: it checks OpenKey every 2 seconds until the owner approves. OpenKey keeps an approval for 10 minutes and a link for about 1 hour. If the command was stopped (a tool timeout, a restart), the check says `LOGIN_STOPPED`; running the sign-in block again resumes the same pending link, so the agent never sends a second link for one request. If it is stopped twice in a row, the agent tells the operator the shell can't keep a background process running. If the link expires first (`APPROVAL_REQUEST_EXPIRED`), the agent follows the shared rule for an expired request, then runs it again and sends the new link.

## Links are long — never retype them

A link is about 2.6 KB. An agent that prints a link in pieces and reassembles it by hand corrupts it (a forward test broke a longer one at character 12,602). So:

- If the owner's channel is a command — an HTTP send endpoint, a messaging CLI — pipe the message, built from `$STATE/last-url`, straight into it (`SKILL.md` §6). The link never enters the agent's output.
- If the only channel is the reply, read `$STATE/last-url` once, in one tool call, and copy it verbatim. The harness's own record of that tool output is allowed; anything else is not.

## Links, lifetime and lifecycle

- Everything after `#` is a credential (`#tc1=…`). The full URL lives only in the CLI output, the 0600 state file, the one delivery read, and the one owner message.
- Always pass `--expires`: 24h unless the owner says otherwise. `SESSION_LIFETIME_EXCEEDED` with "exceeds session expiry": the share would outlive the login → use a shorter `--expires`, never a longer one; under 1 h of session left → the owner starts ONE new login. With "must be at least 60 seconds from now" → use the smallest allowed value, never beyond the session end minus 1 h.
- `share list --json` is sender history with fields `shareId`, `target`, `expiresAt` and `revoked`; there is no `id` field. Link ids are CIDs (`bafkr4…`). Filter out revoked and expired records before calling anything active.
- Sharing with an email address, a domain or a DID isn't available yet.
- Sign-in: the first time, you approve one OpenKey link; nothing to send back. It covers links, for up to 30 days.
- File names with spaces, `..` or symbols are stored under a readable safe name that keeps the extension (`Q3 plan (draft).md` → `Q3-plan-draft.md`); the link shows the stored name.
- Links can be revoked: `share revoke <shareId>` stops the link opening (`SHARE_REVOKED`); `share show <id>` then reports `"revoked": true`. Copies already downloaded can't be recalled.

## Rendering

- **Markdown** renders (headings, lists, bold, tables). Mermaid diagrams render with their labels, in a sandbox, on a white card that stays readable in dark mode. A diagram that can't render shows its source. Very long documents can be cut off when printed from the viewer; "Download original" gives the full file.
- **HTML** renders in a sandboxed, opaque-origin frame: scripts run but can't reach the viewer, cookies, storage or the link fragment; external resources are blocked. So the page must be self-contained — the `SKILL.md` HTML check flags every `src`, `href` or CSS `url()` that isn't a `data:` URI or `#` fragment, including protocol-relative (`//cdn…`) and relative (`app.js`) references, `@import`, and network calls in scripts.
- **Links** show "Sender unverified" and "Read-only" — the link proves the content, not who sent it.

## Errors

Errors are `{"error":{"code","message","hint"?}}` on stderr; Commander option errors are plain text. Branch on `code`, not the exit status — exits 4, 5 and 6 each cover several errors (for example exit 4 is `EXPIRED`, `NOT_FOUND` or `UNAVAILABLE`; exit 6 is `REGISTRY_REJECTED` or a network error). `UNAVAILABLE` means nothing was shared: with "not available in this release" that kind of share isn't available yet; otherwise the registry or network was unreachable, so report it and try again later, never in a loop. `REGISTRY_REJECTED` won't improve on retry — report it. The full table, with actions, is in `SKILL.md`.

## Never

- Never put a full share URL, fragment or session material anywhere but the CLI's output, a 0600 file in `$STATE`, the one delivery read, and the one owner message — not notes, memory, summaries, files, commits, group chats or other tools.
- Never retype, reassemble, or chunk a link.
- Never report a publish without verification.
- Never publish without asking "Anyone with the link can open it. Make a link?" and getting a yes, and never pass `email:`, `domain:` or `did:`.
- Never run `profile delete`, add `--replace-session` unprompted, run two sign-ins at once, or change `TC_BIN`/`TC_HOME`/`TC_PUBLISH_STATE`.
- Never publish HTML that fails the self-contained check unless the owner, told what will break, explicitly says to publish anyway.
