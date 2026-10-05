# Save and read records in TinyCloud — quickstart

Background and walkthrough for the `tc-data` skill. The runnable blocks live in `SKILL.md`; the agent runs them from there.

Works in Claude Code, Codex and OpenCode. Requires Node.js 20 or later and `@tinycloud/cli@1.0.0` or later; pin an exact version. CLI 0.10.0 doesn't work: its paste sign-in silently saves nothing.

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
| Claude Code | `claude` | It asks three times on first use. When it reads the paths and checks the CLI, it offers "Yes, and don't ask again": choose it. For the sign-in files it offers only "Yes". After that, checks, writes and reads don't ask again, in new conversations too; only a new sign-in asks. |
| Codex | `codex -s workspace-write -c sandbox_workspace_write.network_access=true --add-dir <folder holding TC_HOME and TC_DATA_STATE>` | No questions. The CLI needs the network, and it writes the profile store and the state folder, which are outside the project. |
| OpenCode | `opencode` | No questions. Never paste the code into OpenCode: it keeps what you type in `prompt-history.jsonl`. |

## What the owner sees

1. You ask, for example: "Log my weight: 80.5 kg today, then read it back." The agent checks the CLI and your sign-in, writes a sign-in script, and sends you one message:

   > Run `sh <path>/approve-weight.sh` in a terminal on this machine, not in this chat. Open the link it prints, approve on OpenKey, click Copy, paste the code into that terminal and press Enter. Tell me when it says "Signed in". Don't paste the code here.

2. In your own terminal, the script says what you're approving, then prints the OpenKey link and waits:

   ```text
   TinyCloud sign-in: lets your agent read and write your weight records (xyz.tinycloud.agent-data.weight/ in your applications space) for 30 days.
   Open the link below, approve on OpenKey, click Copy, paste the code here and press Enter.

   Open this URL in a browser to authenticate:

     https://openkey.so/delegate?…

   Paste delegation code:
   ```

3. On OpenKey, sign in, check the request and approve it. The page then shows a long code with a Copy button.
4. Paste the code into the terminal once and press Enter. The terminal prints the sign-in result as JSON, then "Signed in. Go back to your agent and say done."
5. Say "done". The agent checks the sign-in itself, writes the record and reads it back to you. If you said "done" before pasting, it tells you the terminal is still waiting.

## What the sign-in grants

- **Scope:** one profile per kind of record, for example `data-weight`. It can get, put, list and delete keys under `xyz.tinycloud.agent-data.weight/` in your `applications` space, and nothing else.
- **Lifetime:** 30 days, OpenKey's maximum. Afterwards the agent's check fails with `AUTH_REQUIRED`, and it sends you the script again.
- **Sharing:** every agent on this machine that uses the same `TC_HOME` uses the same sign-in, so one approval serves Claude Code, Codex and OpenCode.
- **Stopping:** `TC_HOME=<profile store> "$TC_BIN" --profile data-weight auth logout` clears the local session. The approval itself stays valid on TinyCloud until it expires.

## Why it works this way

- **The code never passes through the agent.** OpenKey's code is about 9 KB. Models that copy it corrupt it, so it goes from your browser into your own terminal. That also keeps it out of every transcript. The agent never sees the link either: its dry run of the script prints only error codes.
- **The script holds absolute paths,** because your terminal doesn't have the agent's environment.
- **The agent writes literal paths into its commands.** Claude Code can remember an approval only for a command it can work out from the text; a command named by a variable like `"$TC_BIN"` would ask every time.
- **Rough edges:**
  - The first sign-in may ask which key to use if you have several. Later sign-ins preselect it.
  - A wrapped or retyped code is rejected. Use the page's Copy button and paste once.
  - If you approve with a different account or key than the profile's first sign-in, the terminal prints `OPENKEY_OWNER_MISMATCH`. Run the script again and approve with the same one.
