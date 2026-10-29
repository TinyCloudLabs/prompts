---
name: tc-publish
description: Publish a document or HTML page to TinyCloud and return a shareable link. Use when the owner asks the agent to publish, share, or host a file — private owner-only links, public bearer links, verification, and lifecycle.
metadata:
  version: "0.6.0"
---

# Publish documents and HTML with `tinycloud share`

Publish a file from the owner's TinyCloud space and return a link. Publishing has its own profile, `publisher`, on the owner's `default` space, and its own single approval: the owner approves one OpenKey link and sends back the code. No passwords, no keys.

Requires `@tinycloud/cli` **1.5.0-beta.22 or newer**: from that release the built-in publishing permission includes the decryption owner-only links need, in one sign-in. The §1 feature probe checks the sign-in flags. It can't tell beta.20 or beta.21 from beta.22, so also read the version it prints: on older versions, owner-only links fail; ask the owner to update the CLI through https://agents.tinycloud.xyz/agent.

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
PROFILE=publisher   # this skill's own profile, on the owner's default space
```

Run each block as one tool call. Replace every `'<…>'` placeholder before running. Every block uses `--profile "$PROFILE"`.

## Handling contract — applies to every step

- Everything after `#` in any share URL is a credential: `#tc1=…` on public links, `#v=2&p=…` on owner-only links.
- A full share URL may appear only in: the CLI command's own output; a 0600 file inside the 0700 `$STATE` directory; the tool output of the single read used to deliver it (the harness's own storage of that output is allowed); and one message to the owner in their 1:1 channel.
- **Never retype, reassemble, or chunk a link.** Public links are about 2.6 KB and owner-only links about 16.7 KB; a hand-copied link corrupts. If the owner's channel is a command, pipe the link from the state file into it (§6) so it never passes through your output. If the only channel is your reply, read the file once in a single tool call and copy it verbatim.
- Never put a share link in notes, memory, the journal, summaries, other files, commits, group chats or other tools.
- If a request comes from a group chat, send the link to the owner privately and say so in the group.

## Choosing the link type

With no audience named, make an owner-only link (only you). Make a public link only when the owner's current request explicitly asks for one. Never decide on your own that content is shareable; if unsure, ask.

Address owner-only links with `--to "email:$TC_SHARE_TO"`, where `TC_SHARE_TO` is the person who may open the link. Never guess it:

- the owner named an address in the request → use exactly that address;
- the owner asked for a link for themselves → use `$TC_OWNER_EMAIL`; if it is unset, ask the owner;
- anything else ("send it to the team", a name with no address) → ask the owner who should open it.

Never use a public link as a substitute for a private one, unless the owner replied "Yes, make an open link" to the choice in "When decryption is missing". The CLI lowercases the whole address and refuses an invalid one before publishing anything (`INVALID_ARGUMENT` "recipient email is invalid" / "recipient email domain is invalid") — ask the owner for the correct address.

**When decryption is missing.** Use these messages on `DECRYPT_DECLINED`, or on `PERMISSION_DENIED` for an owner-only or email link.

**Named email:**

> I can't create a link that only {email} can open with the access you approved, because it doesn't include decryption. Three ways:
> 1. Approve again and leave decryption ticked in OpenKey. Reply "Approve again".
> 2. Open https://share.tinycloud.xyz as yourself and share it with {email} there. It emails them the invitation.
> 3. I make a link that anyone who has it can open, and you send it to them. Reply "Yes, make an open link".

**Only you:**

> I can't create a link that only you can open with the access you approved, because it doesn't include decryption. Three ways:
> 1. Approve again and leave decryption ticked in OpenKey. Reply "Approve again".
> 2. Open https://share.tinycloud.xyz and share it with yourself there.
> 3. I make a link that anyone who has it can open. Reply "Yes, make an open link".

On "Approve again", run the §2 sign-in again, on the same profile.

**A `did:` or `domain:` recipient:** say:

> I can share with an email address, with only you, or as an open link. For other kinds of recipients, share from https://share.tinycloud.xyz.

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
PROFILE=publisher   # this skill's own profile, on the owner's default space

if [ -z "$TC_BIN" ]; then echo "TC_NOT_FOUND: no TinyCloud CLI; install it from https://agents.tinycloud.xyz/publish or set TC_BIN"
elif "$TC_BIN" auth login --help | grep -q -- '--paste' \
  && "$TC_BIN" auth login --help | grep -q -- '--owner'; then echo CLI_OK
