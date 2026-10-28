# Set up TinyCloud for the person you're working for

Give any AI agent or chat app this page, and it sets you up so it can act for you in your own TinyCloud storage: you sign in (or create an account) with OpenKey and approve what it may do. Then it carries on with what you asked for. Your records stay available across agents, and secrets are encrypted before storage instead of pasted into chat. After setup, try logging a meal in Health Log.

**Paste into your agent or chat app:**

> Set me up with TinyCloud: https://agents.tinycloud.xyz/onboarding

- **You approve:** two OpenKey screens. The first signs you in, or creates your account, and lets the agent read, list, change, delete and see metadata for all KV data in your whole `applications` space, plus read and write SQL data across the whole `applications` space, including Health Log's database, for 30 days. It does not grant SQL-schema permissions. The second lets it see which spaces and apps you have, read-only, for 30 days. Each screen shows exactly what it grants before you approve.
- **Then:** the agent continues with your request. If it needs more, it asks you on another OpenKey screen.
- **Undo:** see [Undo](#undo).

## How this works

The agent's TinyCloud CLI makes a key on the computer it runs on: the owner's computer, or the agent's own workspace. The owner approves two OpenKey screens on any device. Each one issues a grant that only that key can use, then shows a short code like `ABCD-EFGH`. The owner sends the code back in this chat, and the CLI uses it to collect the grant. Chat apps approve by link only; no code is involved.

**Why the code is safe to send in chat:** it isn't a password, and it isn't the grant. It only lets the CLI collect a grant that is useless without the CLI's key, and that key never leaves the computer it was made on. TinyCloud refuses any request not signed by that key. Each code also works once and expires after 5 minutes. If someone else uses a code first, the owner's CLI is refused and the agent asks for a new one. The owner can revoke any grant at https://account.tinycloud.xyz/delegations.

## For the agent

The person you are talking to is the **owner**. Onboarding sets up three things so you can act for them: a TinyCloud profile for them on this computer, their sign-in with OpenKey, and a starting grant. Keep their original request; after onboarding, continue it in this conversation without asking for another link.

**What/when:** TinyCloud is the owner's encrypted storage for records, files, and secrets; secrets are encrypted before storage. Use it when something should outlast a conversation or work across agents. Shell agents use the CLI; chat apps use hosted MCP.

Pick the route for where you run:

- **You can run shell commands, on the owner's computer or in your own workspace** (a coding agent, or any agent with a workspace): follow [Shell](#shell).
- **You can't** (a chat app such as ChatGPT, Claude, Gemini, Grok or Perplexity): follow [Chat app](#chat-app).

### Principles

Follow these on every TinyCloud page.

1. **Permission comes from the owner.** A grant lets you do only what it names. When you need something you don't have, ask the owner for it through OpenKey; don't work around it.
2. **Ask as few times as you can.** Ask for what the task needs in one request, and tell the owner up front how many approvals are coming.
3. **The owner never sees raw permissions.** Give them the OpenKey link; OpenKey shows the request in plain words. Never show them a delegation, a permission list or JSON to approve.
4. **Every paste comes with its link.** When you ask the owner to paste something, give the link where they get it and one line saying what to do, in the same message.
5. **Codes are fine; secrets are not.** The code OpenKey shows after an approval, and a delegation, only work for the agent they were made for, so the owner can paste them to you. Never ask for a password, private key, session key, recovery phrase, API key or secret value, and never read out or copy a profile's `key.json` or `session.json`, or the part of a share link after `#`.
6. **Send only links you started.** Give the owner only OpenKey links that your own command or tool returned in this conversation.
7. **No account needed first.** The owner doesn't need to have used TinyCloud before: OpenKey creates their account during the first approval.

## Shell

**1. The CLI.** Before installing, tell the owner: "TinyCloud keeps your records available across agents; after setup I can log a meal in Health Log." Follow [the CLI setup](tinycloud.md) with its caller contract, then return to step 2 here. It installs the `tinycloud` command; if its `tc-cli` skill status is unavailable, the CLI remains usable and onboarding continues.

```sh
TC="${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud}"
"$TC" onboard --help >/dev/null && echo ONBOARD_READY
```

No `ONBOARD_READY` means the installed CLI is missing or too old: report the observed version or error and stop. Do not claim onboarding succeeded or ask the owner to rerun `/cli`. These steps need CLI 1.5.0-beta.20 or later.

**2. Run onboarding.** Each run does the next approval. It uses the owner's default profile on this computer, or `TC_PROFILE` if that is set.

```sh
"$TC" onboard
```

It prints JSON on stdout:

- **Exit 8, `"onboarded": false`:** the owner needs to approve. Send them one message with `approvalUrl` and this line, filling in `asks` with its first letter in lower case: "Open this link and sign in or create your account. It lets me <asks> Approve, then send me the short code OpenKey shows (like ABCD-EFGH)." For step 1, start that message with this text, word for word:

  > I'll set up TinyCloud so I can act for you. You'll approve two OpenKey screens: first, sign in (or create your account) and let me read, list, change, delete and see metadata for all KV data in your whole applications space, plus read and write SQL data across the whole applications space, including Health Log's database, for 30 days. This does not grant SQL-schema permissions. Then let me see which spaces and apps you have, read-only, for 30 days.

  When they reply with the code, run this with the code exactly as they sent it:

  ```sh
  "$TC" onboard --code '<the code>'
  ```

  It finishes that approval and either prints the next link (exit 8 again: send it the same way, without the step-1 text) or finishes.
- **Exit 0, `"onboarded": true`:** done. Tell the owner in one line that TinyCloud is set up, then go to [the owner's goal](#the-owners-goal). If they asked only for setup, end with a short list of what they can ask you next: keep records, share or publish a page, use a stored API key, ask about their meetings.

The owner can open the link on any device, their phone included; OpenKey shows the code there for them to send back to you.

**If something goes wrong:**

- **Your client asks the owner to confirm the command:** show them the step and this reply to send: "Go ahead: run `tinycloud onboard` to set up TinyCloud." Run it again once they agree. Don't change their settings or run it another way.
- **`SPACE_SETUP_PENDING`:** a new account's storage can take a moment after the first approval. Tell the owner, wait a minute, and run `"$TC" onboard` again. Don't ask for another approval.
- **`PROFILE_NOT_ONBOARDABLE`:** the default profile is set up another way. Run `"$TC" --profile owner onboard` and use `--profile owner` from then on.
- **The code is refused:** each code works once and expires after 5 minutes. Send the latest `approvalUrl` again and ask for the new code.
- **Any other error:** stop and report it to the owner. Don't retry with other options.

## Chat app

**1. Connect TinyCloud.** If TinyCloud tools aren't available yet, give the owner the steps for their app from [Set up TinyCloud](connect.md), then stop until they've connected. Signing in there with OpenKey creates their account if they don't have one.

**2. Connect the account.** Call `tinycloud_connect`. If it returns `approvalUrl`, send it with this line: "Open this link, check what it asks for, and approve. Then tell me to continue." It lets you see which spaces and apps the owner has, read-only, for 30 days. When they say to continue, call `tinycloud_connect` again until it reports `connected`.

**3. Continue.** Go to [the owner's goal](#the-owners-goal) and use the TinyCloud tools for it. When a tool returns `authority_required` with `approval.url`, send that link with the same line, wait, then call the same tool again unchanged.

## The owner's goal

Fetch the guide for what the owner asked for yourself and follow it from the start, in this conversation. Each guide asks for the permissions its task needs; before each new approval, tell the owner in one line what it is for.

| The owner wants to | Guide |
| --- | --- |
| Keep records or build a small app: meals, weight, workouts, todos | [/apps](tc-apps.md) |
| Share a document or page | [/share](share.md) |
| Publish a page with a link | [/publish](publish.md) |
| Use an API key or other secret | [/secrets](secrets.md) |
| Ask about their meetings | [/chat](../apps/tinychat/setup.md) |
| Post to their TinyCloud Home feed | [/feed](https://agents.tinycloud.xyz/feed) |
| Let you work with another person's agent | [/courier](courier.md) |
| Something not listed here | The ability list at [/setup](README.md) |

In a chat app, use the connected TinyCloud tools for the goal. If they don't cover it, tell the owner they need an agent with a shell on their computer.

### Asking for more later

When a task needs a permission you don't have, ask for exactly that, once. With the CLI, first get the link:

```sh
"$TC" auth request --cap 'tinycloud.kv:<space>:<path>:<actions>' --grant --paste --expiry 30d < /dev/null
```

It exits 3 and prints the OpenKey link on stderr, on the line after `Open this URL in a browser to authenticate:`. Send it with one line, as above. When the owner replies with the code, run the same command with the code on stdin instead of `/dev/null`:

```sh
printf '%s\n' '<the code>' | "$TC" auth request --cap 'tinycloud.kv:<space>:<path>:<actions>' --grant --paste --expiry 30d
```

## Undo

For the owner. Every approval ends on its own after 30 days. To end one sooner, revoke it at https://account.tinycloud.xyz/delegations. `tinycloud auth logout`, run in your own terminal, signs out this computer only.
