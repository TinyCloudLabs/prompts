---
name: tc-secrets
description: Read API keys and other secrets the owner keeps in TinyCloud Secrets, without exposing their values. Use when a task needs a credential (for example ELEVENLABS_API_KEY) that the owner stores in TinyCloud, or when the owner asks you to use TinyCloud Secrets instead of env files.
metadata:
  version: "0.2.0"
---

# Read secrets from TinyCloud with `tc secrets`

The owner stores secrets in TinyCloud Secrets (secrets.tinycloud.xyz). You read only the names they approved, through a CLI profile the owner authorizes with OpenKey. You never see, ask for, or store a secret value in the conversation.

Operator-set, never change or unset:
- `TC_BIN`: absolute path to `tc`. `command -v tc` can resolve to `/usr/sbin/tc`.
- `TC_OWNER_DID`: the owner's `did:pkh:eip155:1:0x…`.
- `TC_HOME`: the CLI profile store. Optional.
- `TC_SECRETS_PROFILE`: the profile name. Default `api-keys`.
- `TC_SECRETS_STATE`: this skill's state directory. Default `$HOME/.local/state/tc-secrets`.

## Shell preamble — required

Agent shells may keep or drop variables, options and umask between calls. Every block below starts with this preamble, so run each block exactly as written, as one tool call, after replacing every `'<…>'` placeholder:

```sh
{ set +x; } 2>/dev/null; set +e; umask 077
STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE="${TC_SECRETS_PROFILE:-api-keys}"
NAMES='<SECRET_NAME …>'   # the names this task needs, space-separated, e.g. 'ELEVENLABS_API_KEY'
```

The preamble turns off inherited shell tracing and exit-on-error, keeps new files owner-only, and repairs the modes of reused state files.

## Handling contract — applies to every step

- **Secret values:**
  - A value goes only into the environment or stdin of the one command that uses it.
  - Never print, echo or log it. Never write it into the repository, notes, memory, commits or summaries.
  - Never pass it as a command-line argument: other local users can read process arguments.
- Never run `secrets get` without `--raw` inside a capture: plain `secrets get` prints the value as JSON.
- **Never ask the owner to paste a secret value into the conversation.** A missing secret is added by the owner in Secret Manager.
- **Never enable shell tracing.** Every block here disables it first.
- **Approval link and code:** the link and the code the owner sends back complete one sign-in for this profile.
  - Keep the code only in `$STATE` until the sign-in completes, then delete it.
  - The link may appear only in your one approval message to the owner.
- **Only the owner approves.** Never open the approval link yourself, never approve anything for the owner, and never relay a code you didn't get from the owner.
- **Run only the blocks the task needs, as written.**
  - Don't create, rename or delete profiles beyond §3a's `init`, and never run `profile delete`.
  - Don't improvise extra `tc` commands to "test" access: §2 is the access test.

## 1. Check the CLI

```sh
{ set +x; } 2>/dev/null; set +e; umask 077
STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE="${TC_SECRETS_PROFILE:-api-keys}"

[ -x "$TC_BIN" ] && "$TC_BIN" secrets get --help | grep -q -- '--raw' \
  && "$TC_BIN" auth login --help | grep -q -- '--owner' && echo CLI_OK || echo STALE
"$TC_BIN" --version
printf '%s\n' "${TC_OWNER_DID:-unset}" | grep -qE '^did:pkh:eip155:[0-9]+:0x[0-9a-fA-F]{40}$' && echo OWNER_OK || echo OWNER_UNSET
```

If it prints `STALE` or `OWNER_UNSET`, stop and tell the owner. Never install anything yourself. When the owner only asked you to check the CLI, stop after this block and report what it printed.

## 2. Check access

This checks that the profile belongs to `TC_OWNER_DID`, then reads each name to `/dev/null`:

```sh
{ set +x; } 2>/dev/null; set +e; umask 077
STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE="${TC_SECRETS_PROFILE:-api-keys}"
NAMES='<SECRET_NAME …>'

errcode() { python3 - "$1" <<'PY'
import json, re, sys
t = open(sys.argv[1], errors="replace").read(); dec, i, last = json.JSONDecoder(), 0, {}
while (m := re.compile(r"\{").search(t, i)):
    try: o, i = dec.raw_decode(t, m.start()); last = o if isinstance(o, dict) and "error" in o else last
    except ValueError: i = m.start() + 1
print((last.get("error") or {}).get("code") or "unknown")
PY
}
rm -f "$STATE/context.json" "$STATE/context.err" "$STATE/get.err"
"$TC_BIN" --profile "$PROFILE" context --json < /dev/null > "$STATE/context.json" 2> "$STATE/context.err"
OWNER=$(python3 - "$STATE/context.json" "$TC_OWNER_DID" <<'PY'
import json, sys
try: ctx = json.load(open(sys.argv[1]))
except Exception: print("NO_PROFILE"); sys.exit()
have, want = (ctx.get("ownerDid") or "").split("#")[0], sys.argv[2]
norm = lambda d: d.rsplit(":", 1)[0] + ":" + d.rsplit(":", 1)[-1].lower() if d else ""
print("OWNER_MATCH" if have and norm(have) == norm(want) else "OWNER_UNSET" if not have else "OWNER_MISMATCH " + have)
PY
)
case "$OWNER" in
  NO_PROFILE) for n in $NAMES; do echo "NOT_READABLE $n $(errcode "$STATE/context.err")"; done ;;
  OWNER_MISMATCH*) echo "$OWNER — profile $PROFILE belongs to another account; stop and tell the operator" ;;
  *) for n in $NAMES; do
       timeout 60 "$TC_BIN" --profile "$PROFILE" secrets get "$n" --raw < /dev/null > /dev/null 2> "$STATE/get.err"
       rc=$?
       if [ $rc -eq 0 ]; then echo "READABLE $n"
       elif [ $rc -eq 124 ]; then echo "NOT_READABLE $n TIMEOUT"
       else echo "NOT_READABLE $n $(errcode "$STATE/get.err")"; fi
     done ;;
esac
rm -f "$STATE/context.json" "$STATE/context.err" "$STATE/get.err"
```

- Every name `READABLE` → go to §4.
- `AUTH_REQUIRED`, `PROFILE_NOT_FOUND`, `PERMISSION_DENIED` or `TIMEOUT` → go to §3 with the full list of names the task needs. `TIMEOUT` happens on CLIs before the TC-599 release, which wait instead of failing when the session doesn't cover a name.
- `NOT_FOUND` → the secret doesn't exist yet. Tell the owner to add it in Secret Manager, then run §2 again. Don't start §3 for it.
- `OWNER_MISMATCH` → stop. The profile is signed in to a different account than `TC_OWNER_DID`. Tell the operator. Never switch profiles, log out or replace the session yourself.
- Anything else → see §5.

## 3. Consent — only when §2 says so

**3a. Create the profile if it doesn't exist.** `init` makes the new profile the default for every `tc` command without `--profile` on this machine, so always pass `--profile`.

```sh
{ set +x; } 2>/dev/null; set +e; umask 077
STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE="${TC_SECRETS_PROFILE:-api-keys}"

rm -f "$STATE/context.err"
if "$TC_BIN" --profile "$PROFILE" context --json < /dev/null > /dev/null 2> "$STATE/context.err"; then echo PROFILE_EXISTS
elif grep -q PROFILE_NOT_FOUND "$STATE/context.err"; then "$TC_BIN" init --name "$PROFILE" --key-only < /dev/null > /dev/null 2>&1 && echo PROFILE_CREATED || echo SETUP_FAILED
else echo SETUP_FAILED; fi
rm -f "$STATE/context.err"
```

`SETUP_FAILED` → stop and report. Never run `profile delete`.

