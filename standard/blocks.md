<!-- std:read-raw -->
**Read this page raw first.** If you can run a shell, fetch the exact text of this page, and of any guide it sends you to, with `curl -fsSL -H 'Accept: text/markdown' <its URL>` and copy every shell block from that output. A web-fetch tool that summarizes pages drops or rewrites the blocks, and they only work exactly as written.

**Send links exactly as printed.** Send the owner every link exactly as the CLI printed it, copied from the output: never retype, shorten or rebuild it.

<!-- std:relay -->
> **Agents: send each link, then stop and wait for the owner.** After any command prints an OpenKey approval link, write that complete link in your reply to the owner, using this guide's line for it, then stop and wait for the owner. When the owner next writes to you, run the next command the guide gives (for a pending approval, the same command again: it picks up their approval). Don't rely on the owner seeing command output. If you already wrote that exact link in an earlier reply, don't write it again. An invitation link is different: send it, then serve the invitation as the guide's serve step says. For an approval command (`onboard`, `auth login`, `auth grant`, `courier init`): if the command's stderr has `Next:` lines, do every one in order, exactly as written. Run the command the `Next:` line names, using your selected `"$TC"` in place of `tinycloud`. Exit 6 prints no `Next:` line: it is a network error, so run the same command again once, with no new link and no failure report to the owner (the request is saved, and the rerun shows the same link). If it exits 6 again, tell the owner "I can't set up TinyCloud right now. Please ask me again later.", then the error code from stderr on its own line, and stop. For invitations, follow the invitation steps below, not the `Next:` lines.
<!-- std:errors -->
**Exit codes and owner lines.** This table applies to the CLI approval commands `onboard`, `auth grant`, `auth login` without `--paste`, and `auth request --grant`. Codes named by a guide itself, such as `SPACE_SETUP_PENDING`, follow that guide. Commands under **Exceptions** have their own codes.

| Exit | Means | Do |
| --- | --- | --- |
| 0 | Done. | Send the done line, then carry on. |
| 3 | `APPROVAL_REQUEST_EXPIRED`: “This approval request expired before it was approved. Start a new request.” | If you have the exit-8 JSON, compare `now` with its `pending.expiresAt`. When `now` is more than 2 minutes before `expiresAt`, the request cannot have expired: treat it as declined and ask the owner the decline question below. Send a new link only if they say they did not decline or want one. If `now >= expiresAt - 2 minutes`, it is a real expiry: start a new request. If you never saw the exit-8 JSON, use the decline question below. Never read `approval-pending.json`; it contains private keys. |
| 6 | `NETWORK_ERROR`. | Run the same command again once; make no new link and don't report it to the owner. If it exits 6 again, tell the owner in one plain line and stop. No `Next:` line is printed. |
| 8 | Still waiting: stdout has a `pending` object with the link. Or OpenKey is down: no `pending` object. | For a pending object, send the link once and wait for the owner; if you already sent this exact link, don't send it again. Follow the shared relay block's `Next:` lines rule. Waiting never counts as a retry. Without `pending`, wait a minute and run it at most 3 times in a row; then send the “can't” failed line and stop. |
| 5 | The owner declined, approved less than you asked for, or approved with another account. | Stop and send the “couldn't” failed line, then the error code on its own line. Ask again only if the owner wants to. The 1.6.2 CLI may also print refused-delegation cleanup details; follow the command-specific guide and never send a CID. |
| Anything else | An error; stderr has `{"error":{"code":…}}`. | Stop, and send the “couldn't” failed line, then the code on its own line. Don't retry. |

**The three owner lines, word for word.** `<what>` is what you are setting up, in a few plain words: “TinyCloud”, “Courier”, “your Home feed”, “publishing”. Call what the owner approves a permission.

- **Done**, on exit 0: “`<What>` is set up.”
- **Failed** when OpenKey stays down: “I can't set up `<what>` right now. Please ask me again later.”
- **Failed** otherwise: “I couldn't set up `<what>` this time. Tell me if you'd like me to try again.”

**Declined approval, owner line:** “Did you decline that request? If not, I'll send you a fresh link.”

While a command is waiting for an approval, don't ask the owner to tell you when they're done or to send back a code: the command sees the approval itself.

**Exceptions: commands with other codes.**

- `auth login --paste` and `auth request --grant --paste` (the Secrets and publish sign-ins, and the older apps fallbacks): exit 3 `PASTE_CODE_MISSING` is the expected first stop, with the link printed and no code yet, not an expired link. These flows still ask the owner for the code OpenKey shows after they approve. It works once, for 5 minutes; a used or expired code ends as exit 1, “Delegation code not found or expired”.
- `auth login --device` (publish's fallback and the older apps sign-in): 3 is `DEVICE_AUTH_EXPIRED` and 5 is `DEVICE_AUTH_DENIED`, as above. Each new run counts toward OpenKey's limit of 5 device sign-ins per 10 minutes; over it, exit 1 `DEVICE_AUTH_RATE_LIMITED`.
- Data commands (`kv`, `sql`, `share`, `secrets get`, `feed`): exit 3 is `AUTH_REQUIRED`, a missing or expired session, so sign in again as the guide says; there is no link to resend. Exit 5 is `PERMISSION_DENIED` or `KV_ALREADY_EXISTS`, not the owner declining. Branch on the code.
- `secrets wait`: exit 8 means a named secret was still missing when the wait ended.
- Courier (`tinycloud courier …`): exit 0 done, 8 still waiting, 2 usage, and 1 for every error, with `[code]` on stderr. `[approval-expired]` is a link expiry and uses the decline/expiry rule above; `[approval-result-expired]` means the approved result expired before collection and follows the Courier guide.
- TinyChat (`tinychat-retrieval`): it reports statuses, not these codes, and still asks for the code OpenKey shows. The TinyChat guide says how.
- Installers and helper scripts (`install-cli.mjs`, `agent-env.mjs`, the apps skill's `.sh` helpers) have their own exit codes, listed where they run. For example, `layout.sh` exits 3 when `jq` is missing.
