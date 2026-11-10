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
| 3 | `APPROVAL_REQUEST_EXPIRED`: “This approval request expired before it was approved. Start a new request.” | Before doing anything else, use `pending.expiresAt` from the earlier exit-8 JSON and compare it with now. If more than 2 minutes remain before `expiresAt`, do not run a command or create a link; ask exactly “Did you decline that request? If not, I'll send you a fresh link.” and wait. Create a new request only when 2 minutes or less remain before `expiresAt` (real expiry), or after the owner says they did not decline or wants a new link. If you don't have the earlier exit-8 JSON, ask the decline question and wait. Never read `approval-pending.json`; it contains private keys. |
| 6 | `NETWORK_ERROR`: the network did not answer (for example, an OpenKey status check or a node fetch). | Run the same command again once; make no new link. For a resumed approval, the saved request is kept. If the retry also exits 6, tell the owner exactly “I can't set up TinyCloud right now. Please ask me again later.”, then put the stderr error code on its own line and stop. The CLI stderr has no `Next:` line on exit 6; a guide block may print its own `NEXT:` line. |
| 8 | Still waiting only when stdout contains a non-empty `pending.approvalUrl` link. Exit 8 without it is not pending. | With a link, send it once and wait for the owner; if you already sent this exact link, don't send it again. Follow the shared relay block's `Next:` lines rule. Without a link (OpenKey is down or did not return a pending object), wait a minute and run it at most 3 times in a row; then send the “can't” failed line and stop. This is a bounded retry, never pending. |
| 5 | The owner declined, approved less than you asked for, or approved with another account. | Stop and send the “couldn't” failed line, then the error code on its own line. Ask again only if the owner wants to. The 1.6.2 CLI may also print refused-delegation cleanup details; follow the command-specific guide and never send a CID. |
| Anything else | An error; stderr has `{"error":{"code":…}}`. | Any code not mapped above is an error: stop and send the “couldn't” failed line, then the code on its own line. Do not treat it as pending or retry. |

**The three owner lines, word for word.** `<what>` is what you are setting up, in a few plain words: “TinyCloud”, “Courier”, “your Home feed”, “publishing”. Call what the owner approves a permission.

- **Done**, on exit 0: “`<What>` is set up.”
- **Failed** when OpenKey stays down: “I can't set up `<what>` right now. Please ask me again later.”
- **Failed** otherwise: “I couldn't set up `<what>` this time. Tell me if you'd like me to try again.”

**Declined approval, owner line:** “Did you decline that request? If not, I'll send you a fresh link.”

**Exceptions: commands with other codes.**

