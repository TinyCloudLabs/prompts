**Exit codes and owner lines (the same in every TinyCloud guide).** This table is for the CLI's approval commands: `onboard`, `auth grant` and `auth login` without `--paste`, and `auth request --grant`. A code the guide names itself, such as `SPACE_SETUP_PENDING`, goes by the guide. The commands under "Exceptions" have codes of their own.

| Exit | Means | Do |
| --- | --- | --- |
| 0 | Done. | Send the done line, then carry on. |
| 3 | The link expired before the owner approved it. | Run the same command again. It can end with 3 once more before it makes a new link. Send the new link once, with the retry line. |
| 8 | Still waiting: stdout has a `pending` object with the link. Or OpenKey is down: no `pending` object. | Run the same command again. A new link: send it with the ask line. Waiting never counts as a retry. OpenKey down: wait a minute, and run it at most 3 times in a row; then send the "can't" failed line and stop. |
| 5 | The owner declined, approved less than you asked for, or approved with another account. | Stop, and say so with the "couldn't" failed line. Ask again only if the owner wants to. |
| Anything else | An error; stderr has `{"error":{"code":…}}`. | Stop, and send the "couldn't" failed line, then the code on its own line. Don't retry. |

**The four owner lines, word for word.** `<what>` is what you are setting up, in a few plain words: "TinyCloud", "Courier", "your Home feed", "publishing". Call what the owner approves a permission.

- **Ask**, under the link: "Open this link and approve. I'll carry on as soon as you do." Courier's link says "Open this link and approve the one-time Courier permission. I'll carry on as soon as you do."
- **Retry**, under a new link after exit 3: "That link expired. Please open this new one and approve. I'll carry on as soon as you do."
- **Done**, on exit 0: "`<What>` is set up."
- **Failed**: "I can't set up `<what>` right now. Please ask me again later." when OpenKey stays down; otherwise "I couldn't set up `<what>` this time. Tell me if you'd like me to try again."

While a command is waiting for an approval, don't ask the owner to tell you when they're done or to send back a code: the command sees the approval itself.

**Exceptions: commands with other codes.**

- `auth login --paste` and `auth request --grant --paste` (the Secrets and publish sign-ins, and the older apps fallbacks): exit 3 `PASTE_CODE_MISSING` is the expected first stop, with the link printed and no code yet, not an expired link. These flows still ask the owner for the code OpenKey shows after they approve. It works once, for 5 minutes; a used or expired code ends as exit 1, "Delegation code not found or expired".
- `auth login --device` (publish's fallback and the older apps sign-in): 3 is `DEVICE_AUTH_EXPIRED` and 5 is `DEVICE_AUTH_DENIED`, as above. Each new run counts toward OpenKey's limit of 5 device sign-ins per 10 minutes; over it, exit 1 `DEVICE_AUTH_RATE_LIMITED`.
- Data commands (`kv`, `sql`, `share`, `secrets get`, `feed`): exit 3 is `AUTH_REQUIRED`, a missing or expired session, so sign in again as the guide says; there is no link to resend. Exit 5 is `PERMISSION_DENIED` or `KV_ALREADY_EXISTS`, not the owner declining. Branch on the code.
- `secrets wait`: exit 8 means a named secret was still missing when the wait ended.
- Courier (`tinycloud courier …`): exit 0 done, 8 still waiting, 2 usage, and 1 for every error, with `[code]` on stderr. An expired link is exit 1 `[approval-expired]` or `[approval-result-expired]`. The Courier guide lists each code.
- TinyChat (`tinychat-retrieval`): it reports statuses, not these codes, and still asks for the code OpenKey shows. The TinyChat guide says how.
- Installers and helper scripts (`install-cli.mjs`, `agent-env.mjs`, the apps skill's `.sh` helpers) have their own exit codes, listed where they run. For example, `layout.sh` exits 3 when `jq` is missing.
