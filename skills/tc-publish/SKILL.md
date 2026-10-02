---
name: tc-publish
description: Publish a document or HTML page to TinyCloud and return a shareable link. Use when the owner asks the agent to publish, share, or host a file — private owner-only links, public bearer links, verification, and lifecycle.
metadata:
  version: "0.3.0"
---

# Publish documents and HTML with `tc share`

Publish a file from the owner's TinyCloud space and return a link. The agent holds a scoped delegation the owner approves through OpenKey device authorization — no passwords, no copied credentials.

Requires `@tinycloud/cli` **1.0.0-beta.16 or newer** (TC-540). The binary path is operator-provided as `TC_BIN` — `command -v tc` can resolve to `/usr/sbin/tc` (Linux traffic control).

## Handling contract — applies to every step

- Everything after `#` in any share URL is a credential: `#tc1=…` on public links, `#v=2&p=…` on owner-only links.
- A full share URL may appear only in: the CLI command's own output; a 0600 file inside the 0700 state directory `$HOME/.local/state/tc-publish` (deleted after use); and one message to the owner in their 1:1 channel.
- The OpenKey approval link and code go only to the owner, 1:1.
- Never put a link or code in notes, memory, the journal, summaries, other files, commits, group chats or other tools.
- If a request comes from a group chat, send the link to the owner privately and say so in the group.

## Choosing the link type

Default to the **owner-only email link**. Create a public link only when the owner's current request explicitly asks for a public or anyone-can-open link. The agent never decides on its own that content is shareable — if unsure, ask.

Address owner-only links with `--to "email:$TC_OWNER_EMAIL"` (operator-set). If `$TC_OWNER_EMAIL` is unset, ask the owner and never guess. To share with someone else, use their address as confirmed by the owner. Never use a public link as a substitute for a private one.

## 1. Check the CLI — feature probes, not version strings

```sh
"$TC_BIN" enable share --help | grep -q -- '--replace-session' \
  && "$TC_BIN" auth login --help | grep -q -- '--expiry' \
  || { echo STALE; }
```

If `TC_BIN` is empty or the probe prints `STALE`, stop and tell the owner. Never install anything yourself.

## 2. Consent — `enable share`, once per profile

```sh
STATE="$HOME/.local/state/tc-publish"; mkdir -p "$STATE"; chmod 700 "$STATE"
LOG="$STATE/enable-share.log"
"$TC_BIN" --profile publisher context --json >/dev/null 2>&1 \
  || "$TC_BIN" init --name publisher --key-only
( "$TC_BIN" --profile publisher enable share; echo "TC_EXIT=$?" ) > "$LOG" 2>&1 &
for i in $(seq 30); do grep -qE '^(Approve on your phone:|TC_EXIT=)' "$LOG" && break; sleep 1; done
grep -E '^(Approve on your phone:|  Or open|  Waiting for approval until)' "$LOG"
```

Run `init` only when `context` fails with `PROFILE_NOT_FOUND`. Never run `profile delete`. Never run two waiters at once; the deadline is the `Waiting for approval until` line.

Send the owner the approval message (template below). Then poll in chunks of 2 minutes or less until `TC_EXIT=` appears:

```sh
for i in $(seq 12); do grep -q '^TC_EXIT=' "$LOG" && break; sleep 10; done
grep -E '^TC_EXIT=|"code"|"enabled"|"declined"|"expiresAt"' "$LOG"
```

`enable share` has no `--expiry`; it requests the maximum 30-day session and the owner can pick a shorter lifetime on the consent page. For a shorter request:

```sh
( "$TC_BIN" --profile publisher auth login --device \
    --manifest builtin:share-publishing --expiry 7d; echo "TC_EXIT=$?" ) > "$LOG" 2>&1 &
```

`--expiry` accepts 1 minute to 30 days; anything else is `INVALID_EXPIRY`.

### Waiter outcomes

| `$LOG` shows | Meaning | Action |
|---|---|---|
| `TC_EXIT=0` + `"enabled": true` + `"declined": []` | Approved (`enable share`) | Done; proceed |
| `TC_EXIT=0` + `"authenticated": true` | Approved (`auth login --device`) | Done; proceed |
| `TC_EXIT=0` + non-empty `"declined"` | Owner unchecked a capability | Done, but tell the owner which link type won't work |
| `TC_EXIT=3` + `DEVICE_AUTH_EXPIRED` | Window closed (~10 min) | Re-run — a new code is issued; send the owner the new link and code |
| `TC_EXIT=5` + `DEVICE_AUTH_DENIED` | Owner declined | Do not re-run unless the owner asks |
| `TC_EXIT=2` + `SESSION_IN_USE` | A live session would be narrowed or shortened | Ask the owner; never add `--replace-session` on your own |
| `OPENKEY_UNREACHABLE` | Can't reach OpenKey | Report; retry only when connectivity returns |
| `SCOPE_REJECTED` | Manifest rejected | Report to the owner; do not retry the same request |
| `PROFILE_STATE_INCONSISTENT` | Local profile state corrupt | Report; do not delete the profile |
| Signature/verification failure | Delegation couldn't be verified | Report; re-run once, then stop |

Delete `$LOG` once the waiter has finished.

## 3. Publish

Always pass `--expires` — 24h for public links, 7d for owner-only, unless the owner says otherwise — and always tell the owner the expiry. The CLI clamps share lifetime to the session end; an explicit `--expires` beyond the session fails `SESSION_LIFETIME_EXCEEDED` and under 60 s is refused.

