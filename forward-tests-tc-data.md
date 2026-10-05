# tc-data forward-test runbook

The coordinator prepares one project folder per client with only `tc-data` installed in it, and the owner approves every sign-in on OpenKey from the link the agent shows. The matrix is Claude Code, Codex and OpenCode. Tests 1 and 2 run in each client in turn; test 3 runs once, at the end.

## Preconditions

- **CLI:** `@tinycloud/cli@1.0.0` in a private prefix, never a global `tc` that other tools depend on:

  ```sh
  npm install --prefix ~/projects/tc-lab/cli-1.0.0 @tinycloud/cli@1.0.0
  ```

  `TC_BIN` is `~/projects/tc-lab/cli-1.0.0/node_modules/.bin/tc`, as an absolute path.
- **Lab data,** standing in for the owner's global setup: `TC_HOME=$HOME/projects/tc-lab/data/home` and `TC_DATA_STATE=$HOME/projects/tc-lab/data/state`. Empty `~/projects/tc-lab/data` (mode 0700) before the first client starts, but keep the folder: Codex's `--add-dir` needs it. Never point either variable at `~/.tinycloud` or the default state folder.
- **One project folder per client:** `~/projects/tc-lab/clients/{claude,codex,opencode}`, each with `git init`. Install the skill project-locally in each, from a checkout of this branch:

  ```sh
  npx --yes skills@1.7.0 add <checkout> --skill tc-data --agent <claude-code|codex|opencode> --copy --yes
  ```

  Claude Code reads `.claude/skills/tc-data/`; Codex and OpenCode read `.agents/skills/tc-data/`. Reinstall after every change to the skill.
- **Confirm each client lists the skill:**
  - Claude Code: `/skills`;
  - Codex: `codex debug prompt-input | grep tc-data`;
  - OpenCode: `opencode debug skill`.
- **Rate limit:** OpenKey allows 5 device sign-in starts per 10 minutes per network. The matrix needs three; don't loop.
- **Launch** each client from its folder with the three variables, without exporting them into the owner's shell:

  ```sh
  env TC_BIN="$HOME/projects/tc-lab/cli-1.0.0/node_modules/.bin/tc" TC_HOME="$HOME/projects/tc-lab/data/home" \
    TC_DATA_STATE="$HOME/projects/tc-lab/data/state" <client command>
  ```

| Client | Command | Notes |
|---|---|---|
| Claude Code | `claude` | It asks three times on first use, for §1, §3 and §4, and each time offers "Yes, and don't ask again", which the owner chooses. Later conversations run §1, §3 and §5 without asking; only a new sign-in asks again. One approval can't cover the flow: Claude Code 2.1.289 saves exact or `<command> <subcommand> *` rules, and never matches a command named by a variable. The agent runs §4 with `run_in_background: true`; Claude Code wakes it when the command exits. |
| Codex | `codex -s workspace-write -c sandbox_workspace_write.network_access=true --add-dir ~/projects/tc-lab/data` | Without these flags the CLI has no network and can't write the data folder, which is outside the workspace. Don't edit `~/.codex` or use a separate `CODEX_HOME`. Codex 0.160 runs commands through `exec_command`, which returns after `yield_time_ms` (default 10 s) and leaves a slower command running; the skill asks for 30000, and for §4 it asks for 5000 and then polls the session with `write_stdin` until the CLI exits. |
| OpenCode | `opencode` | It asks before a file command (`cd`, `rm`, `cp`, `mv`, `mkdir`, `touch`, `chmod`, `chown`, `cat`) that names a literal path outside the project, and the TUI waits on that prompt. The skill's file commands name paths only through variables. Its bash tool streams output into the TUI while a command runs, so §4 runs in the foreground with `timeout: 660000` and the owner reads the link there. Don't launch it with `--yolo`. |

## Coordinator pre-flight (no owner needed)

