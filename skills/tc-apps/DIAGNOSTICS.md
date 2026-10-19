# Team-preview private diagnostics and client attribution

Diagnostics are separate from your records and default off. Installing this skill does **not** enable capture, activate hooks, modify client configuration, grant access, or install a client. The optional helpers in `diagnostics/` run with Node (20 or newer); they do not need executable permissions or extra packages. Keep that whole directory together. Use a diagnostics-capable `tc` build: baseline tc-apps CLI compatibility alone does not establish diagnostics support. Check the selected literal CLI path with `diagnostics --help` before using these commands.

The baseline setup still pins CLI 1.2.3 and the skill requires business commands from 1.2.2+. Neither is a diagnostics release claim. This synthetic-only, metadata-only alpha uses exactly `@tinycloud/telemetry-preview@0.1.0-alpha.0`, not a normal SDK release or installer upgrade. Its target is Node **22.23.2**, Linux x64 glibc. These instructions do not claim npm publication or hosted deployment has succeeded. Real-record capture and optional plugins remain off.

## Preview checkpoint and explicit selection

After explicit installation authorization, install privately alongside the normal CLI with the exact command below; if the exact version is unavailable, stop rather than substitute a tag or archive. Do not use a global install or change PATH, the normal wrapper, `cli-path`, client configuration or installed skill. Updates require a separately reviewed exact version.

The installed package's `identity.json` records the source/build and guidance checkpoint. Match it to the reviewed candidate and require tc-apps **0.1.6** `SKILL.md` plus `SQL.md` and regenerated embedded MCP rules, with exact hashes. Bundled guidance lives at `guidance/skills/tc-apps/`; use that copy, not a mutable website. OpenCode context schema 1 / adapter revision 1 targets **1.18.31**; Claude **2.1.289** and Codex **0.160.0** have launcher-only support. These are source-contract targets, not real-client acceptance claims. Optional plugins remain **off**.

Use private shell variables for the distinct `tc-apps-alpha` and `tc-apps-alpha-mcp` executables:

```sh
umask 077
TC_ALPHA_DIR="$HOME/.local/share/tc-apps-alpha/0.1.0-alpha.0"
mkdir -p "$TC_ALPHA_DIR"
npm install --prefix "$TC_ALPHA_DIR" --ignore-scripts --save-exact @tinycloud/telemetry-preview@0.1.0-alpha.0
TC_PREVIEW_BIN="$TC_ALPHA_DIR/node_modules/.bin/tc-apps-alpha"
TC_PREVIEW_MCP="$TC_ALPHA_DIR/node_modules/.bin/tc-apps-alpha-mcp"
"$TC_PREVIEW_BIN" --alpha-identity
cat "$TC_ALPHA_DIR/node_modules/@tinycloud/telemetry-preview/identity.json"
"$TC_PREVIEW_BIN" diagnostics --help
"$TC_PREVIEW_BIN" diagnostics run --help
"$TC_PREVIEW_BIN" diagnostics status --json
```

Help must expose `--scope` and `--role`; capability checks alone do not prove package identity. Match `--alpha-identity` and the installed `identity.json` to the reviewed checkpoint. Preserve operator-set `TC_BIN`, `TC_HOME`, `TC_APPS_STATE`, `TC_DIAGNOSTICS_HOME`, every XDG override, profile, delegation and grant. Never export a replacement `TC_BIN`. Select the alpha executable explicitly only in the separately approved synthetic invocation; a launcher does not redirect business commands inside its child. If a selected block still names the ordinary executable, it stays ordinary and is not proof of alpha capture.

Before enabling, retain the participant's known-good normal executable/routing and a working alpha disable path using the same diagnostic-root environment. On failure, disable with the retained alpha control if available, stop the selected alpha process and resume the retained ordinary route; fallback must work even when controls fail. Never replay unknown-outcome writes. Disable is not deletion: use the selected deletion controls below, maintain expiry while writers are stopped, and account for backups/external exports.

## Working without adapters

Keep normal SKILL.md/SQL.md blocks unchanged. For a short synthetic task, use an already authorized disposable fixture: read a synthetic record, or write then read back one synthetic record only if explicitly requested. Do not touch real records or broaden grants. Explicitly select the alpha executable for those calls, enable metadata only for the task, wrap each approved block as below, inspect status/review, then disable. Never replay a write whose outcome is unknown. These are separate synthetic actions, not automatic record-request steps.

