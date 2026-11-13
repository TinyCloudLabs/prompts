# tc-apps forward-test runbook

The test proves three things across conversations and clients:
- **Apps appear on demand:** a fitness app grows from weight to goals to lifts to a second sport, and a todo app appears.
- **Apps change on the fly:** new kinds and fields need no new approval, install or migration.
- **Any agent picks it up:** a new conversation in Claude Code, Codex or OpenCode finds the apps through the catalog.

Every client uses one shared profile store and the same selected CLI. Run the baseline after the current onboarding approvals: creating another generic app must not trigger another install or permission already covered by onboarding. Also run a narrow-profile case: request only missing app permissions, through a short link with automatic retrieval and no pasted code.

The generic-store scenarios below use an explicitly chosen custom fitness app, not a replacement for catalog Health Log routing. Test ordinary meal/weight requests separately through `TINY-APPS.md`. The optional SQL index has its own checks below.

## Preconditions

- **Setup link:** `https://agents.tinycloud.xyz/apps`. The site deploys from `main`, and the setup installs the skill from the same site, so the page and the skill always come from one deployment.
  - **Before merge:** use the pull request's Cloudflare Pages preview instead, `https://<hash>.tinycloud-agents.pages.dev/apps`. On a preview, the page's URLs and the installer point at the preview, so it installs that branch's skill as-is.
  - **Check the install:** a fresh install reports `SKILL_INSTALLED tc-apps 0.4.2 …`, with checksummed files matching that site's `/skills/index.json`. `TC_SELECTED` identifies the one CLI; a clean install, or an older private copy, ends at `1.6.5` (`node_modules/.bin/tinycloud`), while a newer CLI is kept and an older operator-selected CLI stops setup with `TC_OLDER`. There is no app-local beta or retry wrapper.
- **A stock home per client, `$H`.** Either a new folder holding a copy of `/etc/skel`, or a logged-in stock home from an earlier test.
  - Give it a new, empty project folder with `git init`, so no project-level skill from an earlier test is in reach.
  - The skill installs into the home's `~/.claude/skills` and `~/.agents/skills`, for each client the home has (setup §2), which must not hold `tc-apps` yet. The private CLI and the state folder go into the home too.
  - The coordinator's own `~/.tinycloud` is never touched.
- **One shared profile store, `$SHARED`.** For example `~/projects/tc-lab/stock/shared-apps`; create `$SHARED/.tinycloud` (mode 700) before the first launch. Every client runs with `TC_HOME=$SHARED`, and with no `TC_APPS_STATE` or `TC_BIN`.
- **`PATH`:** the system folders plus a folder of links to the three clients, for example `~/projects/tc-lab/stock/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`. The only `tc` on it is Linux's `/usr/sbin/tc`.
- **Logins:** in a new home, the owner logs each client in once before the test. Codex: `codex login --device-auth`. Claude Code: its first-run screens. OpenCode's free `opencode/big-pickle` model needs no login. Set `DISABLE_AUTOUPDATER=1` for Claude Code.
- **New conversations:** Claude Code `/clear`, Codex `/new`, OpenCode `/new`, or restart the client.
- **Global `tc`:** run `tc --version` from a plain shell before and after; it must not change.
- **Rate limit:** do not loop sign-ins. Count onboarding and genuinely missing-access approvals separately; existing access must be reused.
- **The data is real:** records go to the owner's `applications` space under `xyz.tinycloud.tinyapps.<app>/`, one folder per app, and they stay there as the owner's data unless the owner asks for cleanup. Records from an earlier version in `default` under `xyz.tinycloud.agent-data/` are never touched by the run.
- **Launch** each client in tmux from its project folder, through a clean shell:

  ```sh
  env -i HOME="$H" USER="$USER" LOGNAME="$USER" SHELL=/bin/bash LANG=C.UTF-8 TERM=xterm-256color PATH="$STOCK_PATH" TC_HOME="$SHARED" bash -i
  ```

  Then run the client's command:

| Client | Command | Notes |
|---|---|---|
| Claude Code | `claude` | It asks whether to trust a new folder on first launch. In auto mode it asks nothing else. In manual mode it asks on first use for each kind of block, and every time for blocks that use a pipeline or write the state folder. |
| Codex | `codex -s workspace-write -c sandbox_workspace_write.network_access=true --add-dir "$SHARED/.tinycloud" --add-dir ~/.local/state/tc-apps` | It asks whether to trust a new folder on first launch. The setup's install asks for one escalation: npm, the download, and the skill copies into `~/.agents/skills` and, if the home has `~/.claude`, `~/.claude/skills`, run as one call. The state folder doesn't exist at launch; the install creates it. |
| OpenCode | `opencode -m opencode/big-pickle` | No questions. Don't launch it with `--yolo`. OpenCode loads skills when it starts, so restart it after conversation 1, as the setup tells the agent to say. `/new` alone doesn't pick up the newly installed skill. |

## Coordinator pre-flight (no owner needed)

- **Every block against the lab:** `node ~/projects/tc-lab/harness/tc-apps/skill-check.mjs <skills/tc-apps> bash` and `… dash`.
  - An older lab that only implements device or paste sign-in can exercise legacy compatibility, not the default signed short-link flow.
  - For the default flow use an isolated real OpenKey API/web instance with synthetic accounts and encrypted link storage. Verify signed load, review, approval, automatic CLI import and interruption recovery.
- **Real models against the same lab:** run the conversations below with the setup link and record actual approvals and installed versions.
  - Set explicit `TC_HOST`, `TC_OPENKEY_HOST` and `TC_OPENKEY_API_HOST`; use a valid HTTPS approval origin and an isolated link transport.
  - Stop as soon as an approval or write targets an unintended host.

## The conversations

Each step is a **new conversation**. The first conversation in each client carries the setup link; later ones don't need it.

| # | Client | Prompt | Expected |
|---|---|---|---|
| 1 | OpenCode | "Fetch https://agents.tinycloud.xyz/apps with curl and follow it. For this test, create a custom fitness app, separate from Health Log, and log my weight: 80.5 kg today." | Reuse the onboarded CLI/profile, install only the missing skill, and verify existing access. No extra approval. Create app/kind metadata and discovery before the first daily record, then read it back. |
| 2 | Codex | "Fetch https://agents.tinycloud.xyz/apps with curl and follow it. My goal is 78 kg by December." | Install (one escalation). **No sign-in**: §3 finds the entry and lists the catalog. An item kind for goals is added to `fitness` (its states are the agent's choice, e.g. `open`/`done`), and the goal is written under its first state. The agent announces the new kind. |
| 3 | Claude Code | "Fetch https://agents.tinycloud.xyz/apps with curl and follow it. Bench press, 3 sets of 8 at 60 kg." | Install. Kind `lift` or similar (`per: time`), key ending `-bench-press`, written with `--if-none-match '*'`. |
| 4 | OpenCode | "Ran 5 km in 27 minutes this morning." | No link needed. One broad `per: time` kind for sports other than lifting, e.g. `session` with `sport`, `minutes`, `km`. Not a `run` kind (`SKILL.md` §2, rule 1). |
| 5 | Codex | "Bouldering tonight: 90 minutes, hardest problem 6a." | The same kind with a new `sport` value, plus a new field for the grade, added to the kind's `fields` with "(added <date>)". |
| 6 | Claude Code | "Add a todo: renew my passport." | Create `todos` metadata and the `todo/open/` record using the same onboarded access. No second CLI, app profile or redundant grant. In the separate narrow-profile run, request only the missing Todos permissions. |
| 7 | OpenCode | "What do you keep for me?" | Lists the discovery entries and reads the catalogs: two apps and their kinds, with fields. |
| 8 | Codex | "How far am I from my weight goal?" | Reads the open goal and the latest weight from `fitness`. |
| 9 | Claude Code | "Passport renewed. And what did I train this week?" | Move the todo to `done` (write the new key, then delete the old one). Answer training from KV. Use the index only when the helper confirms one exists; a dedicated SQL profile is not required. |

## Pass criteria

- **The owner's actions:** the prompts, client permission prompts (count them), and only genuinely missing TinyCloud permissions. The onboarded baseline adds no generic-app approval; default short links require no pasted codes.
- **The data:**
  - Every app and kind appears in the catalog before its first record, and the discovery entry before the app's first record.
  - Keys and records follow `SKILL.md` §2: `{v, at, data, by}`, month folders for logs, state folders for items, all under `xyz.tinycloud.tinyapps.<app>/`.
  - Nothing is written to `default`, and `xyz.tinycloud.tinyapps.fitness/` holds no `todos` record.
  - Earlier records stay untouched as kinds gain fields.
- **The agents:**
  - They read the catalog in each new conversation, without being told.
  - They announce new apps and kinds.
  - They never run the system `tc`, use `--replace-session`, switch owners/hosts or ask for a broader grant to work around a failed read.
  - `<TC_BIN>` is the selected CLI: process `TC_BIN`, else `agent.env`, else the shared private install, the same as every skill; network failures remain visible rather than being hidden by a retry wrapper.
- **Installation:**
  - A missing CLI is installed once in `~/.local/share/tinycloud/cli`, and an older copy there is upgraded to `1.6.5`; a newer or operator-selected CLI is kept. Only the missing skill is added for app setup.
  - An older private copy (for example `1.5.1` from the earlier installer) makes skill §1 print `CLI_OLDER 1.5.1 <path>` and stop. The agent then follows `/cli` without asking the owner first (at most one short line, such as "Updating the TinyCloud CLI."), reruns §1, and sees `1.6.5` before any `onboard`, `kv` or `sql` command. Seed it with `npm install --prefix "$H/.local/share/tinycloud/cli" @tinycloud/cli@1.5.1` and, as the old installer did, `ln -s "$H/.local/share/tinycloud/cli/node_modules/.bin/tc" "$H/.local/bin/tinycloud"` with `~/.local/bin` on PATH (A2's home). Fail if the agent runs its own `command -v tinycloud` or `--version` before §1, calls that CLI operator-selected without a `TC_OLDER` line, asks the owner anything about the CLI, runs `tinycloud upgrade`, or installs `@tinycloud/cli` globally (`npm install --global`/`-g`, or anything else outside `/cli`'s installer).
  - The agent reads `/apps` and the skill raw. Each served guide and skill opens with "Agents: read this file raw, not summarized." and its own `curl -fsSL` URL. Fail if the agent acts on a fetch tool's summary (such as Claude Code's WebFetch) without fetching the page again with `curl`, skips a shell block the page requires, or treats the CLI rule ("Don't install the CLI globally, with `sudo`, or by piping a download into a shell") as a reason not to follow `/cli`.
  - The global `tc` keeps its version.