Before involving the owner, replay the flow through each client with a scripted stand-in model, against a local `tinycloud-node` and a stand-in OpenKey device API at `TC_OPENKEY_HOST`. The stand-in follows OpenKey's device policy (KV only, one space, `account`, `applications` and `secrets` refused, 5 starts per 10 minutes) and approves, denies or lets a request expire on cue:
- **Claude Code:** `claude -p --input-format stream-json --output-format stream-json --permission-prompt-tool stdio`, with `ANTHROPIC_BASE_URL` pointing at a mock Messages API. Each `can_use_tool` request shows whether a block asks, and its `permission_suggestions` are the "don't ask again" rules. Driving the TUI in tmux the same way shows whether that option is offered at the owner's terminal width, and that Claude Code wakes the agent when the background sign-in exits.
- **Codex:** `codex exec` with a mock Responses provider and the flags above, so the blocks run in the real sandbox; the TUI in tmux shows the link message while the agent polls.
- **OpenCode:** `opencode run` with an OpenAI-compatible mock provider. It rejects every permission ask and prints it, so a clean run means the TUI won't ask. The TUI in tmux shows the link in the running command's output.

A real model can follow the installed skill against the same stand-ins: `codex exec` with the owner's Codex login, and `opencode run` with the free `opencode/big-pickle` model. Pin the stand-in hosts inside a `TC_BIN` wrapper, so a client that filters the environment can't reach the real OpenKey.

## Test 1 — Sign-in, write, read

**Prompt:** "Log my weight: 80.5 kg today, then read it back." Use 80.6 in Codex and 80.7 in OpenCode.

**Expected sequence:**
1. §1 prints the two paths.
2. §3 prints `1.0.0` and `AUTH_REQUIRED`: there's no profile in the first client, and no session after a logout.
3. §4 writes the request, creates the profile in the first client (its `context` reports `PROFILE_NOT_FOUND`), and starts `auth login --device`. The CLI prints `Approve on your phone: <link> (code <code>)` within a few seconds.
4. The owner sees the link and code: in the agent's message in Claude Code and Codex, in the command's output in OpenCode.
5. The owner opens the link, signs in to OpenKey, checks the code and approves. Nothing else.
6. The CLI exits with `"authenticated": true`. The agent carries on by itself: §3 (`"keys"`), then §5, and reports the value it read back.

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

- **The owner's only actions:** send the prompt, open the link, approve. No script, no second terminal, no paste, no "done", no retries.
- **Permission prompts:** Claude Code shows only its three first-use prompts. Codex and OpenCode show none.
- **Speed:** prompt to read-back takes under about 2 minutes.
- **The agent follows the skill:**
  - it checks the CLI;
  - it signs in only with `--device`, never `--paste` or `--replace-session`;
  - it creates the profile only after `PROFILE_NOT_FOUND`, through §4;
  - it verifies the sign-in itself.
- **Leak check:** the transcript contains no `key.json` or `session.json` content. Device links and codes may appear. Search it for `delegationHeader`, `delegationCid`, `"d":` and base64 runs over 400 characters. Transcripts are in:
  - Claude Code: `~/.claude/projects/<folder>/*.jsonl`;
  - Codex: `~/.codex/sessions/YYYY/MM/DD/*.jsonl`;
  - OpenCode: the session in `~/.local/share/opencode/opencode.db`, dumped read-only.

## Known rough edges

- The link is valid for 10 minutes. After that the CLI exits with `DEVICE_AUTH_EXPIRED`, and the agent tells the owner instead of starting another.
- A new account may not have its `default` space hosted. Sign-in then succeeds, and §3 fails with `SPACE_NOT_HOSTED`; the agent stops and tells the owner.
- A new profile may ask which key to use if the owner has several. Approving with a different one than the profile's first sign-in fails with `OPENKEY_OWNER_MISMATCH`.

If OpenKey or the CLI causes friction, write it up with what happened, where, and the evidence. Don't patch those repositories from this test.

## Cleanup

```sh
export TC_HOME="$HOME/projects/tc-lab/data/home" TC_BIN="$HOME/projects/tc-lab/cli-1.0.0/node_modules/.bin/tc"
"$TC_BIN" --profile data-weight kv delete xyz.tinycloud.agent-data.weight/<date> --space default
"$TC_BIN" --profile data-weight auth logout
rm -rf ~/projects/tc-lab/data
```
