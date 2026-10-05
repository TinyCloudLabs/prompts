# Save and read records in TinyCloud — quickstart

Background and walkthrough for the `tc-data` skill. The runnable blocks live in `SKILL.md`; the agent runs them from there.

Works in Claude Code, Codex and OpenCode. Requires Node.js 20 or later and `@tinycloud/cli@1.0.0` or later; pin an exact version.

## 0. Owner setup (once, not run by the agent)

```sh
npm install --prefix <dir> @tinycloud/cli@1.0.0
export TC_BIN=<dir>/node_modules/.bin/tc
export TC_HOME=<profile store>          # optional; without it the CLI uses ~/.tinycloud
export TC_DATA_STATE=<state folder>     # optional; default ~/.local/state/tc-data
```

Install the skill into a project with the pinned installer, from a checkout of this repository:

```sh
npx --yes skills@1.7.0 add <checkout> --skill tc-data --agent <claude-code|codex|opencode> --copy --yes
```

Claude Code reads it from `.claude/skills/tc-data/`, Codex and OpenCode from `.agents/skills/tc-data/`. Add `--global` to install it for every project instead.

Start the client from a shell that has the variables:

| Client | Start | What to expect |
|---|---|---|
| Claude Code | `claude` | In auto mode, which 2.1.289 turned on by default in the forward test, it asks nothing. In manual mode it asks three times on first use: when it reads the paths, when it checks the CLI, and when it starts the sign-in. Each offers "Yes, and don't ask again"; choose it. After that, checks, writes and reads don't ask again, in new conversations too; only a new sign-in asks once more. |
| Codex | `codex -s workspace-write -c sandbox_workspace_write.network_access=true --add-dir <folder holding TC_HOME and TC_DATA_STATE>` | No questions. The CLI needs the network, and it writes the profile store and the state folder, which are outside the project. |
| OpenCode | `opencode` | No questions. |

## What the owner sees

1. You ask, for example: "Log my weight: 80.5 kg today, then read it back." The agent checks the CLI and your sign-in, then starts one.
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
- **Stopping:** `TC_HOME=<profile store> "$TC_BIN" --profile data-weight auth logout` clears the local session. The approval itself stays valid on TinyCloud until it expires.

## Why it works this way

- **Device approval.** `tc auth login --device` asks OpenKey for a short code and waits for your approval, so nothing has to reach back to the machine the agent runs on. It works over SSH and from your phone. The link and code aren't secrets: they only identify the request, and the session key never leaves the CLI.
- **The `default` space.** OpenKey refuses device approvals for the `account`, `applications` and `secrets` spaces, and only grants KV access under an explicit path.
- **Each client waits its own way.** Claude Code runs the sign-in in the background and wakes the agent when it finishes. Codex keeps polling the running command. OpenCode keeps the command in the foreground and shows its output as it runs.
- **The agent writes literal paths into its commands.** Claude Code can remember an approval only for a command it can work out from the text; a command named by a variable like `"$TC_BIN"` would ask every time.
- **Rough edges:**
  - OpenKey allows 5 sign-in requests per 10 minutes from one network, shared by every agent on it.
  - If you approve with a different account or key than the profile's first sign-in, the sign-in fails with `OPENKEY_OWNER_MISMATCH`. Ask again and approve with the same one.
  - A brand-new account may not have its `default` space set up yet. Sign-in then succeeds but every read and write fails with `SPACE_NOT_HOSTED`, and the agent stops and tells you.
