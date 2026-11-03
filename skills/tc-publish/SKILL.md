---
name: tc-publish
description: Publish a document or HTML page to TinyCloud and return a shareable link. Use when the owner asks the agent to publish, share, or host a file — a link anyone who has it can open, made only after the owner says yes, with verification and lifecycle.
metadata:
  version: "0.6.11"
---

> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/skills/publish.md` and follow that text. Summaries drop the shell blocks you must run.

# Publish documents and HTML with `tinycloud share`

Publish a file from the owner's TinyCloud space and return a link. The agent holds a scoped delegation the owner approves with one short OpenKey link — no passwords, no copied credentials, no codes.

**CLI rule (stable `1.6.0`): start with §1 and run its block before any other command, including any `tinycloud` or `--version` check of your own; it selects the CLI and decides. Don't judge who installed the CLI yourself. Only a `TC_OLDER` line from §1 or /cli means the operator chose an older CLI: keep it, tell the operator once that `1.6.0` is required, and continue with what §1 reports. Any other older CLI is yours, including one on `PATH` or linked from `~/.local/bin`: §1 prints `CLI_OLDER`; follow https://agents.tinycloud.xyz/cli once and rerun §1. Upgrading the CLI is part of the owner's request: don't ask first; at most one short line ("Updating the TinyCloud CLI."). Never run `tinycloud upgrade` or a global npm install of the TinyCloud CLI; the guide's installer (/cli) handles upgrades. A newer CLI is never downgraded. Don't install the CLI globally, with `sudo`, or by piping a download into a shell; /cli installs and upgrades the agent's own copy.**

With an operator's older CLI (`TC_OLDER`), §1's feature probe checks the sign-in options, and §2's link check stops on anything but a short OpenKey link, which this sign-in needs (verified on `1.6.0`). CLI `1.0.0-beta.17` also can't publish unusual file names (TC-577), so read the version §1 prints (§3 **File names**).

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
- The OpenKey approval link may appear in `$STATE/login.err` and `$STATE/approve.url` (both 0600), in your tool output while you read it to compose the one owner message, and in that message — nowhere else. The §2 blocks delete those files when the sign-in ends.
- Never put a link in notes, memory, the journal, summaries, other files, commits, group chats or other tools.
- If a request comes from a group chat, send the link to the owner privately and say so in the group.

## Ask before making a link

Only links are available for now: anyone who has the link can open it. Sharing with an email address, a domain, a DID or only the owner is not available yet; if the owner asks for one, say so in one line.

Before every publish, ask the owner exactly: "Anyone with the link can open it. Make a link?" Publish only after they say yes. If they say no, tell them it isn't published and the file stays on this computer, and don't offer another place to publish or share it. Never decide on your own that content is shareable, and never publish without that yes.

Always pass `--to anyone`. Never pass `email:`, `domain:` or `did:`, and never rely on the CLI's default target.

## 1. Check the CLI — the pinned version, then feature probes

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
  [ -n "${TC_OWNER_EMAIL:-}" ] || TC_OWNER_EMAIL=$(node "$ENV_HELPER" get TC_OWNER_EMAIL)
fi
OPERATOR_BIN=${TC_BIN:-}; [ -z "$OPERATOR_BIN" ] || ! node -e 'const{realpathSync:r}=require("fs"),[f,d]=process.argv.slice(1),i=(a,b)=>a.startsWith(b+"/");let x=i(f,d);try{x=x||i(r(f),r(d))}catch{}process.exit(x?0:1)' "$OPERATOR_BIN" "$HOME/.local/share/tinycloud/cli" || OPERATOR_BIN=
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # unless the owner names another profile

TC_VERSION=
if [ -n "$TC_BIN" ] && [ -x "$TC_BIN" ]; then
  TC_VERSION=$("$TC_BIN" --version)
  if printf '%s\n' "$TC_VERSION" | awk -F. -v p=1.6.0 '{split(p,q,".");for(i=1;i<4;i++){n=$i+0;if(n!=q[i]+0)exit(n>q[i]+0)};exit($3!~/^[0-9]+-/)}'; then
    if [ "$TC_BIN" = "$OPERATOR_BIN" ]; then echo "TC_OLDER $TC_VERSION $TC_BIN is older than the pinned 1.6.0; keeping this operator-selected CLI"
    else echo "CLI_OLDER $TC_VERSION $TC_BIN: run the CLI setup at https://agents.tinycloud.xyz/cli (it upgrades a CLI the agent installed), then rerun this block"; exit 1; fi
  fi
fi
if [ -z "$TC_BIN" ]; then echo "TC_NOT_FOUND: no TinyCloud CLI; install it from https://agents.tinycloud.xyz/publish or set TC_BIN"
elif "$TC_BIN" auth login --help | awk '/--no-popup/{p=1} /--expiry/{e=1} END{exit !(p&&e)}'; then echo CLI_OK
else echo STALE; fi
[ -z "$TC_VERSION" ] || printf '%s\n' "$TC_VERSION"
```