- Inspect policy: `"$TC_PREVIEW_BIN" diagnostics status --json`.
- Opt in to metadata: `"$TC_PREVIEW_BIN" diagnostics enable --scope tc-apps`.
- Pause/resume: `"$TC_PREVIEW_BIN" diagnostics pause` / `"$TC_PREVIEW_BIN" diagnostics resume`.
- Stop future capture: `"$TC_PREVIEW_BIN" diagnostics disable`. Disable/pause do not delete retained evidence.
- Attribution-only whole-client launch: `"$TC_PREVIEW_BIN" diagnostics run -- /absolute/path/to/claude` (or the reviewed `codex` / `opencode` executable). This creates a new run and clears inherited activity scope, role and wrapper state; it does not record the client's terminal, arguments, messages or tools and does not enable capture. It may retain validated enclosing turn/task/workflow links; a shared run never proves a shared owner task. An already-running OpenCode server does not inherit a new TUI's environment.
- An explicitly selected tc-apps block only: `"$TC_PREVIEW_BIN" diagnostics run --scope tc-apps -- /bin/sh /absolute/path/to/selected-tc-apps-block.sh`. Retain normal state paths, approvals and business semantics; explicitly select the reviewed preview executable only for the approved preview calls. **Never** apply `--scope tc-apps` to a whole client, login shell, shared server, or unrelated batch. The child marker cannot modify its parent environment. Nested selected blocks retain validated run/turn/task/workflow links and adapter provenance, generating a run or workflow only when absent; they do not invent task IDs or client lifecycle events.
- Optional role for that selected block: `"$TC_PREVIEW_BIN" diagnostics run --scope tc-apps --role verification -- /bin/sh /absolute/path/to/selected-readback-block.sh`. Use only `catalog`, `record`, `verification`, `copy`, `approval` or `context`, following the local hints in SKILL.md/SQL.md. `--role` without `--scope tc-apps` is rejected. A nested block needs its own explicit hint; do not assume it inherits the outer role. Omit a hint for mixed work; do not split or rewrite normal business blocks to obtain one.

Without a selected-block marker, ordinary KV/SQL calls can admit source metadata only after validating the tc-apps KV root or exact SQL database. Unscoped auth/context/init/help/version and unrecognized early errors are not captured. Missing/stripped context is supported: independent source events remain useful and **task linkage is unknown**. Never infer a task from timing, profile, working directory, record `by`, session idle, or a shared run.

The launcher surrounds the **whole selected shell block**, so the actual `xargs`/CLI children inherit it, not just the `printf` side of a pipeline. It forwards child streams and exit/signal outcomes; it is not a terminal recorder. Keep operator-set `TC_HOME`, `TC_APPS_STATE` and `TC_BIN` unchanged.

### Private storage and best-effort limits

The default root is `${XDG_STATE_HOME:-$HOME/.local/state}/tinycloud/diagnostics`; an explicit operator-set `TC_DIAGNOSTICS_HOME` overrides it. It is separate from `TC_HOME`, the skill's state folder and the SQL copy. Use the same root for controls and review. Status does not create a missing root. Metadata contains fixed categories, bounded counts/timings and opaque diagnostic IDs, never record keys/values, SQL/parameters, URLs, profile contents or credentials. Local files are private to the OS account, not protection against that account's administrators.

Metadata retention is at most 30 days; selected detail at most seven. A partition is capped at 100 MiB including at most 10 MiB of selected detail; the whole root is capped at **1 GiB**. Managed imports, cases and exports share cleanup/quota accounting. Size limits can expire evidence sooner.

Capture is best effort, not an audit trail. The producer queue is bounded to 128 events / 256 KiB, batches to eight, policy discovery to 1000 ms, lock wait to 200 ms and terminal drain to 300 ms; helper cleanup has a 2000 ms budget, with scheduling/teardown overhead additional. The main business process performs no diagnostic filesystem I/O. A scoped but disabled call may use bounded read-only policy discovery; unrelated calls do not start a helper. Sink failure must not change record behavior. A later healthy write may persist a bounded loss summary (at most 64 attribution buckets per producer/helper); terminal failure or overflow can leave loss unknown. No health counter proves complete capture.

