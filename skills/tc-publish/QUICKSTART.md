# Publish a document to TinyCloud — quickstart

Works in Codex, Claude Code, OpenCode, or OMP. Requires Node **20 or later** and `@tinycloud/cli` ≥ `1.0.0-beta.16` — install from `@beta` or an exact pin, never `@latest` (still 0.9.0).

## 0. Install the CLI and this skill

```sh
npm install --prefix <dir> @tinycloud/cli@<exact beta>   # e.g. 1.0.0-beta.16
export TC_BIN=<dir>/node_modules/.bin/tc
```

Install this `tc-publish` directory into the agent's skill path (e.g. `~/.agents/skills/tc-publish/` for Codex and OpenCode, `~/.claude/skills/tc-publish/` for Claude Code). Installing the `tc-cli` core skill is a separate operation.

## 1. Check the CLI

`tc` is an npm CLI and `command -v tc` can hit `/usr/sbin/tc`. Use `TC_BIN` and feature probes:

```sh
"$TC_BIN" enable share --help | grep -q -- '--replace-session' \
  && "$TC_BIN" auth login --help | grep -q -- '--expiry' \
  || { echo STALE; }
```

If `TC_BIN` is empty or the probe prints `STALE`, stop and tell the owner — never install anything yourself.

## 2. Consent — `enable share` once per profile

```sh
STATE="$HOME/.local/state/tc-publish"; mkdir -p "$STATE"; chmod 700 "$STATE"
LOG="$STATE/enable-share.log"
"$TC_BIN" --profile publisher context --json >/dev/null 2>&1 \
  || "$TC_BIN" init --name publisher --key-only
( "$TC_BIN" --profile publisher enable share; echo "TC_EXIT=$?" ) > "$LOG" 2>&1 &
for i in $(seq 30); do grep -qE '^(Approve on your phone:|TC_EXIT=)' "$LOG" && break; sleep 1; done
grep -E '^(Approve on your phone:|  Or open|  Waiting for approval until)' "$LOG"
```

A missing profile reports `PROFILE_NOT_FOUND` (exit 1) from `context` — that's when `init` runs. Never run `profile delete`, and never run two waiters at once; the deadline is the `Waiting for approval until` line.

`enable share` has no `--expiry` — it requests the 30-day maximum and the owner may pick a shorter lifetime on the consent page. For a shorter request use `auth login --device --manifest builtin:share-publishing --expiry <1m–30d>`; out-of-range values give `INVALID_EXPIRY`.

Send the owner, on their 1:1 channel:

> To let me publish to your TinyCloud, open <link> (code <code>) before <deadline>. It asks for publish-only access to two share folders for up to 30 days. Keep all three items ticked. Only approve if you asked me for this just now.

Then poll in ≤ 2-minute chunks until `TC_EXIT=` appears in `$LOG`:

```sh
for i in $(seq 12); do grep -q '^TC_EXIT=' "$LOG" && break; sleep 10; done
grep -E '^TC_EXIT=|"code"|"enabled"|"declined"|"expiresAt"' "$LOG"
```

Success for `enable share` is `TC_EXIT=0` with `"enabled": true` and `"declined": []`; for `auth login --device` it's `"authenticated": true`. A non-empty `declined` means a capability was unchecked — tell the owner which link type won't work. `DEVICE_AUTH_EXPIRED` means re-run and send the *new* link and code; `DEVICE_AUTH_DENIED` means do not re-run unless the owner asks; `SESSION_IN_USE` means ask the owner — never add `--replace-session` on your own. Delete `$LOG` once the waiter finishes.

### What the owner sees

On their phone at `openkey.so/device`: the three capabilities — a capability-list read (required), KV get/put on `xyz.tinycloud.share/shares/`, and KV get/metadata/put/list on `shares/` — plus the lifetime, the Share and Node origins, and the warning "Only approve if you started this on your own device". They tap "Sign in and review delegation", sign in with a passkey, pick their key, tick "I started this request myself, on a device I control", review the list (optional items can be unchecked), and press **Approve**. The page says "Authenticated" and the CLI saves the scoped session.

## 3. Choose the link type

Default to the **owner-only link**. Public only when the owner's request explicitly says public or anyone-can-open — never decide on your own; if unsure, ask.

