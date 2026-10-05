# tc-data forward-test runbook

The coordinator prepares one project folder per client with only `tc-data` installed in it, and the owner approves every sign-in on OpenKey in their own terminal. The matrix is Claude Code, Codex and OpenCode. Tests 1 and 2 run in each client in turn; test 3 runs once, at the end.

## Preconditions

- **CLI:** `@tinycloud/cli@1.0.0` in a private prefix, never a global `tc` that other tools depend on:

  ```sh
  npm install --prefix ~/projects/tc-lab/cli-1.0.0 @tinycloud/cli@1.0.0
  ```

  `TC_BIN` is `~/projects/tc-lab/cli-1.0.0/node_modules/.bin/tc`, as an absolute path.
- **Lab data,** standing in for the owner's global setup: `TC_HOME=$HOME/projects/tc-lab/data/home` and `TC_DATA_STATE=$HOME/projects/tc-lab/data/state`. Create `~/projects/tc-lab/data` (mode 0700) before the first client starts. Never point either variable at `~/.tinycloud` or the default state folder.
- **One project folder per client:** `~/projects/tc-lab/clients/{claude,codex,opencode}`, each with `git init`. Install the skill project-locally in each, from a checkout of this branch:

  ```sh
  npx --yes skills@1.7.0 add <checkout> --skill tc-data --agent <claude-code|codex|opencode> --copy --yes
  ```

  Claude Code reads `.claude/skills/tc-data/`; Codex and OpenCode read `.agents/skills/tc-data/`. Reinstall after every change to the skill.
- **Confirm each client lists the skill:**
  - Claude Code: `/skills`;
  - Codex: `codex debug prompt-input | grep tc-data`;
  - OpenCode: `opencode debug skill`.
- **Launch** each client from its folder with the three variables, without exporting them into the owner's shell:

  ```sh
  env TC_BIN="$HOME/projects/tc-lab/cli-1.0.0/node_modules/.bin/tc" TC_HOME="$HOME/projects/tc-lab/data/home" \
    TC_DATA_STATE="$HOME/projects/tc-lab/data/state" <client command>
  ```

| Client | Command | Notes |
|---|---|---|
| Claude Code | `claude` | It asks three times on first use. For §1 and §3 it offers "Yes, and don't ask again", which the owner chooses; for §4a, whose rule list is too long to offer that, the owner answers "Yes". Later conversations run §1, §3 and §5 without asking; only a new sign-in asks again. One approval can't cover the flow: Claude Code 2.1.289 saves exact or `<command> <subcommand> *` rules, and never matches a command named by a variable. |
| Codex | `codex -s workspace-write -c sandbox_workspace_write.network_access=true --add-dir ~/projects/tc-lab/data` | Without these flags the CLI has no network and can't write the data folder, which is outside the workspace. Don't edit `~/.codex` or use a separate `CODEX_HOME`. Codex 0.160 runs commands through `exec_command`, which returns after `yield_time_ms` (default 10 s) and leaves a slower command running to be polled; the skill asks for 30000. |
| OpenCode | `opencode` | It saves prompts to `prompt-history.jsonl`, so the code must never be typed into OpenCode. It asks before a file command (`cd`, `rm`, `cp`, `mv`, `mkdir`, `touch`, `chmod`, `chown`, `cat`) that names a literal path outside the project, and the TUI waits on that prompt. The skill's file commands name paths only through variables. |

## Coordinator pre-flight (no owner needed)

Before involving the owner, replay the blocks through each client with a scripted stand-in model, against a local `tinycloud-node` and a stand-in OpenKey signer that turns the approval link into a code:
- **Claude Code:** `claude -p --input-format stream-json --output-format stream-json --permission-prompt-tool stdio`, with `ANTHROPIC_BASE_URL` pointing at a mock Messages API. Each `can_use_tool` request shows whether a block asks, and its `permission_suggestions` are the "don't ask again" rules. Driving the TUI in tmux the same way shows whether that option is offered at the owner's terminal width.
- **Codex:** `codex exec` with a mock Responses provider and the flags above, so the blocks run in the real sandbox.
- **OpenCode:** `opencode run` with an OpenAI-compatible mock provider. It rejects every permission ask and prints it, so a clean run means the TUI won't ask.

