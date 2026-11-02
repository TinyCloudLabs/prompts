# Personal apps in TinyCloud: quickstart

Background and walkthrough for the `tc-apps` skill. The runnable blocks are in `SKILL.md` and `SQL.md`; the agent runs them from there.

Your agent keeps what you tell it in your own TinyCloud storage, in apps it creates as you go. You might log your weight one day, set a goal the next, start logging lifts, take up a new sport, then add a todo:
- **Apps appear on demand.** Fitness and todos each become an app, without a new install.
- **Apps grow on demand.** A new kind of record, or a new detail, is added when you first mention it, without a migration.
- **Any agent can carry on.** A new conversation in Claude Code, Codex or OpenCode finds every app and how it's stored, without being told.

Claude Code, Codex and OpenCode need Node.js 20 or later with npm. Reuse the CLI selected during onboarding, stable `1.5.2`: new installs and older agent-owned installs get it; an operator-selected older CLI stops setup with a one-line notice. There is no separate app CLI or beta installation.

Never share private keys or session files. Approval links also contain request material: send the complete link only to the approving owner, never to a URL shortener. See [What is and isn't secret](https://agents.tinycloud.xyz/agent#what-is-and-isnt-secret).

## 0. Setup, in the same prompt

Add the setup link to your first request:

> Fetch https://agents.tinycloud.xyz/apps with curl and follow it. Log this meal in my TinyCloud: breakfast, two eggs and a slice of toast, about 350 kcal.

The agent follows the setup at [`agents.tinycloud.xyz/apps`](https://agents.tinycloud.xyz/apps), then carries on with your request in the same conversation:
1. It checks Node.js and npm. If either is missing, or Node.js is older than 20, it stops and tells you; it doesn't install them.
2. It reuses the CLI from shared setup, or installs (or upgrades) one private copy in `~/.local/share/tinycloud/cli`. Unrelated commands on PATH are preserved.
3. It installs the skill for your user, so every project folder sees it: `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-apps/` for Claude Code, `~/.agents/skills/tc-apps/` for Codex and OpenCode.
4. It checks existing grants and actual app access, then carries out the requested record operation. Only missing permissions need approval.

No shell profile to edit, variables to set or client to restart. The agent reads the installed skill directly. In a future conversation that has not discovered it, paste the setup link again; the agent uses the installed files and carries on.

| Client | What to expect |
|---|---|
| Claude Code | It can ask you to confirm a step. Reply in chat naming the step your agent explains: [Confirming a step in Claude Code](https://agents.tinycloud.xyz/apps#if-claude-code-still-blocks-it). |
| Codex | Approve the install escalation in chat if its sandbox asks. The agent installs the CLI and skill. |
| OpenCode | The agent reads the installed skill for this request without a restart. Paste the setup link again in a future conversation if needed. |

Claude Code and Codex may also ask whether you trust a folder.

## What you see at sign-in

If you already completed onboarding, its application grants are reused. A new app does not automatically mean another sign-in. If you haven't, the agent runs [onboarding](https://agents.tinycloud.xyz/onboarding) first and then carries on with your request. When more access is needed:

1. The agent checks the selected owner's current permissions.
2. It describes only the missing access and sends the actual short OpenKey URL on its own line.
3. You open it on your computer or phone and review the scope and expiry before approving.
4. The waiting CLI retrieves the approval automatically and the agent saves and reads back your record. No code or terminal command is needed.

After an interruption, the agent resumes the same command/profile. The older narrow Health Log/Recipes fallback still uses manual codes and longer links; the normal onboarding path avoids it. Agents sharing the same profile store also share its existing grants.

## What you can ask

- "Log my weight: 80.5 kg today." Health Log owns weight records. Its installed knowledge defines the record; a new value for the same day replaces the earlier measurement only as its rules permit.
- "My goal is 78 kg by December." This adds a `goal` kind to `fitness`.
- "Bench press, 3 sets of 8 at 60 kg." This adds a `lift` kind.
- "Ran 5 km in 27 minutes." This adds a `session` kind. Later sports become new values of `sport`, and their details become new fields.
- "Add a todo: renew my passport." This starts a `todos` app. "Passport renewed" marks the todo done.
- "What do you keep for me?", "How far am I from my goal?", "My bench volume last week?"

When the agent creates an app or kind, it tells you in one line. Meals, weight and recipes go to Health Log or Recipes. Existing onboarding access is reused rather than requiring a new approval per catalog app.

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

Earlier versions of this skill kept all apps together in your `default` space, under `xyz.tinycloud.agent-data/`. Those records stay there; nothing deletes them unless you ask. An app that has records there keeps working exactly as before, with no new approval. The agent tells you once per conversation: "This app can move to its own folder: say "move my <app> records" when you want it (nothing is deleted)."

If this computer cannot check the old layout, the agent asks whether you kept that app's records with an earlier version before creating a duplicate. When you request a move, it reuses existing access or asks for missing permissions, then runs the migration:

1. It runs the dry run and shows you the plan in chat.
2. Once you agree, it copies the records to the new folder, reads them back and compares the keys, count and contents. It checks the old place again before saving the receipt and switching.
3. Any mismatch or refusal leaves the old records untouched and the old layout active. The agent reports the result in chat.

Pause other agents writing the app while it moves. On another computer, ask that agent to install the verified receipt before using the moved app. A move doesn't import old meal records into Health Log.

## Faster answers over many records

When a question needs many records, the agent first answers from the originals. It then checks whether it can make a searchable copy using existing SQL access. If additional permissions are needed, it offers a short OpenKey link naming this app's database and the expiry.

Approve in the browser; the waiting CLI collects the result. There is no manual code in the normal flow. The agent builds and verifies the copy and reports when it is ready. Declining leaves the originals unchanged and answers continue through direct reads.

Good to know:
- **Your records stay the truth.** The index is only a copy, and the agent rebuilds the parts that fall behind.
- **When the index expires** after 30 days, everything keeps working, more slowly, until you approve it again.
- **Don't rely on the database name as a boundary.** The approval names one database, but TinyCloud's node can also open other SQL databases in the same space. The agent only ever uses that app's index.
- **Approval is bound to the requesting CLI.** Keep the entire short URL intact; another device can open it, but the CLI that made the request verifies the result.

## What the sign-ins grant

- **Existing onboarding access:** covers the owner's application data for the approved lifetime. Reuse it; do not pretend it is narrower than it is.
- **New scoped access:** requests only this app's KV roots or SQL database and only the actions the task needs. A read-only task does not request writes.
- **Lifetime:** normally 30 days. The short link's request expiry is separate from the resulting grant's expiry.
- **Stopping:** revocation through https://account.tinycloud.xyz/delegations ends the grant. Local `auth logout` clears only that profile's local session. A shared onboarding profile serves multiple apps; the agent explains that before logging it out.

  To uninstall too, ask the agent in chat to remove this skill's install, state and skill folders. Your records stay in TinyCloud.

## Why it works this way

- **One folder per app; no redundant approval.** Separate roots support narrow future grants, while an already-approved broader grant can be reused.
- **Short signed browser approval.** The owner can approve on another device, and the waiting CLI retrieves the encrypted result without a pasted code.
- **KV first, SQL as a copy.** Key-value records survive agent mistakes, because each record is its own key. The SQL index is rebuildable, so it never holds the only copy of anything.
- **Reads run side by side.** Each storage command takes 3–5 s against TinyCloud, so the agent fetches up to eight records at once.
- **Literal paths in commands.** Claude Code can remember an approval only for a command it can work out from the text.

## Rough edges

- If you approve with a different account or key than the profile's first sign-in, the sign-in fails with `OPENKEY_OWNER_MISMATCH`. Ask again and use the same one.
- A brand-new account's space finishes setting up a minute or two after the first approval. Until then reads and writes fail with `SPACE_NOT_HOSTED`: the agent tells you it's still being set up and retries for about two minutes. If it's still not ready, the agent says so and stops; try again in a few minutes. It never asks for a second sign-in to fix this.
- When your TinyCloud storage is full, saves fail with `STORAGE_QUOTA_EXCEEDED` or `STORAGE_LIMIT_REACHED` and nothing is saved; your records are still readable. The agent tells you and doesn't retry. To keep saving, upgrade at https://account.tinycloud.xyz/storage; deleting records doesn't free space yet.
- Two agents changing the same kind's description in the same few seconds can lose one change; the next agent re-adds it.
- `tinycloud-explorer` doesn't show these apps yet.