**3b. Build the request and check it before anyone signs.** OpenKey's phone-code (device) sign-in can't grant secrets, so this uses the OpenKey approval page, which shows a code at the end. The CLI prints the approval link and, with no code on stdin, stops with `PASTE_CODE_MISSING`. The checker then accepts the link only if it requests exactly:
- read (`tinycloud.kv/get`) on `vault/secrets/<NAME>` in the owner's `secrets` space, for each name;
- decrypt on the owner's default encryption network;
- the permission check (`tinycloud.capabilities/read`) that OpenKey requires.

It also requires this profile's key, this profile's node, no callback and at most 30 days.

```sh
{ set +x; } 2>/dev/null; set +e; umask 077
STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE="${TC_SECRETS_PROFILE:-api-keys}"
NAMES='<SECRET_NAME …>'

rm -f "$STATE/manifest.json" "$STATE/approve.url" "$STATE/login.err" "$STATE/context.json"
python3 - "$STATE/manifest.json" "$TC_OWNER_DID" $NAMES <<'PY'
import json, re, sys
out, owner, names = sys.argv[1], sys.argv[2], sys.argv[3:]
if not re.fullmatch(r"did:pkh:eip155:\d+:0x[0-9a-fA-F]{40}", owner): sys.exit("TC_OWNER_DID is not a did:pkh")
if not names or not all(re.fullmatch(r"[A-Z][A-Z0-9_]*", n) for n in names): sys.exit("secret names must be UPPER_SNAKE")
perms = [{"service": "tinycloud.kv", "path": f"vault/secrets/{n}", "actions": ["get"], "skipPrefix": True} for n in names]
perms.append({"service": "tinycloud.encryption", "path": f"urn:tinycloud:encryption:{owner}:default", "actions": ["decrypt"], "skipPrefix": True})
perms.append({"service": "tinycloud.capabilities", "path": "", "actions": ["read"], "skipPrefix": True})
json.dump({"manifest_version": 1, "app_id": "xyz.tinycloud.agent-secrets", "name": "Agent secret reads",
           "space": "secrets", "permissions": perms}, open(out, "w"))
PY
if [ -s "$STATE/manifest.json" ]; then
  "$TC_BIN" --profile "$PROFILE" context --json < /dev/null > "$STATE/context.json" 2> /dev/null
  timeout 60 "$TC_BIN" --profile "$PROFILE" auth login --method openkey --manifest "$STATE/manifest.json" --paste \
    --owner "$TC_OWNER_DID" --expiry 30d < /dev/null > /dev/null 2> "$STATE/login.err"
  echo "LOGIN_EXIT $?"
else
  echo "BAD_INPUT — fix TC_OWNER_DID or the secret names" > "$STATE/login.err"
fi
python3 - "$STATE/login.err" "$STATE/context.json" "$STATE/approve.url" "$TC_OWNER_DID" $NAMES <<'PY'
import base64, json, re, sys, urllib.parse
if open(sys.argv[1], errors="replace").read().startswith("BAD_INPUT"): sys.exit(print(open(sys.argv[1]).read().strip()))
err_file, ctx_file, out_file, owner, names = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5:]
text = open(err_file, errors="replace").read()
dec, i, last = json.JSONDecoder(), 0, {}
while (m := re.compile(r"\{").search(text, i)):
    try: o, i = dec.raw_decode(text, m.start()); last = o if isinstance(o, dict) and "error" in o else last
    except ValueError: i = m.start() + 1
code = (last.get("error") or {}).get("code")
if code not in (None, "PASTE_CODE_MISSING"):
    sys.exit(print("LOGIN_PREFLIGHT_FAILED", code, (last["error"].get("message") or "")[:200]))
# The approval link is the line that holds nothing but the URL.
urls = [l.strip() for l in text.splitlines() if re.fullmatch(r"\s*https://\S+\s*", l)]
if len(set(urls)) != 1: sys.exit(print("NO_URL" if not urls else "REQUEST_MISMATCH ambiguous link"))
url = urls[0]
try: ctx = json.load(open(ctx_file))
except Exception: sys.exit(print("REQUEST_MISMATCH no profile context"))
u = urllib.parse.urlsplit(url); q = urllib.parse.parse_qs(u.query, keep_blank_values=True)
def fail(why): sys.exit(print("REQUEST_MISMATCH", why))
if (u.scheme, u.netloc, u.path) != ("https", "openkey.so", "/delegate"): fail("not the OpenKey approval page")
if set(q) - {"did", "jwk", "host", "permissions", "reason", "expiry", "protocolVersion"}: fail("unexpected parameters " + ",".join(sorted(set(q) - {"did", "jwk", "host", "permissions", "reason", "expiry", "protocolVersion"})))
if any(len(v) != 1 for v in q.values()): fail("repeated parameter")
one = {k: v[0] for k, v in q.items()}
if one.get("did") != ctx.get("sessionDid"): fail("link is for another key")
if one.get("host") != ctx.get("host"): fail("link is for another node")
if not re.fullmatch(r"\d+s", one.get("expiry", "")) or int(one["expiry"][:-1]) > 2592000: fail("lifetime over 30 days")
p = one.get("permissions", "")
try: perms = json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))["permissions"]
except Exception: fail("unreadable permissions")
chain, addr = owner.split(":")[3], owner.split(":")[4].lower()
spaces = {"secrets", f"tinycloud:pkh:eip155:{chain}:{addr}:secrets"}
def norm_space(s): return s.lower() if isinstance(s, str) and s.lower().startswith("tinycloud:pkh:") else s
def norm_urn(s): return s.lower() if isinstance(s, str) else s
want = {("tinycloud.kv", f"vault/secrets/{n}", ("tinycloud.kv/get",)) for n in names}
want |= {("tinycloud.encryption", f"urn:tinycloud:encryption:did:pkh:eip155:{chain}:{addr}:default", ("tinycloud.encryption/decrypt",)),
         ("tinycloud.capabilities", "", ("tinycloud.capabilities/read",))}
got, space_values = set(), set()
for e in perms:
    if not isinstance(e, dict) or set(e) - {"service", "space", "path", "actions"}: fail("unexpected entry fields")
    svc, path, acts = e.get("service"), e.get("path"), e.get("actions")
    if not isinstance(acts, list): fail("bad actions")
    if svc == "tinycloud.encryption":
        if e.get("space", "encryption") != "encryption": fail("decrypt not requested as a network grant")
        path = norm_urn(path)
    else:
        if norm_space(e.get("space")) not in spaces: fail("entry outside the owner's secrets space")
        space_values.add(norm_space(e.get("space")))
    t = (svc, path, tuple(acts))
    if t in got: fail("duplicate entry")
    got.add(t)
if got != want or len(perms) != len(want) or len(space_values) != 1: fail("requested permissions differ from the named secrets")
with open(out_file, "w") as f: f.write(url)
print("APPROVAL_READY")
PY
[ -s "$STATE/approve.url" ] || rm -f "$STATE/approve.url"
rm -f "$STATE/login.err" "$STATE/context.json"
```