### Exact review, export and manual linkage

Create a private selection JSON file (private parent directory, mode 0600), containing the actual diagnostic UUIDs you explicitly selected, for example `{"invocation_ids":["<selected invocation UUID>"]}` or `{"event_ids":["<selected event UUID>"]}`. These are diagnostic IDs, never native client IDs or record keys. To discover evidence for a known selected block, use a bounded exact UTC interval such as `{"from":"2026-10-16T10:00:00.000Z","until":"2026-10-16T10:01:00.000Z"}` and inspect the review; a time selection is discovery, **not** proof of task correlation. Replace the example dates with the explicitly authorized interval, then narrow to the returned diagnostic IDs.

```sh
"$TC_PREVIEW_BIN" diagnostics review --selection /absolute/private/selection.json --json
"$TC_PREVIEW_BIN" diagnostics export --selection /absolute/private/selection.json --out /absolute/private/export --expires-at '<future UTC timestamp>' --external
"$TC_PREVIEW_BIN" diagnostics delete --selection /absolute/private/selection.json
"$TC_PREVIEW_BIN" diagnostics delete --selection /absolute/private/selection.json --confirm
```

The first delete is a preview. Export to an outside destination needs explicit `--external`: source expiry/deletion cannot recall that copy. A managed export goes to a new UUID-named directory directly under the diagnostic root's `exports/`, without `--external`; it remains subject to quota, expiry and selected deletion. Exports require an expiry no later than the retained evidence's expiry. Empty selectors are not delete/export-all authority. For explicitly authorized all-history deletion use `{"all":true}` and confirm with either `--pause-after` or `--keep-enabled`. Normal setup Undo does not delete diagnostic history. Local `review` is the history interface; there is no local `history` command.

**Outside this metadata-only preview:** selected-detail intake, case comparison and content-linked reproduction below document implementation capabilities, not authorized team actions. Do not enable detail policy, collect passages, or ingest transcripts for this rollout.

Manual linkage does not require a hook. After selecting the actual source event IDs, an owner can separately authorize selected visible intent/final claims/feedback via `diagnostics select --manifest /absolute/private/case.json`. This is optional content intake, not automatic transcript access. It requires encrypted storage excluded from backups, explicit `enable --scope tc-apps --detail-policy encrypted-excluded-backups`, and a reviewed manifest with this shape (replace every illustrative value):

```json
{
  "schema_version": 1,
  "expires_at": "<future canonical UTC timestamp within seven days>",
  "purpose": "task_review",
  "owner_selected": true,
  "no_secrets_or_unrelated_content": true,
  "detail_policy": "encrypted-excluded-backups",
  "event_ids": ["<selected event UUID>"],
  "passages": [{
    "id": "<new UUID>", "kind": "intent", "origin": "owner",
    "text": "<only the owner-selected visible passage>",
    "event_ids": ["<that selected event UUID>"]
  }]
}
```

Intake generates the case/source identity, creation time and owner-reported trust. Do not supply `case_id`, `created_at`, `source_ids` or `trust` in the manifest.

Canonical timestamps include milliseconds and `Z`. Use actual selected metadata and fresh UUIDs, not the angle-bracket examples. The intake rejects credentials; that check is not a guarantee arbitrary prose is safe. Never include profiles, tokens, transcripts, unrelated turns, hidden reasoning or instructions to execute. Manual associations stay owner-reported evidence, not observed tool execution or proof a record mutation succeeded.

To review that selected content, use a new private selection such as `{"case_ids":["<selected case UUID>"],"include_detail":true}`. Ordinary metadata selections do not implicitly include passages. Optional `feedback` names a fixed classification (`wrong_units`, `wrong_kind`, `unverified_claim`, `excess_work` or `accepted`) and the exact `passage_ids` it concerns. It is owner-reported feedback, not a product verdict.

### Import, compare and reviewed synthetic reproduction

```sh
"$TC_PREVIEW_BIN" diagnostics import /absolute/private/transferred-bundle
"$TC_PREVIEW_BIN" diagnostics review --selection /absolute/private/imported-selection.json --json
"$TC_PREVIEW_BIN" diagnostics compare --left /absolute/private/left-selection.json --right /absolute/private/right-selection.json
```