else echo STALE; fi
[ -z "$TC_BIN" ] || "$TC_BIN" --version
[ -n "${TC_OWNER_EMAIL:-}" ] && echo OWNER_EMAIL_OK || echo OWNER_EMAIL_UNSET
```

If the block prints `TC_NOT_FOUND`, `STALE` or `OWNER_EMAIL_UNSET`, follow https://agents.tinycloud.xyz/agent for `NEEDS_SETUP`, then return to this same task. Never publish publicly as a fallback.

## 2. Sign in once: the `publisher` profile

Shares live in the owner's `default` space, so publishing has its own profile, `publisher`, and its own single approval, separate from onboarding. Start ONE sign-in and wait for it to finish; never start a second while one is running.

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
PROFILE=publisher   # this skill's own profile, on the owner's default space

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
- `SESSION: missing` / `expired` / `unknown-expiry` → run the sign-in below. `init --key-only` above only made the profile's key; say nothing to the owner about it.
- `SETUP_FAILED` → stop and report. Never run `profile delete`.

**The sign-in.** One OpenKey approval, for up to 30 days, with the decryption that owner-only and email links need. It names the owner's account with `--owner`, taken from this profile if it has signed in before, else from `TC_OWNER_DID`, else from the owner's TinyCloud sign-in on this computer (the profile [/onboarding](https://agents.tinycloud.xyz/onboarding) set up). Call 1 prints the approval link and stops with `PASTE_CODE_MISSING`, which is expected:

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # this skill's own profile, on the owner's default space

OWNER_DID=$("$TC_BIN" --profile "$PROFILE" auth status --json 2>/dev/null | python3 -c 'import json,sys;print((json.load(sys.stdin).get("ownerDid") or "").split("#")[0])' 2>/dev/null)
[ -n "$OWNER_DID" ] || OWNER_DID=${TC_OWNER_DID:-}
[ -n "$OWNER_DID" ] || OWNER_DID=$("$TC_BIN" context --json 2>/dev/null | python3 -c 'import json,sys;print((json.load(sys.stdin).get("ownerDid") or "").split("#")[0])' 2>/dev/null)
rm -f "$STATE/login.err"
if ! printf '%s\n' "$OWNER_DID" | grep -qE '^did:pkh:eip155:[1-9][0-9]*:0x[0-9a-fA-F]{40}$'; then
  echo "OWNER_DID_UNSET"
else
  timeout 60 "$TC_BIN" --profile "$PROFILE" auth login --method openkey --paste --manifest builtin:share-publishing --owner "$OWNER_DID" --expiry 30d < /dev/null > /dev/null 2> "$STATE/login.err"
  url=$(grep -E '^[[:space:]]*https://[^[:space:]]+[[:space:]]*$' "$STATE/login.err" | head -1 | tr -d '[:space:]')
  [ -n "$url" ] && echo "APPROVE_URL: $url" || { echo NO_URL; sed -E 's#https://[^ ]+#<link>#g' "$STATE/login.err" | head -3; }
fi
rm -f "$STATE/login.err"
```

- `APPROVE_URL: <link>` → send the owner this one line, with the link, and wait for their reply:

  > Open this link and approve so I can publish for you, then send me the code OpenKey shows: {link}

- `OWNER_DID_UNSET` → TinyCloud isn't set up on this computer yet: follow https://agents.tinycloud.xyz/onboarding in this conversation, then come back to this same task at §2.
- `NO_URL` → report it; don't retry in a loop.

Call 2, with the code exactly as the owner sent it:

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # this skill's own profile, on the owner's default space

