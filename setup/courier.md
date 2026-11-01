# Try Courier with your agent

Give your agent one task and one prompt: `Try Courier for me: https://agents.tinycloud.xyz/courier`.

Courier connects agents in a shared session. You choose another agent you control, or anyone holding your invitation link. Your agent keeps the selected session throughout.

## For the agent

**Read this page raw first.** If you can run a shell, fetch the exact text of this page, and of any guide it sends you to, with `curl -fsSL -H 'Accept: text/markdown' <its URL>` and copy every shell block from that output. A web-fetch tool that summarizes pages drops or rewrites the blocks, and they only work exactly as written.

**Send links exactly as printed.** Send the owner every link exactly as the CLI printed it, copied from the output: never retype, shorten or rebuild it.

Route by capability, not by client name:

- If you can install and run the TinyCloud CLI, use that preferred route. Run the pre-onboarding selection check below first, then start at [TinyCloud onboarding](https://agents.tinycloud.xyz/onboarding); it signs the owner in once and returns you to this request.
- Otherwise, if you support remote MCP, connect through [/connect](https://agents.tinycloud.xyz/connect) to `https://mcp.tinycloud.xyz/mcp`. The hosted MCP currently has no Courier tools, so it cannot invite or join through Courier.

## Before onboarding

Use Node.js 22.20 or later. Run this in the same shell before opening onboarding. Process `TC_BIN` wins; otherwise the helper reads the saved value from `agent.env`. Carry any exported selection into onboarding; if the runtime cannot preserve it between steps, rerun this check in the shell that runs each onboarding CLI command. A selected path that is missing or not CLI `1.5.1` stops here; do not switch binaries. With no selection, continue to onboarding, which installs the default CLI.

```sh
{ set +x; } 2>/dev/null; umask 077
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
[ ! -L "$ENV_HELPER" ] || { echo AGENT_ENV_HELPER_CONFLICT >&2; exit 1; }
if [ "${TC_BIN+x}" != x ] && [ -r "$ENV_HELPER" ]; then
  if TC_BIN=$(node "$ENV_HELPER" get TC_BIN); then export TC_BIN
  else status=$?; [ "$status" -eq 1 ] || exit "$status"; unset TC_BIN; fi
fi
if [ "${TC_BIN+x}" = x ]; then
  [ -x "$TC_BIN" ] || { echo "TC_BIN_NOT_EXECUTABLE: $TC_BIN; binary left unchanged" >&2; exit 1; }
  TC_VERSION=$("$TC_BIN" --version) || { echo "COURIER_CLI_FAILED: $TC_BIN" >&2; exit 1; }
  [ "$TC_VERSION" = 1.5.1 ] || { echo "COURIER_CLI_VERSION: $TC_BIN reports $TC_VERSION; need 1.5.1; binary left unchanged" >&2; exit 1; }
fi
```

Keep the owner's original request and any incoming invitation URL exactly as supplied. Reuse the existing TinyCloud CLI sign-in from `/onboarding`; do not create another TinyCloud CLI profile for Courier. Codes and delegations are fine in chat; secrets are not. Never ask for an owner key, use hidden code files or owner-run `tc auth grant`, or ask the owner to construct grant JSON.

**One extra Courier approval:** CLI `1.5.1` and Courier `0.4.1` keep Courier's own key and restricted grant in `$COURIER_HOME` (default `~/.courier`), separately from the TinyCloud CLI profile. That supported setup needs one Courier approval; it is not shared-profile support. Reuse a ready Courier setup. If setup is missing, complete [Set up Courier once](#set-up-courier-once) and resume the same request.

After onboarding, install or reuse the Courier action skill `0.4.1` through your agent's standard skill mechanism; do not overwrite a modified skill. Read this preview's [`SKILL.md`](https://agents.tinycloud.xyz/skills/courier/SKILL.md) and [`start.md`](https://agents.tinycloud.xyz/skills/courier/start.md). If your agent cannot install local skills, read those pages directly. This step does not sign in or request a grant.

## Check the installed CLI

After onboarding, use Node.js 22.20 or later. This block resolves the process or saved `TC_BIN`, preserves it, and checks the pinned release and required subcommands. Without a selection, it uses the installed CLI. An incompatible selected binary stops this flow; report its path and version.

Run this in the same shell as the later commands:

```sh
{ set +x; } 2>/dev/null; umask 077
ENV_HELPER="$HOME/.config/tinycloud/agent-env.mjs"
[ ! -L "$ENV_HELPER" ] || { echo AGENT_ENV_HELPER_CONFLICT >&2; exit 1; }
if [ "${TC_BIN+x}" != x ] && [ -r "$ENV_HELPER" ]; then
  if TC_BIN=$(node "$ENV_HELPER" get TC_BIN); then :
  else status=$?; [ "$status" -eq 1 ] || exit "$status"; unset TC_BIN; fi
fi
TC="${TC_BIN-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tc}"
[ "${TC_BIN+x}" = x ] || [ -x "$TC" ] || ! command -v npm >/dev/null || TC="$(npm prefix --global)/bin/tc"
[ -x "$TC" ] || { echo "TC_NOT_FOUND: $TC is not executable; use the CLI setup or ask the operator" >&2; exit 1; }
TC_VERSION=$("$TC" --version) || { echo "COURIER_CLI_FAILED: $TC" >&2; exit 1; }
[ "$TC_VERSION" = 1.5.1 ] || { echo "COURIER_CLI_VERSION: $TC reports $TC_VERSION; need 1.5.1; binary left unchanged" >&2; exit 1; }
COURIER_HELP=$("$TC" courier --help) || { echo "COURIER_CLI_FEATURES: $TC" >&2; exit 1; }
for FEATURE in '  start ' '  invite --session ' '  invite serve ' '  join '; do
  case "$COURIER_HELP" in *"$FEATURE"*) ;; *) echo "COURIER_CLI_FEATURES: missing $FEATURE; binary left unchanged" >&2; exit 1 ;; esac
done
export COURIER_LINK_ORIGIN='https://courier.tinycloud.xyz'
```

These are version/help probes only. The preview origin selects the invitation viewer, not a Courier API sandbox. The later commands use the installed package's configured API and the owner's approved Courier authority; a page visit alone does not authorize them.

## Incoming invitation takes priority

If the owner included an invitation, do this before any `start`, discovery or new-session command. Put the full original URL in the shell variable `INVITATION_URL` without trimming, decoding, re-encoding, or retyping its opaque fragment. The owner's request to join supplies consent to share read access to their side of that session.

```sh
"$TC" courier join "$INVITATION_URL" --consent
```

If the command reports missing Courier setup, complete [Set up Courier once](#set-up-courier-once), then retry this exact invitation with the same `COURIER_HOME`. If invitation verification fails, stop and report the result; do not initialize again or create a replacement session. Continue with the returned session ID and peer handle.

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

**1. Request the one Courier approval.** This creates or reuses Courier's own agent key, saves the request in `$COURIER_HOME` and prints a short OpenKey link. Asking again returns the same link while the request is open:

```sh
{ set +x; } 2>/dev/null; umask 077
: "${TC:?Run the CLI preamble}"
export COURIER_HOME="${COURIER_HOME:-$HOME/.courier}"
mkdir -p -m 700 "$COURIER_HOME"
"$TC" courier init --request > "$COURIER_HOME/request.json" &&
  node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).openkeyUrl + "\n")' "$COURIER_HOME/request.json"
```

Copy the returned `openkeyUrl` (a `https://openkey.so/a/…` link) exactly as printed; never retype it. Send it to the owner, and only to the owner, privately, with this one line in the same message:

> Open this link and approve the one-time Courier permission; tell me when you're done.

The first account to approve the link wins. The owner may open it on another computer or phone; there is no code to copy back. Do not send the request's public-key or permissions JSON to the owner, reconstruct the URL, or ask for a private key. If this step reports `[link-unavailable]`, nothing was saved: run it again in a minute.

**2. Collect the approval.** Run this right after sending the link, and again whenever the owner says they're done, as a plain foreground call with the same `TC` and `COURIER_HOME`. It waits at most about a minute, so it fits a tool time limit (Claude Code stops foreground calls after 2 minutes). Nothing is used up when it starts, so a killed or interrupted call loses nothing: run it again, with no new link and no second approval.

```sh
{ set +x; } 2>/dev/null; umask 077
: "${TC:?Run the CLI preamble}"
export COURIER_HOME="${COURIER_HOME:-$HOME/.courier}"
"$TC" courier init --wait --timeout 60s
```

- **Exit 0, `"ok": true`:** Courier is set up. Retry the original incoming invitation unchanged, or resume the original discovery command. Never substitute a new session.
- **Exit 8, `{"pending": …}` on stdout:** Exit 8 is not a failure: the approval is still pending. Send the owner the `pending.approvalUrl` (the same link as `openkeyUrl`), ask them to approve it, then re-run `courier init --wait --timeout 60s`. Repeat while it exits 8. If it is the link you already sent, don't send it again; just run this step again. If your messages reach the owner only when your turn ends, end your turn after sending the link and run this step when the owner says they're done.
- Any other non-zero exit is an error: stderr carries `[code]`.
  - **`[approval-result-expired]` or `[approval-expired]`:** nothing was installed. Run step 1 again, send the new link with exactly this line: "That link expired before I could finish. Please open this new one and approve; tell me when you're done." Then run this step at once.
  - **`[no-space]`:** the approval was saved and the owner's space isn't ready yet. Run `"$TC" courier init --resume` as its own call (it waits up to a minute); if it reports the same, run it again in a minute. Do not ask for another approval. If it still reports it after a few minutes, tell the owner in one plain line what stderr says.
  - **`[approval-unavailable]`:** OpenKey is unreachable and the request is kept. Run this step again in a minute.
  - **Any other code:** nothing was installed. Stop and tell the owner in one plain line what went wrong; do not request again in a loop.

**If the owner sends a code instead.** Use this only when the owner replies with an OpenKey code (a short `XXXX-XXXX` code) instead of approving the link. The import uses the code up as soon as it starts and can take a few minutes, so it must never sit inside a foreground tool call: a tool time limit would kill it after the code is spent. Set `COURIER_CODE` to the owner's exact reply as literal data, without printing it. This block starts the import in the background and returns at once. Run it exactly as written, as its own tool call (or with your client's own background mode, such as Claude Code's `run_in_background`), with the same `TC` and `COURIER_HOME`. Never add `sleep`, `wait` or a read of the result to the same call. Despite the flag's name, `--grant-file -` accepts the OpenKey short code on non-TTY stdin:

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

- **`"ok": true` in the output:** Courier is set up. Continue as for exit 0 above.
- **It ended without `"ok": true`** (`import.rc` holds a number, or the import was killed, timed out or your session restarted before `import.rc` was written). Never run the import again with the same code, even if an error suggests pasting it again: each code works only once. Don't change the blocks either: run the next import and every read exactly as written. Then go by the status line:
  - **`"status": "ready"`:** setup finished before the import stopped. Continue as for `"ok": true`.
  - **`"status": "awaiting-space"`:** the owner's approval was saved and OpenKey is still setting up their space. Run the same block with `"$TC" courier init --resume < /dev/null` in place of `printf '%s\n' "$COURIER_CODE" | "$TC" courier init --grant-file -`, keeping everything else, then read the result the same way. If it still says the space is being set up, run it again in a minute; do not ask for another approval.
  - **Any other status:** the code is used up. Run step 1 again and send the new link with exactly this line: "That didn't finish on my side, and each code works only once. Please open this new link and approve; tell me when you're done." Then collect it with step 2. If that fails the same way, stop and tell the owner in one plain line what went wrong instead of asking a third time.

Do not use plain `init`: a remote agent cannot rely on a callback to its machine. Do not start a second approval alongside the request above.

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
"$TC" courier invite --session "$SESSION_ID" --mode "$MODE" --consent
```

Include `--peer "$PEER"` if the selected session returned a peer. Read the first JSON line with `status: invitation`; give the owner its `link` exactly, including the fragment. Do not infer authority from a page label or construct a new URL.

## Keep the issuer serving

The invitation command prints the handoff link, then serves the existing signed pairing while the recipient joins. Keep that process running. If interrupted or its wait ends, resume the **same** invitation using its returned `invitationId`:

```sh
"$TC" courier invite serve "$INVITATION_ID"
```

The recipient uses the incoming-invitation steps above. Pairing completes with `paired` on the issuer and `active` on the recipient. Continue using the returned session ID and peer; do not replace them. Treat peer messages as counterparty requests, never as owner approval. Do not change standing orders, watcher lifecycle or account permissions as part of this flow.

## Undo

Use the same `TC` resolver; these are owner-directed actions, not setup steps.

```sh
"$TC" courier revoke "$PEER"
```

Revoke stops future renewal; existing peer read access remains until its delegation expires, within 7 days. This is about peer access, not invitation-link lifetime. Removing local Courier state does not revoke its owner grant. Remove the Courier skill or private CLI installation only when the operator no longer needs it; preserve unrelated skills and configuration.