## Test 1 — Sign-in, write, read

**Prompt:** "Log my weight: 80.5 kg today, then read it back." Use 80.6 in Codex and 80.7 in OpenCode.

**Expected sequence:**
1. §1 prints the three paths.
2. §3 prints `1.0.0` and `AUTH_REQUIRED`: there's no profile in the first client, and no session after a logout.
3. §4a prints `SCRIPT <path>` and `"code": "PASTE_CODE_MISSING"`. In the first client the dry run also creates the profile, because the script's `context` reports `PROFILE_NOT_FOUND`.
4. The agent sends the message word for word, with that path, and ends its turn.
5. The owner runs `sh <path>` in their own terminal, opens the link, approves on OpenKey, clicks Copy, pastes once and presses Enter. The terminal prints the CLI's JSON and "Signed in. Go back to your agent and say done." The owner says "done".
6. The agent runs §3 itself (`"keys"`), then §5, and reports the value it read back.

**After Claude Code and after Codex,** log out so the next client signs in again. The profile and its recorded owner stay:

```sh
TC_HOME="$HOME/projects/tc-lab/data/home" "$HOME/projects/tc-lab/cli-1.0.0/node_modules/.bin/tc" --profile data-weight auth logout
```

## Test 2 — Session reuse

**Prompt,** in the same conversation: "What's my weight today?"

**Pass:** the agent reads with §5 and doesn't sign in again.

## Test 3 — Cross-client read

After OpenCode, without logging out, start a new Claude Code conversation.

**Prompt:** "What's my weight today?"

**Pass:** it answers 80.7, so one sign-in serves every client.

## Pass criteria, per client

- **The owner's only actions:** send the prompt, run one command in their own terminal, click the link, approve, Copy, paste, Enter, and say "done".
  - No retries.
  - No client permission prompts beyond Claude Code's three on first use.
- **OpenKey:** the link is clickable and the key is preselected. Prompt to read-back takes under about 3 minutes.
- **The agent follows the skill:**
  - it checks the CLI;
  - it creates the profile only after `PROFILE_NOT_FOUND`, through the §4a script;
  - it never runs the script, apart from the §4a dry run;
  - it verifies the sign-in itself.
- **Leak check:** the transcript contains no code, link, `key.json` or `session.json` content. Search it for `openkey.so`, `delegate?`, `delegationHeader`, `delegationCid`, `"d":` and base64 runs over 400 characters. Transcripts are in:
  - Claude Code: `~/.claude/projects/<folder>/*.jsonl`;
  - Codex: `~/.codex/sessions/YYYY/MM/DD/*.jsonl`;
  - OpenCode: the session in `~/.local/share/opencode/opencode.db`, dumped read-only.

## Known rough edges

- The owner says "done" before pasting. §4b then finds `AUTH_REQUIRED`, and the agent says the terminal is still waiting.
- A new profile may ask which key to use if the owner has several. Later sign-ins preselect it.
- A wrapped or retyped code is rejected. Use the page's Copy button and paste once.

If OpenKey or the CLI causes friction, write it up with what happened, where, and the evidence. Don't patch those repositories from this test.

## Cleanup

```sh
export TC_HOME="$HOME/projects/tc-lab/data/home" TC_BIN="$HOME/projects/tc-lab/cli-1.0.0/node_modules/.bin/tc"
"$TC_BIN" --profile data-weight kv delete xyz.tinycloud.agent-data.weight/<date> --space applications
"$TC_BIN" --profile data-weight auth logout
rm -rf ~/projects/tc-lab/data
```
