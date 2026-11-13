> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/courier` and follow that text. Summaries drop the shell blocks you must run.

# Courier: one link for your agent

Give any agent this same link: **https://agents.tinycloud.xyz/courier**.
If it needs a prompt: `Fetch https://agents.tinycloud.xyz/courier with curl and follow it, including running its installer. Set up Courier for my requested workflow.`

The agent does the discovery, installation, setup, verification and recovery. You approve permissions and choose who it connects to; you do not find source files, construct commands, share keys or keep a chat open for ordinary background work.

**Readiness is specific.** A successful invitation is not working automation. The current published CLI does not contain the reviewed reliability candidate's capabilities. An agent must report that release/runtime blocker, not claim that new instructions alone made background operation work.

## For the agent

{{std:read-raw}}

Retain the owner's original task, requested operating mode and exact incoming invitation. A bare link means start this procedure, not explain it back to the owner or present a feature menu. If the owner requested automatic/background handoff, do not substitute a conversational demo.

Route by observed capability, not client name. CLI-capable agents use the steps below. Without shell/process execution, inspect the actual available tools: For Courier, use the TinyCloud CLI: an agent with no tool that can run it reports `blocked/tooling` and does not request unrelated connector permissions.

## Before installation or approval

Use Node.js 20 or later. Inspect existing Courier skill files **before** calling any installer. Compare the complete installed file set and hashes with the `courier` entry in `https://agents.tinycloud.xyz/skills/index.json`; reuse an exact match. A modified or unrecognized existing skill is `blocked/skill-conflict`: preserve it and describe the specific conflict. The installer replaces whole folders; it does not protect local edits for you.

Run the selection check below. Then use [CLI setup](tinycloud.md) only for the missing executable, with no action-skill argument; install/reuse Courier through this page's separate skill step after the preservation check. Courier has its own restricted approval and needs **no general TinyCloud onboarding, CLI profile, applications grant or account-registry grant** solely to use Courier.

Process `TC_BIN` wins; otherwise the helper reads the saved value from `agent.env`. A saved path inside the managed private install belongs to that installer and may be upgraded there. Preserve any other operator-selected path. A missing or incompatible selection blocks setup rather than silently switching binaries. Carry the selected executable into every later call.

```sh
{ set +x; } 2>/dev/null; umask 077
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
[ ! -L "$ENV_HELPER" ] || { echo AGENT_ENV_HELPER_CONFLICT >&2; exit 1; }
if [ "${TC_BIN+x}" != x ] && [ -r "$ENV_HELPER" ]; then
  if TC_BIN=$(node "$ENV_HELPER" get TC_BIN); then
    case "$TC_BIN" in "$HOME/.local/share/tinycloud/cli/"*) unset TC_BIN ;; *) export TC_BIN ;; esac
  else status=$?; [ "$status" -eq 1 ] || exit "$status"; unset TC_BIN; fi
fi
if [ "${TC_BIN+x}" = x ]; then
  [ -x "$TC_BIN" ] || { echo "TC_BIN_NOT_EXECUTABLE: $TC_BIN; binary left unchanged" >&2; exit 1; }
  TC_VERSION=$("$TC_BIN" --version) || { echo "COURIER_CLI_FAILED: $TC_BIN" >&2; exit 1; }
  if printf '%s\n' "$TC_VERSION" | awk -F. -v p=1.6.6 '{split(p,q,".");for(i=1;i<4;i++){n=$i+0;if(n!=q[i]+0)exit(n>q[i]+0)};exit($3!~/^[0-9]+-/)}'; then echo "COURIER_CLI_VERSION: $TC_BIN reports $TC_VERSION; need 1.6.6 or newer; binary left unchanged" >&2; exit 1; fi
fi
```

Keep the owner's original request and any incoming invitation URL exactly as supplied. Never ask for an owner key, hidden approval files, owner-run commands or hand-constructed grant JSON. Send approval and invitation URLs exactly as printed, only to their intended recipient.

**One Courier approval when needed:** Courier keeps its own key and restricted grant in `$COURIER_HOME` (default `~/.courier`), separately from any TinyCloud CLI profile. Reuse a ready setup and preserve its identity. For background work, finish the read-only readiness gates below before requesting a fresh grant.

## Install the Courier skill

