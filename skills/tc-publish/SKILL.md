---
name: tc-publish
description: Publish a document or HTML page to TinyCloud and return a shareable link. Use when the owner asks the agent to publish, share, or host a file — private owner-only links, public bearer links, verification, and lifecycle.
metadata:
  version: "0.5.0"
---

# Publish documents and HTML with `tc share`

Publish a file from the owner's TinyCloud space and return a link. The agent holds a scoped delegation the owner approves through OpenKey device authorization — no passwords, no copied credentials.

Requires `@tinycloud/cli` **1.0.0-beta.16 or newer** (TC-540). `TC_BIN` (absolute path to `tc`) and `TC_HOME` are operator-set; never change or unset them. `command -v tc` can resolve to `/usr/sbin/tc` (Linux traffic control).

## Shell preamble — required

Agent shells lose variables and umask between calls. **Start every shell call with this preamble**; each block below already does:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE=publisher   # unless the owner names another profile
```

Run each block as one tool call. Replace every `'<…>'` placeholder before running.

## Handling contract — applies to every step

- Everything after `#` in any share URL is a credential: `#tc1=…` on public links, `#v=2&p=…` on owner-only links.
- A full share URL may appear only in: the CLI command's own output; a 0600 file inside the 0700 `$STATE` directory; the tool output of the single read used to deliver it (the harness's own storage of that output is allowed); and one message to the owner in their 1:1 channel.
- **Never retype, reassemble, or chunk a link.** Public links are about 2.6 KB and owner-only links about 16.7 KB; a hand-copied link corrupts. If the owner's channel is a command, pipe the link from the state file into it (§6) so it never passes through your output. If the only channel is your reply, read the file once in a single tool call and copy it verbatim.
- The OpenKey approval link and code may appear in the protected `$LOG`, in your tool output while you read them to compose the one owner message, and in that message — nowhere else. Delete `$LOG` after the waiter finishes.
- Never put a link or code in notes, memory, the journal, summaries, other files, commits, group chats or other tools.
- If a request comes from a group chat, send the link to the owner privately and say so in the group.

## Choosing the link type

Default to the **owner-only email link**. Create a public link only when the owner's current request explicitly asks for a public or anyone-can-open link. Never decide on your own that content is shareable — if unsure, ask.

Address owner-only links with `--to "email:$TC_OWNER_EMAIL"` (operator-set). If `$TC_OWNER_EMAIL` is unset, ask the owner and never guess. To share with someone else, use their address as confirmed by the owner. Never use a public link as a substitute for a private one.

## 1. Check the CLI — feature probes, not version strings

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE=publisher   # unless the owner names another profile

"$TC_BIN" enable share --help | grep -q -- '--replace-session' \
  && "$TC_BIN" auth login --help | grep -q -- '--expiry' \
  && echo CLI_OK || echo STALE
"$TC_BIN" --version
echo "TC_HOME=$TC_HOME"
```

If `TC_BIN` is empty or the probe prints `STALE`, stop and tell the owner. Never install anything yourself.

## 2. Consent — only when there is no live session

Check the profile and session first:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE=publisher   # unless the owner names another profile

if "$TC_BIN" --profile "$PROFILE" context --json > "$STATE/context.json" 2>"$STATE/context.err"; then
  python3 -c 'import json,sys;print("SESSION:", json.load(open(sys.argv[1])).get("session",{}).get("state"))' "$STATE/context.json"
else
  code=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("error",{}).get("code",""))' "$STATE/context.err" 2>/dev/null)
  if [ "$code" = PROFILE_NOT_FOUND ]; then
    "$TC_BIN" init --name "$PROFILE" --key-only >/dev/null && echo "SESSION: missing (profile created)"
  else
    cat "$STATE/context.err"; echo "SETUP_FAILED: $code"
  fi
fi
rm -f "$STATE/context.json" "$STATE/context.err"
```

- `SESSION: present` → **skip to §3.** Come back here only when a publish returns `AUTH_REQUIRED` or `PERMISSION_DENIED`.
- `SESSION: missing` / `expired` / `unknown-expiry` → start the waiter below.
- `SETUP_FAILED` → stop and report. Never run `profile delete`.

Start the waiter. Never run two waiters at once; the deadline is the `Waiting for approval until` line:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE=publisher   # unless the owner names another profile

