---
name: tc-publish
description: Publish a document or HTML page to TinyCloud and return a shareable link. Use when the owner asks the agent to publish, share, or host a file — private owner-only links, public bearer links, verification, and lifecycle.
metadata:
  version: "0.4.0"
---

# Publish documents and HTML with `tc share`

Publish a file from the owner's TinyCloud space and return a link. The agent holds a scoped delegation the owner approves through OpenKey device authorization — no passwords, no copied credentials.

Requires `@tinycloud/cli` **1.0.0-beta.16 or newer** (TC-540). The binary path is operator-provided as `TC_BIN` — `command -v tc` can resolve to `/usr/sbin/tc` (Linux traffic control). `TC_HOME` is operator-set; never change or unset it.

## Shell preamble — required

**Every shell call starts with this preamble** — agent shells lose variables and umask between calls:

```sh
umask 077
STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"
```

## Handling contract — applies to every step

- Everything after `#` in any share URL is a credential: `#tc1=…` on public links, `#v=2&p=…` on owner-only links.
- A full share URL may appear only in: the CLI command's own output; a 0600 file inside the 0700 `$STATE` directory; and one message to the owner in their 1:1 channel. The agent may read `$STATE/last-url` (or `revealed`) into tool output **only** to compose that one owner message — then it runs `rm -f "$STATE"/{last-url,received,revealed,publish.json,publish.err,inspect.json,show.json,receive.err,context.err}`.
- The OpenKey approval link and code may appear in the protected `$LOG` and in the agent's own tool output while it reads them to compose the one owner message — and nowhere else. Delete `$LOG` after the waiter finishes.
- Never put a link or code in notes, memory, the journal, summaries, other files, commits, group chats or other tools.
- If a request comes from a group chat, send the link to the owner privately and say so in the group.

## Choosing the link type

Default to the **owner-only email link**. Create a public link only when the owner's current request explicitly asks for a public or anyone-can-open link. The agent never decides on its own that content is shareable — if unsure, ask.

Address owner-only links with `--to "email:$TC_OWNER_EMAIL"` (operator-set). If `$TC_OWNER_EMAIL` is unset, ask the owner and never guess. To share with someone else, use their address as confirmed by the owner. Never use a public link as a substitute for a private one.

## 1. Check the CLI — feature probes, not version strings

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

"$TC_BIN" enable share --help | grep -q -- '--replace-session' \
  && "$TC_BIN" auth login --help | grep -q -- '--expiry' \
  && echo CLI_OK || echo STALE
"$TC_BIN" --version    # report this alongside the probe result
```

If `TC_BIN` is empty or the probe prints `STALE`, stop and tell the owner. Never install anything yourself.

## 2. Consent — `enable share`, once per profile

Run `init` **only** when `context` fails with `PROFILE_NOT_FOUND`; any other failure stops the flow:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

if ! "$TC_BIN" --profile publisher context --json >/dev/null 2>"$STATE/context.err"; then
  code=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("error",{}).get("code",""))' "$STATE/context.err" 2>/dev/null)
  if [ "$code" = PROFILE_NOT_FOUND ]; then
    "$TC_BIN" init --name publisher --key-only
  else
    cat "$STATE/context.err"; echo "SETUP_FAILED: $code"
  fi
fi
```

Never run `profile delete`. Never run two waiters at once; the deadline is the `Waiting for approval until` line.

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

( "$TC_BIN" --profile publisher enable share; echo "TC_EXIT=$?" ) > "$LOG" 2>&1 &
for i in $(seq 30); do grep -qE '^(Approve on your phone:|TC_EXIT=)|"code"' "$LOG" 2>/dev/null && break; sleep 1; done
grep -E '^(Approve on your phone:|  Or open|  Waiting for approval until|TC_EXIT=)|"code"' "$LOG"
```

If `TC_EXIT=` already appears, skip the approval message and go straight to the outcome table. Otherwise send the owner the approval message (template below), then poll in chunks under 90 seconds until `TC_EXIT=` appears:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

for i in $(seq 9); do grep -q '^TC_EXIT=' "$LOG" 2>/dev/null && break; sleep 10; done || true
grep -E '^TC_EXIT=|"code"' "$LOG" || echo WAITING
```