If the block prints `TC_NOT_FOUND` or `STALE`, follow https://agents.tinycloud.xyz/agent for `NEEDS_SETUP`, then return to this same task. If it prints `CLI_OLDER <version> <path>`, it stopped before any other TinyCloud command: the CLI the agent installed is older than `1.6.0`, so follow https://agents.tinycloud.xyz/cli once (it upgrades that CLI) and run this block again. Upgrading the CLI is part of the owner's request: don't ask first; at most one short line ("Updating the TinyCloud CLI."). Never run `tinycloud upgrade` or a global npm install of the TinyCloud CLI; the guide's installer (/cli) handles upgrades. If it prints `TC_OLDER <version> <path>`, the operator selected the older CLI: keep it, tell the operator once that `1.6.0` is required, and continue with what this block reports.

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

**The sign-in: one short link.** Run it when there is no live session. It is one approval; later runs reuse the saved session, up to 30 days. The approval is tied to this profile's key, which the check above creates (`init --name "$PROFILE" --key-only`; say nothing to the owner about it), so use the same profile in every call.

The CLI prints a short OpenKey link, then waits and fetches the owner's approval by itself: no code comes back. It has no time limit of its own (the link lasts an hour), so it runs as a script that keeps going while you talk to the owner. This block writes the sign-in's permission list to `$STATE/share-publishing.json` (links only: the capability read OpenKey requires and the three share folders in `default`; no decryption, which links don't use) and the script to `$STATE/signin.sh`. It starts nothing:

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN TC_OWNER_EMAIL
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null

rm -f "$STATE/approve.url" "$STATE/signin.sh"
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
cat > "$STATE/signin.sh" <<'W'
{ set +x; } 2>/dev/null; set +e; umask 077
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }
STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"; PROFILE="${1:-publisher}"
rm -f "$STATE/signin.rc" "$STATE/login.json" "$STATE/login.err" "$STATE/context.json"
# This profile's key and node, for the link check.
"$TC_BIN" --profile "$PROFILE" context --json < /dev/null > "$STATE/context.json" 2> /dev/null
"$TC_BIN" --profile "$PROFILE" auth login --method openkey --no-popup --manifest "$STATE/share-publishing.json" --expiry 30d < /dev/null > "$STATE/login.json" 2> "$STATE/login.err" &
echo "$!" > "$STATE/signin.pid"
wait "$!"
echo "$?" > "$STATE/signin.rc"
W
echo "SIGNIN_READY $STATE/signin.sh"
```

**Start it once.** It takes the profile as its argument: `publisher` unless the owner named another profile.

- If your client can keep a process running in the background (for example OMP's supervised process, or Claude Code's background shell), run `sh <the signin.sh path printed above> <profile>` there, with the same environment (`TC_BIN`, `TC_HOME`, `TC_PUBLISH_STATE`).
- Otherwise detach it with this block:

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null
PROFILE=publisher   # unless the owner names another profile

if [ ! -s "$STATE/signin.sh" ]; then echo "NO_SCRIPT — run the block above first"
elif [ -s "$STATE/signin.pid" ] && [ ! -s "$STATE/signin.rc" ] && kill -0 "$(cat "$STATE/signin.pid")" 2>/dev/null; then echo ALREADY_RUNNING
else
  DETACH=$(command -v setsid)   # empty on macOS: prefer a background process there
  $DETACH nohup sh "$STATE/signin.sh" "$PROFILE" > /dev/null 2>&1 < /dev/null &
  echo STARTED
fi
```

