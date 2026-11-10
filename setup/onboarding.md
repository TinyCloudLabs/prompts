> **Agents: read this file raw, not summarized.** If your fetch tool returned a summary, fetch it again with `curl -fsSL https://agents.tinycloud.xyz/onboarding.md` and follow that text. Summaries drop the shell blocks you must run.

# Set up TinyCloud for the person you're working for

Give any AI agent this page, and it sets you up so it can act for you in your own TinyCloud: you sign in (or create an account) with OpenKey and approve what it may do. Then it carries on with what you asked for.

**Paste into your agent:**

> Fetch https://agents.tinycloud.xyz/onboarding.md with curl and follow it, including running its installer. Set me up with TinyCloud.

- **You approve:** two OpenKey screens. The first signs you in, or creates your account, and lets the agent read, change and delete your apps' data for 30 days. The second lets it see which spaces and apps you have, read-only, for 30 days. Each screen shows exactly what it grants before you approve. There's no code to send back: tell your agent when you've approved.
- **Then:** the agent continues with your request. If it needs more, it asks you on another OpenKey screen.
- **Undo:** see [Undo](#undo).

## How this works

The agent's TinyCloud CLI makes a key on the computer it runs on: the owner's computer, or the agent's own workspace. The owner approves two OpenKey screens on any device. Each short link names a signed request; only the requesting CLI can collect and verify the encrypted result. The agent sends the link, and reruns the command when the owner next writes. No pasted code or localhost callback is needed, including from a phone or a remote agent. The owner tells the agent when approval is complete; hosted MCP uses approval links too.

After an interruption, rerun the same command with the same profile to resume the pending approval. The owner can revoke a grant at https://account.tinycloud.xyz/delegations.

## For the agent

{{std:read-raw}}

{{std:relay}}

The person you are talking to is the **owner**. Onboarding sets up three things so you can act for them: a TinyCloud profile for them on this computer, their sign-in with OpenKey, and a starting grant. Keep their original request; after onboarding, continue it in this conversation without asking for another link.

Pick the route for where you run:

- **You can install and run the TinyCloud CLI**, on the owner's computer or in your own workspace: follow [CLI](#cli). This is the preferred route.
- **Otherwise, if you support remote MCP** (for example ChatGPT, Claude, Gemini, Grok or Perplexity): follow [MCP](#mcp).

### Principles

Follow these on every TinyCloud page.

1. **Permission comes from the owner.** A grant lets you do only what it names. When you need something you don't have, ask the owner for it through OpenKey; don't work around it.
2. **Ask as few times as you can.** Ask for what the task needs in one request, and tell the owner up front how many approvals are coming.
3. **The owner never sees raw permissions.** Give them the OpenKey link; OpenKey shows the request in plain words. Never show them a delegation, a permission list or JSON to approve.
4. **Every request comes with its link.** When you ask the owner to approve or fetch something, give the link and one line saying what to do, in the same message.
5. **Grants are fine; secrets are not.** An OpenKey link, the grant it produces and a delegation only work for the agent they were made for. Never ask for a password, private key, session key, recovery phrase, API key or secret value, and never read out or copy a profile's `key.json` or `session.json`, or the part of a share link after `#`.
6. **Send only links you started.** Give the owner only OpenKey links that your own command or tool returned in this conversation.
7. **No account needed first.** The owner doesn't need to have used TinyCloud before: OpenKey creates their account during the first approval.

## CLI

**1. The CLI.** Follow [the CLI setup](tinycloud.md) with its caller contract, then return to step 2 here. It installs the `tinycloud` command and attempts the optional `tinycloud-cli` skill in one download call and one run call. If it reports `TC_SKILL_STATUS unavailable`, continue onboarding with the selected CLI; the command does not depend on the skill. If a guide sent you here, give the CLI setup that guide's action skill too (`apps` for /apps, `courier` for /courier, `chat` for /chat), so the same run call installs it. Replace `<TC_BIN>` in each shell block with the selected absolute executable path; separate tool calls need not share shell variables.

```sh
TC='<TC_BIN>'
"$TC" onboard --help | grep -qF -- --timeout && echo ONBOARD_READY
```

**CLI rule (stable `1.6.5`): run step 2's block as written; its check runs before `onboard` and decides. Don't run a `tinycloud` or `--version` check of your own, and don't judge who installed the CLI yourself. Only a `TC_OLDER` line from step 2 or /cli means the operator chose an older CLI: tell the owner in one line that it is older than the required `1.6.5`, and stop. Any other older CLI is yours, including one on `PATH` or linked from `~/.local/bin`: step 2 prints `CLI_OLDER`; follow https://agents.tinycloud.xyz/cli once and rerun step 2. Upgrading the CLI is part of the owner's request: don't ask first; at most one short line ("Updating the TinyCloud CLI."). Never run `tinycloud upgrade` or a global npm install of the TinyCloud CLI; the guide's installer (/cli) handles upgrades. A newer CLI is never downgraded. No global installation, second beta CLI, `sudo`, or download piped into a shell.** No `ONBOARD_READY` means the selected CLI can't onboard: report the selected path and stop.

**2. Run onboarding.** It asks for both approvals, step 1 first, then step 2. It uses the selected default profile, or `TC_PROFILE` if set. Run this in the foreground, as its own shell call. Each run prints the pending link and exits, unless the owner has already approved; a rerun resumes the same link, and a resumed run can spend up to about 10 seconds checking the approval:

```sh
TC='<TC_BIN>'
V=$("$TC" --version)
if printf '%s\n' "$V" | awk -F. -v p=1.6.5 '{split(p,q,".");for(i=1;i<4;i++){n=$i+0;if(n!=q[i]+0)exit(n>q[i]+0)};exit($3!~/^[0-9]+-/)}'; then
  O=${TC_BIN:-}; H="$HOME/.config/tinycloud/agent-env.mjs"
  if [ -z "$O" ] && [ -r "$H" ]; then O=$(node "$H" get TC_BIN) || O=; fi
  [ -z "$O" ] || ! node -e 'const{realpathSync:r}=require("fs"),[f,d]=process.argv.slice(1),i=(a,b)=>a.startsWith(b+"/");let x=i(f,d);try{x=x||i(r(f),r(d))}catch{}process.exit(x?0:1)' "$O" "$HOME/.local/share/tinycloud/cli" || O=
  if [ "$TC" = "$O" ]; then M="TC_OLDER $V $TC is older than the pinned 1.6.5; keeping this operator-selected CLI"
  else M="CLI_OLDER $V $TC: run the CLI setup at https://agents.tinycloud.xyz/cli (it upgrades a CLI the agent installed), then rerun this block"; fi
  echo "$M" >&2; exit 1
fi
OUT=$(mktemp) || exit 1
{ "$TC" onboard --timeout 1s; echo "$?" > "$OUT.rc"; } | tee "$OUT"
RC=$(cat "$OUT.rc")
URL=$(node -e 'try{const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pending;if(p&&typeof p.approvalUrl==="string")console.log(p.approvalUrl)}catch{}' "$OUT")
rm -f "$OUT" "$OUT.rc"
if [ "$RC" = 0 ]; then echo "NEXT: onboarding is done; continue with the owner's goal."

elif [ "$RC" = 8 ] && [ -n "$URL" ]; then echo "NEXT: send the owner this link in your reply now, on its own line, with the onboarding guide's line: $URL When the owner next writes to you, run this block again. If you already sent this exact link, don't send it again."
elif [ "$RC" = 6 ]; then echo "NEXT: exit 6 is a network error; run this same block again once. If an approval request was saved, it resumes; do not create a new link. If that rerun also exits 6, follow the shared table."
elif [ "$RC" = 3 ]; then echo "ONBOARD_EXIT 3"; echo "NEXT: Before doing anything else, compare now with pending.expiresAt from the earlier exit-8 JSON. If more than 2 minutes remain, do not run a command or create a link; ask exactly \"Did you decline that request? If not, I'll send you a fresh link.\" and wait. If 2 minutes or less remain, it's a real expiry: run this block again to create a fresh link. If you do not have the earlier exit-8 JSON, ask the owner the decline question and wait."
else echo "ONBOARD_EXIT $RC"; fi
exit "$RC"
```

Run it exactly as written; don't pipe it through `tail`, `head` or a filter; read the whole output. The CLI's own output shows in full; then the block prints its final status lines. Do what a `NEXT:` line says. `ONBOARD_EXIT <code>` means: use "If something goes wrong" below and the [shared table](#exit-codes-and-owner-lines). Run the block again until it exits 0, and go by its exit code each time.

**Exit 8 is pending only when stdout contains a non-empty `pending.approvalUrl`.** The owner hasn't approved yet. The object has `step` (1 or 2), `of` (2), `approvalUrl` (the link) and `expiresAt`; stderr shows the same link on the line after `Approve in OpenKey (open the complete link):`. Step 2's link appears only after the owner approves step 1. Send each new link as the **complete URL on its own line** (do not shorten, re-encode, split or strip its fragment), followed by: "Open this link and approve, then tell me." Then end your turn. When the owner next writes to you, run the block again: the command itself sees the approval. Before the first link, say this text word for word:

> I'll set up TinyCloud so I can act for you. You'll approve two OpenKey screens: first, sign in (or create your account) and let me read, change and delete your apps' data for 30 days; then let me see which spaces and apps you have, read-only, for 30 days.

When a rerun shows step 2's link, send it in your reply at once, without the step-1 text, and run the block again on the owner's next message. When it shows a link you already sent, don't send it again; run the block again on the owner's next message. This exit 8 is the normal wait, not a failure: it never counts toward a retry limit.

- **Exit 0, stdout `"onboarded": true`:** retain the returned `profile`, `ownerDid` and `host`, send the done line ("TinyCloud is set up."), then continue [the owner's goal](#the-owners-goal). Do not create another app profile or request permissions already covered. A stored session alone is not proof of storage access; the app guide checks an actual read. For setup only, end with what the owner can ask next: records, sharing, stored API keys or meetings.
- **The command stopped first** (a tool timeout, a restart): rerun the identical command/profile. It preserves completed approvals and shows the pending link again; if it's a link you already sent, don't send it again. If it says `PROFILE_LOCK_TIMEOUT`, wait 30 seconds and run it again.

Never run `onboard --code`: these links don't produce a code, and the approval is retrieved automatically, including from a phone.

**If something goes wrong:** exit codes go by the [shared table](#exit-codes-and-owner-lines), with `<what>` = "TinyCloud". These come first:

- **`CLI_OLDER <version> <path>`:** the selected CLI is older than `1.6.5` and the block stopped before `onboard`. Follow [the CLI setup](tinycloud.md) once (it upgrades a CLI the agent installed), use its new `TC_SELECTED` path as `<TC_BIN>`, then rerun the block. Upgrading the CLI is part of the owner's request: don't ask first; at most one short line ("Updating the TinyCloud CLI."). Never run `tinycloud upgrade` or a global npm install of the TinyCloud CLI; the guide's installer (/cli) handles upgrades.
- **`TC_OLDER <version> <path>`:** the operator selected that older CLI. Tell the owner in one line that it is older than the required `1.6.5`, and stop; don't replace it.
- **Your client asks the owner to confirm the command:** show them the step and this reply to send: "Go ahead: run `tinycloud onboard` to set up TinyCloud." Run it again once they agree. Don't change their settings or run it another way.
- **Exit 6:** a network error. Follow the shared table: run the same command again once, without a new link or reporting it to the owner; if it exits 6 again, tell the owner exactly "I can't set up TinyCloud right now. Please ask me again later.", then put the stderr error code on its own line and stop.
- **`SPACE_SETUP_PENDING`:** a new account's storage can take a moment after the first approval. Tell the owner, wait a minute, and run the same command again. Don't ask for another approval.
- **`PROFILE_NOT_ONBOARDABLE`:** preserve the existing profile. Inspect `"$TC" status --json` and use the owner's existing account and permissions where possible; do not overwrite them or silently switch accounts. If a separate onboarding profile is necessary, explain why, choose an unused profile name explicitly and run `"$TC" --profile <name> onboard --timeout 1s` the same way. Keep using that returned profile for the goal.
- **The link is incomplete:** rerun the identical command and use the current link it returns. Do not reconstruct a fragment or reuse a link from another request.

## MCP

**1. Connect TinyCloud.** If TinyCloud tools aren't available yet, give the owner the steps for their app from [Set up TinyCloud](connect.md), then stop until they've connected. Signing in there with OpenKey creates their account if they don't have one.

**2. Connect the account.** Call `tinycloud_connect`. If it returns `approvalUrl`, send it with this line: "Open this link, check what it asks for, and approve. Then tell me to continue." It lets you see which spaces and apps the owner has, read-only, for 30 days. When they say to continue, call `tinycloud_connect` again until it reports `connected`.

**3. Continue.** Go to [the owner's goal](#the-owners-goal) and use the TinyCloud tools for it. When a tool returns `authority_required` with `approval.url`, send that link with the same line, wait, then call the same tool again unchanged.

## The owner's goal

Fetch the guide for what the owner asked for yourself and follow it from the start, in this conversation. Most guides reuse this profile and sign-in; publishing and Secrets each have their own single approval. If the task needs more than the starting grant, ask once with one OpenKey link (see [Asking for more later](#asking-for-more-later)) and say in one line what it's for.

| The owner wants to | Guide |
| --- | --- |
| Keep records or build a small app: meals, weight, workouts, todos | [/apps](tc-apps.md) |
| Share a document or page | [/share](share.md) |
| Publish a page with a link | [/publish](publish.md) |
| Use an API key or other secret | [/secrets](secrets.md) |
| Ask about their meetings (CLI route only) | [/chat](../apps/tinychat/setup.md) |
| Post to their TinyCloud Home feed | [/feed](https://agents.tinycloud.xyz/feed) |
| Let you work with another person's agent | [/courier](courier.md) |
| Something not listed here | The ability list at [/setup](README.md) |

With MCP, use the connected TinyCloud tools for the goal. The hosted MCP has no meeting tools yet, so meetings use the CLI route. For meetings, or anything else the tools don't cover, tell the owner it needs an agent that can install and run the TinyCloud CLI.

### Asking for more later

When the task needs a permission not already granted, keep the same profile, host and owner and request only that missing access:

```sh
TC='<TC_BIN>'
"$TC" auth request --cap 'tinycloud.kv:<space>:<path>:<actions>' --grant --no-popup --expiry 30d
```

For this link-based `auth request --grant`, use the shared table's persistent-session rule below. It has no `--timeout` and blocks until the approval is resolved; it does not return a pending-link result. Run it in a persistent shell session that streams stderr and stays alive while you reply. Send the complete URL exactly as printed on its own line as soon as it appears, including everything after `#` (never retype or shorten it), with one line on what it allows and this line: "Open this link and approve; tell me when you're done." There's no code; never ask the owner for one. A request that covers more than one space prints one link per space; send each the same way. Then wait for the owner and read the command's final output: JSON with `"changed": true` means the grant is saved on this profile (`"changed": false` means it already had it; no link is printed then). If your shell tool cannot keep this process alive while you reply, stop and ask for a supported flow; do not run it as a one-shot command. It retrieves the result automatically; use the shared exit table when it finishes. Do not add `--paste`, which deliberately selects the older long-URL manual flow.

## Exit codes and owner lines

{{std:errors}}

## Undo

For the owner. Every approval ends on its own after 30 days. To end one sooner, revoke it at https://account.tinycloud.xyz/delegations. `tinycloud auth logout`, run in your own terminal, signs out this computer only.