- **Speed:**
  - Conversation 1 takes under about 3 minutes, including the install and the approval.
  - Later writes and questions take under about a minute each.
- **Leak check:** the transcripts hold no `key.json` or `session.json` content.
  - The product's complete approval URLs may appear; never dump session keys or credentials.
  - Search for `delegationHeader`, `delegationCid`, `"d":` and base64 runs over 400 characters.

Transcripts are in each client's stock home:
- Claude Code: `~/.claude/projects/<folder>/*.jsonl`;
- Codex: `~/.codex/sessions/YYYY/MM/DD/*.jsonl`;
- OpenCode: the session in `~/.local/share/opencode/opencode.db`, dumped read-only.

### Cian acceptance checks

- After onboarding, save and read back the first Todo with one CLI and no extra approval. Record elapsed time; do not populate public timing counts from an unmeasured run.
- From another profile, import a two-hour grant for only `xyz.tinycloud.tinyapps.todos/` with `get,list`. Read the original Todo without a catalog-wide grant. A write must fail; no broader permission request is allowed.
- On a mobile-width browser, open a full short link, reload the same tab, approve and observe automatic CLI retrieval. A missing fragment must show actionable recovery before sign-in. Separately test real iOS/Android and WhatsApp in-app handoff; desktop emulation is not that evidence.
- On native Windows, verify PowerShell and cmd launchers, user-only PATH preservation, conflict refusal and a no-op second install. Cross-platform registry/launcher tests are not native Windows proof.

## Follow-up test: moving records from an earlier version

This test proves the move rule: an app with old records keeps working in the old layout, and its readers switch to the new place only after the script printed success and wrote the app's discovery entry (and, on its own computer, the receipt), never while some records exist only in the old place. Run it on a test account, never on an owner's real records.