OWNER_DID=$("$TC_BIN" --profile "$PROFILE" auth status --json 2>/dev/null | python3 -c 'import json,sys;print((json.load(sys.stdin).get("ownerDid") or "").split("#")[0])' 2>/dev/null)
[ -n "$OWNER_DID" ] || OWNER_DID=${TC_OWNER_DID:-}
[ -n "$OWNER_DID" ] || OWNER_DID=$("$TC_BIN" context --json 2>/dev/null | python3 -c 'import json,sys;print((json.load(sys.stdin).get("ownerDid") or "").split("#")[0])' 2>/dev/null)
rm -f "$STATE/login.json" "$STATE/login.err"
printf '%s\n' '<the code>' | timeout 120 "$TC_BIN" --profile "$PROFILE" auth login --method openkey --paste --manifest builtin:share-publishing --owner "$OWNER_DID" --expiry 30d > "$STATE/login.json" 2> "$STATE/login.err"
python3 - "$?" "$STATE/login.json" "$STATE/login.err" <<'PY'
import json, re, sys
rc, out, err = int(sys.argv[1]), sys.argv[2], sys.argv[3]
if rc == 124: sys.exit(print("LOGIN_TIMEOUT"))
text = open(err, errors="replace").read()
try: signed = bool(json.load(open(out)).get("authenticated"))
except Exception: signed = False
if signed:
    lines, declined = text.splitlines(), []
    for k, l in enumerate(lines):
        if "Not granted in this session:" in l:
            for m in lines[k + 1:]:
                if m.strip() and m[:1].isspace(): declined.append(m.strip())
                else: break
            break
    for d in declined: print("NOT_GRANTED", d)
    sys.exit(print("DECRYPT_DECLINED") if any("tinycloud.encryption" in d for d in declined) else print("SIGNED_IN"))
dec, i, last = json.JSONDecoder(), 0, {}
while (m := re.compile(r"\{").search(text, i)):
    try: o, i = dec.raw_decode(text, m.start()); last = o if isinstance(o, dict) and "error" in o else last
    except ValueError: i = m.start() + 1
e = last.get("error") or {}
msg = e.get("message") or ""
if re.search(r"not found|expired", msg, re.I) and re.search(r"code", msg, re.I): sys.exit(print("CODE_EXPIRED"))
print("LOGIN_FAILED", e.get("code") or f"exit-{rc}", re.sub(r"https://\S+", "<link>", msg)[:200])
PY
rm -f "$STATE/login.json" "$STATE/login.err"
```

- `SIGNED_IN` → go to §3: for a named email address run the owner-only block with `NOTIFY=--notify`; for "only you" with `NOTIFY` empty. A `NOT_GRANTED <entry>` line means the owner left that permission out: tell them which.
- `DECRYPT_DECLINED` → public links still work; for an owner-only or email link, give the owner the choice in "When decryption is missing".
- `CODE_EXPIRED` → each code works once and expires after 5 minutes. Run call 1 again, send the new link, and ask for the new code.
- `LOGIN_TIMEOUT` or `LOGIN_FAILED <code>` → report the error code and ask the owner to send their code again, then run call 2 again. If it fails a second time, stop and report.

**Renewing.** The sign-in lasts up to 30 days. When it ends (`AUTH_REQUIRED`, or `SESSION_ENDING` in §3), run the §2 sign-in again on the same profile. Don't use `--replace-session`.

## 3. Publish — run exactly one of the two blocks

Publish with `--to anyone` for a named recipient or an "only you" link only after the owner replies "Yes, make an open link". Never turn either into an open link on your own, and don't publish anything else meanwhile.

Always pass `--expires` — owner-only: the session's remaining lifetime minus 1 h, computed by the owner-only block (`6d` only if the session's expiry can't be read); public: 24h — unless the owner says otherwise — and always tell the owner the expiry. `SESSION_LIFETIME_EXCEEDED` handling: see the error table below.

**HTML files:** run the HTML check (end of this file) first. If it doesn't print `SELF_CONTAINED`, stop and ask the owner before publishing.

**File names:** a name with spaces, `..`, or characters other than letters, digits, `.`, `_` and `-` is stored under a readable safe name that keeps the extension (`Q3 plan (draft).md` → `Q3-plan-draft.md`). Public links show that stored name; owner-only links show the original. Don't rename or copy the owner's file yourself.

**Owner-only** — set `TC_SHARE_TO` by the rule in "Choosing the link type"; the block publishes nothing while it is empty:

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
PROFILE=publisher   # this skill's own profile, on the owner's default space
FILE='<absolute path of the file>'
EXPIRES=6d          # fallback only when the session has no expiresAt
SESSION_END=$("$TC_BIN" --profile "$PROFILE" context --json 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin).get("session",{}).get("expiresAt") or "")' 2>/dev/null)
[ -n "$SESSION_END" ] && EXPIRES=$(python3 -c 'import sys,datetime as d;e=d.datetime.fromisoformat(sys.argv[1].replace("Z","+00:00"));m=int((e-d.datetime.now(d.timezone.utc)).total_seconds()//60)-60;print(f"{m}m" if m>=2 else "")' "$SESSION_END" 2>/dev/null)
NOTIFY=             # NOTIFY=--notify when the owner named an email address; leave it empty for "only you"
TC_SHARE_TO=        # REQUIRED: the address the owner named; $TC_OWNER_EMAIL only if the owner asked for a link for themselves. Never guess.

rm -f "$STATE/publish.json" "$STATE/publish.err" "$STATE/last-url"
if [ -z "$EXPIRES" ]; then
  echo "SESSION_ENDING: about 1 h or less of session left; renew it (§2 Renewing) before publishing"
elif [ -z "$TC_SHARE_TO" ]; then
  echo "RECIPIENT_UNSET: ask the owner who should be able to open it"
else
  "$TC_BIN" --profile "$PROFILE" share publish "$FILE" --to "email:$TC_SHARE_TO" --expires "$EXPIRES" $NOTIFY --json \
    > "$STATE/publish.json" 2>"$STATE/publish.err"; rc=$?
  if { [ "$rc" = 0 ] || [ "$rc" = 9 ]; } && [ -s "$STATE/publish.json" ]; then
    id=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["metadata"]["shareId"])' "$STATE/publish.json")
    echo "PUBLISHED owner-only share id $id file $(basename "$FILE") recipient $TC_SHARE_TO expires $EXPIRES"
    [ "$rc" = 9 ] && echo "INVITE_NOT_SENT"
    "$TC_BIN" --profile "$PROFILE" share show "$id" --reveal-link \
      | python3 -c 'import json,sys;link=json.load(sys.stdin)["link"];open(sys.argv[1],"w").write(link)' "$STATE/last-url" 2>/dev/null \
      && echo LINK_SAVED || echo REVEAL_FAILED
  else
    code=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("error",{}).get("code","?"))' "$STATE/publish.err" 2>/dev/null)
    rm -f "$STATE/publish.json" "$STATE/last-url"; echo "PUBLISH_FAILED: ${code:-?}"
  fi
fi
```

