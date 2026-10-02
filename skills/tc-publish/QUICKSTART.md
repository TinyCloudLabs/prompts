# Publish a document to TinyCloud — quickstart

Works in Codex, Claude Code, OpenCode, or OMP. Requires Node **20 or later** and `@tinycloud/cli` ≥ `1.0.0-beta.16` — install from `@beta` or an exact pin, never `@latest` (still 0.9.0).

## 0. Install the CLI and this skill

```sh
npm install --prefix <dir> @tinycloud/cli@<exact beta>   # e.g. 1.0.0-beta.16
export TC_BIN=<dir>/node_modules/.bin/tc
```

Install this `tc-publish` directory into the agent's skill path (e.g. `~/.agents/skills/tc-publish/` for Codex and OpenCode, `~/.claude/skills/tc-publish/` for Claude Code). Installing the `tc-cli` core skill is a separate operation. `TC_BIN` and `TC_HOME` are operator-set; never change or unset them.

## Shell preamble — required

Agent shells lose variables and umask between calls, so **every shell call starts with**:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"
```

This keeps every state file at 0600 inside the 0700 directory.

## 1. Check the CLI

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

"$TC_BIN" enable share --help | grep -q -- '--replace-session' \
  && "$TC_BIN" auth login --help | grep -q -- '--expiry' \
  && echo CLI_OK || echo STALE
"$TC_BIN" --version    # report alongside the probe
```

`STALE` or an empty `TC_BIN` → stop and tell the owner; never install anything yourself.

## 2. Consent — `enable share` once per profile

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

if ! "$TC_BIN" --profile publisher context --json >/dev/null 2>"$STATE/context.err"; then
  code=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("error",{}).get("code",""))' "$STATE/context.err" 2>/dev/null)
  if [ "$code" = PROFILE_NOT_FOUND ]; then "$TC_BIN" init --name publisher --key-only; else cat "$STATE/context.err"; echo "SETUP_FAILED: $code"; fi
fi
```

`init` runs only on `PROFILE_NOT_FOUND` — any other `context` failure stops the flow. Never run `profile delete`, never run two waiters at once.

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

( "$TC_BIN" --profile publisher enable share; echo "TC_EXIT=$?" ) > "$LOG" 2>&1 &
for i in $(seq 30); do grep -qE '^(Approve on your phone:|TC_EXIT=)|"code"' "$LOG" 2>/dev/null && break; sleep 1; done
grep -E '^(Approve on your phone:|  Or open|  Waiting for approval until|TC_EXIT=)|"code"' "$LOG"
```

If `TC_EXIT=` already appears, skip the approval message — the outcome is already decided; check the status block in `SKILL.md` §2. Otherwise send the owner, on their 1:1 channel:

> To let me publish to your TinyCloud, open <link> (code <code>) before <deadline>. It asks for publish-only access to your share folders for up to <lifetime>. Leave every item ticked. Only approve if you asked me for this just now.

`enable share` has no `--expiry` — it requests the 30-day maximum and the owner may pick a shorter lifetime on the consent page. For a shorter request use `auth login --device --manifest builtin:share-publishing --expiry <1m–30d>`; out-of-range values give `INVALID_EXPIRY`. Then poll in chunks under 90 seconds until `TC_EXIT=` appears:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

for i in $(seq 9); do grep -q '^TC_EXIT=' "$LOG" 2>/dev/null && break; sleep 10; done || true
grep -E '^TC_EXIT=|"code"' "$LOG" || echo WAITING
```

Success for `enable share` is `TC_EXIT=0` with `"enabled": true` and `"declined": []`; for `auth login --device` it's `"authenticated": true` and `"declined": []`. `DEVICE_AUTH_EXPIRED` → re-run and send the *new* link and code; `DEVICE_AUTH_DENIED` → don't re-run unless asked; `SESSION_IN_USE` → ask the owner, never add `--replace-session` unprompted; no `TC_EXIT=` more than a minute past the deadline → the waiter died: delete `$LOG`, re-run, send the new link and code. A non-empty `declined` means a capability was unchecked — `xyz.tinycloud.share/shares/` declined breaks public links; `shares/` declined breaks owner-only links. Delete `$LOG` when the waiter finishes.

### What the owner sees

On their phone at `openkey.so/device`: the requested capabilities — a capability-list read (required), KV get/put on `xyz.tinycloud.share/shares/`, and KV get/metadata/put/list on `shares/` — plus the lifetime, the Share and Node origins, and the warning "Only approve if you started this on your own device". They tap "Sign in and review delegation", sign in with a passkey, pick their key, tick "I started this request myself, on a device I control", review the list (optional items can be unchecked), and press **Approve**. The page says "Authenticated" and the CLI saves the scoped session.

## 3. Choose the link type and publish

Default to the **owner-only link**; public only when the owner's request explicitly says public or anyone-can-open — never decide on your own; if unsure, ask. Always pass `--expires` (24h public / 7d owner-only unless the owner says otherwise) and always tell the owner the expiry.

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

"$TC_BIN" --profile publisher share publish ./report.md --to "email:$TC_OWNER_EMAIL" --expires 7d --json > "$STATE/publish.json" 2>"$STATE/publish.err" \
  || { code=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("error",{}).get("code","?"))' "$STATE/publish.err" 2>/dev/null); rm -f "$STATE/publish.json" "$STATE/last-url"; echo "PUBLISH_FAILED: $code"; }
# public instead: drop --to and use --expires 24h

id=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["metadata"]["shareId"])' "$STATE/publish.json")
echo "share id $id"
"$TC_BIN" --profile publisher share show "$id" --reveal-link \
  | python3 -c 'import json,sys;sys.stdout.write(json.load(sys.stdin)["link"])' > "$STATE/last-url"
```