Import reads only a selected private bundle, never a profile or conversation history; it does not execute files or reset expiry. Review the returned import/trust/conflict information, then select the imported source/event/case UUIDs explicitly. Transfer checksums detect changed bytes, not authenticity. Imports remain assertions. Comparison requires selected cases with matching `equivalence` fields: `fixture_id`, `fixture_revision`, `task_class` (`record_write_readback`, `record_read`, `record_move` or `copy_check`) and `cache_state` (`cold`, `warm` or `unknown`). Do not label arbitrary tasks equivalent just because their timings look similar. Missing evidence, unknown attribution and incomparable work remain limitations; do not add overlapping durations into a claimed wall time or estimate absent tokens/cost.

Duplicate JSON property names, including escaped-equivalent names, are rejected before import persistence. Conflicts use `source_id/event_id`, not an event UUID alone; conflicting duplicates are excluded without discarding independent sources. Even a conflict-only import retains its original expiry when reviewed or re-exported.

For the implemented wrong-units recipe, review a private synthetic fixture with exactly this shape, using a fresh diagnostic UUID:

```json
{"schema_version":1,"kind":"wrong_units","fixture_id":"<new UUID>","reviewed":true,"synthetic":true,"expected":{"value":1,"unit":"U1"},"observed":{"value":1,"unit":"U2"}}
```

The linked selected case must use `purpose:"synthetic_reproduction"`, `feedback.classification:"wrong_units"` and feedback passage IDs identifying both the selected intent and the observed record excerpt/final claim. Each passage needs `unit:{"value":"U1 or U2","start":0,"end":2}` with actual character offsets selecting that exact unit marker in its text; replace those illustrative offsets. Link actual source events. Its equivalence uses the fixture's UUID and the revision from the compatible `@tinycloud/operations/diagnostics` export `diagnosticFixtureRevision(fixture)` (SHA-256 of the validated canonical fixture, not arbitrary input JSON formatting). No production content or commands belong in the fixture.

With the compatible package already installed and resolvable from the current directory, obtain that revision without recording the fixture text:

```sh
node --input-type=module -e 'import { readFileSync } from "node:fs"; import { diagnosticFixtureRevision } from "@tinycloud/operations/diagnostics"; console.log(diagnosticFixtureRevision(JSON.parse(readFileSync(process.argv[1], "utf8"))));' /absolute/private/fixture.json
```

Copy the resulting revision into the reviewed case's `equivalence.fixture_revision` before `diagnostics select`. This does not install a package or execute the reproduction.

```sh
"$TC_PREVIEW_BIN" diagnostics bundle --case '<selected case UUID>' --fixture /absolute/private/fixture.json --out /absolute/private/reproduction --expires-at '<future UTC timestamp within retained evidence expiry>' --external
```

Read the generated `instructions.txt`, manifest and fixture before separately authorizing execution. The fixed runner requires Node 20+ and a compatible installed `@tinycloud/operations` exposing `diagnostics-reproduction` in the bundle's package-resolution ancestry; nothing is installed automatically. From that reviewed bundle directory, `node reproduce.mjs --reviewed-synthetic` runs real tc-apps write and independent read operations against isolated synthetic storage, not production. Never execute arbitrary imported scripts. This reproduces the reviewed input/units mismatch, not autonomous client reasoning or a proven product defect. Do not broaden it into production replay.

## Support and provenance

| Client target | Shipped behavior | Explicit limit |
|---|---|---|
| Claude Code 2.1.289 | Launcher/manual selection fallback | Automatic ENV_FILE and tool/turn hooks unsupported; no shared shell-environment writes |
| OpenCode v1 1.18.31 | Source contract plus loopback fixtures: root plugin exact sessionID + callID shell attribution, after executing-server health version check | Installed-client acceptance not exercised; missing identity, unavailable health, other version or lost environment means no automatic link |
| Codex 0.160.0 | Launcher/manual selection fallback | Automatic hook linkage unsupported; no pretend hook helper |
| OpenCode v2 | Launcher/manual selection fallback where environment reaches the executor | No v2 plugin; `/v2` package exports do not establish a supported installation |