- `APPROVAL_READY` → send the approval message (template at the end), with the link from one read of `$STATE/approve.url`.
- `LOGIN_PREFLIGHT_FAILED <code>` → the CLI refused before making a link. Handle `<code>` with §5; for example, `SESSION_IN_USE` means ask the owner.
- `REQUEST_MISMATCH <why>` or `NO_URL` → don't send a link. Tell the owner what the check reported. A mismatch about the decrypt grant means the CLI is older than the TC-599 release.

**3c. Finish the sign-in with the owner's code.** After approving, OpenKey shows a long code (about 7–10 KB) and the message "Only paste this code into a terminal you started yourself". The code completes sign-in only for this profile's key. Keep it out of the conversation when you can.

First put the code into `$STATE/code`, using exactly one of these:

- **The harness has a private input** that can pipe a value into a command, such as Paseo's Secret Bridge. Request it, wait for the owner to submit it, then write it with one call. For example, with Secret Bridge:

  ```sh
  secret-bridge request OPENKEY_CODE --reason "Paste the code OpenKey showed after you approved. It finishes the TinyCloud sign-in for this machine's <profile> profile."
  ```

  then, after the owner submits it:

  ```sh
  { set +x; } 2>/dev/null; set +e; umask 077
  STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
  secret-bridge pipe OPENKEY_CODE -- sh -c 'umask 077; rm -f "$1"; cat > "$1"' sh "$STATE/code" && echo CODE_SAVED
  ```

