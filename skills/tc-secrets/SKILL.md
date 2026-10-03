---
name: tc-secrets
description: Read API keys and other secrets the owner keeps in TinyCloud Secrets, without exposing their values. Use when a task needs a credential (for example ELEVENLABS_API_KEY) that the owner stores in TinyCloud, or when the owner asks you to use TinyCloud Secrets instead of env files.
metadata:
  version: "0.1.0"
---

# Read secrets from TinyCloud with `tc secrets`

The owner stores secrets in TinyCloud Secrets (secrets.tinycloud.xyz). You read only the names they approved, through a CLI profile the owner authorizes once with OpenKey. You never see, ask for, or store a secret value in the conversation.

Operator-set, never change or unset: `TC_BIN` (absolute path to `tc`; `command -v tc` can resolve to `/usr/sbin/tc`), `TC_OWNER_DID` (the owner's `did:pkh:eip155:1:0x…`), `TC_HOME` (CLI profile store, optional), `TC_SECRETS_PROFILE` (default `api-keys`) and `TC_SECRETS_STATE` (this skill's state directory, default `$HOME/.local/state/tc-secrets`).

## Shell preamble — required

Agent shells lose variables and umask between calls. Start every shell call with:

```sh
umask 077; STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"
PROFILE="${TC_SECRETS_PROFILE:-api-keys}"
NAMES='<SECRET_NAME …>'   # the names this task needs, space-separated, e.g. 'ELEVENLABS_API_KEY'
```

Run each block below as one tool call. Replace every `'<…>'` placeholder first.

## Handling contract — applies to every step

- A secret value goes only into the environment or stdin of the one command that uses it. Never print it, echo it, log it, write it into the repository, notes, memory, commits, or summaries, and never pass it as a command-line argument (other local users can read process arguments).
- Never run `secrets get` without `--raw` inside a capture: plain `secrets get` prints the value as JSON.
- Never ask the owner to paste a secret value into the conversation. A missing secret is added by the owner in Secret Manager.
- Never turn on shell tracing (`set -x`) in a block that reads a secret.
- The OpenKey approval link and the code the owner sends back finish one sign-in for this profile. Treat them as sensitive: keep the code only in `$STATE` until the sign-in completes, then delete it.
- Run only the blocks the task needs, as written. Never create, rename or delete profiles beyond §3a's `init`, never run `profile delete`, and never improvise extra `tc` commands to "test" access: §2 is the access test.

## 1. Check the CLI

```sh
umask 077; STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"
PROFILE="${TC_SECRETS_PROFILE:-api-keys}"

[ -x "$TC_BIN" ] && "$TC_BIN" secrets get --help | grep -q -- '--raw' \
  && "$TC_BIN" auth login --help | grep -q -- '--owner' && echo CLI_OK || echo STALE
"$TC_BIN" --version
echo "TC_OWNER_DID=${TC_OWNER_DID:-unset}"
```

If it prints `STALE` or `TC_OWNER_DID=unset`, stop and tell the owner. Never install anything yourself. When the owner only asked you to check the CLI, stop after this block and report what it printed.

## 2. Check access

```sh
umask 077; STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"
PROFILE="${TC_SECRETS_PROFILE:-api-keys}"
NAMES='<SECRET_NAME …>'

for n in $NAMES; do
  if timeout 60 "$TC_BIN" --profile "$PROFILE" secrets get "$n" --raw > /dev/null 2> "$STATE/get.err" < /dev/null; then
    echo "READABLE $n"
  elif [ $? -eq 124 ]; then
    echo "NOT_READABLE $n TIMEOUT"
  else
    echo "NOT_READABLE $n $(python3 -c 'import json,sys;e=json.load(open(sys.argv[1]))["error"];print(e["code"], "|", e.get("hint",""))' "$STATE/get.err" 2>/dev/null || echo unknown)"
  fi
done
rm -f "$STATE/get.err"
```