Contexts use `version:1`, an opaque local `run_id` and optional workflow/turn/task links. The OpenCode helper sets flat `adapter`, `adapter_revision:1` and `client_version:"1.18.31"`; the explicit launcher has no client version unless it preserves validated provenance in a scoped block. The core records adapter provenance as **client_reported**, even when the version came from server health. Native client IDs are never exported. No optional plugin supplies scope, role, capture policy, profile, tenant, permissions, storage path or fabricated parent event. There is no core exact scoped-admission bridge for client lifecycle; therefore **no client.lifecycle is persisted**, no pending disk spool exists, and no tool/turn success is inferred.

### Claude Code: use the explicit launcher

No Claude hook is shipped. The documented ENV_FILE interface requires appending shell code to a file shared with other hooks, which run in parallel. An injected partial write in a disposable fixture left an unterminated quote: the helper exited successfully, but the following shell exited 2. A blocked native filesystem read also prevented helper completion. Replacing the shared file or truncating a partial append could discard another hook's variables; a timeout alone cannot repair it safely.

Use the attribution-only launcher and selected-block commands above instead. They pass a bounded environment value directly to a child, preserve business streams and exit/signal behavior, and never write CLAUDE_ENV_FILE. Automatic session/tool/turn linkage remains unsupported. This follows the diagnostic fail-open requirement rather than depending on client timeouts or weakening filesystem checks.

### OpenCode v1: activate at the actual executor only

**Outside this preview:** do not install or activate this optional plugin. The following contract reference requires separate authorization and actual executing-client acceptance; it is not a preview onboarding step.