- **Otherwise** ask the owner to send the code in your 1:1 channel. Paste it between the `CODE` markers exactly as received, in one tool call:

  ```sh
  { set +x; } 2>/dev/null; set +e; umask 077
  STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
  rm -f "$STATE/code"
  cat > "$STATE/code" <<'CODE'
  <code exactly as the owner sent it>
  CODE
  echo CODE_SAVED
  ```

Then finish the sign-in:

```sh
{ set +x; } 2>/dev/null; set +e; umask 077
STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE="${TC_SECRETS_PROFILE:-api-keys}"

if [ ! -s "$STATE/code" ] || [ ! -s "$STATE/manifest.json" ]; then echo NO_CODE
else
  printf '\n' >> "$STATE/code"
  rm -f "$STATE/login.json" "$STATE/login.err"
  timeout 120 "$TC_BIN" --profile "$PROFILE" auth login --method openkey --manifest "$STATE/manifest.json" --paste \
    --owner "$TC_OWNER_DID" --expiry 30d < "$STATE/code" > "$STATE/login.json" 2> "$STATE/login.err"
  python3 - "$?" "$STATE/login.json" "$STATE/login.err" <<'PY'
import json, re, sys
rc, out, err = int(sys.argv[1]), sys.argv[2], sys.argv[3]
if rc == 124: sys.exit(print("LOGIN_TIMEOUT"))
try:
    r = json.load(open(out))
    if r.get("authenticated"):
        sys.exit(print("SIGNED_IN expires", r.get("expiresAt"), "declined", json.dumps(r.get("declined", []))))
except Exception: pass
text = open(err, errors="replace").read(); dec, i, last = json.JSONDecoder(), 0, {}
while (m := re.compile(r"\{").search(text, i)):
    try: o, i = dec.raw_decode(text, m.start()); last = o if isinstance(o, dict) and "error" in o else last
    except ValueError: i = m.start() + 1
e = last.get("error") or {}
print("LOGIN_FAILED", e.get("code") or f"exit-{rc}", (e.get("message") or "")[:200])
PY
fi
rm -f "$STATE/code" "$STATE/login.json" "$STATE/login.err" "$STATE/approve.url"
```

- `SIGNED_IN … declined []` → run §2 again; every name should now be `READABLE`.
- `SIGNED_IN` with a non-empty `declined` → something wasn't granted. Tell the owner which names stay unreadable and why:
  - an item they unticked;
  - or, if the declined entry is the decrypt permission and everything was ticked, an OpenKey deployment too old to grant agent decryption.
- `NO_CODE` → the code never arrived. Ask the owner to send it again.
- `LOGIN_TIMEOUT` → the CLI didn't finish in two minutes. Report it; don't loop.
- `LOGIN_FAILED <code>` → see §5. A code copied wrongly fails here: ask the owner to send it again. Don't start a new request.

Never reuse a code for another profile.

## 4. Use a secret

Read the value inside the one command that needs it. Each read takes a second or two; read again in the next command rather than caching the value on disk. These patterns suit single-line tokens such as API keys. Shell capture drops trailing newlines, so for a multi-line value pipe `secrets get … --raw` straight into the consumer's stdin.

**A program that reads its environment:**

```sh
{ set +x; } 2>/dev/null; set +e; umask 077
STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE="${TC_SECRETS_PROFILE:-api-keys}"

rm -f "$STATE/use.err"
if ELEVENLABS_API_KEY="$(timeout 60 "$TC_BIN" --profile "$PROFILE" secrets get ELEVENLABS_API_KEY --raw < /dev/null 2> "$STATE/use.err")"; then
  export ELEVENLABS_API_KEY
  '<your command, e.g. bun run tools/voice.ts>'
  unset ELEVENLABS_API_KEY
else
  echo "SECRET_UNAVAILABLE — run §2 for ELEVENLABS_API_KEY"
fi
rm -f "$STATE/use.err"
```