Never run two sign-ins at once. Running the script again after it stopped resumes the same link: the CLI saved it before printing it.

**Check the link before you send it.** A few seconds after starting, run this block. It sends nothing. It accepts the link only if all of these hold:

1. **It came from this sign-in.** The block takes the link only from the output of the sign-in you started (`$STATE/login.err`, the line after `Approve this request in OpenKey (open the complete link):`). Never check or send a link from anywhere else.
2. **It is a short OpenKey link:** exactly `https://openkey.so/a/<id>#v=4&k=<key>&c=<hash>`.
3. **It asks for exactly the permission list above.** The block opens the sealed request the way OpenKey's page will, with the CLI's own link reader (it fetches the sealed record, checks its signature and content hash, and decrypts it with the key in the link). The request must be signed by and grant to this profile's own key, be for this profile's node, last at most 30 days, and ask for exactly the entries in `$STATE/share-publishing.json`, in the profile's `default` space, and nothing else.

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
if [ -r "$ENV_HELPER" ]; then
  [ -n "${TC_BIN:-}" ] || TC_BIN=$(node "$ENV_HELPER" get TC_BIN)
fi
[ -n "$TC_BIN" ] || { TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud); }; export TC_BIN
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null

for i in $(seq 30); do { [ -s "$STATE/signin.rc" ] || grep -q '^https://' "$STATE/login.err"; } 2>/dev/null && break; sleep 1; done
R=$(node - "$STATE/login.err" "$STATE/signin.rc" "$STATE/context.json" "$STATE/approve.url" "$STATE/share-publishing.json" <<'JS'
const fs = require("fs"), { createRequire } = require("module");
const [errFile, rcFile, ctxFile, urlFile, manifestFile] = process.argv.slice(2);
const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
const done = (...words) => { console.log(words.join(" ")); process.exit(0); };
const fail = (why) => done("REQUEST_MISMATCH", why);
const text = read(errFile), lines = text.split("\n");
// 1. Only this sign-in's own output: the line after the CLI's prompt, and no other link in it.
const prompt = lines.flatMap((l, i) => (l.trim() === "Approve this request in OpenKey (open the complete link):" ? [i] : []));
if (!prompt.length) {
  if (!read(rcFile).trim()) done("NO_URL");
  const codes = [...text.matchAll(/"code":\s*"([A-Z0-9_]+)"/g)];
  done("LOGIN_PREFLIGHT_FAILED", codes.length ? codes.at(-1)[1] : "exit-" + read(rcFile).trim());
}
if (read(rcFile).trim()) done("SIGNIN_ENDED");
const url = (lines[prompt[0] + 1] || "").trim();
if (new Set(prompt.map((i) => (lines[i + 1] || "").trim())).size !== 1 || lines.filter((l) => /https?:\/\//.test(l)).length !== prompt.length) fail("more than one link");
// 2. The short form OpenKey's approval page opens, and nothing else.
if (!/^https:\/\/openkey\.so\/a\/[a-z2-7]{26}#v=4&k=[A-Za-z0-9_-]{43}&c=bafkrei[a-z2-7]{52}$/.test(url)) fail("not a short OpenKey link");
let ctx, manifest;
try { ctx = JSON.parse(read(ctxFile)); } catch { fail("no profile context"); }
try { manifest = JSON.parse(read(manifestFile)); } catch { fail("no permission list"); }
// 3. Open the sealed request as OpenKey's page will, with the CLI's own link reader.
let links;
try { links = createRequire(fs.realpathSync(process.env.TC_BIN))("@tinycloud/share-envelope/links"); } catch { done("CHECK_UNAVAILABLE"); }
(async () => {
  let request;
  try {
    ({ request } = await links.resolveApprovalRequest(url, { trustedOrigins: ["https://openkey.so"], apiOrigin: process.env.TC_LINKS_API_ORIGIN ?? "https://api.tinycloud.xyz" }));
  } catch (e) {
    if (e?.code === "service_unavailable") done("CHECK_RETRY");
    fail("the sealed request doesn't open (" + (e?.code || "error") + ")");
  }
  if (request.issuer !== String(ctx.sessionDid || "").split("#")[0]) fail("link is for another key");
  if (request.nodeOrigin !== ctx.host) fail("link is for another node");
  if (!(request.grantLifetimeSeconds <= 2592000)) fail("lifetime over 30 days");
  const lower = (s) => (typeof s === "string" ? s.toLowerCase() : s);
  const spaces = new Set([manifest.space]);
  const [, , , chain, addr] = String(ctx.ownerDid || "").split("#")[0].split(":");
  if (chain && addr) spaces.add(`tinycloud:pkh:eip155:${chain}:${lower(addr)}:${manifest.space}`);
  const want = new Set(manifest.permissions.map((p) => `${p.service}|${p.path}|${p.actions.join(",")}`));
  const got = new Set(), spaceValues = new Set();
  for (const e of request.permissions) {
    if (Object.keys(e).some((k) => !["service", "space", "path", "actions"].includes(k)) || !Array.isArray(e.actions)) fail("unexpected entry fields");
    const space = lower(e.space).startsWith("tinycloud:pkh:") ? lower(e.space) : e.space;
    if (!spaces.has(space)) fail("entry outside the profile's default space");
    spaceValues.add(space);
    const t = `${e.service}|${e.path}|${e.actions.join(",")}`;
    if (got.has(t)) fail("duplicate entry");
    got.add(t);
  }
  if (got.size !== want.size || [...want].some((t) => !got.has(t)) || spaceValues.size !== 1) fail("requested permissions differ from the publishing list");
  const same = read(urlFile).trim() === url;
  fs.writeFileSync(urlFile, url, { mode: 0o600 });
  done("APPROVE_URL_SAVED", same ? "SAME_LINK" : "NEW_LINK");
})();
JS
)
echo "${R:-CHECK_UNAVAILABLE}"
case "$R" in
  APPROVE_URL_SAVED*|SIGNIN_ENDED|NO_URL|CHECK_RETRY) ;;
  *) kill "$(cat "$STATE/signin.pid" 2>/dev/null)" 2>/dev/null; rm -f "$STATE/approve.url" "$STATE/signin.pid" ;;
esac
```

- `APPROVE_URL_SAVED NEW_LINK` → read `$STATE/approve.url` once, put the link in the message below, send it, then run the wait block.
- `APPROVE_URL_SAVED SAME_LINK` → it's the link you already sent: don't send it again; run the wait block.
- `SIGNIN_ENDED` → the sign-in already finished; run the wait block.
- `NO_URL` → the link isn't printed yet. Run this block once more; if it repeats, run the wait block, which reports why.
- `CHECK_RETRY` → TinyCloud's links service couldn't be reached. Run this block again in a minute, at most 3 times in a row; then stop and tell the owner.
- `LOGIN_PREFLIGHT_FAILED <code>` → the CLI refused before making a link; see the errors table.
- `REQUEST_MISMATCH <why>` or `CHECK_UNAVAILABLE` → the block stopped the sign-in. Don't send any link; report what the check said. If §1 printed `TC_OLDER`, `not a short OpenKey link` or `CHECK_UNAVAILABLE` means that CLI can't make this sign-in's short link: tell the owner in one line that the CLI is older than the required `1.6.0`, and stop. Publishing with an existing session still works.

Send exactly this, with the link on its own line, as printed:

> To publish for you, I need one permission in OpenKey: publish-only access to your share folders for up to 30 days. Leave every item ticked. Only approve if you asked me for this just now.
>
> {approveUrl}
>
> Open this link and approve. I'll carry on as soon as you do.

**Wait for the approval.** Run this block right after you send the link, in the same turn, and again each time it prints `WAITING`, without waiting for the owner to reply: the sign-in sees the approval itself. Each run waits at most a minute.

```sh
{ set +x; } 2>/dev/null; set +e; umask 077; STATE="${TC_PUBLISH_STATE:-$HOME/.local/state/tc-publish}"
mkdir -p "$STATE"; chmod 700 "$STATE"; find "$STATE" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null

for i in $(seq 60); do [ -s "$STATE/signin.rc" ] && break; [ -s "$STATE/signin.pid" ] && kill -0 "$(cat "$STATE/signin.pid")" 2>/dev/null || break; sleep 1; done
ALIVE=no; [ ! -s "$STATE/signin.rc" ] && [ -s "$STATE/signin.pid" ] && kill -0 "$(cat "$STATE/signin.pid")" 2>/dev/null && ALIVE=yes
python3 - "$ALIVE" "$STATE/signin.rc" "$STATE/login.json" "$STATE/login.err" <<'PY'
import json, re, sys
alive, rc_f, out_f, err_f = sys.argv[1:5]
def read(f):
    try: return open(f, errors="replace").read()
    except OSError: return ""
try: out = json.loads(read(out_f) or "{}")
except ValueError: out = {}
rc = read(rc_f).strip() or ("0" if out.get("authenticated") else "")
# No result yet, or the CLI was killed by a signal (exit 128 and up): the saved link resumes.
if not rc or (int(rc) >= 128 and not out.get("authenticated")): sys.exit(print("WAITING" if alive == "yes" else "SIGNIN_STOPPED"))
if rc == "0" and out.get("authenticated"): sys.exit(print("SIGNED_IN expires", out.get("expiresAt")))
text, dec, i, last = read(err_f), json.JSONDecoder(), 0, {}
while (m := re.compile(r"\{").search(text, i)):
    try: o, i = dec.raw_decode(text, m.start()); last = o if isinstance(o, dict) and "error" in o else last
    except ValueError: i = m.start() + 1
code = (last.get("error") or {}).get("code") or f"exit-{rc}"
print("LINK_EXPIRED" if rc == "3" else "NOT_APPROVED" if rc == "5" else "LOGIN_FAILED", code)
PY
[ "$ALIVE" = yes ] || rm -f "$STATE/signin.rc" "$STATE/signin.pid" "$STATE/login.json" "$STATE/login.err"
```

Exit codes here are the [shared table](#exit-codes-and-owner-lines)'s, with `<what>` = "publishing":

- `WAITING` → the owner hasn't approved yet. Run this block again now; don't send the link again. Waiting never counts as a retry.
- `SIGNED_IN expires <date>` → send the done line ("Publishing is set up."), delete `$STATE/approve.url` and `$STATE/signin.sh`, and go to §3.
- `SIGNIN_STOPPED` → the sign-in stopped without a result (a restart, or a killed process). Start it again and run the check block: it resumes the same link (`SAME_LINK`), so don't send it again; run this block.
- `LINK_EXPIRED <code>` (exit 3) → the link expired before the owner approved it. Start the sign-in again and run the check block. It can end with `LINK_EXPIRED` once more before it makes a new link; then start it once more. Send the new link once, with the retry line: "That link expired. Please open this new one and approve. I'll carry on as soon as you do." If that link expires too, send the "couldn't" failed line and stop.
- `NOT_APPROVED <code>` (exit 5) → the owner declined, unticked an item (`OPENKEY_APPROVAL_NARROWER`: short links are all or nothing), or approved with another account. Nothing was saved. Send the "couldn't" failed line and stop; ask again only if the owner wants to.
- `LOGIN_FAILED <code>` → send the "couldn't" failed line, then the code on its own line, and see the errors table. Don't retry.

**Renewing.** Renew by running the §2 sign-in again (the same profile). Don't use `--replace-session`.

## 3. Publish — run exactly this block

Publish only after the owner said yes to "Anyone with the link can open it. Make a link?" (see "Ask before making a link"), and don't publish anything else meanwhile.

Always pass `--expires` — 24h unless the owner says otherwise — and always tell the owner the expiry. `SESSION_LIFETIME_EXCEEDED` handling: see the error table below.

**HTML files:** run the HTML check (end of this file) first. If it doesn't print `SELF_CONTAINED`, stop and ask the owner before publishing.

**File names:** a name with spaces, `..`, or characters other than letters, digits, `.`, `_` and `-` is stored under a readable safe name that keeps the extension (`Q3 plan (draft).md` → `Q3-plan-draft.md`); the link shows that stored name. CLI `1.0.0-beta.17` (the version §1 prints) can't publish such names: spaces fail with `PERMISSION_DENIED`, and other unusual names may fail with `INVALID_ARGUMENT` "share input is invalid". That is not a consent problem — don't run §2. Tell the owner this file needs CLI `1.0.0-beta.18`, and don't rename or copy their file yourself.

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
      "$STATE/context.json" "$STATE/context.err" "$STATE/share-publishing.json"
```

## Exit codes and owner lines

Publishing's sign-in (§2) follows the shared table below, with `<what>` = "publishing". The share commands' own codes are among its exceptions: branch on them in the errors table.

{{ERRORS}}

## Errors — `{"error":{"code","message","hint"?}}` on stderr; Commander option errors are plain text

Branch on `code`, never on the exit status alone — exits 4, 5 and 6 each cover several errors. Report the code and the CLI's message; never relay raw server text.

| Code | Exit | Action |
|---|---|---|
| `AUTH_REQUIRED` | 3 | Session expired/invalid — return to §2 on the same profile (ignore the CLI's own `auth login`/`init` hint) |
| `PERMISSION_DENIED` | 5 | Scope lacks the publishing permission — return to §2 once. If the new session gets the same error, stop and report; don't ask the owner to approve again. On CLI `1.0.0-beta.17` a file name with spaces also gives this — see §3 **File names**, not §2 |
| `SESSION_LIFETIME_EXCEEDED` | 2 | Two cases, told apart by the message. **"requested share lifetime exceeds session expiry"** → the share would outlive the login: use a SHORTER `--expires` (session end minus 1 hour), never a longer one. If the session has under 1 hour left, tell the owner the login is about to end and ask them to renew the sign-in (see "Renewing" in §2). **"share expiry must be at least 60 seconds from now"** → use the smallest allowed value (`2m`), never beyond the session end minus 1 hour. |
| `INVALID_EXPIRY` | 2 | `--expiry` outside 1 m–30 d |
| `INVALID_ARGUMENT` | 2 | Bad option combination or missing input file — fix the command. |
| `SESSION_IN_USE` | 2 | Live session would narrow — ask the owner; never `--replace-session` unprompted |
| `ORIGIN_MISMATCH` | 2 publish / 5 receive | Share origin vs configured service — check host/viewer-origin config, not re-login |
| `EXPIRED` / `NOT_FOUND` | 4 | The share expired or the id is wrong |
| `UNAVAILABLE` | 4 | Nothing was shared. If the message contains "not available in this release": that kind of share isn't available yet — tell the owner in one line, and don't retry. Otherwise (the location registry or the network couldn't be reached): report the CLI's message and suggest trying again later. Never retry in a loop |
| `REGISTRY_REJECTED` | 6 | The registry refused the owner's location record — retrying won't help; report it |
| `STORAGE_QUOTA_EXCEEDED` / `STORAGE_LIMIT_REACHED` | 10 (4 on CLIs before the TC-625 release) | The owner's TinyCloud storage is full, or this file is larger than what is left. Newer CLIs include the account's used and plan sizes. Nothing was shared. Tell the owner and point them to https://account.tinycloud.xyz/storage; don't retry and don't run §2 |
| `UPLOAD_FAILED` | 4 | The source upload failed; nothing was shared. Retry once shortly, then report |
| `PROFILE_NOT_FOUND` | 1 | No profile yet — the only case where `init` runs |
| `PROFILE_EXISTS` | 1 | `init` on an existing profile — use it; never `profile delete` |
| `APPROVAL_REQUEST_EXPIRED` | 3 | The sign-in link expired before the owner approved it — §2's wait block reports `LINK_EXPIRED` |
| `OPENKEY_APPROVAL_NARROWER` | 5 | The owner unticked an item; a short link is all or nothing, so nothing was saved — stop |
| `OPENKEY_UNREACHABLE` | 6 | OpenKey unreachable — report, retry later |
| `SCOPE_REJECTED` | 5 | Manifest rejected — report; don't retry the same request |
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

Markdown renders (headings, lists, bold, tables), and so do Mermaid diagrams; one that can't render shows its source. See `QUICKSTART.md` for the walkthrough and what the owner sees on their phone.