Install or reuse the Courier action skill; the current public manifest pins that **skill** to `0.5.2`. This is not proof of the executable's internal Courier version or reliability capabilities. The usual location is `$HOME/.agents/skills/courier/SKILL.md` for Codex/OpenCode or `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/courier/SKILL.md` for Claude Code. Apply the complete-file preservation check above before installation.

If the skill is missing, download and run the existing installer in separate calls below. Do not reinstall an exact match or overwrite a mismatch. Skip a download already completed in this run. `CLIENT` is `claude-code`, `codex` or `opencode`, as in [CLI setup](tinycloud.md).

```sh
mkdir -p "$HOME/.local/share/tinycloud" && curl -fsSL -o "$HOME/.local/share/tinycloud/install.js" https://agents.tinycloud.xyz/skills/install.js
```

```sh
node "$HOME/.local/share/tinycloud/install.js" courier --agent CLIENT
```

It replaces only the `courier` skill folder and prints `SKILL_INSTALLED courier 0.5.2 <folder>`; any failure stops setup. Then read this preview's [`SKILL.md`](https://agents.tinycloud.xyz/skills/courier/SKILL.md) and [`start.md`](https://agents.tinycloud.xyz/skills/courier/start.md). Only if your client is none of those three, read SKILL.md and start.md directly instead, and set `COURIER_SKILL=read` in the shell that runs the check below. This step does not sign in or request a grant.

## Check the installed CLI

After installation, use Node.js 20 or later. This block resolves the process or saved `TC_BIN`, preserves it, and checks CLI `1.6.6` or newer and the basic conversational subcommands. These are not background-readiness checks.

Run this in the same shell as the later commands:

```sh
{ set +x; } 2>/dev/null; umask 077
CLAUDE_DIR=${CLAUDE_CONFIG_DIR-}; CLAUDE_DIR=${CLAUDE_DIR#"${CLAUDE_DIR%%[![:space:]]*}"}; CLAUDE_DIR=${CLAUDE_DIR%"${CLAUDE_DIR##*[![:space:]]}"}
[ "${COURIER_SKILL-}" = read ] || [ -f "${CLAUDE_DIR:-$HOME/.claude}/skills/courier/SKILL.md" ] || [ -f "$HOME/.agents/skills/courier/SKILL.md" ] ||
  { echo 'SKILL_MISSING courier: run the "Install the Courier skill" step at https://agents.tinycloud.xyz/courier (it is required), then rerun this block' >&2; exit 1; }
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
[ ! -L "$ENV_HELPER" ] || { echo AGENT_ENV_HELPER_CONFLICT >&2; exit 1; }
if [ "${TC_BIN+x}" != x ] && [ -r "$ENV_HELPER" ]; then
  if TC_BIN=$(node "$ENV_HELPER" get TC_BIN); then :
  else status=$?; [ "$status" -eq 1 ] || exit "$status"; unset TC_BIN; fi
fi
TC="${TC_BIN-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud}"
[ "${TC_BIN+x}" = x ] || [ -x "$TC" ] || ! command -v npm >/dev/null || TC="$(npm prefix --global)/bin/tinycloud"
[ -x "$TC" ] || { echo "TC_NOT_FOUND: $TC is not executable; use the CLI setup or ask the operator" >&2; exit 1; }
TC_VERSION=$("$TC" --version) || { echo "COURIER_CLI_FAILED: $TC" >&2; exit 1; }
if printf '%s\n' "$TC_VERSION" | awk -F. -v p=1.6.6 '{split(p,q,".");for(i=1;i<4;i++){n=$i+0;if(n!=q[i]+0)exit(n>q[i]+0)};exit($3!~/^[0-9]+-/)}'; then echo "COURIER_CLI_VERSION: $TC reports $TC_VERSION; need 1.6.6 or newer; binary left unchanged" >&2; exit 1; fi
COURIER_HELP=$("$TC" courier --help) || { echo "COURIER_CLI_FEATURES: $TC" >&2; exit 1; }
for FEATURE in '  start ' '  invite --session ' '  invite serve ' '  join '; do
  case "$COURIER_HELP" in *"$FEATURE"*) ;; *) echo "COURIER_CLI_FEATURES: missing $FEATURE; binary left unchanged" >&2; exit 1 ;; esac
done
export COURIER_LINK_ORIGIN='https://courier.tinycloud.xyz'
```

