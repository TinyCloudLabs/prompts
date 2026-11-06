# The context app (tc-apps)

Part of the `tc-apps` skill: `SKILL.md` has the sign-in, the write and read blocks and the errors. The context app keeps what the owner told an agent, so the next agent they use, in any client, can carry on without being told again: facts about them, how they like things done, decisions made in a task, and a short handoff at the end of a task.

- **App:** `context`. Its key root is `xyz.tinycloud.tinyapps.context/` in the owner's `applications` space, written `<C>/` below.
- **Profile and approval:** use the profile returned by `SKILL.md` §3's app-context check; it may reuse the selected onboarding profile or use `tinyapp-context` when scoped sign-in is needed. A scoped approval grants only `<C>/` and this app's exact discovery entry, `xyz.tinycloud.tinyapps.catalog/context/entry`, for 30 days.
- **Layout:** always the new layout. Skip `SKILL.md` §1a's first line for this app; use the selected `TC_BIN` from `SKILL.md` §1.
- **Who reads it:** every agent the owner uses, and every read sends what it reads to that agent's model provider. So it holds low-sensitivity facts and preferences only (§1).

## 1. What goes in, and what never does

- **Save only what the owner said, or approved when you asked.** Never a guess, an inference, or something you noticed about them.
- **Never secrets,** in context or anywhere else: passwords, API keys, tokens, recovery codes, private keys. They belong in TinyCloud Secrets.
- **A pasted secret.** If the owner pastes a password, key or token into the chat, don't save it anywhere and never repeat it back, not even in part. Tell them in one or two lines that it is now in this chat's history, so they should replace it with a new one, and add the new one to TinyCloud Secrets: with the `tc-secrets` skill's add link if that skill is set up here, otherwise through <https://agents.tinycloud.xyz/secrets>.
- **Sensitive things go to their own app, not here:** health data, money and account or card numbers, government or ID numbers, an exact home address, and private details about other people. If the owner asks to keep one of these in context, say in one short line why not ("Any agent that reads your context sends it to the company that runs its AI model."), and offer the right place, with its own approval:
  - meals, calories and body weight → Health Log (`TINY-APPS.md`); other health records → their own app (`SKILL.md` §2);
  - an account, card or ID number → TinyCloud Secrets, as for a secret;
  - money, an address, details about another person → their own app (`SKILL.md` §2).

  Save it in context only if the owner then insists in so many words.
- **What fits:** "my coffee order is a flat white", "I live in Lisbon", "keep replies short", "we chose the hotel in Alfama".

## 2. Keys and records

| Key (in the `applications` space) | Holds |
|---|---|
| `<C>/catalog` | the app record |
| `<C>/catalog/<kind>` | a kind record for each kind below |
| `<C>/fact/<subject>` | something true about the owner that they told an agent |
| `<C>/preference/<subject>` | what they like or choose, and how they like things done |
| `<C>/decision/<subject>` | a choice made in a task that a later task needs |
| `<C>/handoff/<YYYY-MM-DD>-<task>` | a short note at the end of a task: what was done and what's next |

- **Fact or preference.** A fact is true about the owner whatever they'd choose today: their birthday (`fact/birthday`), their home city (`fact/home-city`), the languages they speak. A preference is something they like or choose, and could choose differently tomorrow: their coffee order (`preference/coffee-order`), short replies (`preference/reply-length`), metric units, an aisle seat. If they'd put it as "I like …", "I prefer …" or "I usually …", it's a preference.
- **One record per subject, whatever its kind.** `<subject>` names what it's about, never its value: `coffee-order`, not `flat-white`; `reply-length`; for a decision, the task and topic, `lisbon-trip-hotel`. A new value for the same subject replaces the record. Before you write, look in the key list (§3) for the same subject under any kind, such as `fact/coffee-order` or `preference/coffee` for a coffee order, and update that record, under its key, instead of making a second one (§4).
- **A handoff's key** is the task's start date, the local date from `<NOW>`, and a slug of the task: `handoff/2026-10-27-lisbon-trip`. Picking the task up later updates the same key.
- Slugs follow `SKILL.md` §2: lowercase `a-z`, `0-9` and `-`.

