# Save and read records in TinyCloud — quickstart

Background and walkthrough for the `tc-data` skill. The runnable blocks live in `SKILL.md`; the agent runs them from there.

Works in Claude Code, Codex and OpenCode. Requires Node.js 22.20 or later, with npm. The skill runs `@tinycloud/cli@1.0.0` from a folder of its own.

## 0. Setup, in the same prompt

Add the setup link to your first request:

> Log my weight: 80.5 kg today, then read it back. Set it up with TinyCloud: https://raw.githubusercontent.com/TinyCloudLabs/prompts/refs/heads/feat/tc-data/setup/tc-data.md

The agent follows [`setup/tc-data.md`](../../setup/tc-data.md), then carries on with your request in the same conversation:
1. It checks Node.js and npm. If either is missing, or Node.js is older than 22.20, it stops and tells you; it doesn't install them.
2. It installs the CLI into `~/.local/share/tc-data/cli`, a folder only this skill uses, unless it's already there. A `tc` on your `PATH` stays as it is.
3. It installs the skill into the project: `.claude/skills/tc-data/` in Claude Code, `.agents/skills/tc-data/` in Codex and OpenCode.
4. It reads the skill and signs you in, as below.

Nothing to restart and no shell profile to edit. In another project, send the link again: the agent reuses the CLI and only adds the skill there.

Start the client in the project folder:

| Client | Start | What to expect |
|---|---|---|
| Claude Code | `claude` | In auto mode, which 2.1.289 turned on by default in the forward test, it asks nothing. In manual mode it asks six or seven times on first use: once or twice for the setup page (WebFetch, `curl`, or both), once each for the check and the install, then the skill's three: when it reads the paths, when it checks the CLI, and when it starts the sign-in. Each offers "Yes, and don't ask again"; choose it. After that, checks, writes and reads don't ask again, in new conversations too; only a new sign-in asks once more. |
| Codex | `codex -s workspace-write -c sandbox_workspace_write.network_access=true --add-dir <folder holding TC_HOME and TC_DATA_STATE>` | One approval, for the install: npm writes outside the workspace. The CLI needs the network, and it writes the profile store and the state folder, which are outside the project. |
| OpenCode | `opencode` | No questions. |

Claude Code and Codex also ask whether you trust a folder the first time you start them in it.

Optional variables, set before you start the client:
- `TC_HOME`: the CLI profile store. Without it the CLI uses `~/.tinycloud`.
- `TC_DATA_STATE`: this skill's state folder. Default `~/.local/state/tc-data`.
- `TC_BIN`: the absolute path to another `tc`, CLI 1.0.0 or later. The skill then uses it instead of its own folder.

To set it up without the agent, run the same two installs yourself, the second one in the project folder:

```sh
npm install --prefix ~/.local/share/tc-data/cli @tinycloud/cli@1.0.0
npx --yes skills@1.7.0 add https://github.com/TinyCloudLabs/prompts/archive/refs/heads/feat/tc-data.tar.gz --skill tc-data --agent <claude-code|codex|opencode> --copy --yes
```

Add `--global` to the second line to install the skill for every project instead.

## What the owner sees

1. You ask, for example: "Log my weight: 80.5 kg today, then read it back.", with the setup link the first time (§0). The agent installs what's missing, checks your sign-in, then starts one.
2. A link and a code appear:
   - **Claude Code and Codex:** in the agent's message, worded by the agent, for example:

     > Open https://openkey.so/device?user_code=ABCD-EFGH and approve the request on OpenKey. It should show the code ABCD-EFGH. I'll carry on as soon as you approve.

     Some agents format it as a Markdown link; Claude Code and Codex then show `OpenKey (https://openkey.so/device?user_code=…)`, so the full link is still on screen.

   - **OpenCode:** the agent says "Open the OpenKey link that appears below and approve the request.", and the link appears in the output of the command it's running:

     ```text
     Approve on your phone: https://openkey.so/device?user_code=ABCD-EFGH (code ABCD-EFGH)
       Or open https://openkey.so/device and enter code ABCD-EFGH.
       Waiting for approval until 2026-10-05T12:10:00Z. Keep this command running.
     ```

3. Open the link, on this computer or your phone, and sign in to OpenKey. Check that it shows the same code, then approve.
4. That's all. The agent notices the approval by itself within a few seconds, writes the record and reads it back to you. You don't need to reply. In the forward test this took 72–97 s from the prompt, including the approval.

The link stays valid for 10 minutes. If you miss it, the agent tells you; ask again and it starts a new one.

Later questions such as "What's my weight today?" read the record again without signing in, in any client that shares the sign-in. Logging a new value for a day that already has one replaces it; the agent says so.

## What the sign-in grants

- **Scope:** one profile per kind of record, for example `data-weight`. It can get, put, list and delete keys under `xyz.tinycloud.agent-data.weight/` in your `default` space, and nothing else. Every OpenKey approval also lets it read which permissions it holds.
- **Lifetime:** 30 days, OpenKey's maximum. Afterwards the agent's check fails with `AUTH_REQUIRED`, and it shows you a new link.
- **Sharing:** every agent on this machine that uses the same `TC_HOME` uses the same sign-in, so one approval serves Claude Code, Codex and OpenCode.
- **Stopping:** `~/.local/share/tc-data/cli/node_modules/.bin/tc --profile data-weight auth logout`, with `TC_HOME` set as when you started the client, clears the local session. The approval itself stays valid on TinyCloud until it expires. To remove the rest, delete `~/.local/share/tc-data` and the project's `tc-data` skill folder.

## Why it works this way

- **Device approval.** `tc auth login --device` asks OpenKey for a short code and waits for your approval, so nothing has to reach back to the machine the agent runs on. It works over SSH and from your phone. The link and code aren't secrets: they only identify the request, and the session key never leaves the CLI.
- **A CLI of its own.** The setup installs CLI 1.0.0 into `~/.local/share/tc-data/cli` rather than globally, so a global `tc` that other tools depend on keeps its version. When `TC_BIN` isn't set, the skill's first block finds the CLI there, so the client's environment doesn't change and nothing needs a restart.
- **The `default` space.** OpenKey refuses device approvals for the `account`, `applications` and `secrets` spaces, and only grants KV access under an explicit path.
- **Each client waits its own way.** Claude Code runs the sign-in in the background and wakes the agent when it finishes. Codex keeps polling the running command. OpenCode keeps the command in the foreground and shows its output as it runs.
- **The agent writes literal paths into its commands.** Claude Code can remember an approval only for a command it can work out from the text; a command named by a variable like `"$TC_BIN"` would ask every time.
- **Rough edges:**
  - OpenKey allows 5 sign-in requests per 10 minutes from one network, shared by every agent on it.
  - If you approve with a different account or key than the profile's first sign-in, the sign-in fails with `OPENKEY_OWNER_MISMATCH`. Ask again and approve with the same one.
  - A brand-new account may not have its `default` space set up yet. Sign-in then succeeds but every read and write fails with `SPACE_NOT_HOSTED`, and the agent stops and tells you.