`--reveal-link` already prints JSON with `.link` — never combine it with `--json` (`INVALID_ARGUMENT`). The full URL goes only into `$STATE/last-url` and one message to the owner; record share id + file name, never the URL. If `$TC_OWNER_EMAIL` is unset, ask; never guess.

## 4. Verify — every time, before reporting

Public links:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

src=$(sha256sum < ./report.md | cut -d' ' -f1)
if cat "$STATE/last-url" | "$TC_BIN" --profile publisher share receive - --stdout > "$STATE/received" 2>"$STATE/receive.err" \
   && [ "$src" = "$(sha256sum < "$STATE/received" | cut -d' ' -f1)" ]; then
  echo VERIFIED
else
  echo MISMATCH
fi
```

Checking `receive`'s status matters — a failed `receive` would otherwise hash empty input and could false-match.

Owner-only links can't be received by this profile (`CLAIM_REQUIRED`, exit 6 — expected); verify with `share inspect` plus the sender record, as in `SKILL.md` §4: `metadata.target.kind` = `email`, `metadata.resource.path` ends in `/<basename>`, `metadata.expiresAt` ≈ now + `--expires` (±2 min), `link.kind` = `policy`, and `share show <id>` `.recipient` = `$TC_OWNER_EMAIL`.

The recipient opens the link in a browser and proves the mailbox with an 8-digit code — no TinyCloud account needed. Owner-only HTML downloads rather than renders.

## 5. Manage

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

"$TC_BIN" --profile publisher share list --json   # filter .shares[] on revoked + expiresAt — it's sender history, not active-only
"$TC_BIN" --profile publisher share show "$id"
"$TC_BIN" --profile publisher share show "$id" --reveal-link \
  | python3 -c 'import json,sys;sys.stdout.write(json.load(sys.stdin)["link"])' > "$STATE/revealed"
"$TC_BIN" --profile publisher share revoke "$id"  # addressed links only
```

Bearer links can't be reliably revoked before they expire (TC-545 in progress — `share revoke` may print `revoked` while the link still opens). If the owner insists, verify with `share receive` and report the truth.

## HTML and rendering

- **Bearer `.html`/`.htm`** renders in a sandboxed opaque-origin frame: scripts run but can't reach the viewer, cookies, storage or the fragment; external resources are blocked. Check before publishing — any `src`/`href`/`url()` not `data:` or `#` counts as external:

  ```sh
  python3 - FILE <<'PY'
  import re, sys
  src = open(sys.argv[1]).read()
  pat = re.compile(r'''(?:src|href)\s*=\s*["']?\s*(?!data:|#)\S+|url\(\s*["']?\s*(?!data:)[^)]+\)|@import|fetch\s*\(|<link\b''', re.I)
  hits = [f"{i+1}: {l.strip()}" for i, l in enumerate(src.splitlines()) if pat.search(l)]
  print("\n".join(hits) if hits else "SELF_CONTAINED")
  PY
  ```

- **Addressed HTML** downloads rather than rendering.
- **Markdown** renders (headings, lists, bold, tables); Mermaid blocks show their source (TC-546).
- Both viewers show "Sender unverified" and "Read-only" — the link proves the content, not who sent it.

## Errors — `{"error":{"code","message","hint"?}}` on stderr; Commander option errors are plain text

Branch on `code`, never on exit status alone (exits 5 and 6 each cover several errors). `AUTH_REQUIRED` → re-run `enable share` on the same profile (ignore the `tc auth login`/`init` hint). `PERMISSION_DENIED` → profile lacks the share scope. `SESSION_LIFETIME_EXCEEDED` → `--expires` beyond the session: shorten or re-login; under 60 s: lengthen. `INVALID_EXPIRY`/`INVALID_ARGUMENT` → fix the option/input. `SESSION_IN_USE` → ask the owner; never `--replace-session` unprompted. `CLAIM_REQUIRED` → expected on owner-only `receive`; use `inspect`. `UNSUPPORTED_LINK` → `inspect` doesn't take public links. `ORIGIN_MISMATCH` → share origin vs configured service (exit 2 publish / 5 receive), not a re-login. `DEVICE_AUTH_EXPIRED` → re-run and send the new code. `DEVICE_AUTH_DENIED` → don't re-run unless asked. `DEVICE_AUTH_BINDING_MISMATCH`/`DEVICE_AUTH_INVALID_RESPONSE`/`DEVICE_AUTH_FAILED` → report; re-run once, then stop. `OPENKEY_UNREACHABLE` → retry later. `SCOPE_REJECTED`/`PROFILE_STATE_INCONSISTENT` → report; don't retry or delete. `PROFILE_EXISTS` → use the existing profile. `EXPIRED`/`NOT_FOUND` → share gone or wrong id. Report the code and the CLI's message — never relay raw server text.

## Never

- Never put a full share URL, fragment, user code or session material anywhere but the CLI's own output, a 0600 file in `$STATE`, the tool output used to compose the one owner message, or that message itself — never notes, memory, files, commits, group chats or other tools. State files are deleted after use (`rm -f "$STATE"/{last-url,received,revealed,publish.json,publish.err,inspect.json,show.json,receive.err,context.err}`, and `$LOG` when the waiter finishes).
- Never report a publish without verification — hash for public, `inspect` + sender record for owner-only.
- Never publish publicly without the owner explicitly asking, and never substitute a public link for a private one.
- Never run `profile delete`, never add `--replace-session` unprompted, never run two waiters at once, never change `TC_BIN` or `TC_HOME`.