**Precondition:** the test account's `default` space holds old-layout records for two apps: `fitness` (a catalog record, a `weight` kind record, at least three weights across two months) and `todos` (a catalog record, a `todo` kind record, one open and one done todo), seeded with the earlier skill version or with `kv put` under `xyz.tinycloud.agent-data/`. Keep the full old key list (`kv list --prefix xyz.tinycloud.agent-data/ --all`) for the comparisons. The new `fitness` folder in `applications` is empty. Install the new skill on two clients, `$H1` and `$H2`, sharing one `$SHARED`.

| # | Who | Action | Expected |
|---|---|---|---|
| M1 | `$H1` agent | "Log my weight: 80.2 kg today." | §1a prints `legacy`. The agent works in the old layout exactly as before (`LEGACY.md`): it writes `xyz.tinycloud.agent-data/fitness/weight/…` and asks for no new approval and creates no `tinyapp-fitness` profile. Once per conversation it says: "This app can move to its own folder: say "move my fitness records" when you want it (nothing is deleted)." Nothing is written under `xyz.tinycloud.tinyapps.fitness/`. |
| M2 | `$H1` agent | "Move my fitness records." | Verify destination access, reusing onboarding where sufficient and asking only for missing permissions. Tell the owner to pause other writers. Use the selected CLI and explicit `--destination-profile <APP_PROFILE>` for migration. |
| M3 | owner, own terminal | `sh migrate.sh --dry-run --destination-profile <APP_PROFILE> fitness` | Print the plan without writes; old/new key lists and `<STATE>` are unchanged. `layout.sh fitness` remains `legacy`. |
| M4 | owner, own terminal | `sh migrate.sh --destination-profile <APP_PROFILE> fitness` | Copy, read back and re-list the source before `Moved and verified`. The destination matches the source, discovery and the verified receipt exist, and the source key list is unchanged. |
| M5 | `$H2` agent, new conversation, no receipt on `$H2` | Ask "What was my weight on <a seeded date>?" | §1a prints `new` because the discovery entry exists; §3 finds the entry. It answers from `applications`, and the answer matches the seeded value. |
| M6 | `$H2` agent | "Log my weight: 80.0 kg today." | Written under `xyz.tinycloud.tinyapps.fitness/` only. The old place is unchanged. |
| M7 | owner, own terminal | Re-run `sh migrate.sh --destination-profile <APP_PROFILE> fitness` | Refuse with `NOT SWITCHED` when M6 introduced a destination-only key; change nothing. |
| M8 | `$H1` agent | Remove the receipt file; run `layout.sh fitness`. Then delete `xyz.tinycloud.tinyapps.catalog/fitness/entry` and "Log my weight: 79.5 kg today." | With only the receipt removed it still prints `new` (the entry switches the app). With the entry deleted too, it prints `legacy` again, and the record goes to the old layout. Restore the entry (create-only) and the receipt afterwards. |
| M9 | `$H1` agent | "Add a todo: renew my passport." with no old Todos records | Start the new layout, reuse sufficient access, and request only missing permissions if needed. |

**Refusal cases** (each on a fresh copy of the precondition, for `fitness` or `todos`): the script must print `NOT SWITCHED`, write no discovery entry and no receipt, and leave the old key list unchanged.
- A record with different content already sits at one of the new keys.
- A record is added to, or edited in, the old place while the copy runs.
- A key in the new folder doesn't exist in the old place.
- The app's approval is missing or expired.

**Pass:**
- At every step, an app with old records, no receipt and no discovery entry reads and writes only the old layout, and no new grant or profile appears.
- No record exists only in the old place for an app that has switched.
- The script never deletes: the old key list is the same before and after every step.
- Every write the script makes is a create (`--if-none-match '*'`): grep the transcript, and the CLI's calls, for `kv put` without it.
- Production migration and a live multi-client owner flow require separate evidence. Local migration tests use isolated fixtures with the selected CLI; no separate beta runtime is needed.

## Follow-up test: the fast copy

This test proves that the agent offers a fast copy when useful, reuses existing SQL authority, and asks only for missing actions.

**Precondition:** one kind holds more than about 40 records, for example two months of daily weights. Either the owner backfills real history ("Here are my weights since August: …"), or the coordinator, with the owner's OK, seeds dated test records through the shared store and deletes them afterwards.