rm -f "$LOG"
( "$TC_BIN" --profile "$PROFILE" enable share; echo "TC_EXIT=$?" ) > "$LOG" 2>&1 &
for i in $(seq 30); do grep -qE '^(Approve on your phone:|TC_EXIT=)|"code"' "$LOG" 2>/dev/null && break; sleep 1; done
grep -E '^(Approve on your phone:|  Or open|  Waiting for approval until|TC_EXIT=)|"code"' "$LOG"
```

If `TC_EXIT=` already appears, skip the approval message and use the outcome table. Otherwise send the owner the approval message (template below).

`enable share` has no `--expiry`: it requests the maximum 30-day session and the owner can pick a shorter lifetime on the consent page. For a shorter request, replace the `enable share` line with `( "$TC_BIN" --profile "$PROFILE" auth login --device --manifest builtin:share-publishing --expiry 7d; echo "TC_EXIT=$?" ) > "$LOG" 2>&1 &`. `--expiry` accepts 1 minute to 30 days; anything else is `INVALID_EXPIRY`.

**Waiting.** If you can keep working in the same turn, poll in chunks of about 90 seconds:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null

for i in $(seq 9); do grep -q '^TC_EXIT=' "$LOG" 2>/dev/null && break; sleep 10; done
grep -E '^TC_EXIT=|"code"' "$LOG" || echo WAITING
```

If your only channel to the owner is your reply (Codex, SWE-2 and similar harnesses), sending the approval message ends your turn — you cannot watch in the background across turns. When the owner next writes (for example "approved"), run the poll and status blocks and report. If the waiter died meanwhile, the dead-waiter row applies.

### Waiter outcomes — branch on `code`, never on exit status alone (exits 5 and 6 each cover several errors)

Read the status structurally — the log may contain pretty-printed JSON:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null

python3 - "$LOG" <<'PY'
import json, re, sys
txt = open(sys.argv[1]).read()
dec, objs, i = json.JSONDecoder(), [], 0
while True:
    m = re.compile(r'[\[{]').search(txt, i)
    if not m: break
    try:
        obj, end = dec.raw_decode(txt, m.start())
        objs.append(obj); i = end
    except json.JSONDecodeError:
        i = m.start() + 1
last = next((o for o in reversed(objs) if isinstance(o, dict)), {})
exitm = re.search(r'^TC_EXIT=(\d+)', txt, re.M)
print("TC_EXIT:", exitm.group(1) if exitm else None)
print("code:", last.get("error", {}).get("code"))
print("enabled:", last.get("enabled"), "authenticated:", last.get("authenticated"))
print("declined:", json.dumps(last.get("declined")))
print("expiresAt:", last.get("expiresAt"))
PY
```

| Status | Meaning | Action |
|---|---|---|
| `TC_EXIT: 0`, `enabled: True`, `declined: []` | Approved (`enable share`) | Done; go to §3 |
| `TC_EXIT: 0`, `authenticated: True`, `declined: []` | Approved (`auth login --device`) | Done; go to §3 |
| `TC_EXIT: 0`, `declined` non-empty | A capability was unchecked | Proceed, and tell the owner: `xyz.tinycloud.share/shares/` declined → **public** links fail; `shares/` declined → **owner-only** links fail |
| `TC_EXIT: 3`, `DEVICE_AUTH_EXPIRED` | Window closed (~10 min) | Re-run the waiter — it issues a **new** code; send the new link and code |
| `TC_EXIT: 5`, `DEVICE_AUTH_DENIED` | Owner declined | Do not re-run unless the owner asks |
| `TC_EXIT: 2`, `SESSION_IN_USE` | A live session would be narrowed or shortened | Ask the owner; never add `--replace-session` on your own |
| `TC_EXIT: 6`, `OPENKEY_UNREACHABLE` | Can't reach OpenKey | Report; retry when connectivity returns |
| `TC_EXIT: 5`, `SCOPE_REJECTED` | Manifest rejected | Report; do not retry the same request |
| `TC_EXIT: 1`, `PROFILE_STATE_INCONSISTENT` | Corrupt local profile state | Report; do not delete the profile |
| `DEVICE_AUTH_BINDING_MISMATCH` (5) / `DEVICE_AUTH_INVALID_RESPONSE` / `DEVICE_AUTH_FAILED` (1) | Delegation binding or verification failed | Report; re-run once, then stop |
| `TC_EXIT: None` more than 1 minute past the deadline | Waiter died | Delete `$LOG`, re-run, send the new link and code |

Delete `$LOG` once the waiter has finished: `rm -f "$HOME/.local/state/tc-publish/enable-share.log"`.

## 3. Publish — run exactly one of the two blocks

Always pass `--expires` — 7d for owner-only, 24h for public, unless the owner says otherwise — and always tell the owner the expiry. `--expires` beyond the session fails `SESSION_LIFETIME_EXCEEDED`; under 60 s is refused.

**Owner-only (the default):**

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE=publisher   # unless the owner names another profile
FILE='<absolute path of the file>'
EXPIRES=7d

rm -f "$STATE/publish.json" "$STATE/publish.err" "$STATE/last-url"
if "$TC_BIN" --profile "$PROFILE" share publish "$FILE" --to "email:$TC_OWNER_EMAIL" --expires "$EXPIRES" --json \
     > "$STATE/publish.json" 2>"$STATE/publish.err" && [ -s "$STATE/publish.json" ]; then
  id=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["metadata"]["shareId"])' "$STATE/publish.json")
  echo "PUBLISHED owner-only share id $id file $(basename "$FILE") expires $EXPIRES"
  "$TC_BIN" --profile "$PROFILE" share show "$id" --reveal-link \
    | python3 -c 'import json,sys;link=json.load(sys.stdin)["link"];open(sys.argv[1],"w").write(link)' "$STATE/last-url" 2>/dev/null \
    && echo LINK_SAVED || echo REVEAL_FAILED
else
  code=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("error",{}).get("code","?"))' "$STATE/publish.err" 2>/dev/null)
  rm -f "$STATE/publish.json" "$STATE/last-url"; echo "PUBLISH_FAILED: ${code:-?}"
fi
```