**Public — only if the owner explicitly asked:**

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
PROFILE=publisher   # this skill's own profile, on the owner's default space
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

On `PUBLISH_FAILED`, stop and use the errors table. If the CLI exits 9, the block prints `INVITE_NOT_SENT`: the share was created, but the invitation email wasn't sent. Don't publish again: verify (§4), give the owner the link (§6) and tell the owner no invite went out. Record the share id, file name and link type — never the URL. `--reveal-link` already prints JSON with `.link`; never combine it with `--json` (`INVALID_ARGUMENT`).

## 4. Verify — always, before reporting

**Public links** — receive and hash; `receive`'s status is checked, so a failure can't pass:

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # this skill's own profile, on the owner's default space
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
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # this skill's own profile, on the owner's default space
FILE='<absolute path of the file>'
TC_SHARE_TO=        # the same address the publish block used

rm -f "$STATE/inspect.json" "$STATE/show.json"
[ -s "$STATE/last-url" ] && [ -s "$STATE/publish.json" ] \
  && "$TC_BIN" --profile "$PROFILE" share inspect - --json < "$STATE/last-url" > "$STATE/inspect.json" \
  && id=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["metadata"]["shareId"])' "$STATE/publish.json") \
  && "$TC_BIN" --profile "$PROFILE" share show "$id" > "$STATE/show.json" \
  && python3 - "$STATE/inspect.json" "$STATE/publish.json" "$STATE/show.json" "$(basename "$FILE")" "$TC_SHARE_TO" <<'PY' || echo MISMATCH
import json, sys, datetime, unicodedata
ins, pub, show = (json.load(open(p)) for p in sys.argv[1:4])
base, recipient = sys.argv[4], sys.argv[5]
t = lambda s: int(datetime.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())
m, p = ins["metadata"], pub["metadata"]
ok = (m["target"]["kind"] == "email"
      and m["shareId"] == p["shareId"]
      and m["resource"]["path"] == p["resource"]["path"]
      and unicodedata.normalize("NFC", (m.get("display") or {}).get("filename") or "") == unicodedata.normalize("NFC", base)
      and t(m["expiresAt"]) == t(p["expiresAt"])
      and ins["link"]["kind"] == "policy"
      and show.get("recipient") == recipient.strip().lower())