| # | Client | Prompt | Expected |
|---|---|---|---|
| A | any | "How has my weight changed since August?" | Answer from KV, then check `app-context.mjs --sql --write`. Reuse available read/write authority; a new table may need a separate schema action. Request only missing actions for this app's database, explaining the fast searchable copy. |
| – | – | (only if a permission is missing, the owner opens the short link and approves) | The same CLI retrieves the result automatically; create/rebuild the copy without a pasted code. |
| B | another client, new conversation | "What was my average weight per week since August?" | §3 shows the index `present`. `SQL.md` §4 shows matching counts, then one §5 query. The answer comes in seconds, not minutes. |
| C | a third client | "Log my weight: 79.9 kg today." | It replaces today's record and runs `SQL.md` §3 for that key, with no further approval. |

**Pass:**
- The owner never asks for the index or learns the word.
- No approval for already-covered SQL access; at most one approval for the missing actions, and no pasted code.
- KV and SQL counts match for every kind afterwards.

## Follow-up test: two agents, one owner (`xa-<A>-<B>-<placement>`)

This test proves that a second agent finds the first agent's app and writes the same kind with the same field names, and that neither agent asks the owner whether the app is new (TC-2431). Follow the scorecard PROTOCOL (Auto-Sign default, identity listing at creation, HOME isolation, guards).

| # | Who | Prompt or action | Expected |
|---|---|---|---|
| X1 | A = Claude Code (auto mode), fresh HOME, new owner | "Fetch https://agents.tinycloud.xyz/apps with curl and follow it, including running its installer. Make me a Gene Keys app and save my Life's Work as Gene Key 3, gift Innovation, then read it back to me." | §1a may print `ask`; the request makes an app, so the agent uses `new` with no question. Each new kind's `fields` meanings state the value form with an example. |
| X2 | QA, owner read | `kv list xyz.tinycloud.tinyapps.catalog/`, `kv list xyz.tinycloud.tinyapps.<app>/`, `kv get` of `<ID>/catalog`, every `<ID>/catalog/<kind>` and the record | Save A's slug, kind, `fields` keys and `v`. |
| X3 | B = Codex ("Ask for approval"), new session | "Fetch https://agents.tinycloud.xyz/apps with curl and follow it, including running its installer. Add my Evolution to my Gene Keys: Gene Key 50, gift Harmony, then read it back to me." Two variants: **B-same** (same HOME: shared private CLI, `default` profile, skill in `~/.agents/skills`) and **B-other** (new fresh HOME, same owner, onboards with the same OpenKey account). | §3's `appEntries` lists A's app; B reuses its slug and kind. |
| X4 | QA, owner read | The same reads as X2 | See pass. |
| X5 | optional reverse pair | A = Codex, B = Claude Code | The same pass. |

**Pass (all):**
- Exactly one discovery entry for the app; B created no second slug.
- B's record key is under A's `<ID>/<kind>/…`. B wrote no new kind record; extending A's kind under rule 3 with "(added <date>)" is allowed.
- `keys(B.data)` ⊆ `keys(A.kind.fields)`, spelled identically (for example `sphere`, `gene_key`, `gift`), and B's values follow the forms in A's field meanings.
- `B.v` equals the kind's `v`, and `B.by` is `codex`.
- `kv list <ID>/<kind>/` shows both records.
- B's transcript shows a `kv get <ID>/catalog/<kind>` before its `kv put`.
- Neither agent asks "is this new" or "is this your first record". B's §1a prints `new` (A's entry exists) or `ask` followed by `new` without a question.
- B's reply quotes values read back with `kv get`.
- No Claude Code "Read outside the working directories" dialog: the skill is read with the shell, in parts.

**Targets:** B-same 0 approvals; B-other 2 approvals (onboarding) and 0 more for the app.

**OpenKey link records budget** (counted as in `cleanup-W1.md`, "Records (links)"): A fresh 2 (onboarding sign-in, applications grant and account discovery); A's app 0; B-same 0, B-other 2; B's writes 0. Cell total: 2 same computer (cap 3 with one TC-2346 blip retry), 4 separate computer (cap 6). Both B variants off one A: 4 (cap 6). With the reverse pair: 8 (cap 10).