**Public — only if the owner explicitly asked:**

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE=publisher   # unless the owner names another profile
FILE='<absolute path of the file>'
EXPIRES=24h

rm -f "$STATE/publish.json" "$STATE/publish.err" "$STATE/last-url"
if "$TC_BIN" --profile "$PROFILE" share publish "$FILE" --expires "$EXPIRES" --json \
     > "$STATE/publish.json" 2>"$STATE/publish.err" && [ -s "$STATE/publish.json" ]; then
  id=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["metadata"]["shareId"])' "$STATE/publish.json")
  echo "PUBLISHED public share id $id file $(basename "$FILE") expires $EXPIRES"
  "$TC_BIN" --profile "$PROFILE" share show "$id" --reveal-link \
    | python3 -c 'import json,sys;link=json.load(sys.stdin)["link"];open(sys.argv[1],"w").write(link)' "$STATE/last-url" 2>/dev/null \
    && echo LINK_SAVED || echo REVEAL_FAILED
else
  code=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("error",{}).get("code","?"))' "$STATE/publish.err" 2>/dev/null)
  rm -f "$STATE/publish.json" "$STATE/last-url"; echo "PUBLISH_FAILED: ${code:-?}"
fi
```

On `PUBLISH_FAILED`, stop and use the errors table. Record the share id, file name and link type — never the URL. `--reveal-link` already prints JSON with `.link`; never combine it with `--json` (`INVALID_ARGUMENT`).

## 4. Verify — always, before reporting

**Public links** — receive and hash; `receive`'s status is checked, so a failure can't pass:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE=publisher   # unless the owner names another profile
FILE='<absolute path of the file>'

rm -f "$STATE/received" "$STATE/receive.err"
src=$(sha256sum < "$FILE" | cut -d' ' -f1)
if [ ! -s "$STATE/last-url" ]; then
  echo "MISMATCH (no link file)"
elif ! "$TC_BIN" --profile "$PROFILE" share receive - --stdout < "$STATE/last-url" > "$STATE/received" 2>"$STATE/receive.err"; then
  echo "MISMATCH (receive failed: $(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["error"]["code"])' "$STATE/receive.err" 2>/dev/null || echo unknown))"
elif [ "$src" = "$(sha256sum < "$STATE/received" | cut -d' ' -f1)" ]; then
  echo VERIFIED
else
  echo "MISMATCH (hash differs)"
fi
```

**Owner-only links** — the agent cannot `receive` them (`CLAIM_REQUIRED`, exit 6, expected). Inspect the link and compare it with the publish record and the sender record:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE=publisher   # unless the owner names another profile
FILE='<absolute path of the file>'

rm -f "$STATE/inspect.json" "$STATE/show.json"
[ -s "$STATE/last-url" ] && [ -s "$STATE/publish.json" ] \
  && "$TC_BIN" --profile "$PROFILE" share inspect - --json < "$STATE/last-url" > "$STATE/inspect.json" \
  && id=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["metadata"]["shareId"])' "$STATE/publish.json") \
  && "$TC_BIN" --profile "$PROFILE" share show "$id" > "$STATE/show.json" \
  && python3 - "$STATE/inspect.json" "$STATE/publish.json" "$STATE/show.json" "$(basename "$FILE")" "$TC_OWNER_EMAIL" <<'PY' || echo MISMATCH