`enable share` has no `--expiry`; it requests the maximum 30-day session and the owner can pick a shorter lifetime on the consent page. For a shorter request:
```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

( "$TC_BIN" --profile publisher auth login --device \
    --manifest builtin:share-publishing --expiry 7d; echo "TC_EXIT=$?" ) > "$LOG" 2>&1 &
```

`--expiry` accepts 1 minute to 30 days; anything else is `INVALID_EXPIRY`.

### Waiter outcomes — branch on `code`, never on exit status alone (exits 5 and 6 each cover several errors)

Read status structurally — the log may contain pretty-printed JSON:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

python3 - "$LOG" <<'PY'
import json, re, sys
txt = open(sys.argv[1]).read()
dec, objs, i = json.JSONDecoder(), [], 0
while True:
    m = re.search(r'[\[{]', txt[i:])
    if not m: break
    try:
        obj, end = dec.raw_decode(txt, i + m.start())
        objs.append(obj); i += m.start() + end
    except json.JSONDecodeError:
        i += m.start() + 1
last = next((o for o in reversed(objs) if isinstance(o, dict)), {})
err = last.get("error", {})
exitm = re.search(r'^TC_EXIT=(\d+)', txt, re.M)
print("TC_EXIT:", exitm.group(1) if exitm else None)
print("code:", err.get("code"))
print("enabled:", last.get("enabled"), "authenticated:", last.get("authenticated"))
print("declined:", last.get("declined"))
print("expiresAt:", last.get("expiresAt"))
PY
```

| Status | Meaning | Action |
|---|---|---|
| `TC_EXIT=0`, `enabled: true`, `declined: []` | Approved (`enable share`) | Done |
| `TC_EXIT=0`, `authenticated: true`, `declined: []` | Approved (`auth login --device`) | Done |
| `TC_EXIT=0`, `declined` non-empty | A capability was unchecked | Proceed, but tell the owner which link type won't work — declining `xyz.tinycloud.share/shares/` breaks **public** links; declining `shares/` breaks **owner-only** links |
| `TC_EXIT=3`, `DEVICE_AUTH_EXPIRED` | Window closed (~10 min) | Re-run — it issues a **new** code; send the new link and code |
| `TC_EXIT=5`, `DEVICE_AUTH_DENIED` | Owner declined | Do not re-run unless the owner asks |
| `TC_EXIT=2`, `SESSION_IN_USE` | Live session would be narrowed or shortened | Ask the owner; never add `--replace-session` on your own |
| `TC_EXIT=6`, `OPENKEY_UNREACHABLE` | Can't reach OpenKey | Report; retry when connectivity returns |
| `TC_EXIT=5`, `SCOPE_REJECTED` | Manifest rejected | Report; do not retry the same request |
| `TC_EXIT=1`, `PROFILE_STATE_INCONSISTENT` | Corrupt local profile state | Report; do not delete the profile |
| `DEVICE_AUTH_BINDING_MISMATCH` / `DEVICE_AUTH_INVALID_RESPONSE` / `DEVICE_AUTH_FAILED` | Delegation verification or binding failed | Report; re-run once, then stop |
| no `TC_EXIT=` more than 1 minute past the deadline | Waiter died | Delete `$LOG`, re-run, send the new link and code |

Delete `$LOG` once the waiter has finished.

## 3. Publish

Always pass `--expires` — 24h for public links, 7d for owner-only, unless the owner says otherwise — and always tell the owner the expiry. An explicit `--expires` beyond the session fails `SESSION_LIFETIME_EXCEEDED`; under 60 s is refused.

Publish with `--json` so the share id lands in the state file, then resolve the link without printing it:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

# Owner-only (the default):
"$TC_BIN" --profile publisher share publish FILE --to "email:$TC_OWNER_EMAIL" --expires 7d --json > "$STATE/publish.json" 2>"$STATE/publish.err" \
  || { code=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("error",{}).get("code","?"))' "$STATE/publish.err" 2>/dev/null); rm -f "$STATE/publish.json" "$STATE/last-url"; echo "PUBLISH_FAILED: $code"; }

# Public (only when the owner explicitly asked) — drop --to and use --expires 24h:
"$TC_BIN" --profile publisher share publish FILE --expires 24h --json > "$STATE/publish.json" 2>"$STATE/publish.err" \
  || { code=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("error",{}).get("code","?"))' "$STATE/publish.err" 2>/dev/null); rm -f "$STATE/publish.json" "$STATE/last-url"; echo "PUBLISH_FAILED: $code"; }

id=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["metadata"]["shareId"])' "$STATE/publish.json")
echo "share id $id"    # record the share id and file name — never the URL
"$TC_BIN" --profile publisher share show "$id" --reveal-link \
  | python3 -c 'import json,sys;sys.stdout.write(json.load(sys.stdin)["link"])' > "$STATE/last-url"
```