```sh
umask 077
# Owner-only (the default):
"$TC_BIN" --profile publisher share publish FILE --to "email:$TC_OWNER_EMAIL" --expires 7d > "$STATE/last-url"
# Public (only when the owner explicitly asked):
"$TC_BIN" --profile publisher share publish FILE --expires 24h > "$STATE/last-url"
```

`--json` deliberately omits the URL; recover it later with `share show <id> --reveal-link`.

## 4. Verify — always, before reporting

**Public links** — receive and hash; a failed `receive` must never look like a match:

```sh
src=$(sha256sum < FILE | cut -d' ' -f1)
if cat "$STATE/last-url" | "$TC_BIN" --profile publisher share receive - --stdout > "$STATE/received" 2>/dev/null \
   && [ "$src" = "$(sha256sum < "$STATE/received" | cut -d' ' -f1)" ]; then
  echo VERIFIED
else
  echo MISMATCH
fi
```

Checking `receive`'s exit status separately matters: without it, a failed `receive` still hashes empty input and can false-match an empty source file.

**Owner-only links** — the agent cannot `receive` them (`CLAIM_REQUIRED`, exit 6, expected). Inspect:

```sh
cat "$STATE/last-url" | "$TC_BIN" --profile publisher share inspect - --json
```

Require: `metadata.target.kind` = `email`; `metadata.resource.path` ends in `/<basename of FILE>` (the real path is `shares/<share-id>/<basename>`; the input name is in `metadata.display.filename`); `metadata.expiresAt` within 2 minutes of now + `--expires`; `link.kind` = `policy`. If the sender record exposes `recipient`, check it matches.

## 5. Lifecycle

```sh
"$TC_BIN" --profile publisher share list              # sender history — includes expired and revoked; filter before reporting
"$TC_BIN" --profile publisher share show <id>         # metadata only
"$TC_BIN" --profile publisher share show <id> --reveal-link --json \
  | python3 -c 'import json,sys; open("'$STATE'/revealed","w").write(json.load(sys.stdin)["link"])'
"$TC_BIN" --profile publisher share revoke <id>       # addressed links only
```

- `share show --reveal-link` returns JSON with a `.link` field — extract it into the state file; never print it.
- **Do not revoke bearer links.** TC-545 is in progress and today's behavior is uncertain — `share revoke` may print `revoked` while the link still opens. If the owner insists, revoke, then run `share receive` on the revealed link and report the truth (still opens vs. fails).
- Addressed links revoke normally; afterwards `share show` reports `revoked: true`.

## 6. Report to the owner

Publish report — link type, what the recipient experiences, expiry, verification result, then the URL:

> Published `report.md` — owner-only link (opens after an 8-digit code is emailed to you) / public link (anyone holding it can open; can't be revoked early). Expires <date>. Verified by hash match / email-target inspect. <URL>

## Errors — `{"error":{"code","message","hint"?}}` on stderr; Commander option errors are plain text

| Code | Exit | Action |
|---|---|---|
| `AUTH_REQUIRED` | 3 | Session expired/invalid — re-run `enable share` on the same profile (ignore the CLI's own `tc auth login`/`init` hint) |
| `PERMISSION_DENIED` | 5 | Scope lacks the publishing permission — re-run `enable share` |
| `SESSION_LIFETIME_EXCEEDED` | 2 | `--expires` outlives the session or is under 60 s — shorten it |
| `INVALID_EXPIRY` | 2 | `--expiry` outside 1 m–30 d |
| `SESSION_IN_USE` | 2 | Live session would narrow — ask the owner; never `--replace-session` unprompted |
| `CLAIM_REQUIRED` | 6 | Expected on `receive` of an owner-only link — use `inspect` |
| `UNSUPPORTED_LINK` | 2 | `inspect` on a public link — verify by `receive` + hash instead |
| `ORIGIN_MISMATCH` | 2 | The share origin doesn't match the configured service — check `--viewer-origin`/host config, not re-login |
| `EXPIRED` / `NOT_FOUND` | 4 | The share expired or the id is wrong |
| `PROFILE_EXISTS` | 1 | `init` on an existing profile — use it; never `profile delete` |
| `DEVICE_AUTH_EXPIRED` | 3 | Approval window closed — re-run sends a new code |
| `DEVICE_AUTH_DENIED` | 5 | Owner declined — don't re-run unless asked |
| `OPENKEY_UNREACHABLE` | 7 | OpenKey unreachable — report, retry later |
| `SCOPE_REJECTED` | 2 | Manifest rejected — report; don't retry the same request |
| `PROFILE_STATE_INCONSISTENT` | 2 | Corrupt local profile state — report; don't delete the profile |

## Approval message template (to the owner, 1:1)

> To let me publish to your TinyCloud, open <link> (code <code>) before <deadline>. It asks for publish-only access to two share folders for up to 30 days. Keep all three items ticked. Only approve if you asked me for this just now.

## HTML notes

Bearer `.html`/`.htm` renders in a sandboxed, opaque-origin frame — scripts run but can't reach the viewer, cookies, storage or the link fragment; external resources are blocked. Before publishing HTML, require it to be self-contained:

```sh
grep -nEi '(src|href)=["'"'"']?https?:|@import|fetch\(|<link ' FILE   # must print nothing
```

Owner-only HTML links download rather than render — say so in the report.

See `QUICKSTART.md` for the walkthrough and what the owner sees on their phone.