```sh
umask 077
# Owner-only (default):
"$TC_BIN" --profile publisher share publish ./report.md --to "email:$TC_OWNER_EMAIL" --expires 7d > "$STATE/last-url"
# Public (only when asked):
"$TC_BIN" --profile publisher share publish ./report.md --expires 24h > "$STATE/last-url"
```

Always pass `--expires` (24h public / 7d owner-only unless the owner says otherwise) and always tell the owner the expiry. The full URL goes only into `$STATE/last-url` (0600), the CLI's own output, and one message to the owner — never into notes, files, summaries or group chats. If `$TC_OWNER_EMAIL` is unset, ask; never guess. Sharing with someone else needs their address confirmed by the owner.

## 4. Verify — every time, before reporting

Public links:

```sh
src=$(sha256sum < ./report.md | cut -d' ' -f1)
if cat "$STATE/last-url" | "$TC_BIN" --profile publisher share receive - --stdout > "$STATE/received" 2>/dev/null \
   && [ "$src" = "$(sha256sum < "$STATE/received" | cut -d' ' -f1)" ]; then
  echo VERIFIED
else
  echo MISMATCH
fi
```

Owner-only links can't be received by this profile (`CLAIM_REQUIRED`, exit 6 — expected); inspect:

```sh
cat "$STATE/last-url" | "$TC_BIN" --profile publisher share inspect - --json
# expect: metadata.target.kind = "email", metadata.resource.path ends in
#         "/<basename>", metadata.expiresAt ≈ now + --expires (±2 min),
#         link.kind = "policy"
```

The recipient opens the link in a browser and proves the mailbox with an 8-digit code — no TinyCloud account needed. Owner-only HTML downloads rather than renders.

## 5. Manage

```sh
"$TC_BIN" --profile publisher share list                          # sender history — filter expired/revoked yourself
"$TC_BIN" --profile publisher share show <id>
"$TC_BIN" --profile publisher share show <id> --reveal-link       # JSON; extract .link into the state file, don't print it
"$TC_BIN" --profile publisher share revoke <id>                   # addressed links only
```

Bearer links can't be reliably revoked until TC-545 — expiry is the only bound. If `share revoke` prints `revoked` for a bearer share anyway, `share receive` the revealed link and report whether it still opens.

## HTML and rendering

- **Bearer `.html`/`.htm`** renders in a sandboxed opaque-origin frame: scripts run but can't reach the viewer, cookies, storage or the fragment; external resources are blocked. Check before publishing:

  ```sh
  grep -nEi '(src|href)=["'"'"']?https?:|@import|fetch\(|<link ' FILE   # must print nothing
  ```

- **Addressed HTML** downloads rather than rendering.
- **Markdown** renders (headings, lists, bold, tables); Mermaid blocks show their source (TC-546).
- Both viewers show "Sender unverified" and "Read-only" — the link proves the content, not who sent it.

## Errors — `{"error":{"code","message","hint"?}}` on stderr; Commander option errors are plain text

`AUTH_REQUIRED` → re-run `enable share` on the same profile (ignore the `tc auth login`/`init` hint). `PERMISSION_DENIED` → profile lacks the share scope. `SESSION_LIFETIME_EXCEEDED` → shorten `--expires`. `INVALID_EXPIRY` → `--expiry` outside 1 m–30 d. `SESSION_IN_USE` → ask the owner; never `--replace-session` unprompted. `CLAIM_REQUIRED` → expected on `receive` of an owner-only link; use `inspect`. `UNSUPPORTED_LINK` → `inspect` doesn't take public links. `ORIGIN_MISMATCH` → share origin vs configured service, not a re-login. `DEVICE_AUTH_EXPIRED` → re-run and send the new code. `DEVICE_AUTH_DENIED` → don't re-run unless asked. `PROFILE_EXISTS` → use the existing profile. `EXPIRED`/`NOT_FOUND` → share is gone or the id is wrong. Report the code and the CLI's message — never relay raw server text.

## Never

- Never paste a full share URL, fragment, user code or session material into notes, memory, files, commits, group chats or other tools — only the owner's 1:1 channel gets the requested link.
- Never report a publish without verification — hash for public, `inspect` for owner-only.
- Never publish publicly without the owner explicitly asking, and never substitute a public link for a private one.
- Never run `profile delete`, never add `--replace-session` unprompted, never run two waiters at once.