`--reveal-link` prints JSON with `.link` — do not combine it with `--json` (`INVALID_ARGUMENT`).

## 4. Verify — always, before reporting

**Public links** — receive and hash; `receive`'s status is checked so a failure can't pass:
```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

src=$(sha256sum < FILE | cut -d' ' -f1)
if cat "$STATE/last-url" | "$TC_BIN" --profile publisher share receive - --stdout > "$STATE/received" 2>"$STATE/receive.err" \
   && [ "$src" = "$(sha256sum < "$STATE/received" | cut -d' ' -f1)" ]; then
  echo VERIFIED
else
  echo "MISMATCH ($(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("error",{}).get("code","?"))' "$STATE/receive.err" 2>/dev/null || echo receive-failed))"
fi
```

**Owner-only links** — the agent cannot `receive` them (`CLAIM_REQUIRED`, exit 6, expected). Inspect and check the sender record:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

cat "$STATE/last-url" | "$TC_BIN" --profile publisher share inspect - --json > "$STATE/inspect.json"
id=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["metadata"]["shareId"])' "$STATE/inspect.json")
"$TC_BIN" --profile publisher share show "$id" --json > "$STATE/show.json"
python3 - "$STATE/inspect.json" "$STATE/show.json" "$(basename FILE)" "$TC_OWNER_EMAIL" "$EXPIRES" <<'PY'
import json, re, sys, datetime
ins = json.load(open(sys.argv[1])); show = json.load(open(sys.argv[2]))
base, owner, dur = sys.argv[3], sys.argv[4], sys.argv[5]
m = re.fullmatch(r'(\d+)\s*([smhd])', dur.strip())
secs = int(m.group(1)) * {"s":1,"m":60,"h":3600,"d":86400}[m.group(2)]
meta = ins["metadata"]
exp = datetime.datetime.fromisoformat(meta["expiresAt"].replace("Z","+00:00")).timestamp()
want = datetime.datetime.now(datetime.timezone.utc).timestamp() + secs
ok = (meta["target"]["kind"] == "email"
      and meta["resource"]["path"].endswith("/" + base)
      and abs(exp - want) <= 120
      and ins["link"]["kind"] == "policy"
      and show.get("recipient") == owner)
print("VERIFIED" if ok else "MISMATCH")
PY
```

`$EXPIRES` is the duration string passed to `--expires` (e.g. `7d`).

## 5. Lifecycle

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

"$TC_BIN" --profile publisher share list --json \
  | python3 -c 'import json,sys,datetime
for s in json.load(sys.stdin)["shares"]:
    if not s.get("revoked") and s["expiresAt"] > datetime.datetime.now(datetime.timezone.utc).isoformat():
        print(s["shareId"], s["target"], s["expiresAt"])'
"$TC_BIN" --profile publisher share show "$id" --reveal-link \
  | python3 -c 'import json,sys;sys.stdout.write(json.load(sys.stdin)["link"])' > "$STATE/revealed"
"$TC_BIN" --profile publisher share revoke "$id"       # addressed links only
```

- `share list` is sender history — filter `.shares[]` on `revoked` and `expiresAt` before reporting "active" shares.
- **Do not revoke bearer links.** TC-545 is in progress and behavior is uncertain — `share revoke` may print `revoked` while the link still opens. If the owner insists, revoke, then `share receive` the revealed link and report the truth (still opens vs. fails).
- Addressed links revoke normally; afterwards `share show` reports `revoked: true`.

## 6. Report to the owner

Publish report — link type, what the recipient experiences, expiry, verification result, then the URL:

> Published `report.md` — owner-only link (opens after an 8-digit code is emailed to you) / public link (anyone holding it can open; can't be reliably revoked before it expires). Expires <date>. Verified by hash match / email-target inspect. <URL>

## Errors — `{"error":{"code","message","hint"?}}` on stderr; Commander option errors are plain text

Branch on `code`, never on the exit status alone — exits 5 and 6 each cover several errors.

| Code | Exit | Action |
|---|---|---|
| `AUTH_REQUIRED` | 3 | Session expired/invalid — re-run `enable share` on the same profile (ignore the CLI's own `tc auth login`/`init` hint) |
| `PERMISSION_DENIED` | 5 | Scope lacks the publishing permission — re-run `enable share` |
| `SESSION_LIFETIME_EXCEEDED` | 2 | `--expires` beyond the session → shorten it or re-login; under 60 s → lengthen it |
| `INVALID_EXPIRY` | 2 | `--expiry` outside 1 m–30 d |
| `INVALID_ARGUMENT` | 2 | Bad option combination or missing input — fix the command |
| `SESSION_IN_USE` | 2 | Live session would narrow — ask the owner; never `--replace-session` unprompted |
| `CLAIM_REQUIRED` | 6 | Expected on `receive` of an owner-only link — use `inspect` |
| `UNSUPPORTED_LINK` | 2 | `inspect` on a public link — verify by `receive` + hash instead |
| `ORIGIN_MISMATCH` | 2 publish / 5 receive | Share origin vs configured service — check `--viewer-origin`/host config, not re-login |
| `EXPIRED` / `NOT_FOUND` | 4 | The share expired or the id is wrong |
| `PROFILE_EXISTS` | 1 | `init` on an existing profile — use it; never `profile delete` |
| `PROFILE_NOT_FOUND` | 1 | No profile yet — `init` is the answer here only |
| `DEVICE_AUTH_EXPIRED` | 3 | Approval window closed — re-run sends a new code |
| `DEVICE_AUTH_DENIED` | 5 | Owner declined — don't re-run unless asked |
| `DEVICE_AUTH_BINDING_MISMATCH` | 5 | Session/transaction binding failed — report; re-run once |
| `DEVICE_AUTH_INVALID_RESPONSE` / `DEVICE_AUTH_FAILED` | 1 | Malformed or unverifiable OpenKey response — report; re-run once, then stop |
| `OPENKEY_UNREACHABLE` | 6 | OpenKey unreachable — report, retry later |
| `SCOPE_REJECTED` | 5 | Manifest rejected — report; don't retry the same request |
| `PROFILE_STATE_INCONSISTENT` | 1 | Corrupt local profile state — report; don't delete the profile |

## Approval message template (to the owner, 1:1)

> To let me publish to your TinyCloud, open <link> (code <code>) before <deadline>. It asks for publish-only access to your share folders for up to <lifetime>. Leave every item ticked. Only approve if you asked me for this just now.

## HTML notes

Bearer `.html`/`.htm` renders in a sandboxed, opaque-origin frame — scripts run but can't reach the viewer, cookies, storage or the link fragment; external resources are blocked. Before publishing HTML require it to be self-contained — any `src`, `href` or `url()` whose value isn't a `data:` URI or a `#` fragment counts as external (relative references won't load from the viewer either):

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"; mkdir -p "$STATE"; chmod 700 "$STATE"

python3 - FILE <<'PY'
import re, sys
src = open(sys.argv[1]).read()
# Flag any src/href/url() whose value isn't a data: URI or a # fragment —
# this includes absolute http(s), protocol-relative //, and relative paths.
pat = re.compile(r'''(?:src|href)\s*=\s*["']?\s*(?!data:|#)\S+|url\(\s*["']?\s*(?!data:)[^)]+\)|@import|fetch\s*\(|<link\b''', re.I)
hits = [f"{i+1}: {l.strip()}" for i, l in enumerate(src.splitlines()) if pat.search(l)]
print("\n".join(hits) if hits else "SELF_CONTAINED")
PY
```

It must print `SELF_CONTAINED`. Any flagged line means the resource won't load in the viewer — inline it (data URI) or warn the owner.

Owner-only HTML links download rather than render — say so in the report.

See `QUICKSTART.md` for the walkthrough and what the owner sees on their phone.