**A record**, as in `SKILL.md` §2: `{"v":1,"at":"<UTC>","data":{"text":"Flat white"},"by":"codex"}`. `at` is when the owner told you, or when the task ended, from `<UTC>`.
- `fact`, `preference`: `text`, short, in the owner's words.
- `decision`: `text` (what was decided) and `task` (the task it was made in).
- `handoff`: `task`, `did` (what was done), `next` (what's next), and `where` if there is one: a folder, a repository and branch, or a link.

**The catalog**, written as `SKILL.md` §2 rule 2 says: the app record, the first kind record and the discovery entry before the app's first record, and each other kind record before its first record. `<TODAY>` is the local date.
- `<C>/catalog`: `{"app":"context","title":"Context","about":"What the owner told an agent, so the next agent can carry on: facts, preferences, decisions and handoffs. Low-sensitivity only.","created":"<TODAY>","by":"<client>"}`
- `<C>/catalog/fact`: `{"app":"context","kind":"fact","about":"Something true about the owner that they told an agent. One record per subject.","shape":"subject","v":1,"fields":{"text":"text: the fact, in the owner's words"},"created":"<TODAY>","by":"<client>"}`
- `<C>/catalog/preference`: the same, with `"kind":"preference"`, `"about":"How the owner likes things done. One record per subject."` and `"fields":{"text":"text: the preference, in the owner's words"}`.
- `<C>/catalog/decision`: `"kind":"decision"`, `"about":"A choice made in a task that a later task needs. One record per subject."`, `"fields":{"text":"text: what was decided","task":"text: the task it was made in"}`.
- `<C>/catalog/handoff`: `"kind":"handoff"`, `"about":"A short note at the end of a task: what was done and what's next. One per task; the key starts with the task's start date."`, `"fields":{"task":"text: the task","did":"text: what was done","next":"text: what's next","where":"text: optional, the folder, repository and branch, or link"}`.
- `xyz.tinycloud.tinyapps.catalog/context/entry`: `{"v":1,"app":"context","id":"xyz.tinycloud.tinyapps.context","title":"Context"}`

## 3. Read

**When:**
- A line in your instructions asks you to check the owner's TinyCloud context (setup §4): before your first answer in a session.
- Otherwise, when a request needs what the owner told an agent before: "what's my …", "as usual", "the way I like it", "continue", "pick up where I left off".
- Never just to warm up. A request that needs nothing personal gets nothing past the key list.

**How, at most once per session:**
1. Run `SKILL.md` §3's app-context check for `context` with the selected `TC_BIN`. When it returns `ready`, use its `profile` as `<CONTEXT_PROFILE>`, its `host` as `<CONTEXT_HOST>` and its `spaceId` as `<CONTEXT_SPACE>`. If the request needs context and the status is not `ready`, follow its §3/§4 instructions and rerun the check. A request that doesn't need context continues without a new approval.
2. Check whether the fast copy is available, using the same helper:

   ```sh
   for d in "${CLAUDE_SKILL_DIR:-}" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps" "$HOME/.agents/skills/tc-apps" "$HOME/.local/share/tc-apps/skill"; do if [ -n "$d" ] && [ -f "$d/app-context.mjs" ]; then node "$d/app-context.mjs" '<TC_BIN>' context --sql; break; fi; done
   ```

   If it returns `ready` with `indexPresent: true`, use its `profile` as `<CONTEXT_SQL_PROFILE>`; otherwise treat the fast copy as unavailable. This check is informational; don't request another approval for it.
3. List the keys, once:

   ```sh
   TC_BIN='<TC_BIN>'; umask 077
   "$TC_BIN" --profile '<CONTEXT_PROFILE>' --host '<CONTEXT_HOST>' kv list --prefix 'xyz.tinycloud.tinyapps.context/' --space '<CONTEXT_SPACE>' --all --json
   ```

4. Get only the records the request needs, up to about 20, with `SKILL.md` §5's block for several records and `--profile '<CONTEXT_PROFILE>'`. The subject is in the key, so pick by key; a preference about how to work or reply, such as `preference/reply-length`, fits most requests. Never get every record, and never paste the key list into your reply.
5. Later in the same session, get one more record only when a new request needs it. Don't list again.

**What the list says:**
- `"keys"` → read as above. `"keys": []` → nothing saved yet; don't mention it unless asked.
- `PROFILE_NOT_FOUND` → the context app isn't approved on this computer. Before a first answer, carry on and say nothing. For a request that needs context, such as "remember …" or "what's my …", get its approval (`SKILL.md` §4 with `context`), then list again.
- `AUTH_REQUIRED`, `AUTH_EXPIRED`, `AUTH_UNAUTHORIZED`, or "persisted SIWE is expired" → the 30 days are over. Before a first answer: answer the request, then add one line, once per session: "Your TinyCloud context approval has ended; say "renew my context" when you want it back." For a request that needs context: `SKILL.md` §4 with `context`.
- `SPACE_NOT_HOSTED` or `NETWORK_ERROR` → follow `SKILL.md` §1a, §3 and §8. Don't hold up a request that doesn't need context.

**"Continue" or "pick up where I left off":** take the `handoff/` keys from the list. If the owner named the task, use the handoff whose slug matches it; otherwise get the newest: the keys sort by date, so get the ones with the latest date and use the one with the latest `at`. Say in one line which task you're picking up, then go on from its `next`.

**"What's in my TinyCloud context?"** is the one request that reads every record. List, then get every key except `<C>/catalog` and `<C>/catalog/…`, in blocks of up to 40. Show a compact list, one line per record: its kind, its subject (from the key), a short value, `by` (the client that saved it) and the date of `at`. Then offer to delete any of them.

**A search over many records** (more than about 40, and the question is about their contents, not their subjects) → the fast copy, as `SKILL.md` §7 says for any app. In its `entries` view, `id` is the subject and `folder` is empty.

## 4. Write

**When:**
- **Facts and preferences:** the owner asks you to remember something about them, or states a lasting fact or preference about themselves in so many words ("I'm vegetarian", "always use metric"). Check it against §1 before any sign-in or write.
- **Decisions:** the owner makes or approves a choice that a later task needs. Not every step of a task.
- **Handoffs:** at most one per task, at its end, or at a real pause such as the owner stopping for the day. Only for a task of several steps; never one per step, and none for a quick answer or one record.

**How:**
1. Run `SKILL.md` §1 for `<UTC>` and `<NOW>`, using its selected `TC_BIN`.
2. Use this session's key list (§3). If you haven't listed yet, list now; that is the session's one list. Look in it for the same subject under every kind, `fact/`, `preference/`, `decision/`: another agent may have filed it under a kind you wouldn't pick. If one is there, that is the key to update, in step 4; keep its kind, and never write a second record for the same subject.
3. **A new key**, only when no kind has the subject: write it with `SKILL.md` §6's block, with `--if-none-match '*'`. Put any catalog records it still needs (§2) first, in the same block.
4. **A key that exists:** get it. If the value is the same, write nothing. If it changed, write the new record without `--if-none-match`, which replaces the old one.
5. **Write rarely.** Storage counts every write, and overwrites and deletes don't free space today. One write per new fact; never rewrite a record only to change its `at`.
6. If §3 step 2 returned `ready` with `indexPresent: true`, follow `SQL.md` §3 afterwards, as for any app.

**Tell the owner** in one short line, only for a new fact or preference they told you: "Saved to your TinyCloud context: coffee order, flat white." Say nothing for an update, a decision or a handoff.

## 5. Delete

When the owner asks you to forget something, delete that record with `SKILL.md` §6's `kv delete`, and `SQL.md` §3 if there's a fast copy. Tell them in one line that it's deleted. The first time in a conversation, add what deleting does today, in these words:

<!-- For maintainers: deletion facts as of 2026-10-27 (TinyCloud's node keeps the earlier write under a delete tombstone). When old versions can be fully erased, update this quote, the setup guide's Undo and QUICKSTART.md together. -->
> Deleting a record removes it from your TinyCloud, so agents can't get it there again. An earlier copy stays in TinyCloud's storage, and an agent that already read it may have kept its own copy, so don't put anything in context you'd need permanently erased.

"Forget everything" or "clear my context": list, tell the owner how many records there are, ask once, then delete each record. Keep the catalog records: they hold nothing about the owner.

## 6. The session check

The setup's one question (setup §4) may have added this line, ending with `<!-- tinycloud-context -->`, to the instructions of the owner's agents on this computer: "Before your first answer in a session, check my TinyCloud context: follow `<this file>` (tc-apps skill, context app). Save new facts I tell you there." It is what makes the next agent read context without being asked.

- If the owner said no, `preference/session-check` may say so. Never ask again.
- If the owner asks you to stop it, run the script in the skill's folder and tell them which files it changed:

  ```sh
  for d in "${CLAUDE_SKILL_DIR:-}" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/tc-apps" "$HOME/.agents/skills/tc-apps" "$HOME/.local/share/tc-apps/skill"; do if [ -n "$d" ] && [ -f "$d/session-check.sh" ]; then sh "$d/session-check.sh" remove; break; fi; done
  ```

  It removes only the lines that end with `<!-- tinycloud-context -->`. If the step is blocked, give the owner the same command to run in their own terminal.
