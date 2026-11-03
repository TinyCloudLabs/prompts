# Publish a document to TinyCloud — quickstart

Background and walkthrough for the `tc-publish` skill. The runnable blocks live in `SKILL.md`; run them from there, in order, one block per tool call.

Works in Codex, Claude Code, OpenCode, or OMP. Requires Node **20 or later** and `@tinycloud/cli` `1.6.0`: new installs and older agent-owned installs get it from https://agents.tinycloud.xyz/cli. An older CLI the operator selected is kept; the sign-in needs a CLI that prints short OpenKey links (verified on `1.6.0`), and the skill stops on any other link. Beta.17 can't publish file names with spaces (TC-577), so the skill also reads the version.

## 0. Operator setup (once, not run by the agent)

```sh
# Reuse the selected CLI from https://agents.tinycloud.xyz/cli (new installs pin 1.6.0).
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

1. **Check the CLI** (`SKILL.md` §1). Feature probes, not version strings: `auth login` must offer `--no-popup` and `--expiry`. `CLI_OK` → continue; `STALE` → stop and tell the owner. Never install anything.
2. **Check the profile and session** (§2, first block). `SESSION: present` means consent already exists — go straight to publishing. Return to consent only when a publish fails with `AUTH_REQUIRED`, and only once: `STORAGE_QUOTA_EXCEEDED` and `UPLOAD_FAILED` are never consent problems. `init` runs only when the profile doesn't exist (`PROFILE_NOT_FOUND`); any other failure stops the flow. Never `profile delete`.
3. **Sign-in** (§2). The first time, you approve one short OpenKey link; there's no code to send back, and the approval lasts up to 30 days. The agent writes the permission list and a small sign-in script into `$STATE`, then starts `auth login --method openkey --no-popup --manifest "$STATE/share-publishing.json" --expiry 30d` through that script so it outlives the tool call and the turn: as the harness's background process if there is one, otherwise detached with `setsid nohup … < /dev/null &`. In a **separate** command it takes the link only from that sign-in's own output and checks it is exactly `https://openkey.so/a/<id>#v=4&k=…&c=…`; only then does it send it, with the shared ask line. A wait block then runs a minute at a time, in the same turn, until the sign-in reports `SIGNED_IN`, `LINK_EXPIRED`, `NOT_APPROVED <code>` or `LOGIN_FAILED <code>`. Rerunning the sign-in after it stopped resumes the same link.
4. **Ask, then publish** (§3). Before every publish the agent asks: "Anyone with the link can open it. Make a link?" It publishes only after a yes; on a no, nothing is published and the file stays on the computer. The block publishes with `--to anyone` and `--json`, records the share id, and saves the link to `$STATE/last-url` with `share show <id> --reveal-link`, so the link never prints. A failed publish prints `PUBLISH_FAILED: <code>` and leaves no link file. Run EXACTLY the block; do not write your own `share publish` command.
5. **Verify** (§4). Receive the link and compare SHA-256 with the source → `VERIFIED` or `MISMATCH (reason)`.
6. **Deliver, report, clean up** (§6). Hand the link to the owner in the reply with the expiry, and nowhere else; report with the template (the link can be revoked any time before it expires), then delete the state files.

## What the owner sees

The short link opens OpenKey's approval page (`openkey.so/a/<id>`), which loads the request sealed behind the link: a capability-list read (required), KV get/put on `xyz.tinycloud.share/shares/`, and KV get/metadata/put/list on `shares/` and `artifacts/`, plus the lifetime and the node. The agent's message says to approve only if you asked the agent for this just now.

The owner signs in with a passkey, picks their key, leaves every item ticked, and presses **Approve**. The CLI fetches the approval, checks it, and saves the scoped session. The approval is all or nothing: unticking an item saves nothing (`OPENKEY_APPROVAL_NARROWER`), and the agent stops and says so.

## Keeping the sign-in alive

In the second forward-test round, a plain `( … ) &` waiter was killed when the command finished (Codex) and between turns (SWE-2 on OMP). A supervised process (OMP) or a `setsid nohup` detached process survived in both harnesses, so the sign-in runs that way. If it dies anyway, nothing is lost: the CLI saved the link before printing it, and starting it again resumes the same link and collects an approval already given. `setsid` isn't available on macOS; use the harness's background process there.

