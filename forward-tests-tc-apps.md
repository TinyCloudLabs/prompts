# tc-apps forward-test runbook

The test proves three things across conversations and clients:
- **Apps appear on demand:** a fitness app grows from weight to goals to lifts to a second sport, and a todo app appears.
- **Apps change on the fly:** new kinds and fields need no new approval, install or migration.
- **Any agent picks it up:** a new conversation in Claude Code, Codex or OpenCode finds the apps through the catalog.

Every client signs in through one shared profile store, so the whole test needs one device approval.

The SQL index isn't part of this run. Its setup is being reworked so that the agent asks for the permission itself, only when a question needs it, and the owner never has to ask for it. It gets its own short test afterwards.

## Preconditions

- **Setup link:** the raw URL of [`setup/tc-apps.md`](setup/tc-apps.md) on the branch under test, for example `https://raw.githubusercontent.com/TinyCloudLabs/prompts/refs/heads/feat/tc-apps/setup/tc-apps.md`. The setup installs the skill from the same branch's GitHub archive.
- **A stock home per client, `$H`.** Either a new folder holding a copy of `/etc/skel`, or a logged-in stock home from an earlier test.
  - Give it a new, empty project folder with `git init`, so no project-level skill from an earlier test is in reach.
  - The skill installs into the home's `~/.claude/skills` or `~/.agents/skills`, which must not hold `tc-apps` yet. The private CLI and the state folder go into the home too.
  - The coordinator's own `~/.tinycloud` is never touched.
- **One shared profile store, `$SHARED`.** For example `~/projects/tc-lab/stock/shared-apps`; create `$SHARED/.tinycloud` (mode 700) before the first launch. Every client runs with `TC_HOME=$SHARED`, and with no `TC_APPS_STATE` or `TC_BIN`.
- **`PATH`:** the system folders plus a folder of links to the three clients, for example `~/projects/tc-lab/stock/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`. The only `tc` on it is Linux's `/usr/sbin/tc`.
- **Logins:** in a new home, the owner logs each client in once before the test. Codex: `codex login --device-auth`. Claude Code: its first-run screens. OpenCode's free `opencode/big-pickle` model needs no login. Set `DISABLE_AUTOUPDATER=1` for Claude Code.
- **New conversations:** Claude Code `/clear`, Codex `/new`, OpenCode `/new`, or restart the client.
- **Global `tc`:** run `tc --version` from a plain shell before and after; it must not change.
- **Rate limit:** OpenKey allows 5 device sign-in starts per 10 minutes per network. The test needs one. Don't loop.
- **The data is real:** records go to the owner's `default` space under `xyz.tinycloud.agent-data/`, and they stay there as the owner's data unless the owner asks for cleanup.
- **Launch** each client in tmux from its project folder, through a clean shell:

  ```sh
  env -i HOME="$H" USER="$USER" LOGNAME="$USER" SHELL=/bin/bash LANG=C.UTF-8 TERM=xterm-256color PATH="$STOCK_PATH" TC_HOME="$SHARED" bash -i
  ```

  Then run the client's command:

| Client | Command | Notes |
|---|---|---|
| Claude Code | `claude` | It asks whether to trust a new folder on first launch. In auto mode it asks nothing else. In manual mode it asks on first use for each kind of block, and every time for blocks that use a pipeline or write the state folder. |
| Codex | `codex -s workspace-write -c sandbox_workspace_write.network_access=true --add-dir "$SHARED/.tinycloud" --add-dir ~/.local/state/tc-apps` | It asks whether to trust a new folder on first launch. The setup's install asks for one escalation: npm, and the skills installer writing `~/.agents/skills`. The state folder doesn't exist at launch; the install creates it. |
| OpenCode | `opencode -m opencode/big-pickle` | No questions. Don't launch it with `--yolo`. OpenCode loads skills when it starts, so restart it after conversation 1, as the setup tells the agent to say. `/new` alone doesn't pick up the newly installed skill. |

## Coordinator pre-flight (no owner needed)

- **Every block against the lab:** `node ~/projects/tc-lab/harness/tc-apps/skill-check.mjs <skills/tc-apps> bash` and `… dash`.
  - The lab is a local `tinycloud-node`, plus a stand-in OpenKey that enforces the device policy and also serves the paste flow.
  - The checks cover sign-in, catalog, writes, reads, item moves, and the SQL index: paste sign-in, create, copy, check, query, rebuild after a mark, and removal of deleted keys.
- **Real models against the same lab:** run the conversations below with the setup link. The lab approves device sign-ins after a delay and approves paste links when the agent shows one.
  - The CLI the agent installs reaches the lab only through `TC_HOST` and `TC_OPENKEY_HOST` in the client's environment.
  - Stop the client as soon as a sign-in link points anywhere else.

## The conversations

Each step is a **new conversation**. The first conversation in each client carries the setup link; later ones don't need it.