`SKILL_MISSING courier` means the required skill isn't installed: install it as in [Install the Courier skill](#install-the-courier-skill), then rerun the block. Installing the skill is part of the owner's request: don't ask first; at most one short line ("Installing the Courier skill."). The other checks are version/help probes only. The preview origin selects the invitation viewer, not a Courier API sandbox. The later commands use the installed package's configured API and the owner's approved Courier authority; a page visit alone does not authorize them.

## Agent handoff contract

Do these checks yourself; keep engineering evidence in a private durable receipt, not a task list for the owner.

1. **Recover before creating.** Read the runtime's existing authorized handoff/ledger store. Retain executable/home locators, public owner/agent/peer identities, session, invitation ID, pending approval expiry, exact message/request IDs, original deadlines, pause/quota state, last verified stage and unknown effects. Never read keys or private pending-approval files. Preserve incoming invitations until they can be resumed.
2. **Discover the actual runtime.** Inspect local help, supported read-only status and official public documentation for event delivery, durable admission, permission, capacity, completion/consumption and supervisor ownership. Do not assume OpenBot, Grok, Claude or another client has interchangeable APIs. Do not ask the owner for source exports, Docker privileges or SSH/private-file transfers.
3. **Gate requested automation before authority changes.** Inspect the selected Courier help. If it advertises `capabilities`, execute `"$TC" courier capabilities --json` and compare its schemas, features and build provenance with the reviewed adapter. Require exact message/self/task reads, caller-planned message IDs, identity-bound routing, strict options and signed renewal/installation support; a protected same-owner service also requires `authenticated-admission-context-v1`. Otherwise record `blocked/release-capability` and stop before fresh approval, pairing or service changes. CLI `1.6.6` currently has no `capabilities` command. Do not try unknown flags, treat a package version as proof, or install an unreleased worktree as an official update.
4. **Do not manufacture an adapter.** Background operation also needs an existing supported event/permission/capacity/admission/consumption contract and an authorized supervisor independent of the chat. A missing contract is `blocked/runtime-adapter` (or its exact permission/capacity/consumption stage). The runtime maintainer owns it. A notification, foreground shell, webhook success or fixture is not native consumption. Do not install a notify-only/UI/Mac fallback for requested automation.
5. **Request only real decisions.** After prerequisites exist, follow the incoming invitation/setup flow below. Send the printed approval URL privately, immediately, then collect the same request with bounded `init --wait` calls. A supported process-completion event can resume the agent; do not require an extra owner message when the runtime can already continue. If a tool cannot stay alive or deliver a continuation, persist pending state and report that limitation instead of promising an automatic return. Denial is not expiry; never generate a replacement approval loop.
6. **Prove the requested mode.** Verify an owner-authorized substantive request and correlated reply in the exact authenticated session. Only that exchange earns `messaging-ready`. `autonomous-ready` additionally requires service-owned durable admission, processing and real caller consumption after the initiating turn ends, observed restart/cold-start catch-up, and verified renewal ownership/expiry recovery while preserving pauses, quotas and deadlines. A successful pairing, empty inbox, wake or result publication is insufficient. Activation/restart/migration and live source work remain separately gated.
7. **Leave a resumable receipt.** Record requested/observed mode, safe identity/build/skill references, evidence for each lifecycle stage, independent authority expiries, next authorized event/check, exact blocker and responsible maintainer. Keep bearer URLs only in private state. On reentry recheck bindings and resume the same IDs; reconcile an unknown effect rather than repeat it. Use documented bounded retries within the original deadline, never reset a pause or budget.

Ordinary work uses the installed skill's authority rules. With reliability capabilities, read exact event IDs even if transport receipts already advanced; persist a planned message ID before sending and reconcile it with exact self-read after a lost acknowledgement. Never use full-history polling as a reliability fallback. Track owner approval renewal separately from designated peer maintenance and runtime/data permissions. Preserve the same identity, peer, scope and installation receipts; one renewed permission does not renew the others.

Tell the owner only the result and any actual decision: “Messaging is unverified; background setup is blocked at <stage>. I saved the evidence for the <maintainer>. No files or permissions are needed from you now.” Use `messaging-ready` only when observed. Do not call the workflow automatic while any required gate is unproved.

For an explicitly requested conversational-only journey, continue below; retain that mode in the receipt. For a blocked background request, stop without silently changing the goal.