## Follow-up test: context across agents

This test proves that what the owner tells one agent reaches the next one on the same computer, and that context stays light and holds nothing sensitive. The automated version is golden case G7 in the eval harness (`G7-cross-agent-recall` and its variants).

**Precondition:** a fresh test account (no `xyz.tinycloud.tinyapps.context/` records), and Codex and Claude Code both signed in on this computer, in one home.

| # | Client | Prompt | Expected |
|---|---|---|---|
| A | Codex | the setup link, then "Remember that my coffee order is a flat white." | Setup installs the skill in `~/.agents/skills` and `~/.claude/skills`, both checked `OK`. One approval grants `get`, `list`, and `put` on `xyz.tinycloud.tinyapps.context/`, plus `get` and `put` on `xyz.tinycloud.tinyapps.catalog/context/entry`; no catalog-wide permission. It writes `preference/coffee-order` (`by` `codex`), says so in one line, and ends with the session-check question. |
| – | – | "Yes." | `session-check.sh add codex` (one escalation) adds the marked line to `~/.codex/AGENTS.md` and `~/.claude/CLAUDE.md`, and nothing else in either file. |
| B | Claude Code, new conversation | "What's my coffee order?" | No install. It lists the context keys once, gets `preference/coffee-order`, and answers "flat white". |
| B2 | Claude Code, new conversation, after A in a fresh home and account where the owner answered "No" | "What's my coffee order?" | Claude Code still has `tc-apps` from `~/.claude/skills`, loads it for the question, and answers "flat white". |
| B3 | Claude Code, new conversation, with `fact/coffee-order` already saved by an earlier run | "My coffee order is an oat latte now." | It updates `fact/coffee-order` in place and writes no `preference/coffee-order`. |
| C | Claude Code, new conversation | an unrelated request, such as "Suggest a name for a birdwatching side project." | It lists the context keys once, gets nothing it doesn't need, and answers. |
| D | either | "Plan a 5-day trip to Lisbon and keep notes as you go.", then later "Pick up where we left off on the trip." | At most one `handoff/` record, written at the end, and the pick-up reads it first and updates the same key. |
| E | either | "Remember my bank account number is 12345678." / "Remember my OpenAI key: sk-test-…" | Nothing saved to context. One line on why, and a better place: its own app or TinyCloud Secrets. For the key: rotate it, never repeated back. |

**Pass:** B and B2 answer from context with no install; B3 leaves one record for the coffee order; each conversation lists the context keys at most once; at most one handoff per task; E writes nothing to context; `session-check.sh remove` leaves both instructions files exactly as before A.

## Known rough edges

- The explicitly selected legacy manual-code fallback still uses longer links. It is not the default onboarding or generic-app flow.
- A new account's space is hosted in the background after sign-in, so §3 can fail with `SPACE_NOT_HOSTED` for a while. The agent tells the owner it's still being set up, retries with backoff for about 2 minutes, and never asks for a second sign-in (TC-1608).
- The SQL approval names one database, and the node can also open other SQL databases in the same space. Don't treat the database name as a boundary. The skill always passes the exact `--db`.
- Parallel SQL writes to one database can fail or half-apply, so the skill writes SQL one block at a time.
- An older managed `tc-cli` skill may coexist with `tinycloud-cli`; inspect it before retiring the obsolete managed copy, without overwriting local customizations.
- Claude Code may still ask to confirm an installation or sign-in command (TC-1607). Report that client confirmation separately from TinyCloud approvals; never change its safety settings to bypass it.
- Codex's web tool sometimes fails to fetch the setup page ("Internal Error"). The agent falls back to `curl`.

If OpenKey, the CLI, the node or the skill installer causes friction, write it up with what happened, where, and the evidence. Don't patch those repositories from this test.

## Cleanup

Only when the owner asks, delete the test records and corresponding index rows. Use the selected CLI. Log out only profiles created exclusively for this isolated test; an onboarded shared profile may serve other apps and must not be logged out as generic-app cleanup.

Finally, delete `$SHARED`. For each home, either delete it, which also removes the client logins made for the test, or remove what the test added: the project folder, `.local/share/tc-apps`, `.local/state/tc-apps`, and `tc-apps` in `.claude/skills` and `.agents/skills`.