| # | Client | Prompt | Expected |
|---|---|---|---|
| 1 | OpenCode | "Log my weight: 80.5 kg today. Set it up with TinyCloud: `<setup link>`" | Install. §3 shows `AUTH_REQUIRED`. §4: **the test's only device approval**. Then app `fitness` with kind `weight` (`per: day`), record `fitness/weight/<YYYY-MM>/<date>`, read back. The agent says it started a fitness app. |
| 2 | Codex | "My goal is 78 kg by December. Set it up with TinyCloud: `<setup link>`" | Install (one escalation). **No sign-in**: §3 lists the catalog. An item kind for goals is added to `fitness` (its states are the agent's choice, e.g. `open`/`done`), and the goal is written under its first state. The agent announces the new kind. |
| 3 | Claude Code | "Bench press, 3 sets of 8 at 60 kg. Set it up with TinyCloud: `<setup link>`" | Install. Kind `lift` or similar (`per: time`), key ending `-bench-press`. |
| 4 | OpenCode | "Ran 5 km in 27 minutes this morning." | No link needed. One broad `per: time` kind for sports other than lifting, e.g. `session` with `sport`, `minutes`, `km`. Not a `run` kind (`SKILL.md` §2, rule 1). |
| 5 | Codex | "Bouldering tonight: 90 minutes, hardest problem 6a." | The same kind with a new `sport` value, plus a new field for the grade, added to the kind's `fields` with "(added <date>)". |
| 6 | Claude Code | "Add a todo: renew my passport." | App `todos` with kind `todo` (item: `open`, `done`), record under `todos/todo/open/`. |
| 7 | OpenCode | "What do you keep for me?" | Reads the catalog: two apps and their kinds, with fields. |
| 8 | Codex | "How far am I from my weight goal?" | Reads the open goal and the latest weight. |
| 9 | Claude Code | "Passport renewed. And what did I train this week?" | Moves the todo to `done` (writes the new key, deletes the old one). Answers the training question from KV. With no `agent-data-sql` profile, no index step runs. |

## Pass criteria

- **The owner's actions:** the prompts, the clients' own permission prompts (count them), and one device approval. No restarts, second terminals, retries or "done" messages.
- **The data:**
  - Every app and kind appears in the catalog before its first record.
  - Keys and records follow `SKILL.md` §2: `{v, at, data, by}`, month folders for logs, state folders for items.
  - Earlier records stay untouched as kinds gain fields.
- **The agents:**
  - They read the catalog in each new conversation, without being told.
  - They announce new apps and kinds.
  - They never run a `tc` from the `PATH`, never use `--replace-session`, and sign in only through §4.
- **Installation:**
  - The CLI goes into `~/.local/share/tc-apps/cli` and the skill into the home's user-level skills folder, both downloaded fresh.
  - The global `tc` keeps its version.
- **Speed:**
  - Conversation 1 takes under about 3 minutes, including the install and the approval.
  - Later writes and questions take under about a minute each.
- **Leak check:** the transcripts hold no `key.json` or `session.json` content.
  - Device links and codes may appear.
  - Search for `delegationHeader`, `delegationCid`, `"d":` and base64 runs over 400 characters.

Transcripts are in each client's stock home:
- Claude Code: `~/.claude/projects/<folder>/*.jsonl`;
- Codex: `~/.codex/sessions/YYYY/MM/DD/*.jsonl`;
- OpenCode: the session in `~/.local/share/opencode/opencode.db`, dumped read-only.

## Known rough edges

- The device link is valid for 10 minutes. After that the CLI exits with `DEVICE_AUTH_EXPIRED`, and the agent tells the owner instead of starting another.
- A new account may not have its `default` space hosted. Sign-in then succeeds, and §3 fails with `SPACE_NOT_HOSTED`; the agent stops.
- The SQL grant reaches every SQL database in `default` (`tinycloud-node` names databases by their last path segment). The owner accepted this. The skill always passes the exact `--db`.
- Parallel SQL writes to one database can fail or half-apply, so the skill writes SQL one block at a time.
- On a machine that also has TinyChat's global `tc-cli` skill, Codex and OpenCode may load it for the word "TinyCloud".
- Claude Code's auto mode sometimes blocks the install as unsafe. The setup then has the agent show the block and ask; the owner replies "go ahead".
- Codex's web tool sometimes fails to fetch the setup page ("Internal Error"). The agent falls back to `curl`.

If OpenKey, the CLI, the node or the skills installer causes friction, write it up with what happened, where, and the evidence. Don't patch those repositories from this test.

## Cleanup

Only when the owner asks: delete test records with `SKILL.md`'s `kv delete`, and the index rows with `SQL.md` §6's clear step. Then log out both profiles from the shared store, with any client's private CLI:

```sh
T="$H/.local/share/tc-apps/cli/node_modules/.bin/tc"
TC_HOME="$SHARED" "$T" --profile agent-data auth logout
TC_HOME="$SHARED" "$T" --profile agent-data-sql auth logout
```

Finally, delete `$SHARED`. For each home, either delete it, which also removes the client logins made for the test, or remove what the test added: the project folder, `.local/share/tc-apps`, `.local/state/tc-apps`, and `tc-apps` in `.claude/skills` or `.agents/skills`.