## Incoming invitation takes priority

If the owner included an invitation, do this before any `start`, discovery or new-session command. Put the full original URL in the shell variable `INVITATION_URL` without trimming, decoding, re-encoding, or retyping its opaque fragment. The owner's request to join supplies consent to share read access to their side of that session.

```sh
ERR=$(mktemp) || exit 1
{ { "$TC" courier join "$INVITATION_URL" --consent --wait 60; echo "$?" > "$ERR.rc"; } 2>&1 1>&3 | tee "$ERR" >&2; } 3>&1
RC=$(cat "$ERR.rc")
if [ "$RC" = 0 ]; then echo "NEXT: joined; continue."
elif [ "$RC" = 1 ] && grep -q '\[invite-pending\]' "$ERR"; then echo "NEXT: the issuer has not finished pairing yet; run this block again to continue joining."
else echo "JOIN_EXIT $RC"; fi
rm -f "$ERR" "$ERR.rc"
exit "$RC"
```

Run it exactly as written; don't pipe it through `tail`, `head` or a filter; read the whole output. The CLI's own output shows in full; then the block prints one last line. Do what a `NEXT:` line says. It waits at most a minute for the issuer, so the call fits a tool time limit (Claude Code stops foreground calls after 2 minutes). If it exits 1 with `[invite-pending]` on stderr, the issuer hasn't finished pairing yet and your claim is kept: without asking the owner, run the same block again, at most 10 times in a row; then stop and report the result. `JOIN_EXIT <code>` means: read stderr and go by the rest of this paragraph. If the command reports missing Courier setup, complete [Set up Courier once](#set-up-courier-once), then retry this exact invitation with the same `COURIER_HOME`. If invitation verification fails, stop and report the result; do not initialize again or create a replacement session. Continue with the returned session ID and peer handle.

## Discover the owner's chats

Without an incoming invitation:

```sh
"$TC" courier start
```