- Every name `READABLE` → go to §4.
- `AUTH_REQUIRED`, `PROFILE_NOT_FOUND`, `PERMISSION_DENIED` or `TIMEOUT` → go to §3 with the full list of names the task needs. (`TIMEOUT`: CLIs before the TC-599 release wait forever instead of failing when the session doesn't cover a name.)
- `NOT_FOUND` → the secret does not exist yet. Tell the owner to add it in Secret Manager (the hint names the page), then run §2 again. Don't start §3 for it.
- Anything else → see §5.

## 3. Consent — only when §2 says so

**3a. Create the profile if it doesn't exist.** `init` makes the new profile the default for every `tc` command without `--profile` on this machine, so always pass `--profile`.

```sh
umask 077; STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"
PROFILE="${TC_SECRETS_PROFILE:-api-keys}"

if "$TC_BIN" --profile "$PROFILE" context --json > /dev/null 2> "$STATE/context.err"; then echo PROFILE_EXISTS
elif grep -q PROFILE_NOT_FOUND "$STATE/context.err"; then "$TC_BIN" init --name "$PROFILE" --key-only > /dev/null && echo PROFILE_CREATED
else cat "$STATE/context.err"; echo SETUP_FAILED; fi
rm -f "$STATE/context.err"
```

`SETUP_FAILED` → stop and report. Never run `profile delete`.

**3b. Build the request and check it before asking anyone to sign.** The manifest asks for read and decrypt on exactly the listed names, for up to 30 days. OpenKey's phone-code (device) sign-in cannot grant secrets, so this uses the OpenKey approval page, which ends by showing a code.

```sh
umask 077; STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"
PROFILE="${TC_SECRETS_PROFILE:-api-keys}"
NAMES='<SECRET_NAME …>'

python3 - "$STATE/manifest.json" "$TC_OWNER_DID" $NAMES <<'PY'
import json, re, sys
out, owner, names = sys.argv[1], sys.argv[2], sys.argv[3:]
assert re.fullmatch(r"did:pkh:eip155:\d+:0x[0-9a-fA-F]{40}", owner), "TC_OWNER_DID is not a did:pkh"
assert names and all(re.fullmatch(r"[A-Z][A-Z0-9_]*", n) for n in names), "secret names must be UPPER_SNAKE"
perms = [{"service": "tinycloud.kv", "path": f"vault/secrets/{n}", "actions": ["get"], "skipPrefix": True} for n in names]
perms.append({"service": "tinycloud.encryption", "path": f"urn:tinycloud:encryption:{owner}:default", "actions": ["decrypt"], "skipPrefix": True})
perms.append({"service": "tinycloud.capabilities", "path": "", "actions": ["read"], "skipPrefix": True})
json.dump({"manifest_version": 1, "app_id": "xyz.tinycloud.agent-secrets", "name": "Agent secret reads",
           "space": "secrets", "permissions": perms}, open(out, "w"))
PY
"$TC_BIN" --profile "$PROFILE" auth login --method openkey --manifest "$STATE/manifest.json" --paste \
  --owner "$TC_OWNER_DID" --expiry 30d < /dev/null > /dev/null 2> "$STATE/login.err"
grep -oE 'https://openkey\.so/delegate\?[^ ]+' "$STATE/login.err" | tail -1 > "$STATE/approve.url"
VERDICT=$(python3 - "$STATE/approve.url" "$TC_OWNER_DID" $NAMES <<'PY'
import base64, json, sys, urllib.parse
url_file, owner, names = sys.argv[1], sys.argv[2], set(sys.argv[3:])
url = open(url_file).read().strip()
if not url: sys.exit(print("NO_URL"))
p = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)["permissions"][0]
perms = json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))["permissions"]
kv = {e["path"].removeprefix("vault/secrets/") for e in perms if e["service"] == "tinycloud.kv" and e["actions"] == ["tinycloud.kv/get"]}
dec = [e for e in perms if e["service"] == "tinycloud.encryption"]
ok = (kv == names and len(dec) == 1 and dec[0].get("space") == "encryption"
      and dec[0]["path"] == f"urn:tinycloud:encryption:{owner}:default"
      and any(e["service"] == "tinycloud.capabilities" for e in perms)
      and len(perms) == len(names) + 2)
print("APPROVAL_READY" if ok else "REQUEST_MISMATCH")
PY
)
echo "$VERDICT"; [ "$VERDICT" = APPROVAL_READY ] || rm -f "$STATE/approve.url"
rm -f "$STATE/login.err"
```

- `APPROVAL_READY` → send the approval message (template at the end) with the link from one read of `$STATE/approve.url`.
- `REQUEST_MISMATCH` or `NO_URL` → stop and tell the owner the CLI is too old to request secret reads correctly. Don't send a link.

**3c. Finish the sign-in with the owner's code.** After approving, OpenKey shows a long code (about 7–10 KB) and the message "Only paste this code into a terminal you started yourself." The code only completes sign-in for this profile's key, but keep it out of the conversation when you can.

First put the code into `$STATE/code`, using exactly one of these:

- **The harness has a private input** that can pipe a value into a command, such as Paseo's Secret Bridge. Request it, wait for the owner to submit it, then write it with one call. For example, with Secret Bridge:

  ```sh
  secret-bridge request OPENKEY_CODE --reason "Paste the code OpenKey showed after you approved. It finishes the TinyCloud sign-in for this machine's <profile> profile."
  ```

  then, after the owner submits it:

  ```sh
  umask 077; STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"
  secret-bridge pipe OPENKEY_CODE -- sh -c 'umask 077; cat > "$1"' sh "$STATE/code" && echo CODE_SAVED
  ```

- **Otherwise** ask the owner to send the code in your 1:1 channel, and paste it between the `CODE` markers exactly as received, in one tool call:

  ```sh
  umask 077; STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"
  cat > "$STATE/code" <<'CODE'
  <code exactly as the owner sent it>
  CODE
  echo CODE_SAVED
  ```

Then finish the sign-in:

```sh
umask 077; STATE="${TC_SECRETS_STATE:-$HOME/.local/state/tc-secrets}"; mkdir -p "$STATE"; chmod 700 "$STATE"
PROFILE="${TC_SECRETS_PROFILE:-api-keys}"

[ -s "$STATE/code" ] || { echo "NO_CODE"; exit 0; }
printf '\n' >> "$STATE/code"
timeout 120 "$TC_BIN" --profile "$PROFILE" auth login --method openkey --manifest "$STATE/manifest.json" --paste \
  --owner "$TC_OWNER_DID" --expiry 30d < "$STATE/code" > "$STATE/login.json" 2> "$STATE/login.err"
python3 - "$STATE/login.json" "$STATE/login.err" <<'PY'
import json, sys
try:
    r = json.load(open(sys.argv[1]))
    print("SIGNED_IN" if r.get("authenticated") else "NOT_SIGNED_IN", "expires", r.get("expiresAt"),
          "declined", json.dumps(r.get("declined", [])))
except Exception:
    try: e = json.load(open(sys.argv[2]))["error"]; print("LOGIN_FAILED", e.get("code"), e.get("message"))
    except Exception: print("LOGIN_FAILED unknown (no output)")
PY
rm -f "$STATE/code" "$STATE/login.json" "$STATE/login.err" "$STATE/approve.url"
```

- `SIGNED_IN` with `declined []` → run §2 again; every name should now be `READABLE`.
- A non-empty `declined` → something was not granted. Tell the owner which names stay unreadable and why: an unticked item, or (when the declined entry is the decrypt permission and the owner left everything ticked) an OpenKey deployment too old to grant agent decryption.
- `NO_CODE` → the code never arrived; ask the owner to send it again.
- `LOGIN_FAILED` → see §5. A code copied wrongly fails here; ask the owner to send it again, don't start a new request.

The code completes sign-in only for this profile's key. Never reuse it for another profile.

## 4. Use a secret

Read the value inside the one command that needs it. Each read takes a second or two; read again in the next command rather than caching the value on disk.

**A program that reads its environment:**

```sh
umask 077; PROFILE="${TC_SECRETS_PROFILE:-api-keys}"
ELEVENLABS_API_KEY="$("$TC_BIN" --profile "$PROFILE" secrets get ELEVENLABS_API_KEY --raw < /dev/null)" || exit 1
export ELEVENLABS_API_KEY
'<your command, e.g. bun run tools/voice.ts>'
```

**An HTTP header (keeps the value out of the process list):**

```sh
umask 077; PROFILE="${TC_SECRETS_PROFILE:-api-keys}"
KEY="$("$TC_BIN" --profile "$PROFILE" secrets get ELEVENLABS_API_KEY --raw < /dev/null)" || exit 1
printf 'xi-api-key: %s\n' "$KEY" | curl -sS -H @- '<https://api.example/v1/…>' -o '<output file>'
```

If a tool insists on a key file, write it with `umask 077` inside `$STATE`, use it in the same command, and delete it in that command.

## 5. Errors — `{"error":{"code","message","hint"?}}` on stderr

Branch on `code`, never on the exit status alone.

| Code | Meaning | Action |
|---|---|---|
| `AUTH_REQUIRED` (exit 3) | No session or it expired | §3 on the same profile |
| `PROFILE_NOT_FOUND` | No profile yet | §3a |
| `PERMISSION_DENIED` | The session doesn't cover this name | §3 with the full list of names (current and new); approving it widens the session |
| `NOT_FOUND` | The secret doesn't exist | Owner adds it in Secret Manager (page in `hint`); never ask for the value |
| `SECRET_DECRYPT_FAILED` | Decryption refused or failed | Report it. On CLIs before the TC-599 release this means the decrypt grant was signed in a form the node refuses; renewing consent won't help |
| `SECRET_READ_FAILED` | Ciphertext unreadable | Report it |
| `NETWORK_ERROR` | TinyCloud node unreachable | Retry shortly, then report |
| `INVALID_SECRET_NAME` | Name isn't `UPPER_SNAKE` | Fix the name |
| `SESSION_IN_USE` | A new request would narrow or shorten the live session | Ask the owner; never add `--replace-session` on your own |
| `INVALID_LOGIN_SCOPE` | The request has no secrets or mixes spaces | Rebuild the manifest with §3b |

## 6. Lifecycle

- **Expiry:** the session lasts up to 30 days from approval. `"$TC_BIN" --profile "$PROFILE" context --json` shows `session.expiresAt`. Renew before it ends by running §3b–§3c with the same names; the owner approves again.
- **More secrets:** run §3b–§3c with the full list. A request that adds names and lasts at least as long needs no extra flag.
- **Stop reading:** `"$TC_BIN" --profile "$PROFILE" auth logout` clears the local session. The approval itself stays valid on TinyCloud until it expires; tell the owner that.

## Approval message (to the owner, 1:1)

Send this text, filling in the placeholders. Don't drop sentences.

> To let me read <NAMES> from your TinyCloud Secrets, open <link> and sign in with the account that owns those secrets. It asks for read and decrypt access to those names only, for up to 30 days, for the `<profile>` profile on this machine. Leave every item ticked and approve. OpenKey then shows a long code: send it back to me here (or in the private input I opened). It only works with this machine's profile. Only approve if you asked me for this just now.