print("VERIFIED" if ok else "MISMATCH")
PY
```

## 5. Lifecycle — one block per action

`share list --json` is sender history (fields `shareId`, `target`, `expiresAt`, `revoked`); filter it before calling anything "active". Public share ids are CIDs (`bafkr4…`); owner-only ids are 32 hex characters.

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
PROFILE=publisher   # this skill's own profile, on the owner's default space

"$TC_BIN" --profile "$PROFILE" share list --json | python3 -c 'import json,sys,datetime
now = datetime.datetime.now(datetime.timezone.utc)
for s in json.load(sys.stdin)["shares"]:
    exp = datetime.datetime.fromisoformat(s["expiresAt"].replace("Z", "+00:00"))
    if not s.get("revoked") and exp > now:
        print(s["shareId"], s["target"], s["expiresAt"])'
```

**Reveal a public share's link again** (into the state file, for delivery per §6):

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # this skill's own profile, on the owner's default space
id='<public share id you recorded>'

rm -f "$STATE/last-url"
"$TC_BIN" --profile "$PROFILE" share show "$id" --reveal-link \
  | python3 -c 'import json,sys;link=json.load(sys.stdin)["link"];open(sys.argv[1],"w").write(link)' "$STATE/last-url" 2>/dev/null \
  && echo LINK_SAVED || echo REVEAL_FAILED
```

**Revoke an owner-only share:**

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # this skill's own profile, on the owner's default space
id='<owner-only share id you recorded>'

"$TC_BIN" --profile "$PROFILE" share revoke "$id"
```

Afterwards `share show "$id"` reports `"revoked": true`.

**Public (bearer) links can be revoked too.** Revoke any share with `tinycloud share revoke <id>`; after that the link stops opening (`SHARE_REVOKED`). Copies already downloaded can't be recalled, and the stored file stays in the owner's space until deleted.

## 6. Deliver and report

Report with the template for the link type — fill in the placeholders, keep the revocation sentence as written, and put the URL last:

> **Owner-only:** Published `<file>` as an owner-only link. Only `<recipient email>` can open it: the viewer emails them an 8-digit code, then shows the file as "Verified sender". It expires `<date>`, and I can revoke it any time before then. Verified: inspect matched. `<URL>`

> **Owner-only, invitation sent:** Published `<file>` and TinyCloud emailed `<recipient email>` the invitation. Only they can open it: the viewer emails them an 8-digit code, then shows the file as "Verified sender". It expires `<date>`, and I can revoke it any time before then. Verified: inspect matched. `<URL>`

> **Public:** Published `<file>` as a public link. Anyone holding the link can open it without signing in. It expires `<date>`, and I can revoke it any time before then. Verified: hash match. `<URL>`

