# Personal apps in TinyCloud: quickstart

Background and walkthrough for the `tc-apps` skill. The runnable blocks are in `SKILL.md` and `SQL.md`; the agent runs them from there.

Your agent keeps what you tell it in your own TinyCloud storage, in apps it creates as you go. You might log your weight one day, set a goal the next, start logging lifts, take up a new sport, then add a todo:
- **Apps appear on demand.** Fitness and todos each become an app, without a new install.
- **Apps grow on demand.** A new kind of record, or a new detail, is added when you first mention it, without a migration.
- **Any agent can carry on.** A new conversation in Claude Code, Codex or OpenCode finds every app and how it's stored, without being told.

It works in Claude Code, Codex and OpenCode, and needs Node.js 22.20 or later with npm. The skill runs `@tinycloud/cli@1.3.4` from a folder of its own.

A permission slip and the code OpenKey shows after you approve are fine to share; keys and session files are not. The full list is in [What is and isn't secret](https://agents.tinycloud.xyz/agent#what-is-and-isnt-secret).

## 0. Setup, in the same prompt

Add the setup link to your first request:

> Fetch https://agents.tinycloud.xyz/apps with curl and follow it. Log this meal in my TinyCloud: breakfast, two eggs and a slice of toast, about 350 kcal.

The agent follows the setup at [`agents.tinycloud.xyz/apps`](https://agents.tinycloud.xyz/apps), then carries on with your request in the same conversation:
1. It checks Node.js and npm. If either is missing, or Node.js is older than 22.20, it stops and tells you; it doesn't install them.
2. It installs the CLI into `~/.local/share/tc-apps/cli`, a folder only this skill uses, unless it's already there. A `tc` on your `PATH` stays as it is. Next to it, it writes `~/.local/share/tc-apps/tc`, a short script that runs this CLI and retries when TinyCloud drops a connection.
3. It installs the skill for your user, so every project folder sees it: `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-apps/` for Claude Code, `~/.agents/skills/tc-apps/` for Codex and OpenCode.
4. It reads the skill and signs you in, as below.

No shell profile to edit, and nothing to restart except OpenCode, once (see below). Afterwards, any new conversation in any folder can use your apps without the link.

| Client | Start | What to expect |
|---|---|---|
| Claude Code | `claude` | Auto mode can block the install or the sign-in. The agent then shows you the block and asks; reply "go ahead", or allow it in your settings: [If Claude Code still blocks it](https://agents.tinycloud.xyz/apps#if-claude-code-still-blocks-it). Manual mode asks on first use for the setup page, the check, the install and each kind of skill block; choose "Yes, and don't ask again" where it's offered. Blocks that run commands side by side, or write the skill's state folder, ask every time in manual mode. |
| Codex | `codex -s workspace-write -c sandbox_workspace_write.network_access=true --add-dir ~/.tinycloud --add-dir ~/.local/state/tc-apps` | One approval, for the install. The CLI needs the network, and it writes the profile store and the state folder, both outside the project. With `TC_HOME` or `TC_APPS_STATE` set, pass `$TC_HOME/.tinycloud` and `$TC_APPS_STATE` instead. Folders under your home don't need to exist yet: the setup creates them. A missing `--add-dir` folder under `/tmp`, though, stops Codex's sandbox from starting, so create it first. |
| OpenCode | `opencode` | No questions. After the first setup, restart OpenCode once, as the agent will tell you: it loads skills only when it starts. Claude Code and Codex don't need a restart. |

Claude Code and Codex also ask whether you trust a folder the first time you start them in it.

Optional variables, set before you start the client:
- `TC_HOME`: the CLI profile store. Without it the CLI uses `~/.tinycloud`.
- `TC_APPS_STATE`: this skill's state folder. Default `~/.local/state/tc-apps`.
- `TC_BIN`: the absolute path to another `tc`, CLI `1.3.4` or later. The skill then uses it instead of its own folder.

## What you see at sign-in

1. You ask, for example "Log my weight: 80.5 kg today." The agent checks your sign-in, then starts one.
2. A link and a code appear:
   - **Claude Code and Codex:** in the agent's message, for example:

     > Open https://openkey.so/device?user_code=ABCD-EFGH and approve the request on OpenKey. It should show the code ABCD-EFGH. It lets the agents on this computer keep your records under `xyz.tinycloud.agent-data/` for 30 days. I'll carry on as soon as you approve.

   - **OpenCode:** the agent says "Open the OpenKey link that appears below and approve the request." The link appears in the output of the command it's running.
3. Open the link, on this computer or your phone, and sign in to OpenKey. Check that it shows the same code and one key-value entry for `xyz.tinycloud.agent-data/` in your `default` space, then approve.
4. The agent notices the approval by itself within a few seconds and carries on. In the forward test, the first request took 98–162 s, including the install and the approval.

That one approval covers every app, for 30 days, for every agent on this computer that uses the same `TC_HOME`.

## What you can ask

- "Log my weight: 80.5 kg today." This starts a `fitness` app with a `weight` kind. Another value for the same day replaces the first, and the agent says so.
- "My goal is 78 kg by December." This adds a `goal` kind to `fitness`.
- "Bench press, 3 sets of 8 at 60 kg." This adds a `lift` kind.
- "Ran 5 km in 27 minutes." This adds a `session` kind. Later sports become new values of `sport`, and their details become new fields.
- "Add a todo: renew my passport." This starts a `todos` app. "Passport renewed" marks the todo done.
- "What do you keep for me?", "How far am I from my goal?", "My bench volume last week?"

When the agent creates an app or a kind, it tells you in one line.

## How your data is organised

Everything sits under `xyz.tinycloud.agent-data/` in your `default` space:

```text
catalog/fitness                          what the fitness app is for
catalog/fitness/lift                     what a lift record holds: fields, units, how keys are formed
fitness/lift/2026-10/2026-10-06T1830-bench-press
fitness/weight/2026-10/2026-10-06
todos/todo/open/2026-10-06-renew-passport
```

Each record is a small JSON document: `{"v":1,"at":"…","data":{…},"by":"claude-code"}`, where `by` is the client that wrote it.
- **The catalog** tells any agent what exists and how to read it.
- **Changes only add.** New fields and new kinds never break old records, and nothing is migrated.

## Faster answers over many records

You don't need to set anything up. The first time a question needs many records, such as "bench volume per week since August", the agent answers the slow way, reading them one by one. It then offers a faster way, a searchable copy of your records:

1. The agent shows an OpenKey link. Open it and sign in. OpenKey lists the request as SQL access to `xyz.tinycloud.agent-data.index` in your `default` space, for 30 days; that's the copy.
2. Approve. OpenKey then shows a short code, such as `ABCD-EFGH`. Paste it in the chat and the agent finishes the sign-in, or paste it into your own terminal with the command the agent gives you. A short code works once and expires within minutes; if it has expired, paste the full code OpenKey also shows.
3. The agent finishes, builds the copy from your records, and says when it's done. From then on it answers questions over many records with one lookup instead of reading every record. The agent's own thinking still takes most of the time.

If you ignore the offer, nothing breaks; the agent asks again in a later conversation that needs it.

Good to know:
- **Your records stay the truth.** The index is only a copy, and the agent rebuilds the parts that fall behind.
- **When the index expires** after 30 days, everything keeps working, more slowly, until you approve it again.
- **Its reach is wider than its label.** The approval names one database, but TinyCloud's node also lets it open your `default` space's other SQL databases. The agent only ever uses the index.
- **The code** is a permission slip for this computer's `agent-data-sql` profile, so it's fine to paste in the chat. A short code only works for the sign-in that asked for it, works once, and expires within minutes.

## What the sign-ins grant

- **Records:** profile `agent-data` can get, put, list and delete keys under `xyz.tinycloud.agent-data/` in your `default` space, and nothing else. Every OpenKey approval also lets it read which permissions it holds.
- **Index:** profile `agent-data-sql` can read, write and change the schema of the SQL database `xyz.tinycloud.agent-data.index` in your `default` space, with the wider reach described above.
- **Lifetime:** 30 days each, OpenKey's maximum. Afterwards the agent shows you a new link when it needs one.
- **Stopping:** each command below clears the local session, with `TC_HOME` and `TC_BIN` set as when you started the client, so it uses the same CLI as the skill. The approvals stay valid on TinyCloud until they expire.

  ```sh
  "${TC_BIN:-$HOME/.local/share/tc-apps/tc}" --profile agent-data auth logout
  "${TC_BIN:-$HOME/.local/share/tc-apps/tc}" --profile agent-data-sql auth logout
  ```

  To remove the rest, delete `~/.local/share/tc-apps`, `~/.local/state/tc-apps`, and the `tc-apps` skill folders.

## Why it works this way

- **One root, one approval.** Every app lives under one key root, so new apps and new kinds need no new approval. The price is that the one grant covers all of your agent-kept records.
- **Phone-code approval for records.** `tc auth login --device` needs nothing to reach back to the machine the agent runs on, so it works over SSH and from your phone. OpenKey allows it only for key-value storage in an ordinary space, under an explicit path.
- **KV first, SQL as a copy.** Key-value records work with the phone-code approval and survive agent mistakes, because each record is its own key. The SQL index is rebuildable, so it never holds the only copy of anything.
- **Reads run side by side.** Each storage command takes 3–5 s against TinyCloud, so the agent fetches up to eight records at once.
- **Literal paths in commands.** Claude Code can remember an approval only for a command it can work out from the text.

## Rough edges

- OpenKey allows 5 phone-code sign-in requests per 10 minutes from one network.
- If you approve with a different account or key than the profile's first sign-in, the sign-in fails with `OPENKEY_OWNER_MISMATCH`. Ask again and use the same one.
- A brand-new account's `default` space finishes setting up a minute or two after the first approval. Until then reads and writes fail with `SPACE_NOT_HOSTED`: the agent tells you it's still being set up and retries for about two minutes. If it's still not ready, the agent says so and stops; try again in a few minutes. It never asks for a second sign-in to fix this.
- Two agents changing the same kind's description in the same few seconds can lose one change; the next agent re-adds it.
- `tinycloud-explorer` doesn't show these apps yet.
