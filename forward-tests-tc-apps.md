# tc-apps forward-test runbook

This runbook uses **disposable synthetic fixtures only**. It is not permission to install clients/plugins, enable normal-use capture, inspect owner profiles/conversations, approve live access, publish or deploy. Never run `tests/cli/setup.ts`: it is not a safe diagnostics fixture.

The baseline scenarios still check three business behaviors:
- **Apps appear on demand:** a synthetic fitness app grows from weight to goals to lifts to a second sport, and a synthetic todo app appears.
- **Apps change on the fly:** new kinds and fields need no new approval, install or migration.
- **Any agent picks it up:** a new conversation can find apps through the catalog.

The SQL-copy and diagnostics scenarios below are separate from baseline setup. CLI 1.2.3 remains the ordinary setup pin, not a claim that a diagnostics release is published. No installed-client acceptance is claimed by the in-process OpenCode fixture.

## Preconditions

- **Isolation:** create a new empty temporary root for every run, private mode 0700, with separate disposable HOME, TC_HOME, TC_APPS_STATE and TC_DIAGNOSTICS_HOME. Never copy an existing home, logged-in profile, conversation database, grant or token. Clear ambient TinyCloud/test credentials and endpoint variables before setting the explicit fixture values. In particular, do not inherit `TC_TEST_SERVER` or a private key.
- **Network:** bind fixture node/OpenKey/health endpoints to loopback only and deny outbound traffic for fixture subprocesses. Explicitly set `TC_HOST` and `TC_OPENKEY_HOST` to those reviewed loopback endpoints. A URL, approval or request to any other host stops the run; do not “fix” it by using a live service.
- **Build identity:** use the reviewed literal built CLI path in `TC_BIN`, never a PATH `tc`, and record Node/CLI/operations/wrapper/skill revisions. Check `diagnostics --help` and `diagnostics run --help`. If missing, baseline behavior may still work, but diagnostics acceptance cannot pass. Do not install a different package silently.
- **Synthetic state:** generate only fixture keys/credentials and artificial records. Fixture OpenKey, not the owner, supplies a delayed synthetic approval. Every test profile and SQL database is disposable. Shared-profile scenarios may share only the current run's synthetic TC_HOME.
- **Artifact boundary:** keep only bounded synthetic command outputs, assertions and selected diagnostic exports under the temporary root. Never enumerate client history directories, dump a client database, scan existing transcripts or copy authentication files into evidence. Canary strings are invented by the fixture, not extracted from a person's data. Diagnostic metadata must exclude them even if a normal business output contains one.
- **Packaging:** generate/render/install only in the separately authorized integration step, from the reviewed site output served over loopback. The installed `SKILL_INSTALLED` version must match that output's `/skills/index.json`; validate all hashes, including the optional helpers and wrapper. Check the baseline CLI pin is unchanged. Updating the skill alone must leave the separately copied runtime wrapper untouched until its explicit copy step.
- **Real-client gate:** the conversations below are specifications for a separately authorized disposable-client acceptance session. No real model login, client launch, plugin activation, trust-policy change or installation is authorized merely by this runbook. Use fixture executors for the default run. If real-client authorization is later obtained, use only new temporary homes and the same loopback record/auth service; do not weaken the owner's existing trust/environment policy.

## Coordinator fixture pre-flight (no owner needed)

After the parent integration build, run each suite in isolation, from the named repository:

```sh
# PROMPTS
node --test scripts/tc-wrapper.test.mjs
node --test scripts/tc-diagnostics-adapters.test.mjs
node --test scripts/install-skill.test.mjs
```

```sh
# SDK
bun test packages/cli/test/diagnostics.e2e.test.ts
bun test tests/packed-runtime/diagnostics.test.ts
```

Use the suites' disposable state/loopback fixtures and inspect their prerequisites before execution. Do not substitute `tests/cli/setup.ts` or a production sign-in if a build artifact is missing. These commands are verification entrypoints, not proof they have run in a particular checkout.

The optional external `tc-lab` harness is not shipped here. If it is available and reviewed to meet the isolation/network rules above, its skill-block checks can also exercise Bash and Dash, catalog, writes, reads, item moves, paste sign-in, copy, check, query and rebuild. Absence is a reported prerequisite, not permission to use a real account.

## The conversations

Each step uses a fresh fixture conversation with only the current disposable catalog/state carried over. The prompts below are invented test input, never the owner's personal records. In a separately authorized installation/client session, replace `<setup link>` with the reviewed loopback-served setup page; ordinary fixture executors use the already built CLI without installation.

