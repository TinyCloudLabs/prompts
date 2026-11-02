# Set up TinyCloud for the person you're working for

Give any AI agent this page, and it sets you up so it can act for you in your own TinyCloud: you sign in (or create an account) with OpenKey and approve what it may do. Then it carries on with what you asked for.

**Paste into your agent:**

> Set me up with TinyCloud: https://agents.tinycloud.xyz/onboarding

- **You approve:** two OpenKey screens. The first signs you in, or creates your account, and lets the agent read, change and delete your apps' data for 30 days. The second lets it see which spaces and apps you have, read-only, for 30 days. Each screen shows exactly what it grants before you approve. There's no code to send back: tell your agent when you've approved.
- **Then:** the agent continues with your request. If it needs more, it asks you on another OpenKey screen.
- **Undo:** see [Undo](#undo).

## How this works

The agent's TinyCloud CLI makes a key on the computer it runs on: the owner's computer, or the agent's own workspace. The owner approves two OpenKey screens on any device. Each short link names a signed request; only the requesting CLI can collect and verify the encrypted result. Keep the command running while the owner approves. No pasted code or localhost callback is needed, including from a phone or a remote agent. The owner tells the agent when approval is complete; hosted MCP uses approval links too.

After an interruption, rerun the same command with the same profile to resume the pending approval. The owner can revoke a grant at https://account.tinycloud.xyz/delegations.

## For the agent

**Read this page raw first.** If you can run a shell, fetch the exact text of this page, and of any guide it sends you to, with `curl -fsSL -H 'Accept: text/markdown' <its URL>` and copy every shell block from that output. A web-fetch tool that summarizes pages drops or rewrites the blocks, and they only work exactly as written.

**Send links exactly as printed.** Send the owner every link exactly as the CLI printed it, copied from the output: never retype, shorten or rebuild it.

The person you are talking to is the **owner**. Onboarding sets up three things so you can act for them: a TinyCloud profile for them on this computer, their sign-in with OpenKey, and a starting grant. Keep their original request; after onboarding, continue it in this conversation without asking for another link.

Pick the route for where you run:

- **You can install and run the TinyCloud CLI**, on the owner's computer or in your own workspace: follow [CLI](#cli). This is the preferred route.
- **Otherwise, if you support remote MCP** (for example ChatGPT, Claude, Gemini, Grok or Perplexity): follow [MCP](#mcp).

### Principles

Follow these on every TinyCloud page.

1. **Permission comes from the owner.** A grant lets you do only what it names. When you need something you don't have, ask the owner for it through OpenKey; don't work around it.
2. **Ask as few times as you can.** Ask for what the task needs in one request, and tell the owner up front how many approvals are coming.
3. **The owner never sees raw permissions.** Give them the OpenKey link; OpenKey shows the request in plain words. Never show them a delegation, a permission list or JSON to approve.
4. **Every paste comes with its link.** When you ask the owner to paste something, give the link where they get it and one line saying what to do, in the same message.
5. **Codes are fine; secrets are not.** The code OpenKey shows after an approval, and a delegation, only work for the agent they were made for, so the owner can paste them to you. Never ask for a password, private key, session key, recovery phrase, API key or secret value, and never read out or copy a profile's `key.json` or `session.json`, or the part of a share link after `#`.
6. **Send only links you started.** Give the owner only OpenKey links that your own command or tool returned in this conversation.
7. **No account needed first.** The owner doesn't need to have used TinyCloud before: OpenKey creates their account during the first approval.

## CLI

**1. The CLI.** Follow [the CLI setup](tinycloud.md) with its caller contract, then return to step 2 here. It installs the `tinycloud` command and its `tinycloud-cli` skill; do both of its install steps. Replace `<TC_BIN>` in each shell block with the selected absolute executable path; separate tool calls need not share shell variables.

```sh
TC='<TC_BIN>'
"$TC" onboard --help | grep -q -e --timeout && echo ONBOARD_READY
```

Every guide needs `1.6.0-beta.1`: new installs and older agent-owned installs get it. If the CLI setup printed `TC_OLDER`, the operator selected an older CLI: tell the owner in one line that it is older than the required `1.6.0-beta.1`, and stop; don't replace it. No `ONBOARD_READY` means the selected CLI can't onboard: report the selected path and stop the same way.

**2. Run onboarding.** It asks for both approvals, step 1 first, then step 2. It uses the selected default profile, or `TC_PROFILE` if set. Run this in the foreground, as its own shell call. Each run waits at most a minute for the owner and ends within about two minutes:

```sh
TC='<TC_BIN>'
"$TC" onboard --timeout 60s
```

Run it again until it exits 0, and go by its exit code each time.

**Exit 8 with a `pending` object on stdout** means the owner hasn't approved yet. The object has `step` (1 or 2), `of` (2), `approvalUrl` (the link) and `expiresAt`; stderr shows the same link on the line after `Approve in OpenKey (open the complete link):`. Step 2's link appears only after the owner approves step 1. Send each new link as the **complete URL on its own line**, followed by: "Open this link and approve; tell me when you're done." Do not shorten, re-encode, split or strip its fragment. Before the first link, say this text word for word:

> I'll set up TinyCloud so I can act for you. You'll approve two OpenKey screens: first, sign in (or create your account) and let me read, change and delete your apps' data for 30 days; then let me see which spaces and apps you have, read-only, for 30 days.

Don't wait for the owner to say they're done. Right after sending a link, run the same command again. When it shows step 2's link, send it at once, without the step-1 text, and run the command again. When it shows a link you already sent, don't send it again; just run the command again. This exit 8 is the normal wait, not a failure: it never counts toward a retry limit.

- **Exit 0, stdout `"onboarded": true`:** retain the returned `profile`, `ownerDid` and `host`, report success, then continue [the owner's goal](#the-owners-goal). Do not create another app profile or request permissions already covered. A stored session alone is not proof of storage access; the app guide checks an actual read. For setup only, end with what the owner can ask next: records, sharing, stored API keys or meetings.
- **The command stopped first** (a tool timeout, a restart): rerun the identical command/profile. It preserves completed approvals and shows the pending link again; if it's a link you already sent, don't send it again. If it says `PROFILE_LOCK_TIMEOUT`, wait 30 seconds and run it again.

Never run `onboard --code`: these links don't produce a code, and the approval is retrieved automatically, including from a phone.

**If something goes wrong:**

- **Your client asks the owner to confirm the command:** show them the step and this reply to send: "Go ahead: run `tinycloud onboard` to set up TinyCloud." Run it again once they agree. Don't change their settings or run it another way.
- **Exit 8 without a `pending` object:** OpenKey couldn't be reached. Wait a minute and run the same command again, at most three times in a row. If it still fails, stop and report it to the owner; don't retry. Never edit or delete the CLI's files yourself.
- **`APPROVAL_REQUEST_EXPIRED` (exit 3):** the link expired before it was approved. Run the same command again; it can end this way once more before it makes a new link. Send the new link.
- **`SPACE_SETUP_PENDING`:** a new account's storage can take a moment after the first approval. Tell the owner, wait a minute, and run the same command again. Don't ask for another approval.
- **`PROFILE_NOT_ONBOARDABLE`:** preserve the existing profile. Inspect `"$TC" status --json` and use the owner's existing account and permissions where possible; do not overwrite them or silently switch accounts. If a separate onboarding profile is necessary, explain why, choose an unused profile name explicitly and run `"$TC" --profile <name> onboard --timeout 60s` the same way. Keep using that returned profile for the goal.
- **The link is incomplete:** rerun the identical command and use the current link it returns. Do not reconstruct a fragment or reuse a link from another request.
- **Any other error:** stop and report it to the owner. Don't retry with other options.

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

Keep the command running, send the full short URL it prints on its own line, and let the owner approve. It retrieves the result automatically; no return code is needed. After an interruption, rerun the same command/profile. Do not add `--paste`, which deliberately selects the older long-URL manual flow.

## Undo

For the owner. Every approval ends on its own after 30 days. To end one sooner, revoke it at https://account.tinycloud.xyz/delegations. `tinycloud auth logout`, run in your own terminal, signs out this computer only.