- `auth login --paste` and `auth request --grant --paste` (the older apps fallbacks): exit 3 `PASTE_CODE_MISSING` is the expected first stop, with the link printed and no code yet, not an expired link. These flows still ask the owner for the code OpenKey shows after they approve. It works once, for 5 minutes; a used or expired code ends as exit 1, “Delegation code not found or expired”.
- `auth login --device` (the older apps sign-in): 3 is `DEVICE_AUTH_EXPIRED` and 5 is `DEVICE_AUTH_DENIED`, as above. Each new run counts toward OpenKey's limit of 5 device sign-ins per 10 minutes; over it, exit 1 `DEVICE_AUTH_RATE_LIMITED`.
- Data commands (`kv`, `sql`, `share`, `secrets get`, `feed`): exit 3 is `AUTH_REQUIRED`, a missing or expired session, so sign in again as the guide says; there is no link to resend. Exit 5 is `PERMISSION_DENIED` or `KV_ALREADY_EXISTS`, not the owner declining. Branch on the code.
- `secrets wait`: exit 8 means a named secret was still missing when the wait ended.
- Courier (`tinycloud courier …`): Courier 0.5.2 exits only 0, 1, 2 or 8; exit 6 is not a Courier code. Codes are command-specific; follow the Courier guide. For `init --request`, exit 0 may still create and print an approval link; follow every stderr `Next:` line by the shared relay rule, regardless of the exit code. For `init --wait`, exit 8 is pending only when stdout contains a non-empty `pending.approvalUrl`.
- Link-based CLI `auth request --grant` (without `--paste`) has no `--timeout` and blocks until the approval is resolved; it does not return a pending-link result. Run it in a persistent shell session that streams stderr and stays alive while you reply. Send the complete short URL on its own line as soon as it appears; then wait for the owner's next message and read the command's final output. If your shell tool cannot keep this process alive while you reply, stop and ask for a supported flow; do not run it as a one-shot command or rerun blindly after interruption.
- TinyChat (`tinychat-retrieval`): it reports statuses, not these codes, and still asks for the code OpenKey shows. The TinyChat guide says how.
- Installers and helper scripts (`install-cli.mjs`, `agent-env.mjs`, the apps skill's `.sh` helpers) have their own exit codes, listed where they run. For example, `layout.sh` exits 3 when `jq` is missing.

<!-- std:connect-hosted -->
## Approve access, then finish the request

The owner needs a signed-in client account that can add custom connectors, then signs in or creates a TinyCloud account through OpenKey and approves the requested access.

Keep the owner's original request in this conversation. A setup link alone means set up TinyCloud, not ask for a new task. Reuse working connections; do not force a reconnect, change accounts or request broader permissions to repeat setup.

1. Once TinyCloud tools are available, call `tinycloud_connect`. If it returns `approvalUrl`, show that actual complete link on its own line: "Open this link, check what it asks for, and approve. Then tell me to continue." Wait for the owner, then call `tinycloud_connect` again until it reports `connected`.
2. If another tool returns `authority_required` with `approval.url`, show that returned link with the same line, wait, then resume the same call unchanged. Never invent an authorization URL or approve on the owner's behalf. A saved connector or "Connected" card is not proof of authorized data access.
3. Continue the original task through the available tools and their returned instructions. For setup only, follow the [connected-tool record recipe](https://agents.tinycloud.xyz/connect#setup-only-requests-in-chat-apps). Read back any saved record before saying it was saved. A tool list or successful sign-in alone proves neither a read nor a write.

## Choose tools and instructions for the task

Use the tools this connection actually exposes. The [MCP reference skill](https://agents.tinycloud.xyz/skills/mcp.md) documents both hosted and local stdio workflows; a tool named in a skill or SDK is not evidence that your hosted connection exposes it. No local CLI, auth-import commands or filesystem skill installation belongs in a transient chat sandbox.

| Original request | Hosted route and relevant guide |
| --- | --- |
| Read or write KV data | Inspect the available `tinycloud_kv_list`, `tinycloud_kv_get` and `tinycloud_kv_put` schemas; use the exact non-secrets space and path authorized for the task. The [MCP skill](https://agents.tinycloud.xyz/skills/mcp.md) covers scoped reads, pagination and conditional writes. Read before replacing data; do not broaden scope or overwrite a concurrent change. |
| Personal records or apps | Use `tinycloud_apps_context`, then its returned rules and the live tool schemas. [Apps](https://agents.tinycloud.xyz/apps) and the [apps skill](https://agents.tinycloud.xyz/skills/apps.md) describe the CLI workflow; their layout detection, `LEGACY.md`, migration and shell installation steps are not hosted-tool instructions. |
| A named secret | Use `tinycloud_secrets_get` only for the owner's requested task and follow its approval instructions. [Secrets](https://agents.tinycloud.xyz/secrets) is the CLI workflow; the [MCP skill](https://agents.tinycloud.xyz/skills/mcp.md) distinguishes hosted access. Never display the value or put it in prompts, memory or reports. The client may retain tool results; do not promise that a secret never reaches the host. |
| Publish or share | The hosted MCP has **no publishing or sharing tools yet**. Keep the request and use a persistent CLI-capable agent with [publish](https://agents.tinycloud.xyz/publish) or [share](https://agents.tinycloud.xyz/share). A chat prompt link does not create a share or publish anything. |
| Meetings | The hosted MCP has **no meeting tools yet**. Use a CLI-capable agent with [TinyChat meetings](https://agents.tinycloud.xyz/chat) and its retrieval skill. |

The [skill index](https://agents.tinycloud.xyz/skills/index.json) identifies the task's reference material; hosted clients use connected tools, not downloaded CLI skill bodies. If a needed tool is absent, report the observed limitation instead of claiming CLI parity.

For `SPACE_NOT_HOSTED`, follow the [new-account guidance](https://agents.tinycloud.xyz/connect#approve-access-and-continue), not another or broader sign-in. For `STORAGE_QUOTA_EXCEEDED` or `STORAGE_LIMIT_REACHED`, nothing was saved: do not retry; the owner can manage storage at https://account.tinycloud.xyz/storage. Disconnecting TinyCloud in the client's connector settings does not delete stored records.

<!-- std:connect-cli -->
## CLI route: continue with the right skill

**Only for a runtime using the CLI route:** keep the original request, owner, profile and host. Fetch [onboarding](https://agents.tinycloud.xyz/onboarding.md) raw and follow it in this conversation, including its CLI installer and actual OpenKey approval links. Do not copy an old sign-in URL, request credentials in chat, overwrite an existing profile or broaden permissions to make a check pass. Existing grants are reused; missing task-specific access follows the relevant guide. If you chose the remote MCP alternative above, follow its hosted workflow instead of these installation steps.

| Original request | Guide and skill |
| --- | --- |
| KV read/write or other data work | [All abilities](https://agents.tinycloud.xyz/setup) and the [CLI skill](https://agents.tinycloud.xyz/skills/cli.md). Inspect the selected CLI's command help; use the authorized space/key and read back writes before claiming success. |
| Personal records, context or a small app | [Apps](https://agents.tinycloud.xyz/apps), with `tc-apps` (`apps`). |
| A named API key or other secret | [Secrets](https://agents.tinycloud.xyz/secrets), with `tc-secrets` (`secrets`). Use it for the requested operation without displaying or copying the value into chat, memory or reports. |
| Publish or share a document/page | [Publish](https://agents.tinycloud.xyz/publish) or [share](https://agents.tinycloud.xyz/share), with `tc-publish` (`publish`). Make the link only with the owner's permission. |
| Meeting recap, follow-ups or transcript search | [TinyChat meetings](https://agents.tinycloud.xyz/chat), with `tinychat-retrieval` (`chat`). |

The task guide is the authority for installing its skill, permissions and cleanup; fetch it yourself rather than asking the owner to paste another link. The [skill index](https://agents.tinycloud.xyz/skills/index.json) lists versions, files and checksums. If a needed skill is not installed by that guide, download the installer in one tool call:

```sh
mkdir -p "$HOME/.local/share/tinycloud" && curl -fsSL -o "$HOME/.local/share/tinycloud/install.js" https://agents.tinycloud.xyz/skills/install.js
```

Then run it in a separate call for the relevant short name (`apps`, `secrets`, `publish`, `chat`, `cli`):

```sh
node "$HOME/.local/share/tinycloud/install.js" apps --agent codex
```

Use `claude-code` for Claude Code, `opencode` for OpenCode and `codex` for other runtimes. The latter installs into `~/.agents/skills`; use the runtime-specific discovery instructions on this page. Read the installed `SKILL.md` and its task-relevant references before acting. Do not install every skill or switch to local stdio MCP merely to complete CLI onboarding.

The hosted server at `https://mcp.tinycloud.xyz/mcp` is a separate remote OAuth surface. Unlike the CLI route, it has **no publishing, sharing or meeting tools yet**. A locally installed stdio MCP process is not that hosted connection; neither a vendor directory listing nor a prompt link establishes either one.

<!-- std:connect-feedback -->
## If something went wrong

Help the next agent avoid the same problem: [report it](https://bugs.tinycloud.xyz) using the [agent reporting instructions](https://bugs.tinycloud.xyz/agents.md). Ask the owner first, with a short summary of what happened and any attachments you'd send; send nothing without their OK, and never include personal data or secrets.