## Links are long — never retype them

A link is about 2.6 KB. An agent that prints a link in pieces and reassembles it by hand corrupts it (a forward test broke a longer one at character 12,602). So:

- If the owner's channel is a command — an HTTP send endpoint, a messaging CLI — pipe the message, built from `$STATE/last-url`, straight into it (`SKILL.md` §6). The link never enters the agent's output.
- If the only channel is the reply, read `$STATE/last-url` once, in one tool call, and copy it verbatim. The harness's own record of that tool output is allowed; anything else is not.

## Links, lifetime and lifecycle

- Everything after `#` is a credential (`#tc1=…`). The full URL lives only in the CLI output, the 0600 state file, the one delivery read, and the one owner message.
- Always pass `--expires`: 24h unless the owner says otherwise. `SESSION_LIFETIME_EXCEEDED` with "exceeds session expiry": the share would outlive the login → use a shorter `--expires`, never a longer one; under 1 h of session left → the owner starts ONE new login. With "must be at least 60 seconds from now" → use the smallest allowed value, never beyond the session end minus 1 h.
- `share list --json` is sender history with fields `shareId`, `target`, `expiresAt` and `revoked`; there is no `id` field. Link ids are CIDs (`bafkr4…`). Filter out revoked and expired records before calling anything active.
- Sharing with an email address, a domain or a DID isn't available yet.
- Sign-in: the first time, you approve one short OpenKey link; there's no code to send back. It covers links, for up to 30 days.
- File names with spaces, `..` or symbols are stored under a readable safe name that keeps the extension (`Q3 plan (draft).md` → `Q3-plan-draft.md`); the link shows the stored name. CLI `1.0.0-beta.17` can't publish such names (TC-577): spaces give a misleading `PERMISSION_DENIED`, other unusual names may give `INVALID_ARGUMENT`. The agent tells the owner to upgrade instead of re-running consent or renaming the file.
- Links can be revoked: `share revoke <shareId>` stops the link opening (`SHARE_REVOKED`); `share show <id>` then reports `"revoked": true`. Copies already downloaded can't be recalled.

## Rendering

- **Markdown** renders (headings, lists, bold, tables). Mermaid diagrams render with their labels, in a sandbox, on a white card that stays readable in dark mode. A diagram that can't render shows its source. Very long documents can be cut off when printed from the viewer; "Download original" gives the full file.
- **HTML** renders in a sandboxed, opaque-origin frame: scripts run but can't reach the viewer, cookies, storage or the link fragment; external resources are blocked. So the page must be self-contained — the `SKILL.md` HTML check flags every `src`, `href` or CSS `url()` that isn't a `data:` URI or `#` fragment, including protocol-relative (`//cdn…`) and relative (`app.js`) references, `@import`, and network calls in scripts.
- **Links** show "Sender unverified" and "Read-only" — the link proves the content, not who sent it.

## Errors

Errors are `{"error":{"code","message","hint"?}}` on stderr; Commander option errors are plain text. Branch on `code`, not the exit status — exits 4, 5 and 6 each cover several errors (for example exit 4 is `EXPIRED`, `NOT_FOUND` or `UNAVAILABLE`; exit 6 is `OPENKEY_UNREACHABLE` or `REGISTRY_REJECTED`). `UNAVAILABLE` means nothing was shared: with "not available in this release" that kind of share isn't available yet; otherwise the registry or network was unreachable, so report it and try again later, never in a loop. `REGISTRY_REJECTED` won't improve on retry — report it. The full table, with actions, is in `SKILL.md`.

## Never

- Never put a full share URL, fragment, approval link or session material anywhere but the CLI's output, a 0600 file in `$STATE`, the one delivery read, and the one owner message — not notes, memory, summaries, files, commits, group chats or other tools.
- Never retype, reassemble, or chunk a link.
- Never report a publish without verification.
- Never publish without asking "Anyone with the link can open it. Make a link?" and getting a yes, and never pass `email:`, `domain:` or `did:`.
- Never run `profile delete`, add `--replace-session` unprompted, run two sign-ins at once, or change `TC_BIN`/`TC_HOME`/`TC_PUBLISH_STATE`.
- Never publish HTML that fails the self-contained check unless the owner, told what will break, explicitly says to publish anyway.
