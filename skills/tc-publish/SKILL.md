---
name: tc-publish
description: Publish a document or HTML page to TinyCloud and return a shareable link. Use when the owner asks the agent to publish, share, or host a file — a link anyone who has it can open, made only after the owner says yes, with verification and lifecycle.
metadata:
  version: "0.6.4"
---

# Publish documents and HTML with `tinycloud share`

Publish a file from the owner's TinyCloud space and return a link. The agent holds a scoped delegation the owner approves through one OpenKey link — no passwords, no copied credentials.

Requires `@tinycloud/cli` 1.5.1 (installed by [/cli](https://agents.tinycloud.xyz/cli)). The §1 feature probe is authoritative — trust it over the version string.

Operator defaults `TC_BIN` and `TC_OWNER_EMAIL` come from process variables first, then `~/.config/tinycloud/agent.env` (or `TC_AGENT_ENV` on a multi-owner host), read as data through the pinned parser installed by [setup/agent.md](https://agents.tinycloud.xyz/agent). Never source the data file. `TC_HOME` (CLI home root) and `TC_PUBLISH_STATE` (this skill's state, default `$HOME/.local/state/tc-publish`) stay role-specific. Without `TC_BIN`, use the shared private CLI or `tinycloud` on `PATH`, never bare `tc`.

## Shell preamble — required

Agent shells lose variables and umask between calls. **Start every shell call with this preamble**; each block below already does:

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # unless the owner names another profile
```

Run each block as one tool call. Replace every `'<…>'` placeholder before running.

## Handling contract — applies to every step

- Everything after `#` in any share URL is a credential (`#tc1=…`).
- A full share URL may appear only in: the CLI command's own output; a 0600 file inside the 0700 `$STATE` directory; the tool output of the single read used to deliver it (the harness's own storage of that output is allowed); and one message to the owner in their 1:1 channel.
- **Never retype, reassemble, or chunk a link.** Links are about 2.6 KB; a hand-copied link corrupts. If the owner's channel is a command, pipe the link from the state file into it (§6) so it never passes through your output. If the only channel is your reply, read the file once in a single tool call and copy it verbatim.
- The OpenKey approval link may appear in `$STATE/login.err`, in your tool output while you read it to compose the one owner message, and in that message — nowhere else.
- Never put a link in notes, memory, the journal, summaries, other files, commits, group chats or other tools.
- If a request comes from a group chat, send the link to the owner privately and say so in the group.

## Ask before making a link

Only links are available for now: anyone who has the link can open it. Sharing with an email address, a domain, a DID or only the owner is not available yet; if the owner asks for one, say so in one line.

Before every publish, ask the owner exactly: "Anyone with the link can open it. Make a link?" Publish only after they say yes. If they say no, tell them it isn't published and the file stays on this computer, and don't offer another place to publish or share it. Never decide on your own that content is shareable, and never publish without that yes.

Always pass `--to anyone`. Never pass `email:`, `domain:` or `did:`, and never rely on the CLI's default target.

## 1. Check the CLI — feature probes, not version strings

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # unless the owner names another profile

if [ -z "$TC_BIN" ]; then echo "TC_NOT_FOUND: no TinyCloud CLI; install it from https://agents.tinycloud.xyz/publish or set TC_BIN"
elif "$TC_BIN" onboard --help >/dev/null 2>&1 \
  && "$TC_BIN" auth login --help | grep -q -- '--expiry'; then echo CLI_OK
else echo STALE; fi
[ -z "$TC_BIN" ] || "$TC_BIN" --version
```

If the block prints `TC_NOT_FOUND` or `STALE`, follow https://agents.tinycloud.xyz/agent for `NEEDS_SETUP`, then return to this same task.

## 2. Sign in — only when there is no live session

Start ONE login and wait for it to finish; never start a second login while one is running.

Check the profile and session first:

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
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

- `SESSION: present` → **skip to §3.** Come back here only when a publish returns `AUTH_REQUIRED`.
- `SESSION: missing` / `expired` / `unknown-expiry` → run the sign-in below.
- `SETUP_FAILED` → stop and report. Never run `profile delete`.

**The sign-in.** Run it when there is no live session. It is one approval; later runs reuse the saved session, up to 30 days. The approval is tied to this profile's key, which the check above creates (`init --name "$PROFILE" --key-only`; say nothing to the owner about it), so use the same `--profile "$PROFILE"` in every call.

The block writes the sign-in's permission list to `$STATE/share-publishing.json` (links only: the capability read OpenKey requires and the three share folders in `default`; no decryption, which links don't use) and starts `auth login`. `auth login` prints an OpenKey link on stderr, then keeps running, checking OpenKey every 2 seconds, until the owner approves. No code is involved; never ask the owner for one.

**Run it in the background, every time.** `auth login` waits for the owner's approval, which can take many minutes, so never run it as a foreground tool call: a tool time limit (2 minutes in Claude Code) would stop it. Start it as a background process (your client's own, if it has one; then leave out the final `&`) or in an interactive session. Its output goes to `$STATE/login.out` and `$STATE/login.err`, which you read with the check block below.

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # unless the owner names another profile

cat > "$STATE/share-publishing.json" <<'JSON'
{
  "app_id": "xyz.tinycloud.share",
  "name": "TinyCloud Share publishing",
  "space": "default",
  "permissions": [
    { "service": "tinycloud.capabilities", "path": "", "skipPrefix": true, "actions": ["tinycloud.capabilities/read"] },
    { "service": "tinycloud.kv", "path": "xyz.tinycloud.share/shares/", "skipPrefix": true, "actions": ["tinycloud.kv/get", "tinycloud.kv/put"] },
    { "service": "tinycloud.kv", "path": "shares/", "skipPrefix": true, "actions": ["tinycloud.kv/get", "tinycloud.kv/metadata", "tinycloud.kv/put", "tinycloud.kv/list"] },
    { "service": "tinycloud.kv", "path": "artifacts/", "skipPrefix": true, "actions": ["tinycloud.kv/get", "tinycloud.kv/metadata", "tinycloud.kv/put", "tinycloud.kv/list"] }
  ]
}
JSON
chmod 600 "$STATE/share-publishing.json"
"$TC_BIN" --profile "$PROFILE" auth login --method openkey --no-popup --manifest "$STATE/share-publishing.json" --expiry 30d > "$STATE/login.out" 2> "$STATE/login.err" < /dev/null &
```

Then, in a separate tool call, read where the sign-in is:

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
python3 - "$STATE/login.out" "$STATE/login.err" <<'PY'
import json, re, sys
def read(path):
    try: return open(path, errors="replace").read()
    except OSError: return ""
out, err = read(sys.argv[1]), read(sys.argv[2])
try: result = json.loads(out)
except ValueError: result = {}
if isinstance(result, dict) and result.get("authenticated") is True:
    for d in result.get("declined") or []: print("NOT_GRANTED", json.dumps(d))
    sys.exit(print("SIGNED_IN"))
dec, i, last = json.JSONDecoder(), 0, {}
while (m := re.compile(r"\{").search(err, i)):
    try: o, i = dec.raw_decode(err, m.start()); last = o if isinstance(o, dict) and "error" in o else last
    except ValueError: i = m.start() + 1
if last:
    e = last["error"] if isinstance(last["error"], dict) else {}
    sys.exit(print("LOGIN_FAILED", e.get("code") or "?", re.sub(r"https://\S+", "<link>", e.get("message") or "")[:200]))
links = re.findall(r"^Approve this request in OpenKey: (https://\S+)", err, re.M)
print("APPROVE_LINK", links[-1]) if links else print("NO_LINK_YET")
PY
```

- `APPROVE_LINK <link>` → send the owner this one line with that exact link (never retype or shorten it). If you already sent this link, don't send it again.

  > Open this link and approve; tell me when you're done: <link>

- `NO_LINK_YET` → the command hasn't printed its link yet: run the check again in a few seconds.
- `SIGNED_IN` → go to §3. A `NOT_GRANTED <entry>` line means the owner left that permission out: tell them which. Without `xyz.tinycloud.share/shares/`, links fail.

When the owner says they're done, run the check again:

- `SIGNED_IN` → go to §3.
- `APPROVE_LINK` again → the approval hasn't arrived yet. If the sign-in command is still running, run the check again in a few seconds; if it still shows the link, ask the owner whether they pressed Approve on that link. If the command stopped (a tool timeout, a restart), start the sign-in block again the same way: it resumes the same pending link. Don't resend a link you already sent.
- `LOGIN_FAILED APPROVAL_REQUEST_EXPIRED`, `APPROVAL_RESULT_EXPIRED`, `APPROVAL_REQUEST_NOT_FOUND` or `APPROVAL_RESULT_NOT_FOUND` (exit 3) → the link expired before it was approved (about 1 hour), or the approval wasn't collected within 10 minutes. Run the sign-in block again and send the new link with the same line.
- `LOGIN_FAILED APPROVAL_REQUEST_UNAVAILABLE`, `APPROVAL_RESULT_UNAVAILABLE` or `APPROVAL_ACK_PENDING` (exit 8) → OpenKey couldn't be reached for a moment. Wait a minute and start the sign-in block again, at most three times in a row; it resumes the same request. Don't resend a link you already sent. The check prints the CLI's message after the code.
  - If each of those says `APPROVAL_REQUEST_UNAVAILABLE` with `(HTTP 400)`: the link expired before it was approved, and this CLI keeps asking OpenKey for it. Before `auth logout`, make sure none of your own `tinycloud` commands for that profile is still running (stop any background sign-in you started): a command still waiting on a link would be orphaned. Run the block below, which runs `"$TC_BIN" --profile "$PROFILE" auth logout` on the sign-in profile, then start the sign-in block again and send the new link with the same line, as for `APPROVAL_REQUEST_EXPIRED` above. Never edit or delete the CLI's files yourself.

    ```sh
    { set +x; } 2>/dev/null; set +e; umask 077
    ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
    if [ -r "$ENV_HELPER" ]; then
      [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
    fi
    [ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
    PROFILE=publisher   # unless the owner names another profile
    "$TC_BIN" --profile "$PROFILE" auth logout < /dev/null
    ```

  - Otherwise: stop and report the code; don't retry.
- `LOGIN_FAILED APPROVAL_RESULT_ACKNOWLEDGED` (exit 8) → the sign-in may already be saved: run the session check at the top of §2 again.
- `LOGIN_FAILED SESSION_IN_USE` → ask the owner; never add `--replace-session` on your own.
- Any other `LOGIN_FAILED <code>` → report the code; don't retry.

**Renewing.** Renew by running the §2 sign-in again (the same profile). Don't use `--replace-session`.

## 3. Publish — run exactly this block

Publish only after the owner said yes to "Anyone with the link can open it. Make a link?" (see "Ask before making a link"), and don't publish anything else meanwhile.

Always pass `--expires` — 24h unless the owner says otherwise — and always tell the owner the expiry. `SESSION_LIFETIME_EXCEEDED` handling: see the error table below.

**HTML files:** run the HTML check (end of this file) first. If it doesn't print `SELF_CONTAINED`, stop and ask the owner before publishing.

**File names:** a name with spaces, `..`, or characters other than letters, digits, `.`, `_` and `-` is stored under a readable safe name that keeps the extension (`Q3 plan (draft).md` → `Q3-plan-draft.md`); the link shows that stored name.

Run EXACTLY this block; do not write your own `share publish` command.

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # unless the owner names another profile
FILE='<absolute path of the file>'
EXPIRES=24h

rm -f "$STATE/publish.json" "$STATE/publish.err" "$STATE/last-url"
if "$TC_BIN" --profile "$PROFILE" share publish "$FILE" --to anyone --expires "$EXPIRES" --json \
     > "$STATE/publish.json" 2>"$STATE/publish.err" && [ -s "$STATE/publish.json" ]; then
  id=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["metadata"]["shareId"])' "$STATE/publish.json")
  echo "PUBLISHED link share id $id file $(basename "$FILE") expires $EXPIRES"
  "$TC_BIN" --profile "$PROFILE" share show "$id" --reveal-link \
    | python3 -c 'import json,sys;link=json.load(sys.stdin)["link"];open(sys.argv[1],"w").write(link)' "$STATE/last-url" 2>/dev/null \
    && echo LINK_SAVED || echo REVEAL_FAILED
else
  code=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("error",{}).get("code","?"))' "$STATE/publish.err" 2>/dev/null)
  rm -f "$STATE/publish.json" "$STATE/last-url"; echo "PUBLISH_FAILED: ${code:-?}"
fi
```

On `PUBLISH_FAILED`, stop and use the errors table. Record the share id and file name — never the URL. `--reveal-link` already prints JSON with `.link`; never combine it with `--json` (`INVALID_ARGUMENT`).

## 4. Verify — always, before reporting

Receive and hash; `receive`'s status is checked, so a failure can't pass:

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
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

## 5. Lifecycle — one block per action

`share list --json` is sender history (fields `shareId`, `target`, `expiresAt`, `revoked`); filter it before calling anything "active". Link share ids are CIDs (`bafkr4…`).

**List active shares:**

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # unless the owner names another profile

"$TC_BIN" --profile "$PROFILE" share list --json | python3 -c 'import json,sys,datetime
now = datetime.datetime.now(datetime.timezone.utc)
for s in json.load(sys.stdin)["shares"]:
    exp = datetime.datetime.fromisoformat(s["expiresAt"].replace("Z", "+00:00"))
    if not s.get("revoked") and exp > now:
        print(s["shareId"], s["target"], s["expiresAt"])'
```

**Reveal a share's link again** (into the state file, for delivery per §6):

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # unless the owner names another profile
id='<share id you recorded>'

rm -f "$STATE/last-url"
"$TC_BIN" --profile "$PROFILE" share show "$id" --reveal-link \
  | python3 -c 'import json,sys;link=json.load(sys.stdin)["link"];open(sys.argv[1],"w").write(link)' "$STATE/last-url" 2>/dev/null \
  && echo LINK_SAVED || echo REVEAL_FAILED
```

**Revoke a share:**

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # unless the owner names another profile
id='<share id you recorded>'

"$TC_BIN" --profile "$PROFILE" share revoke "$id"
```

Afterwards `share show "$id"` reports `"revoked": true`, and the link stops opening (`SHARE_REVOKED`). Copies already downloaded can't be recalled, and the stored file stays in the owner's space until deleted.

## 6. Deliver and report

Report with this template — fill in the placeholders, keep the revocation sentence as written, and put the URL last:

> Published `<file>` as a link. Anyone holding the link can open it without signing in. It expires `<date>`, and I can revoke it any time before then. Verified: hash match. `<URL>`

Give the owner the link in your reply, ready to forward, with the expiry. Never write steps for the owner to carry out (no "copy this and send it to…"): you send it, or you hand over the link. Don't message anyone else through any other channel yourself.

**If the owner's channel is a command** (for example an HTTP send endpoint), build the message from the state file and pipe it in — the link never passes through your output. Adapt the JSON shape and the send command to the channel:

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null

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
umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null

cat "$STATE/last-url"
```

**Last step, always — clean up:**

```sh
umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null

rm -f "$STATE/last-url" "$STATE/received" "$STATE/receive.err" "$STATE/publish.json" "$STATE/publish.err" \
      "$STATE/context.json" "$STATE/context.err" "$STATE/share-publishing.json" "$STATE/login.out" "$STATE/login.err"
```

## Errors — `{"error":{"code","message","hint"?}}` on stderr; Commander option errors are plain text

Branch on `code`, never on the exit status alone — exits 4, 5 and 6 each cover several errors. Report the code and the CLI's message; never relay raw server text.

| Code | Exit | Action |
|---|---|---|
| `AUTH_REQUIRED` | 3 | Session expired/invalid — return to §2 on the same profile (ignore the CLI's own `auth login`/`init` hint) |
| `PERMISSION_DENIED` | 5 | Scope lacks the publishing permission — return to §2 once. If the new session gets the same error, stop and report; don't ask the owner to approve again |
| `SESSION_LIFETIME_EXCEEDED` | 2 | Two cases, told apart by the message. **"requested share lifetime exceeds session expiry"** → the share would outlive the login: use a SHORTER `--expires` (session end minus 1 hour), never a longer one. If the session has under 1 hour left, tell the owner the login is about to end and ask them to renew the sign-in (see "Renewing" in §2). **"share expiry must be at least 60 seconds from now"** → use the smallest allowed value (`2m`), never beyond the session end minus 1 hour. |
| `INVALID_EXPIRY` | 2 | `--expiry` outside 1 m–30 d |
| `INVALID_ARGUMENT` | 2 | Bad option combination or missing input file — fix the command. |
| `SESSION_IN_USE` | 2 | Live session would narrow — ask the owner; never `--replace-session` unprompted |
| `ORIGIN_MISMATCH` | 2 publish / 5 receive | Share origin vs configured service — check host/viewer-origin config, not re-login |
| `EXPIRED` / `NOT_FOUND` | 4 | The share expired or the id is wrong |
| `UNAVAILABLE` | 4 | Nothing was shared. If the message contains "not available in this release": that kind of share isn't available yet — tell the owner in one line, and don't retry. Otherwise (the location registry or the network couldn't be reached): report the CLI's message and suggest trying again later. Never retry in a loop |
| `REGISTRY_REJECTED` | 6 | The registry refused the owner's location record — retrying won't help; report it |
| `STORAGE_QUOTA_EXCEEDED` / `STORAGE_LIMIT_REACHED` | 10 | The owner's TinyCloud storage is full, or this file is larger than what is left. Nothing was shared. Tell the owner and point them to https://account.tinycloud.xyz/storage; don't retry and don't run §2 |
| `UPLOAD_FAILED` | 4 | The source upload failed; nothing was shared. Retry once shortly, then report |
| `PROFILE_NOT_FOUND` | 1 | No profile yet — the only case where `init` runs |
| `PROFILE_EXISTS` | 1 | `init` on an existing profile — use it; never `profile delete` |
| `APPROVAL_REQUEST_EXPIRED` / `APPROVAL_RESULT_EXPIRED` / `APPROVAL_REQUEST_NOT_FOUND` / `APPROVAL_RESULT_NOT_FOUND` | 3 | The sign-in link expired, or the approval wasn't collected in time — run the §2 sign-in again and send the new link |
| `APPROVAL_REQUEST_UNAVAILABLE` / `APPROVAL_RESULT_UNAVAILABLE` / `APPROVAL_ACK_PENDING` | 8 | OpenKey couldn't be reached for a moment — wait a minute and start the §2 sign-in again, at most three times in a row; it resumes the same link. If each says `APPROVAL_REQUEST_UNAVAILABLE` with `(HTTP 400)`, run the §2 `auth logout` block, then sign in again and send the new link; otherwise stop and report |
| `APPROVAL_RESULT_INVALID` | 5 | OpenKey's answer didn't match this request — report; don't retry |
| `PROFILE_STATE_INCONSISTENT` | 1 | Corrupt local profile state — report; don't delete the profile |

## HTML

`.html`/`.htm` renders in a sandboxed, opaque-origin frame: scripts run but can't reach the viewer, cookies, storage or the link fragment, and external resources are blocked.

Before publishing HTML, check that it is self-contained. Any `src`, `href` or CSS `url()` whose value isn't a `data:` URI or a `#` fragment counts as external — absolute, protocol-relative (`//cdn…`) and relative (`app.js`) references all fail to load in the viewer:

```sh
umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
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

**If it prints anything other than `SELF_CONTAINED`, do not publish.** Tell the owner which resources will break (the flagged lines) and ask which they want: you inline the resources (data URIs, inline `<style>`/`<script>`) and re-check, or you publish it as-is. Publish an unchanged file only after the owner explicitly says to publish anyway.

Markdown renders (headings, lists, bold, tables), and so do Mermaid diagrams; one that can't render shows its source. See `QUICKSTART.md` for the walkthrough and what the owner sees when they open the approval link.