| # | Client | Prompt | Expected |
|---|---|---|---|
| 1 | OpenCode | "Log my weight: 80.5 kg today. Set it up with TinyCloud: `<setup link>`" | §3 shows `AUTH_REQUIRED`. §4: **one synthetic fixture device approval**. Then app `fitness` with kind `weight` (`per: day`), record `fitness/weight/<YYYY-MM>/<date>`, read back. The agent says it started a fitness app. |
| 2 | Codex | "My goal is 78 kg by December. Set it up with TinyCloud: `<setup link>`" | **No new sign-in**: §3 lists the synthetic catalog. An item kind for goals is added to `fitness` (e.g. states `open`/`done`), and the goal is written under its first state. The agent announces the new kind. |
| 3 | Claude Code | "Bench press, 3 sets of 8 at 60 kg. Set it up with TinyCloud: `<setup link>`" | Kind `lift` or similar (`per: time`), key ending `-bench-press`. |
| 4 | OpenCode | "Ran 5 km in 27 minutes this morning." | No link needed. One broad `per: time` kind for sports other than lifting, e.g. `session` with `sport`, `minutes`, `km`. Not a `run` kind (`SKILL.md` §2, rule 1). |
| 5 | Codex | "Bouldering tonight: 90 minutes, hardest problem 6a." | The same kind with a new `sport` value, plus a new field for the grade, added to the kind's `fields` with "(added <date>)". |
| 6 | Claude Code | "Add a todo: renew my passport." | App `todos` with kind `todo` (item: `open`, `done`), record under `todos/todo/open/`. |
| 7 | OpenCode | "What do you keep for me?" | Reads the catalog: two apps and their kinds, with fields. |
| 8 | Codex | "How far am I from my weight goal?" | Reads the open goal and the latest weight. |
| 9 | Claude Code | "Passport renewed. And what did I train this week?" | Moves the todo to `done` (writes the new key, deletes the old one). Answers the training question from KV. With no `agent-data-sql` profile, no index step runs. |

## Pass criteria

- **Interactions:** no owner/live approval. Fixture sign-in completes once. For separately authorized real-client checks, record permission prompts without expanding permission, and handle the one documented OpenCode restart rather than claiming no restart is needed.
- **The data:**
  - Every app and kind appears in the catalog before its first record.
  - Keys and records follow `SKILL.md` §2: `{v, at, data, by}`, month folders for logs, state folders for items.
  - Earlier records stay untouched as kinds gain fields.
- **The agents:**
  - They read the catalog in each new conversation, without being told.
  - They announce new apps and kinds.
  - They never run a `tc` from the `PATH`, never use `--replace-session`, and sign in only through §4.
  - The selected wrapper uses the exact reviewed CLI path. Count physical SDK attempts, wrapper child attempts and later agent reissues separately; a missing diagnostic attempt does not prove no dispatch. Preserve the wrapper's existing stdin normalization, stdout, final stderr and exit/signal behavior.
- **Installation, only when separately authorized:** all outputs remain under the disposable home. No global CLI or owner client configuration changes. Skill files include `DIAGNOSTICS.md`, `tc-wrapper.sh` and `diagnostics/{contract,opencode-v1,opencode-config}.mjs`, each with a generated index hash. Invoke the config generator with Node; verify it only prints an entry and that copying the wrapper is explicit.
- **Timing:** record cold/warm setup, approval wait, wrapper sleeps and machine work separately; compare like fixtures with pinned revisions. Report measured samples, not historical speed targets as new acceptance.
- **Privacy:** scan only the fixture's explicitly collected outputs and generated diagnostic bundles for its known synthetic content canaries. Business output may contain a synthetic record; diagnostic metadata must not. No transcript discovery/dumps, profile-file capture, device-code capture or broad log collection.

## Diagnostics acceptance matrix

Keep policy default off for the baseline pass. Enable only the disposable root for the explicitly authorized capture pass, and disable it afterwards. An enable command is not consent to collect selected content.