**An HTTP header (keeps the value out of the process list):**

```sh
{ set +x; } 2>/dev/null; set +e; umask 077
STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"; chmod 600 "$STATE"/* 2>/dev/null
PROFILE="${TC_SECRETS_PROFILE:-api-keys}"

rm -f "$STATE/use.err"
if KEY="$(timeout 60 "$TC_BIN" --profile "$PROFILE" secrets get ELEVENLABS_API_KEY --raw < /dev/null 2> "$STATE/use.err")"; then
  printf 'xi-api-key: %s\n' "$KEY" | curl -sS -H @- '<https://api.example/v1/…>' -o '<output file>'
  unset KEY
else
  echo "SECRET_UNAVAILABLE — run §2 for ELEVENLABS_API_KEY"
fi
rm -f "$STATE/use.err"
```

Both patterns close stdin and send the CLI's stderr to a private file, so the CLI never waits for a browser approval mid-task. `SECRET_UNAVAILABLE` means access changed since §2 (for example, the session expired): go back to §2.

If a tool insists on a key file, write it with `umask 077` inside `$STATE`, use it in the same command, and delete it in that command.

## 5. Errors — `{"error":{"code","message","hint"?}}` on stderr

Branch on `code`, never on the exit status alone.

| Code | Meaning | Action |
|---|---|---|
| `AUTH_REQUIRED` (exit 3) | No session, or it expired | §3 on the same profile |
| `PROFILE_NOT_FOUND` | No profile yet | §3a |
| `PERMISSION_DENIED` (exit 5) | The session doesn't cover this name | §3 with the full list of names, current and new. Approving it widens the session |
| `NOT_FOUND` | The secret doesn't exist | The owner adds it in Secret Manager (page in `hint`). Never ask for the value |
| `SECRET_DECRYPT_FAILED` | Decryption failed | Report it |
| `SECRET_READ_FAILED` | The ciphertext is unreadable | Report it |
| `NETWORK_ERROR` | The TinyCloud node is unreachable | Retry shortly, then report |
| `INVALID_SECRET_NAME` | The name isn't `UPPER_SNAKE` | Fix the name |
| `SESSION_IN_USE` | A new request would narrow or shorten the live session | Ask the owner. Never add `--replace-session` on your own |
| `INVALID_LOGIN_SCOPE` | The request has no secrets, or mixes spaces | Rebuild the manifest with §3b |
| `PASTE_CODE_MISSING` (exit 3) | Expected in §3b: no code on stdin | Nothing; §3b handles it |
| `DEVICE_AUTH_UNSUPPORTED_SCOPE` | Device login can't grant secrets | Use §3, never `--device` |

## 6. Lifecycle

- **Expiry:** the session lasts up to 30 days from approval. `"$TC_BIN" --profile "$PROFILE" context --json` shows `session.expiresAt`. Before it ends, renew by running §3b–§3c with the same names; the owner approves again.
- **More secrets:** run §3b–§3c with the full list. A request that adds names and lasts at least as long needs no extra flag.
- **Stop reading:** `"$TC_BIN" --profile "$PROFILE" auth logout` clears the local session. The approval stays valid on TinyCloud until it expires, so tell the owner that.

## Approval message (to the owner, 1:1)

Send this text, filling in the placeholders. Don't drop sentences.

> To let me read <NAMES> from your TinyCloud Secrets, open <link> and sign in with the account that owns those secrets. It lets the `<profile>` profile on this machine read only those named secrets for up to 30 days. It also lets that profile decrypt with your default TinyCloud encryption network, which is how those secrets are opened. That decrypt permission isn't limited to these names, but this profile can only fetch the secrets named here. OpenKey also shows a required "Check your TinyCloud permissions" item. Leave every item ticked and approve. OpenKey then shows a long code: send it back to me here, or in the private input I opened. Only you can approve this. Only approve if you asked me for this just now.