Generate a reviewable local entry module with an installed Node runtime (20+; ordinary setup's Node 22.20+ also works). The skill installer does not make arbitrary helpers executable:

```sh
SKILL='/absolute/installed/tc-apps'
node "$SKILL/diagnostics/opencode-config.mjs" --print-module
```

It prints an `export { default } from "file:///actual/installed/.../opencode-v1.mjs";` module with the actual resolved path. Keep **all three** original `diagnostics/*.mjs` files together at that stable installed path. Do not copy `opencode-v1.mjs` alone: it imports `contract.mjs`.

After separate authorization, stage the output in a new private review directory, inspect it, then copy **only the generated entry** to the executing server's intended project `.opencode/plugins/` or user `~/.config/opencode/plugins/` directory. Use actual absolute paths below, not the placeholders; stop if the destination already exists rather than overwrite another plugin:

```sh
SKILL='/absolute/installed/tc-apps'; REVIEW='/absolute/private/new-plugin-review'; umask 077
mkdir -m 700 "$REVIEW" &&
node "$SKILL/diagnostics/opencode-config.mjs" --print-module > "$REVIEW/tc-apps-diagnostics.js" &&
cat "$REVIEW/tc-apps-diagnostics.js"
```

Only after reviewing that output and authorizing the chosen server configuration change:

```sh
REVIEW='/absolute/private/new-plugin-review'
PLUGINS='/absolute/executing-server/project/.opencode/plugins'
mkdir -p "$PLUGINS" &&
test ! -e "$PLUGINS/tc-apps-diagnostics.js" &&
cp -i "$REVIEW/tc-apps-diagnostics.js" "$PLUGINS/tc-apps-diagnostics.js"
```

These are optional operator actions, not part of baseline setup. Preserve existing plugins/configuration/trust and arrange a separately authorized executor reload. The generator itself creates no files and restarts nothing. The plugin uses only Node built-ins, no package installation. A newly launched TUI is not evidence an existing remote/shared server loaded it. To remove the adapter, remove only the entry you installed and reload that executor; this neither disables core capture nor deletes retained history. Updating the skill does not update the separately copied retry wrapper; use the setup guide's explicit wrapper-copy step.

At plugin initialization the public origin-root `GET /global/health` API must return `{ "healthy": true, "version": "1.18.31" }`. The root SDK has no declared health method, so this uses a direct bounded HTTP fetch against `PluginInput.serverUrl`, not an invented SDK call. It rejects URL credentials, redirects, queries/fragments and reverse-proxy base paths; no Authorization, cookies, SDK credentials or ambient client credentials are read or sent. The total diagnostic wait is capped at 500 ms and the body at 4096 bytes / depth 8. An authentication-protected or unavailable health endpoint is **unsupported**, not a reason to find credentials, scan routes, or trust a TUI banner. Unknown fields/errors are discarded. Version checks are for that plugin/server instance, not a guarantee of future remote restarts.

Only root hooks `tool.execute.before`, `shell.env`, `tool.execute.after` plus disposal are used. Only the known `bash` tool creates mappings. Up to 64 sessions and 256 active calls are held in memory, with five-minute inactivity/session and call-age eviction. Eviction loses linkage rather than guessing. Distinct sessions get distinct random run UUIDs; exact `(sessionID,callID)` calls get distinct workflow UUIDs. The optional shell IDs must both match exactly. Unmatched shells remove only `TC_DIAGNOSTICS_CONTEXT` from that hook's environment, preventing stale per-call/scope inheritance; all unrelated variables remain unchanged. Unsupported-server instances return no hooks. Completion removes the exact call; disposal clears maps. No global current task, event/history API, shell args, output, title, arbitrary metadata, filesystem history, model instructions or permission mutation is involved.

### Codex environment policy

There is no per-tool environment return in the pinned Codex command-hook contract. Do not install Claude ENV_FILE hooks into Codex, rewrite tool commands, use `notify`, turn on OTel/debug capture, or ingest terminal/transcript content as a substitute.

The inherited launcher context is useful only if the existing executor policy allows it. Preserve the effective `shell_environment_policy` and trust review:

- Never set `inherit=all`, disable default-secret exclusions, remove exclusions, or use `set` to restore a protected excluded value.
- Never replace `include_only` with `[]`/wildcards, or mix legacy `include_only`/`exclude` with keyed `filters` in one policy object.
- Introducing the **first** include changes an otherwise unrestricted filter table to include-only and can break ordinary tools; do not do it blindly.
- Only if an existing authorized include-only policy already permits this kind of addition, retain every existing entry and consider adding the exact `TC_DIAGNOSTICS_CONTEXT` variable. An include cannot restore something removed by inheritance or exclusion.
- If effective preservation cannot be established without changing protected policy, retain unknown linkage and use selected-block/manual review. No universal policy-overwrite snippet is provided.

## Evidence, fixtures and separately authorized acceptance

**Source support:** [Claude hooks and CLAUDE_ENV_FILE](https://code.claude.com/docs/en/hooks), [Claude 2.1.289 release](https://github.com/anthropics/claude-code/releases/tag/v2.1.289); [pinned OpenCode root plugin declarations](https://unpkg.com/@opencode-ai/plugin@1.18.31/dist/index.d.ts), [pinned root SDK declarations](https://unpkg.com/@opencode-ai/sdk@1.18.31/dist/gen/sdk.gen.d.ts), [public server health route](https://opencode.ai/docs/server/#global), [local plugin loading](https://opencode.ai/docs/plugins/); [frozen Codex 0.160.0 hook schemas](https://github.com/openai/codex/tree/rust-v0.160.0/codex-rs/hooks/schema/generated), [frozen configuration schema](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/core/config.schema.json), [environment policy semantics](https://learn.chatgpt.com/docs/config-file/config-advanced.md#shell-environment-policy). The OpenCode health route and Claude docs are live public documentation, not release-frozen schemas. These citations establish available contracts, **not** real-client acceptance.

**Fixture support:** `node --test scripts/tc-diagnostics-adapters.test.mjs` exercises the generated OpenCode entry, in-memory plugin calls and synthetic loopback HTTP. Cases cover concurrent calls/sessions, unknown/mismatched IDs and versions, environment stripping, content canaries, oversized/deep/hung health responses, bounded mapping eviction, no history requests and no scope leakage. Fixtures do not certify real clients; consult the implementation verification report for actual run results.

**Real-client gates remain separately authorized:** verify launcher environment propagation for Claude and Codex; verify OpenCode 1.18.31 server/plugin loading, health endpoint, actual shell hook ordering and ID presence, concurrent sessions/subagents on the same executor, no after-hook cross-call cleanup, remote environment transport and policy stripping. Verify unsupported versions and cancelled/missing callbacks fail open. Observe unchanged permission prompts, command arguments/results and normal record behavior using synthetic tasks. Confirm diagnostics scope at the source, not merely helper output. No automatic Claude/Codex hooks or OpenCode v2 compatibility are claimed.