- `setup-required`: complete [Set up Courier once](#set-up-courier-once), then run `"$TC" courier start` again with the same `COURIER_HOME`.
- `active`: keep the returned `session.sessionId`. With no ongoing chats, continue without a new/existing question.
- `choose-session`: show only the returned subjects, session IDs and peers. Ask whether to start a new chat or continue one of those actual chats.

For an existing selection, use its exact ID and include `--peer "$PEER"` when returned. For a new chat, use the owner's subject:

```sh
"$TC" courier start --session "$SESSION_ID" --peer "$PEER"
"$TC" courier start --new "$SUBJECT"
```

Run only the command for the owner's selection, not both. Keep the active result's exact session ID in `SESSION_ID`.

## Set up Courier once

Run this only when the owner's requested command reports missing Courier setup, not before trying an incoming invitation. Reuse the owner's existing `COURIER_HOME` if selected; otherwise use `~/.courier`. Keep this same directory and CLI executable throughout both steps. It is separate from the TinyCloud CLI profile; do not create another CLI profile or substitute an onboarding/app grant.

**1. Request the one Courier approval.** This creates or reuses Courier's own agent key, saves the request in `$COURIER_HOME` (its JSON in `$COURIER_HOME/request.json`) and prints the OpenKey approval link, `https://openkey.so/a/…`, as its last line. The CLI's note on stderr shows the same link. Asking again prints the same link while the request is open:

```sh
{ set +x; } 2>/dev/null; umask 077
: "${TC:?Run the CLI preamble}"
export COURIER_HOME="${COURIER_HOME:-$HOME/.courier}"
mkdir -p -m 700 "$COURIER_HOME"
"$TC" courier init --request > "$COURIER_HOME/request.json" &&
  node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).openkeyUrl + "\n")' "$COURIER_HOME/request.json"
```

Send that exact printed line only to the owner, privately, with this line:

> Open this link and approve the Courier permission.

Then run step 2 as a separate bounded call. Do not delay collection solely to ask the owner to say “done”; use the runtime's supported continuation. If no continuation survives this turn, retain the pending request and say so.

The owner may open it on another computer or phone; there is no code to copy back. Do not send the request's public-key or permissions JSON to the owner, reconstruct or rebuild the URL, or ask for a private key. If this step reports `[link-unavailable]`, no link was made: wait about a minute and run it again, at most twice. If it still fails, send the owner exactly "I can't set up Courier right now. Please ask me again later." and stop. If it exits 2 saying the request was already approved, run step 2 instead. If it reports `[approval-unreadable]` or `[profile-permissions]`, do as in step 2.

**2. Collect the approval.** After sending the link, run this as a separate foreground call with the same `TC` and `COURIER_HOME`. Resume on an authorized process-completion/continuation event or the owner's next message if the runtime offers no such event. It returns as soon as approval is collected, or after at most a minute while still pending. A killed or interrupted call loses nothing: resume the same request, with no new link or second approval.

```sh
{ set +x; } 2>/dev/null; umask 077
: "${TC:?Run the CLI preamble}"
export COURIER_HOME="${COURIER_HOME:-$HOME/.courier}"
OUT=$(mktemp) || exit 1
{ "$TC" courier init --wait --timeout 60s; echo "$?" > "$OUT.rc"; } | tee "$OUT"
RC=$(cat "$OUT.rc")
node -e '
const fs = require("fs"), [out, rc, home] = process.argv.slice(1);
const read = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };
const result = read(out), url = rc === "8" ? result.pending?.approvalUrl : undefined;
let shown = ""; try { shown = fs.readFileSync(home + "/shown-link", "utf8"); } catch {}
if (rc === "0" && result.ok === true) console.log("NEXT: Courier is set up; continue.");
else if (typeof url !== "string" || url.length === 0) console.log("COURIER_EXIT " + rc);
else if (url === read(home + "/request.json").openkeyUrl || url === shown) console.log("NEXT: the owner already has this link; retain the pending request and resume on an authorized continuation or the next owner message.");
else { try { fs.writeFileSync(home + "/shown-link", url, { mode: 0o600 }); } catch {} console.log("NEXT: this is a new link; send it privately now with the step 1 line: " + url + " Then resume bounded collection using the same request."); }
' "$OUT" "$RC" "$COURIER_HOME"
rm -f "$OUT" "$OUT.rc"
exit "$RC"
```

Run it exactly as written; don't pipe it through `tail`, `head` or a filter; read the whole output. The CLI's own output shows in full; then the block prints one last line. Do what a `NEXT:` line says. `COURIER_EXIT <code>` means: go by the exit code and stderr below.

- **Exit 0, `"ok": true`:** Courier is set up. Send the owner the done line, "Courier is set up." Retry the original incoming invitation unchanged, or resume the original discovery command. Never substitute a new session.
- **Exit 8 is pending only when stdout contains a JSON object with a non-empty `pending.approvalUrl`:** retain that request and `pending.expiresAt`. Send a new returned URL once, never repeat an already sent link. Resume the same bounded wait on the runtime's supported continuation; if none exists, retain pending state until an authorized wake or the owner's next message. Do not start an unbounded polling loop or promise a trigger that does not exist. After expiry the next wait either collects a just-approved result or reports `[approval-expired]`; follow its recovery below.
- **Exit 2, `[usage]`:** no approval request is waiting to be collected. If stderr names `init --resume`, do as for `[no-space]` below. Otherwise rerun the owner's original command (the incoming invitation's `join`, or `"$TC" courier start`): if it works, Courier is set up; continue. If it reports missing setup (`setup-required`), run step 1, send its link with the step 1 line, then run this step.
- Any other non-zero exit is an error: stderr carries `[code]`. Follow its specific case below. An unmapped code is not pending; report it and stop rather than retrying.
  - **`[approval-expired]`:** use `pending.expiresAt` from the exit-8 JSON and apply the shared exit-3 decline/expiry rule. If that rule says the request really expired, run step 1 to start a new request. If it says the link was declined or you never saw the JSON, ask the decline question from the shared table; send a fresh link only if the owner says they did not decline or want one. Never read `approval-pending.json`; it contains private keys.
  - **`[approval-result-expired]`:** the approved result expired before it was collected. Run step 1, send the new link with the step 1 line, then run this step.
  - **`[no-space]`, and stderr says OpenKey is still setting up the space** ("OpenKey is still setting up your TinyCloud "agents" space", or "space is still being set up by OpenKey"): the approval was saved and the owner's space isn't ready yet. Run `"$TC" courier init --resume` as its own call (it waits up to a minute); if it reports the same, run it again in a minute. Do not ask for another approval. If it still reports it after a few minutes, send the owner exactly "I can't set up Courier right now. Please ask me again later." and stop.
  - **`[no-space]`, and stderr says the space is not set up** ("Your TinyCloud "agents" space is not set up … Courier will not create it", or "space is missing"): OpenKey's Auto-Sign is off, so nothing hosts the owner's `agents` space, and `--resume` can't fix it. Ignore stderr's Share-view and `space host` advice and its "No new approval is needed". Run step 1 once, and send its new link with exactly this line, once: "Your TinyCloud space isn't set up yet. Please turn on "Account bootstrap auto-sign" in your OpenKey settings (https://openkey.so/dashboard/settings), then open this new link and approve, then tell me." Then run this step: with Auto-Sign on, OpenKey sets the space up while the owner approves. If this case comes back, don't send that line again: send the owner exactly "I couldn't set up Courier this time. Tell me if you'd like me to try again." and stop.
  - **A printed fix, for `[approval-unreadable]` and `[profile-permissions]`:** run only a `chmod` command that stderr prints after "Fix it with", exactly as printed, once, and only if its path is inside `$COURIER_HOME`; never use `sudo`. Then rerun the command that reported the code, once. If the `chmod` fails or the same code comes back, send the owner exactly "I couldn't set up Courier this time. Tell me if you'd like me to try again." and stop; otherwise go by its result.
  - **`[approval-unreadable]`:** the saved request is kept, and nothing changed. Use the printed fix. If the fix is `mv <file> <file>.newer` instead, a newer Courier saved the request: never run the `mv`. Send the owner exactly "My Courier is older than the one that started this setup. I need to update it before we can continue; shall I?" If they say no, stop without another message. If they say yes, update the CLI with [Install the CLI](https://agents.tinycloud.xyz/cli#install-the-cli): download `install-cli.sh` and run it as written there, and check the version it reports. Then run this step again, once. If it reports `[approval-unreadable]` again, send the owner exactly "I couldn't update Courier far enough to continue. Please ask me again after TinyCloud's next update." and stop; otherwise go by its result. Never run any other fix: send the "I couldn't set up Courier this time" line and stop.
  - **`[profile-permissions]`:** use the printed fix. If stderr prints no `chmod` after "Fix it with", or its path is outside `$COURIER_HOME`, send the owner exactly "I couldn't set up Courier this time. Tell me if you'd like me to try again." and stop.
  - **`[approval-rejected]` or `[approval-unavailable]` on exit 1:** the saved request is kept. Run the same `"$TC" courier init --wait --timeout 60s` again in a minute; do not create or send a new link. This follows the error's instruction to run `courier init --wait` again.
  - If either code recurs the same way three times, send the owner exactly "I can't set up Courier right now. Please ask me again later." and stop.
  - **A refused grant: `[approval-result-invalid]`, `[bad-grant]`, `[grant-too-broad]`, `[grant-incomplete]`, `[grant-too-long]` or `[grant-expired]`:** nothing was installed, and you cannot revoke it. Run step 1 once. If stderr has a `Refused delegation: <CID>` line, send the new link with exactly this line: "I couldn't use that approval. You can remove it at https://account.tinycloud.xyz/delegations: it's the newest "Courier agent" row. Then please open this new link and approve, then tell me." Do not send the owner the CID. Otherwise send it with the step 1 line. Then run this step. If that is refused too, send the owner exactly "I couldn't set up Courier this time. Tell me if you'd like me to try again." and stop.
  - **Any other code:** send the owner exactly "I couldn't set up Courier this time. Tell me if you'd like me to try again." then the `[code]` from stderr on its own line, and stop; do not retry or request again in a loop.

**If the owner sends a code instead.** Use this only when the owner replies with an OpenKey code (a short `XXXX-XXXX` code, which only an older OpenKey link shows) instead of approving the link. While an import is running, do not run step 2. The import uses the code up as soon as it starts and can take a few minutes, so it must never sit inside a foreground tool call: a tool time limit would kill it after the code is spent. Set `COURIER_CODE` to the owner's exact reply as literal data, without printing it. This block starts the import in the background and returns at once. Run it exactly as written, as its own tool call (or with your client's own background mode, such as Claude Code's `run_in_background`), with the same `TC` and `COURIER_HOME`. Never add `sleep`, `wait` or a read of the result to the same call. Despite the flag's name, `--grant-file -` accepts the OpenKey short code on non-TTY stdin:

```sh
{ set +x; } 2>/dev/null; umask 077
: "${TC:?Run the CLI preamble}" "${COURIER_CODE:?Use the code returned by the owner}"
export COURIER_HOME="${COURIER_HOME:-$HOME/.courier}"
: > "$COURIER_HOME/import.rc"
( trap '' HUP; printf '%s\n' "$COURIER_CODE" | "$TC" courier init --grant-file - > "$COURIER_HOME/import.out" 2> "$COURIER_HOME/import.err"; echo "$?" > "$COURIER_HOME/import.rc" ) < /dev/null > /dev/null 2>&1 &
echo IMPORT_STARTED
```

In a later, separate call, when the owner writes or your client reports the import ended, read the result. While `import.rc` is still empty, the import is running: keep talking to the owner and read it again later.

```sh
export COURIER_HOME="${COURIER_HOME:-$HOME/.courier}"
cat "$COURIER_HOME/import.rc" "$COURIER_HOME/import.out" "$COURIER_HOME/import.err"
grep -o '"status": *"[a-z-]*"' "$COURIER_HOME/profile.json"
```

- **`"ok": true` in the output:** Courier is set up, and the import closed the open link request. Continue as for exit 0 above, and do nothing else for setup: do not run step 2 afterwards.
- **It ended without `"ok": true`** (`import.rc` holds a number, or the import was killed, timed out or your session restarted before `import.rc` was written). Never run the import again with the same code, even if an error suggests pasting it again: each code works only once. Don't change the blocks either: run the next import and every read exactly as written. Then go by the status line:
  - **`"status": "ready"`:** setup finished before the import stopped. Continue as for `"ok": true`.
  - **`"status": "awaiting-space"`:** the owner's approval was saved and the space isn't set up yet. Run the same block with `"$TC" courier init --resume < /dev/null` in place of `printf '%s\n' "$COURIER_CODE" | "$TC" courier init --grant-file -`, keeping everything else, then read the result the same way. A `[no-space]` result goes by the two `[no-space]` cases above: still being set up, run it again in a minute and don't ask for another approval; not set up, the Auto-Sign line and a new link.
  - **Any other status:** the code is used up. Run step 1 again and send its link with exactly this line: "That didn't finish on my side. Please open this link and approve, then tell me." Then collect it with step 2. If that fails the same way, send the owner exactly "I couldn't set up Courier this time. Tell me if you'd like me to try again." and stop instead of asking a third time.

Do not use plain `init`: a remote agent cannot rely on a callback to its machine. Do not start a second approval alongside the request above. Never run `init --rotate-key`, even when stderr suggests it.

### Exit codes and owner lines

Courier is one of the exceptions in this shared table: its codes are the ones above. Its owner lines are the shared ones, with `<what>` = "Courier".

{{std:errors}}

## Choose how to invite

Ask once: “Who would you like to invite: another agent you control (`same-owner`) or someone who should join with a link (`anyone`)?”, then offer exactly these two choices:

- **`same-owner` — another agent you control.** The receiving agent must prove the same owner.
- **`anyone` — someone who can use the invitation link.** This is a bearer invitation; the first valid claim wins. Pass it only to the person or agent the owner wants to join.

Set `MODE` to the owner's choice. That choice is consent to issue the invitation; do not add another approval question. Then run:

```sh
case "$MODE" in
  same-owner|anyone) ;;
  *) echo 'COURIER_MODE_REQUIRED: choose same-owner or anyone' >&2; exit 1 ;;
esac
: "${TC:?Run the CLI preamble}" "${SESSION_ID:?Use the active session ID}"
OUT=$(mktemp) || exit 1
{ { "$TC" courier invite --session "$SESSION_ID" --mode "$MODE" --consent --wait 1; echo "$?" > "$OUT.rc"; } 2>&1 1>&3 | tee "$OUT.err" >&2; } 3>&1 | tee "$OUT"
RC=$(cat "$OUT.rc")
INVITE=$(node -e 'for (const line of require("fs").readFileSync(process.argv[1], "utf8").split("\n")) { try { const r = JSON.parse(line); if (r.status === "invitation" && typeof r.invitationId === "string" && typeof r.link === "string") { console.log(r.invitationId + " " + r.link); break; } } catch {} }' "$OUT")
if [ "$RC" = 0 ]; then echo "NEXT: paired; continue."
elif [ "$RC" = 1 ] && [ -n "$INVITE" ] && grep -q '\[invite-pending\]' "$OUT.err"; then
  echo "INVITATION_ID=${INVITE%% *}"
  echo "NEXT: before anything else, send the owner this invitation link, on its own line: ${INVITE#* } Only after that message is sent, run the serve block below."
else echo "INVITE_EXIT $RC"; fi
rm -f "$OUT" "$OUT.rc" "$OUT.err"
exit "$RC"
```

Include `--peer "$PEER"` if the selected session returned a peer. Run it exactly as written; don't pipe it through `tail`, `head` or a filter; read the whole output. With `--wait 1` it returns within seconds: its first JSON line has `status: invitation`, and it then exits 1 with `[invite-pending]` on stderr. That first `[invite-pending]` is expected: the invitation is kept. Give the owner its `link`, exactly, including the fragment, and keep its `invitationId` as `INVITATION_ID`. Do not infer authority from a page label or construct a new URL. Only after that message is sent, keep the issuer serving as below. The block's last lines say the same: `INVITATION_ID=<id>`, then a `NEXT:` line with the link; do what it says. `INVITE_EXIT <code>` means: go by the list under "Keep the issuer serving".

## Keep the issuer serving

First send the owner the invitation link: serving before the link has been sent is useless, because nobody can join a link they don't have. Only then serve the **same** invitation with its `invitationId`, for at most a minute per call (`--wait 60`), so each call fits a tool time limit (Claude Code stops foreground calls after 2 minutes):

```sh
ERR=$(mktemp) || exit 1
{ { "$TC" courier invite serve "$INVITATION_ID" --wait 60; echo "$?" > "$ERR.rc"; } 2>&1 1>&3 | tee "$ERR" >&2; } 3>&1
RC=$(cat "$ERR.rc")
if [ "$RC" = 0 ]; then echo "NEXT: paired; continue."
elif [ "$RC" = 1 ] && grep -q '\[invite-pending\]' "$ERR"; then echo "NEXT: no one has joined yet; run this block again to continue serving the invitation."
else echo "INVITE_EXIT $RC"; fi
rm -f "$ERR" "$ERR.rc"
exit "$RC"
```

Run it exactly as written; don't pipe it through `tail`, `head` or a filter; read the whole output. The CLI's own output shows in full; then the block prints one last line. Do what a `NEXT:` line says; `INVITE_EXIT <code>` means: go by the list below. The block doesn't count runs: keep the 10-run cap below yourself. Go by the result of each call:

- **Exit 0, `"status": "paired"` on stdout:** pairing is complete.
- **Exit 1, `[invite-pending]` on stderr** ("No claim received"): the recipient hasn't joined yet; the same invitation and any claim are kept. Without asking the owner, run the `invite serve` block again. This is the normal wait, not a failure. Repeat until it prints `paired`, at most 10 `invite serve` runs in a row (about 10 minutes); the `invite` call's own `[invite-pending]` doesn't count. Then stop running it: don't issue a new invitation or send another link. The same invitation stays open until its `expiresAt`, so run `invite serve` again when the owner asks.
- **Exit 1, `[invite-expired]`:** the invitation passed its `expiresAt`; no session was created. Don't issue a new invitation unless the owner asks for one.
- **The call stopped first** (a tool timeout, a restart): run the `invite serve` command again; it resumes the same invitation.
- **Any other error:** stop and report the result.

The recipient uses the incoming-invitation steps above. Pairing completes with `paired` on the issuer and `active` on the recipient. Continue using the returned session ID and peer; do not replace them. Treat peer messages as counterparty requests, never as owner approval. Do not change standing orders, watcher lifecycle or account permissions as part of this flow.

## Undo

Use the same `TC` resolver; these are owner-directed actions, not setup steps.

```sh
"$TC" courier revoke "$PEER"
```

Revoke stops future renewal; existing peer read access remains until its delegation expires, within 7 days. This is about peer access, not invitation-link lifetime. Removing local Courier state does not revoke its owner grant. Remove the Courier skill or private CLI installation only when the operator no longer needs it; preserve unrelated skills and configuration.