import json, sys, datetime
ins, pub, show = (json.load(open(p)) for p in sys.argv[1:4])
base, owner = sys.argv[4], sys.argv[5]
t = lambda s: int(datetime.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())
m, p = ins["metadata"], pub["metadata"]
ok = (m["target"]["kind"] == "email"
      and m["shareId"] == p["shareId"]
      and m["resource"]["path"].endswith("/" + base)
      and t(m["expiresAt"]) == t(p["expiresAt"])
      and ins["link"]["kind"] == "policy"
      and show.get("recipient") == owner)
print("VERIFIED" if ok else "MISMATCH")
PY
```

## 5. Lifecycle — one block per action

`share list --json` is sender history (fields `shareId`, `target`, `expiresAt`, `revoked`); filter it before calling anything "active". Public share ids are CIDs (`bafkr4…`); owner-only ids are 32 hex characters.

**List active shares:**

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE=publisher   # unless the owner names another profile

"$TC_BIN" --profile "$PROFILE" share list --json | python3 -c 'import json,sys,datetime
now = datetime.datetime.now(datetime.timezone.utc)
for s in json.load(sys.stdin)["shares"]:
    exp = datetime.datetime.fromisoformat(s["expiresAt"].replace("Z", "+00:00"))
    if not s.get("revoked") and exp > now:
        print(s["shareId"], s["target"], s["expiresAt"])'
```

**Reveal a public share's link again** (into the state file, for delivery per §6):

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE=publisher   # unless the owner names another profile
id='<public share id you recorded>'

rm -f "$STATE/last-url"
"$TC_BIN" --profile "$PROFILE" share show "$id" --reveal-link \
  | python3 -c 'import json,sys;link=json.load(sys.stdin)["link"];open(sys.argv[1],"w").write(link)' "$STATE/last-url" 2>/dev/null \
  && echo LINK_SAVED || echo REVEAL_FAILED
```

**Revoke an owner-only share:**

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE=publisher   # unless the owner names another profile
id='<owner-only share id you recorded>'

"$TC_BIN" --profile "$PROFILE" share revoke "$id"
```

Afterwards `share show "$id"` reports `"revoked": true`.

**Public (bearer) links cannot be revoked today.** On production, `share revoke <bearer shareId>` exits 2 with `INVALID_ARGUMENT` "share operation failed", and the link still opens (TC-545). Do not attempt it; tell the owner the link stays live until it expires.

## 6. Deliver and report

Report: link type, what the recipient experiences, expiry, verification result, then the URL:

> Published `report.md` — owner-only link (opens after an 8-digit code is emailed to you) / public link (anyone holding it can open; can't be revoked before it expires). Expires <date>. Verified (hash match / inspect matched). <URL>

**If the owner's channel is a command** (for example an HTTP send endpoint), build the message from the state file and pipe it in — the link never passes through your output. Adapt the JSON shape and the send command to the channel:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null

python3 - "$STATE/last-url" "<summary line without the URL>" <<'PY' \
  | curl -fsS -H 'Content-Type: application/json' --data-binary @- '<owner send endpoint>' >/dev/null \
  && echo SENT || echo SEND_FAILED
import json, sys
link = open(sys.argv[1]).read()
print(json.dumps({"text": sys.argv[2] + "\n" + link}))
PY
```

**If the only channel is your reply**, read the file once, in a single tool call, and copy the link verbatim into your reply:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null

cat "$STATE/last-url"
```

**Last step, always — clean up:**

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null

rm -f "$STATE/last-url" "$STATE/received" "$STATE/receive.err" "$STATE/publish.json" "$STATE/publish.err" \
      "$STATE/inspect.json" "$STATE/show.json" "$STATE/context.json" "$STATE/context.err"
```

## Errors — `{"error":{"code","message","hint"?}}` on stderr; Commander option errors are plain text

Branch on `code`, never on the exit status alone — exits 5 and 6 each cover several errors. Report the code and the CLI's message; never relay raw server text.

| Code | Exit | Action |
|---|---|---|
| `AUTH_REQUIRED` | 3 | Session expired/invalid — return to §2 on the same profile (ignore the CLI's own `tc auth login`/`init` hint) |
| `PERMISSION_DENIED` | 5 | Scope lacks the publishing permission — return to §2 |
| `SESSION_LIFETIME_EXCEEDED` | 2 | `--expires` beyond the session → shorten it or renew consent; under 60 s → lengthen it |
| `INVALID_EXPIRY` | 2 | `--expiry` outside 1 m–30 d |
| `INVALID_ARGUMENT` | 2 | Bad option combination or missing input file — fix the command. Also what `share revoke` returns for a public share today ("share operation failed"; the link stays live) |
| `SESSION_IN_USE` | 2 | Live session would narrow — ask the owner; never `--replace-session` unprompted |
| `CLAIM_REQUIRED` | 6 | Expected on `receive` of an owner-only link — use `inspect` |
| `UNSUPPORTED_LINK` | 2 | `inspect` on a public link — verify by `receive` + hash instead |
| `ORIGIN_MISMATCH` | 2 publish / 5 receive | Share origin vs configured service — check host/viewer-origin config, not re-login |
| `EXPIRED` / `NOT_FOUND` | 4 | The share expired or the id is wrong |
| `PROFILE_NOT_FOUND` | 1 | No profile yet — the only case where `init` runs |
| `PROFILE_EXISTS` | 1 | `init` on an existing profile — use it; never `profile delete` |
| `DEVICE_AUTH_EXPIRED` | 3 | Approval window closed — re-run sends a new code |
| `DEVICE_AUTH_DENIED` | 5 | Owner declined — don't re-run unless asked |
| `DEVICE_AUTH_BINDING_MISMATCH` | 5 | Session/transaction binding failed — report; re-run once |
| `DEVICE_AUTH_INVALID_RESPONSE` / `DEVICE_AUTH_FAILED` | 1 | Malformed or unverifiable OpenKey response — report; re-run once, then stop |
| `OPENKEY_UNREACHABLE` | 6 | OpenKey unreachable — report, retry later |
| `SCOPE_REJECTED` | 5 | Manifest rejected — report; don't retry the same request |
| `PROFILE_STATE_INCONSISTENT` | 1 | Corrupt local profile state — report; don't delete the profile |

## Approval message template (to the owner, 1:1)

> To let me publish to your TinyCloud, open <link> (code <code>) before <deadline>. It asks for publish-only access to your share folders for up to <lifetime>. Leave every item ticked. Only approve if you asked me for this just now.

## HTML

Public `.html`/`.htm` renders in a sandboxed, opaque-origin frame: scripts run but can't reach the viewer, cookies, storage or the link fragment, and external resources are blocked. Owner-only HTML links download rather than render — say so in the report.

Before publishing HTML, check that it is self-contained. Any `src`, `href` or CSS `url()` whose value isn't a `data:` URI or a `#` fragment counts as external — absolute, protocol-relative (`//cdn…`) and relative (`app.js`) references all fail to load in the viewer:

```sh
umask 077; STATE="$HOME/.local/state/tc-publish"; LOG="$STATE/enable-share.log"
mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
FILE='<absolute path of the file>'

python3 - "$FILE" <<'PY'
import re, sys
from html.parser import HTMLParser
URL_ATTRS = {"src", "href", "srcset", "poster", "data", "action", "formaction", "background"}
CSS_URL = re.compile(r'url\(\s*["\']?\s*([^"\')\s]*)', re.I)
def local(v): return v.strip().lower().startswith(("data:", "#"))
class Check(HTMLParser):
    def __init__(self):
        super().__init__(); self.hits = []; self.tag = None
    def flag(self, what): self.hits.append(f"line {self.getpos()[0]}: {what}")
    def css(self, text):
        for v in CSS_URL.findall(text):
            if not local(v): self.flag(f"url({v})")
        if "@import" in text.lower(): self.flag("@import")
    def handle_starttag(self, tag, attrs):
        self.tag = tag
        for k, v in attrs:
            if v is None: continue
            if k in URL_ATTRS and not local(v): self.flag(f"<{tag} {k}={v.strip()}>")
            if k == "style": self.css(v)
    def handle_data(self, data):
        if self.tag == "style": self.css(data)
        if self.tag == "script" and re.search(r'\b(fetch|import)\s*\(|XMLHttpRequest|WebSocket|EventSource', data):
            self.flag("network call in <script>")
    def handle_endtag(self, tag): self.tag = None
c = Check(); c.feed(open(sys.argv[1], encoding="utf-8", errors="replace").read()); c.close()
print("\n".join(c.hits) if c.hits else "SELF_CONTAINED")
PY
```

It must print `SELF_CONTAINED`. Otherwise inline each flagged resource (data URI, inline `<style>`/`<script>`) or tell the owner what won't load.

Markdown renders (headings, lists, bold, tables); Mermaid blocks show their source (TC-546). See `QUICKSTART.md` for the walkthrough and what the owner sees on their phone.