| Scenario | Required observation |
|---|---|
| Disabled and unrelated work | No capture/root creation; unrelated calls helper-free. Scoped disabled calls may perform bounded read-only policy discovery. Business streams, status and records unchanged. |
| Whole-client launcher | New run attribution, no scope/role/wrapper state; no transcript or lifecycle capture. Unrelated sibling work stays unscoped. |
| Selected block and `xargs -P 8` | Actual shell/CLI children receive scope; each invocation remains distinct. Nested blocks preserve validated run/turn/task/workflow attribution; absent workflow gets a new one. `--role` is accepted only on a scoped block, and hints do not prove outcomes. |
| Catalog, record/read-back, move and copy | Observe source work separately from copy upkeep. A successful generic executor is not mutation evidence; an unfinished phase remains unknown. Preserve unknown commit after lost acknowledgment and acknowledged destination before failed source deletion. |
| Wrapper recovery | Existing retries only; separate wrapper ID/children/physical attempts and retry sleeps. Unavailable diagnostics must not add a business retry or change final output. |
| Approval and SQL sign-in | Synthetic delayed approval and paste exchange only; never store codes/links/grants. Approval wait separate from machine time. |
| OpenCode v1 1.18.31 fixture | Exact concurrent session/call links, unknown/missing IDs/version omit linkage, bounded health failures and no content/scope leakage. Root-plugin loopback proof only, not installed-client certification. |
| Unsupported clients | Claude/Codex launcher/manual fallback; no shared Claude ENV_FILE writes or fake lifecycle hooks. OpenCode v2 and other versions unsupported; no policy broadening to force linkage. |
| Export → import → review | Exact selected diagnostic IDs, explicit expiry, import remains untrusted assertion, conflicts/gaps visible. Local command is `review`, not `history`. External copies cannot be recalled. |
| Selected case → comparison → reproduction | Explicit synthetic visible passages only, independent detail policy, matching equivalence contract, reviewed wrong-units fixture and independent product read-back; never production replay or a claim of autonomous client behavior. |
| Pause/disable/delete and loss | Generation cutoff, preview/confirm deletion and all-history pause decision. Metadata 30d/detail 7d maxima, partition 100 MiB including 10 MiB detail, root 1 GiB. Loss summaries bounded to 64 attribution buckets; terminal failure/overflow may remain unknown. |

The command/selection formats are in `skills/tc-apps/DIAGNOSTICS.md`. Retain observed assertion results and limitations only; do not count planned rows as passing or silently substitute a fixture for a requested actual-client gate.

## Follow-up test: the fast copy

This test proves that the owner never has to ask for the SQL index. The agent asks for the extra approval itself, in plain words, the first time a question needs many records.

**Precondition:** seed more than 40 artificial records (for example two fixture months of daily weights) in the disposable loopback store only. Do not backfill real history or borrow an owner account/profile.

| # | Client | Prompt | Expected |
|---|---|---|---|
| A | any | "How has my weight changed since August?" | §3 shows no index. The agent reads the records in blocks of up to 40 keys and answers. In the same reply it asks for "a fast, searchable copy of your records" with `SQL.md` §1a's message, without the words index, SQL or database, apart from OpenKey's own label. |
| – | – | (fixture OpenKey supplies a synthetic approval and code) | §1b, §2, then §6 for every kind. One line: questions over many records are fast from now on. Never copy the code into diagnostics. |
| B | another client, new conversation | "What was my average weight per week since August?" | §3 shows the index `present`. `SQL.md` §4 shows matching counts, then one §5 query. The answer comes in seconds, not minutes. |
| C | a third client | "Log my weight: 79.9 kg today." | It replaces today's record and runs `SQL.md` §3 for that key, with no further approval. |

**Pass:**
- The agent asks for the copy without being prompted to use an index.
- One synthetic approval and one synthetic pasted code; no live approval.
- KV and SQL counts match for every kind afterwards.

## Known rough edges

- The device link is valid for 10 minutes. After that the CLI exits with `DEVICE_AUTH_EXPIRED`, and the agent tells the owner instead of starting another.
- A new account may not have its `default` space hosted. Sign-in then succeeds, and §3 fails with `SPACE_NOT_HOSTED`; the agent stops.
- The SQL grant reaches every SQL database in `default` (`tinycloud-node` names databases by their last path segment). Test this only inside disposable fixture state. The skill always passes the exact `--db`; diagnostics do not broaden its grant.
- Parallel SQL writes to one database can fail or half-apply, so the skill writes SQL one block at a time.
- On a machine that also has TinyChat's global `tc-cli` skill, Codex and OpenCode may load it for the word "TinyCloud".
- Claude Code's auto mode sometimes blocks the install as unsafe. The setup then has the agent show the block and ask; the owner replies "go ahead".
- Codex's web tool sometimes fails to fetch the setup page ("Internal Error"). The agent falls back to `curl`.

If OpenKey, the CLI, the node or the skill installer causes friction, write it up with what happened, where, and the evidence. Don't patch those repositories from this test.

## Cleanup and separate release gates

Stop fixture processes and disable capture in the disposable diagnostic root. Preview and confirm the intended synthetic history deletion, then remove only the temporary root created for this run, including its synthetic homes/profiles/records and explicit external bundles. Never run cleanup against an owner's profile or records. Ordinary setup Undo is not diagnostic deletion.

Publication, deployment, owner installation, adapter activation and normal-use enablement need separate authorization after integrated packaging/rendered review and synthetic acceptance. Record exact CLI/worker/wrapper/skill/client versions when those gates are exercised. There is no claimed published diagnostics CLI version here. The OpenCode plugin's 1.18.31 fixture contract is not installed-client proof; Claude/Codex automatic hooks and OpenCode v2 remain unsupported.