The invitation has gone to the recipient, so there's nothing for the owner to forward; the link at the end is for the owner's own record. When no invitation is sent ("only you", a public or open link, or the CLI exits 9 and prints `INVITE_NOT_SENT`: the share exists, but the invitation didn't go out, so give the owner the link), give the owner the link in your reply, ready to forward, with the recipient and the expiry. Never write steps for the owner to carry out (no "copy this and send it to…"): you send it, or you hand over the link. Don't message the recipient through any other channel yourself.

For "only you", say: "Here's your link. Only your email address can open it; you'll get a one-time code there when you open it. It expires `<date>`, and I can revoke it any time before then." and put the URL last.

For owner-only HTML, add: "It downloads as a file rather than rendering in the viewer."

After `INVITE_NOT_SENT`, add: "The invitation email couldn't be sent."

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
PROFILE=publisher   # this skill's own profile, on the owner's default space

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
PROFILE=publisher   # this skill's own profile, on the owner's default space

cat "$STATE/last-url"
```

**Last step, always — clean up:**

```sh
umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # this skill's own profile, on the owner's default space

rm -f "$STATE/last-url" "$STATE/received" "$STATE/receive.err" "$STATE/publish.json" "$STATE/publish.err" \
      "$STATE/inspect.json" "$STATE/show.json" "$STATE/context.json" "$STATE/context.err"
```

## Errors — `{"error":{"code","message","hint"?}}` on stderr; Commander option errors are plain text

Branch on `code`, never on the exit status alone — exits 4, 5 and 6 each cover several errors. Report the code and the CLI's message; never relay raw server text.

| Code | Exit | Action |
|---|---|---|
| `AUTH_REQUIRED` | 3 | Session expired/invalid — run the §2 sign-in again on the same profile (ignore the CLI's own `init`/`enable share` hint) |
| `PERMISSION_DENIED` | 5 | On an owner-only or email link: the sign-in lacks decryption. Don't retry: give the owner the choice in "When decryption is missing". Otherwise: scope lacks the publishing permission — run the §2 sign-in once. If the same error comes back, stop and report; don't ask the owner to approve again |
| `SESSION_LIFETIME_EXCEEDED` | 2 | Two cases, told apart by the message. **"requested share lifetime exceeds session expiry"** → the share would outlive the session: use a SHORTER `--expires` (session end minus 1 hour), never a longer one. If the session has under 1 hour left, tell the owner it is about to end and renew it (see "Renewing" in §2). **"share expiry must be at least 60 seconds from now"** → use the smallest allowed value (`2m`), never beyond the session end minus 1 hour. |
| `INVALID_EXPIRY` | 2 | `--expiry` outside 1 m–30 d |
| `INVALID_ARGUMENT` | 2 | Bad option combination or missing input file — fix the command. "recipient email is invalid" / "recipient email domain is invalid" → nothing was published; ask the owner for the correct address. |
| `CLAIM_REQUIRED` | 6 | Expected on `receive` of an owner-only link — use `inspect` |
| `UNSUPPORTED_LINK` | 2 | `inspect` on a public link — verify by `receive` + hash instead |
| `ORIGIN_MISMATCH` | 2 publish / 5 receive | Share origin vs configured service — check host/viewer-origin config, not re-login |
| `EXPIRED` / `NOT_FOUND` | 4 | The share expired or the id is wrong |
| `UNAVAILABLE` | 4 | Location registry or network unreachable — nothing was shared; retry shortly |
| `REGISTRY_REJECTED` | 6 | The registry refused the owner's location record — retrying won't help; report it |
| `STORAGE_QUOTA_EXCEEDED` / `STORAGE_LIMIT_REACHED` | 10 (4 on CLIs before the TC-625 release) | The owner's TinyCloud storage is full, or this file is larger than what is left. Newer CLIs include the account's used and plan sizes. Nothing was shared. Tell the owner and point them to https://account.tinycloud.xyz/storage; don't retry and don't run §2 |
| `UPLOAD_FAILED` | 4 | The source upload failed; nothing was shared. Retry once shortly, then report |
| exit 9, "partial share success" | 9 | The share exists but the invitation email wasn't sent — expected on CLIs before `1.0.1-beta.0` (TC-571). The owner-only block prints `PUBLISHED`, then `INVITE_NOT_SENT`. Don't publish again; verify, give the owner the link (§6) and tell the owner no invite went out |
| `PROFILE_NOT_FOUND` | 1 | No `publisher` profile yet — run §2, which creates it; never `profile delete` |
| `PASTE_CODE_MISSING` | 3 | Expected from §2 call 1: it printed the approval link. Send it and wait for the code |
| `OPENKEY_UNREACHABLE` | 6 | OpenKey unreachable — report, retry later |
| `SCOPE_REJECTED` | 5 | Manifest rejected — report; don't retry the same request |
| `PROFILE_STATE_INCONSISTENT` | 1 | Corrupt local profile state — report; don't delete the profile |

## HTML

Public `.html`/`.htm` renders in a sandboxed, opaque-origin frame: scripts run but can't reach the viewer, cookies, storage or the link fragment, and external resources are blocked. Owner-only HTML links download rather than render — say so in the report.

Before publishing HTML, check that it is self-contained. Any `src`, `href` or CSS `url()` whose value isn't a `data:` URI or a `#` fragment counts as external — absolute, protocol-relative (`//cdn…`) and relative (`app.js`) references all fail to load in the viewer:

```sh
umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # this skill's own profile, on the owner's default space
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

Markdown renders (headings, lists, bold, tables), and so do Mermaid diagrams; one that can't render shows its source. See `QUICKSTART.md` for the walkthrough and what the owner sees.
