# Personal apps in TinyCloud: quickstart

Background and walkthrough for the `tc-apps` skill. The runnable blocks are in `SKILL.md` and `SQL.md`; the agent runs them from there.

Your agent keeps what you tell it in your own TinyCloud storage, in apps it creates as you go. You might log your weight one day, set a goal the next, start logging lifts, take up a new sport, then add a todo:
- **Apps appear on demand.** Fitness and todos each become an app, without a new install.
- **Apps grow on demand.** A new kind of record, or a new detail, is added when you first mention it, without a migration.
- **Any agent can carry on.** A new conversation in any agent with this skill finds every app and how it's stored, without being told.

It works in any agent that can install and run the TinyCloud CLI, for example Claude Code, Codex or OpenCode, and needs Node.js 22.20 or later with npm. It uses the CLI and your TinyCloud sign-in from [`agents.tinycloud.xyz/onboarding`](https://agents.tinycloud.xyz/onboarding).

A permission slip and the code OpenKey shows after you approve are fine to share; keys and session files are not. The full list is in [What is and isn't secret](https://agents.tinycloud.xyz/agent#what-is-and-isnt-secret).

## 0. Setup, in the same prompt

Add the setup link to your first request:

> Fetch https://agents.tinycloud.xyz/apps with curl and follow it. Log this meal in my TinyCloud: breakfast, two eggs and a slice of toast, about 350 kcal.

The agent follows the setup at [`agents.tinycloud.xyz/apps`](https://agents.tinycloud.xyz/apps), then carries on with your request in the same conversation:
1. It checks Node.js and npm. If either is missing, or Node.js is older than 22.20, it stops and tells you; it doesn't install them.
2. If TinyCloud isn't set up on this computer yet, it follows [`agents.tinycloud.xyz/onboarding`](https://agents.tinycloud.xyz/onboarding) first: that installs the TinyCloud CLI and signs you in. A `tc` on your `PATH` stays as it is.
3. It installs the skill for your user, so every project folder sees it: for example `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-apps/` for Claude Code, `~/.agents/skills/tc-apps/` for Codex and OpenCode.
4. It reads the skill and carries on with your request.

No shell profile to edit, variables to set or client to restart. The agent reads the installed skill directly. In a future conversation that has not discovered it, paste the setup link again; the agent uses the installed files and carries on.

| Client | What to expect |
|---|---|
| Claude Code | It can ask you to confirm a step. Reply in chat naming the step your agent explains: [Confirming a step in Claude Code](https://agents.tinycloud.xyz/apps#if-claude-code-still-blocks-it). |
| Codex | Approve the install escalation in chat if its sandbox asks. The agent installs the skill. |
| OpenCode | The agent reads the installed skill for this request without a restart. Paste the setup link again in a future conversation if needed. |

These are examples; any agent that can install and run the TinyCloud CLI works the same way. Claude Code and Codex may also ask whether you trust a folder.

## What you approve

Nothing new. The sign-in from onboarding lets your agent read and write your `applications` space for 30 days, and every app lives there, so a new app, such as `todos` or `fitness`, starts without an approval. Every agent on this computer that uses the same `TC_HOME` shares that sign-in.

Only two things ask once more, each with one OpenKey link: the fast, searchable copy of an app's records (below), and records you kept with an earlier version of this skill. Open the link, approve, and send the agent the code OpenKey shows.

## What you can ask

- "Log my weight: 80.5 kg today." This starts a `fitness` app with a `weight` kind. Another value for the same day replaces the first, and the agent says so.
- "My goal is 78 kg by December." This adds a `goal` kind to `fitness`.
- "Bench press, 3 sets of 8 at 60 kg." This adds a `lift` kind.
- "Ran 5 km in 27 minutes." This adds a `session` kind. Later sports become new values of `sport`, and their details become new fields.
- "Add a todo: renew my passport." This starts a `todos` app. "Passport renewed" marks the todo done.
- "What do you keep for me?", "How far am I from my goal?", "My bench volume last week?"

When the agent creates an app or a kind, it tells you in one line. Meals, food, calories and recipes go to Health Log and Recipes.

## How your data is organised

Each app sits under its own folder in your `applications` space, `xyz.tinycloud.tinyapps.<app>/`:

```text
xyz.tinycloud.tinyapps.fitness/catalog                          what the fitness app is for
xyz.tinycloud.tinyapps.fitness/catalog/lift                     what a lift record holds: fields, units, how keys are formed
xyz.tinycloud.tinyapps.fitness/lift/2026-10/2026-10-06T1830-bench-press
xyz.tinycloud.tinyapps.fitness/weight/2026-10/2026-10-06
xyz.tinycloud.tinyapps.todos/todo/open/2026-10-06-renew-passport
xyz.tinycloud.tinyapps.catalog/fitness/entry                    one line per app, so any agent can find it
```

Each record is a small JSON document: `{"v":1,"at":"…","data":{…},"by":"claude-code"}`, where `by` is the client that wrote it.
- **The catalog** tells any agent what exists and how to read it.
- **Changes only add.** New fields and new kinds never break old records, and old records aren't rewritten.
- **New records are created, not overwritten.** The agent writes a new key with `--if-none-match '*'`, which refuses to replace an existing record. It replaces one only when you give a new value for a once-a-day record such as a weigh-in.

## Records from an earlier version

Earlier versions of this skill kept all apps together in your `default` space, under `xyz.tinycloud.agent-data/`. Those records stay there; nothing deletes them unless you ask. An app that has records there keeps working as before. Your sign-in from onboarding doesn't cover that space, so the agent asks once for access to it with one OpenKey link. The agent tells you once per conversation: "This app can move to its own folder: say "move my <app> records" when you want it (nothing is deleted)."

If this computer can't see the old place, the agent can't check it, so it asks whether you kept that app's records with an earlier version.

When you ask for the move, the agent shows you the plan and runs the move after you say it looks right:

1. `sh migrate.sh --dry-run <app>` prints the plan and writes nothing.
2. `sh migrate.sh <app>` copies the records to the app's new folder, reads them back and compares them (the same keys, the same count, the same contents), checks the old place again for edits made meanwhile, and only then marks the app as moved and saves a receipt with counts and a digest.
3. If anything differs, or is refused, it stops with `NOT SWITCHED`, the old records are untouched, and the app keeps working in the old place. Fix the cause and run it again; keys that already match are recognised.

The app switches to its own folder only after step 2 printed success and its receipt exists. Pause other agents that write the app while it runs, and copy the receipt to your other computers before you use the app there. A move doesn't import old meal records into Health Log; they are moved as they are. An app with no old records starts in its own folder.

## Faster answers over many records

You don't need to set anything up. The first time a question needs many records of one app, such as "bench volume per week since August", the agent answers the slow way, reading them one by one. It then offers a faster way, a searchable copy of that app's records:

1. The agent sends you an OpenKey link. Open it, on this computer or your phone, and approve.
2. OpenKey then shows a short code, such as `ABCD-EFGH`. Send it to the agent in the chat. A code works once and expires within minutes; if it has expired, the agent sends a new link.
3. The agent finishes, builds the copy from the app's records, and says when it's done. From then on it answers questions over many records of that app with one lookup, without reading every record. The agent's own thinking still takes most of the time.

If you ignore the offer, nothing breaks; the agent asks again in a later conversation that needs it.

Good to know:
- **Your records stay the truth.** The index is only a copy, and the agent rebuilds the parts that fall behind.
- **The code** is a permission slip for this computer's TinyCloud sign-in, so it's fine to paste in the chat.

## What the approvals grant

- **Your sign-in from onboarding:** read, change and delete your apps' data in your `applications` space, which holds every app's records and the SQL index's rows.
- **The fast copy:** creating the tables of one app's SQL database, `xyz.tinycloud.tinyapps.<app>/index`.
- **Records from an earlier version:** get, put, list and delete keys under `xyz.tinycloud.agent-data/` in your `default` space, and, for their fast copy, the SQL database `xyz.tinycloud.agent-data.index` there.
- **Lifetime:** 30 days each, OpenKey's maximum. Afterwards the agent sends you a new link when it needs one.
- **Stopping:** revoke any approval at https://account.tinycloud.xyz/delegations. To uninstall too, ask the agent in chat to remove this skill's state and skill folders. Your records stay in TinyCloud.

## Why it works this way

- **One folder per app, one sign-in for all.** Each app has its own key root, so apps don't mix, and your sign-in from onboarding covers them all.
- **Browser approval with a pasted code.** OpenKey shows the request in plain words; you approve it on any device and send the agent the code it shows.
- **KV first, SQL as a copy.** Key-value records survive agent mistakes, because each record is its own key. The SQL index is rebuildable, so it never holds the only copy of anything.
- **Reads run side by side.** Each storage command takes 3–5 s against TinyCloud, so the agent fetches up to eight records at once.
- **Literal paths in commands.** Claude Code can remember an approval only for a command it can work out from the text.

## Rough edges

- If you approve with a different account than the one you signed in with on this computer, the approval fails with `OPENKEY_OWNER_MISMATCH`. Ask again and use the same one.
- A brand-new account's space finishes setting up a minute or two after the first approval. Until then reads and writes fail with `SPACE_NOT_HOSTED`: the agent tells you it's still being set up and retries for about two minutes. If it's still not ready, the agent says so and stops; try again in a few minutes. It never asks for a second sign-in to fix this.
- When your TinyCloud storage is full, saves fail with `STORAGE_QUOTA_EXCEEDED` or `STORAGE_LIMIT_REACHED` and nothing is saved; your records are still readable. The agent tells you and doesn't retry. To keep saving, upgrade at https://account.tinycloud.xyz/storage; deleting records doesn't free space yet.
- Two agents changing the same kind's description in the same few seconds can lose one change; the next agent re-adds it.
- `tinycloud-explorer` doesn't show these apps yet.
