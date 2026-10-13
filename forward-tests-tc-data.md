# tc-data forward-test runbook

The coordinator gives each client a stock home: no TinyCloud CLI, no skills, no npm cache and no TinyCloud settings. The owner's first prompt carries the setup link: the agent installs the CLI and the skill itself, then signs in, writes and reads, all in the same conversation. The owner approves every sign-in on OpenKey from the link the agent shows. The matrix is Claude Code, Codex and OpenCode, in any order. Tests 1 and 2 run in each client.

## Preconditions

- **Setup link:** the raw URL of [`setup/tc-data.md`](setup/tc-data.md) on the branch under test, for example `https://raw.githubusercontent.com/TinyCloudLabs/prompts/refs/heads/feat/tc-data/setup/tc-data.md`. The setup installs the skill from the same branch's GitHub archive.
- **A stock home per client:** a new folder, for example `~/projects/tc-lab/stock/<client>/home`, holding a copy of `/etc/skel` and an empty project folder, `project`, with `git init`. There's no `TC_HOME`, `TC_DATA_STATE` or `TC_BIN`: the CLI and the skill use their default folders inside that home, and the coordinator's own `~/.tinycloud` is never touched.
- **`PATH`:** the system folders plus a folder holding links to the three clients, for example `~/projects/tc-lab/stock/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`. Node.js and npm come from the system; the only `tc` is Linux's `/usr/sbin/tc`.
- **Logins:** each client starts logged out in its new home, so the owner logs in once before the test. Codex: `codex login --device-auth`. Claude Code: its first-run screens. OpenCode's free `opencode/big-pickle` model needs none. Set `DISABLE_AUTOUPDATER=1` for Claude Code to keep its version for the test.
- **Global `tc`:** a global `tc` that other tools depend on must keep its version. Run `tc --version` from a plain shell before and after.
- **Rate limit:** OpenKey allows 5 device sign-in starts per 10 minutes per network. The matrix needs three; don't loop.
- **Launch** each client in tmux from its project folder, through a clean shell, so nothing from the coordinator's environment leaks in:

  ```sh
  env -i HOME="$H" USER="$USER" LOGNAME="$USER" SHELL=/bin/bash LANG=C.UTF-8 TERM=xterm-256color PATH="$STOCK_PATH" bash -i
  ```

  then run the client's command below.

| Client | Command | Notes |
|---|---|---|
| Claude Code | `claude` | It asks whether to trust a new folder on first launch. In auto mode, which 2.1.289 used by default in the forward test, it asks nothing else. In manual mode it asks six or seven times on first use: once or twice for the setup page (WebFetch, `curl`, or both), the check, the install, then §1, §3 and §4. Each offers "Yes, and don't ask again", which the owner chooses. Later conversations run §1, §3 and §5 without asking; only a new sign-in asks again. One approval can't cover the flow: Claude Code 2.1.289 saves exact or `<command> <subcommand> *` rules, and never matches a command named by a variable. In the pre-flight, the install moved to the background by itself after about 10 s, and Claude Code woke the agent when it finished. The agent runs §4 with `run_in_background: true`; Claude Code wakes it when the command exits. |
| Codex | `codex -s workspace-write -c sandbox_workspace_write.network_access=true --add-dir ~/.tinycloud --add-dir ~/.local/state/tc-data` | It asks whether to trust a new folder on first launch. Without these flags the CLI has no network and can't write the profile store or the state folder, which are outside the workspace. Neither folder exists at launch: the setup's install creates them, and Codex lets the CLI write there from then on. The sandbox blocks npm's cache and the CLI folder in the home folder, so the setup runs its install with `sandbox_permissions: "require_escalated"`: one approval prompt. Codex 0.160 runs commands through `exec_command`, which returns after `yield_time_ms` (default 10 s) and leaves a slower command running; the skill asks for 30000, and for §4 it asks for 5000 and then polls the session with `write_stdin` until the CLI exits. |
| OpenCode | `opencode -m opencode/big-pickle` | It asks before a file command (`cd`, `rm`, `cp`, `mv`, `mkdir`, `touch`, `chmod`, `chown`, `cat`) that names a literal path outside the project, and the TUI waits on that prompt. `npm` and `npx` aren't on that list, and the blocks name outside paths only through variables. Its bash tool streams output into the TUI while a command runs, so §4 runs in the foreground with `timeout: 660000` and the owner reads the link there. Don't launch it with `--yolo`. |

## Coordinator pre-flight (no owner needed)

Before involving the owner, replay the flow through each client with a scripted stand-in model, against a local `tinycloud-node` and a stand-in OpenKey device API at `TC_OPENKEY_HOST`. The stand-in follows OpenKey's device policy (KV only, one space, `account`, `applications` and `secrets` refused, 5 starts per 10 minutes) and approves, denies or lets a request expire on cue:
- **Claude Code:** `claude -p --input-format stream-json --output-format stream-json --permission-prompt-tool stdio`, with `ANTHROPIC_BASE_URL` pointing at a mock Messages API. Each `can_use_tool` request shows whether a block asks, and its `permission_suggestions` are the "don't ask again" rules. Driving the TUI in tmux the same way shows whether that option is offered at the owner's terminal width, and that Claude Code wakes the agent when the background sign-in exits.
- **Codex:** `codex exec` with a mock Responses provider and the flags above, so the blocks run in the real sandbox; the TUI in tmux shows the link message while the agent polls. `codex exec` rejects `require_escalated`, so the setup's install needs the TUI.
- **OpenCode:** `opencode run` with an OpenAI-compatible mock provider. It rejects every permission ask and prints it, so a clean run means the TUI won't ask. The TUI in tmux shows the link in the running command's output.

A real model can follow the setup link against the same stand-ins, starting with no skill and no `TC_BIN`:
- Codex: the TUI in tmux with the owner's Codex login, answering the install approval. Run it with a stock home too: the sandbox decides what the install and the CLI may write there;
- `opencode run` with the free `opencode/big-pickle` model;
- `claude -p --input-format stream-json --permission-mode auto` with the owner's Claude login. Keep stdin open until the background sign-in has exited, so Claude Code can wake the agent.

The CLI the agent installs reaches the stand-ins only through `TC_HOST` and `TC_OPENKEY_HOST` in the client's environment. Stop the client as soon as a sign-in link points anywhere else.

## Test 1 — Setup, sign-in, write, read

**Prompt:** "Log my weight: 80.5 kg today, then read it back. Set it up with TinyCloud: `<setup link>`" Use 80.6 in Codex and 80.7 in OpenCode.

**Expected sequence:**
1. The agent fetches the setup page.
2. Setup §1 prints the Node.js and npm versions, and `No such file or directory` for the CLI.
3. Setup §2 creates the profile store and the state folder, installs the CLI into `~/.local/share/tc-data/cli` and the skill into the project, in 12–16 s with nothing cached. Codex asks for one approval first.
4. The agent reads the installed `SKILL.md` and carries on: skill §1 prints `~/.local/share/tc-data/cli/node_modules/.bin/tc`, expanded, and the state folder.
5. §3 prints `1.0.0` and `AUTH_REQUIRED`.
6. §4 writes the request, creates the profile (its `context` reports `PROFILE_NOT_FOUND`), and starts `auth login --device`. The CLI prints `Approve on your phone: <link> (code <code>)` within a few seconds.
7. The owner sees the link and code: in the agent's message in Claude Code and Codex, in the command's output in OpenCode.
8. The owner opens the link, signs in to OpenKey, checks the code and approves.
9. The CLI exits with `"authenticated": true`. The agent carries on by itself: §3 (`"keys"`), then §5, and reports the value it read back.

Each client has its own home, so nothing needs resetting between clients. The record lives in the owner's TinyCloud space, though: from the second client on, §3 lists the day the previous client wrote, and §5 replaces it without asking and says so.

## Test 2 — Session reuse

**Prompt,** in the same conversation: "What's my weight today?"

**Pass:** the agent reads again with §5, rather than answering from memory, and doesn't sign in again.

## Pass criteria, per client

- **The owner's only actions:** send the prompt, answer the client's own permission prompts, open the link, approve. No restart, no second terminal, no paste, no "done", no retries. Count the permission prompts.
- **Permission prompts:** a trust prompt for the new folder in Claude Code and Codex. Then Claude Code shows none in auto mode, and at most its six or seven first-use prompts in manual mode; Codex shows one, for the install; OpenCode shows none.
- **Installation:** the CLI goes into `~/.local/share/tc-data/cli` and the skill into the project, both downloaded fresh; the global `tc` keeps its version.
- **Speed:** prompt to read-back takes under about 3 minutes, including the install.
- **The agent follows the setup and the skill:**
  - it checks Node.js and installs only the CLI and the skill;
  - it never runs a `tc` from the `PATH`;
  - it reads the installed `SKILL.md` and carries on without another prompt;
  - it signs in only with `--device`, never `--paste` or `--replace-session`;
  - it creates the profile only after `PROFILE_NOT_FOUND`, through §4;
  - it verifies the sign-in itself.
- **Leak check:** the transcript contains no `key.json` or `session.json` content. Device links and codes may appear. Search it for `delegationHeader`, `delegationCid`, `"d":` and base64 runs over 400 characters. Transcripts are in the client's stock home:
  - Claude Code: `~/.claude/projects/<folder>/*.jsonl`;
  - Codex: `~/.codex/sessions/YYYY/MM/DD/*.jsonl`;
  - OpenCode: the session in `~/.local/share/opencode/opencode.db`, dumped read-only.

## Known rough edges

- The link is valid for 10 minutes. After that the CLI exits with `DEVICE_AUTH_EXPIRED`, and the agent tells the owner instead of starting another.
- A new account may not have its `default` space hosted. Sign-in then succeeds, and §3 fails with `SPACE_NOT_HOSTED`; the agent stops and tells the owner.
- A new profile may ask which key to use if the owner has several. Approving with a different one than the profile's first sign-in fails with `OPENKEY_OWNER_MISMATCH`.
- On a machine that also has TinyChat's global `tc-cli` skill, Codex and OpenCode may load it for the word "TinyCloud". In one dry run, Codex then ran `tc --version` and `tc profile list` with the global `tc` before it read the setup page; both only read, and afterwards it followed the setup.

If OpenKey, the CLI or the skills installer causes friction, write it up with what happened, where, and the evidence. Don't patch those repositories from this test.

## Cleanup

Delete the record with any client's CLI, log out each stock home's profile, then delete the stock homes; that also removes the client logins made for the test:

```sh
H=~/projects/tc-lab/stock/claude/home
HOME="$H" "$H/.local/share/tc-data/cli/node_modules/.bin/tc" --profile data-weight kv delete xyz.tinycloud.agent-data.weight/<date> --space default
for c in claude codex opencode; do H=~/projects/tc-lab/stock/$c/home; HOME="$H" "$H/.local/share/tc-data/cli/node_modules/.bin/tc" --profile data-weight auth logout; done
rm -rf ~/projects/tc-lab/stock
```
