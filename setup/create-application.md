# Create a private application for the original task

Use this procedure from the [general guide](../quickstart/tinycloud.md#2-select-the-context-and-discover-the-application) only after successful live, canonically normalized discovery returns **no compatible registered app**, with no unresolved evidence of an existing target. An explicit storage request such as “add buy milk to my todos” authorizes minimal first-use preparation and that item. It does not require a second “create an app?” question. A read, hypothetical discussion, installation-only request, denied discovery or undocumented existing app does not authorize creation. An explicit setup-only request prepares an empty app and stops without an example record.

An app here is a logical registration, its private data resources and maintained guidance. No frontend, repository, deployment, plugin or general workflow engine is needed. This procedure authors a new contract; it never invents the contract of an existing app or silently migrates one. See [validation and limits](../docs/app-creation-validation.md) for tested behavior.

## 1. Bind the task and a single provisioner

Retain the original request, resolved date/timezone and trusted CLI/host/primary owner selections. Reuse a suitable existing private space for that owner on that host, normally the existing private default space verified through `context --space default --json` and real access. Keep its full URI and the separate full account-space URI. Missing authority is not a reason to create another identity or space. Do not scan unrelated storage or servers for hypothetical unregistered apps. Known unregistered data, a relevant broken registration or a pending setup requires reconciliation first.

**Supported coordination boundary: one provisioner for this owner, host and purpose at a time, across devices.** Before inspecting pending plans or allocating an app, acquire an exclusive local guard in the caller’s private provisioning directory using atomic directory creation (for example `active.lock`, shared by all cooperating setup sessions for that owner/host). Record the owning setup/continuation handle in it, retain it through setup, and release only your own guard after verified completion or an orderly pause. An existing guard requires checking its bound plan and active session; never delete it merely because it is old. An explicit continuation of that same plan may reclaim it only after establishing the previous provisioner has stopped. Inspect pending plans matching that context/purpose and account for known active setup. This agent must not start parallel provisioners. This mandatory local guard prevents cooperating local sessions racing, but cannot enforce exclusion across devices. This procedure assumes the owner is using one setup session; if another provisioner is known or the environment requires concurrent creation, pause the dependent setup until it is serialized. Do not claim distributed exclusion. CLI KV registration has no compare-and-set operation, and read-before-write does not close that race.

A new session may locate a pending plan through the entry's private state directory; an explicit continuation supplies its path. Match host/owner/purpose, but never deduplicate separate requests by title or prompt hash. If a fresh request could either resume a pending request or add a separate item, clarify that choice before the dependent mutation. A completed plan is not app discovery. Later ordinary sessions use the live registry and remote guidance without reading old plans.

## 2. Design and persist the minimal plan

Choose a small model suited to the data and actual CLI. KV JSON documents suit small independent items; SQL suits structured records needing constraints, conditional updates or tabular queries. A KV prefix is virtual: it needs no empty directory or sentinel write. Its storage readiness check is a successful list of the exact prospective record prefix and missing reads of the exact prospective knowledge and first item keys. Do not create a fake record to initialize it. SQL needs the deliberately designed table and exact schema inspection. No tracker tables or universal schema engine are required.

Allocate once: a random app UUID, a descriptive stable logical ID (for example `xyz.tinycloud.personal.todos.<uuid>`), a collision-safe private prefix (for example `personal/<uuid>`), flat SQL database name if needed, and the original item's stable UUID/operation ID. Names are illustrative; do not adopt example identifiers literally. Find existing compatible apps by purpose and supported operations, regardless of their ID or representation. Do not allocate replacement IDs on a collision or retry; preserve the conflicting resource and report it.

Before asking for provisioning consent or dispatching anything, create a private durable plan directory, for example `<task-state>/provisioning/<setup-uuid>/`. Use directory mode `0700`, files `0600`, and atomic replacement of state files. Store only the task's necessary private data and no keys, sessions, signed responses or grants. Save these complete artifacts:

| Artifact | Required contents |
| --- | --- |
| `plan.json` | Version; setup ID; original request and whether an item or only setup was requested; retained request date/timezone; trusted executable, host, expected primary owner, full app/account spaces; single-provisioner assumption; discovery evidence/status; logical app ID and every exact target; representation/schema; original item/operation IDs and intended values; nonsecret profile selections; artifact filenames; per-step states and verified observations. |
| `knowledge.md` | Complete [version 2 root](../references/application-knowledge.md#version-2-general-application-guidance) with exact resources and all supported one-off operations. |
| `application.json` | Valid existing manifest schema: `manifest_version`, `app_id`, meaningful `name`/`description`, explicit full `space`, `prefix`, `defaults: false`, `includePublicSpace: false`, `knowledge: "knowledge/index.md"`, and exact declared resources/actions. Every permission uses fully resolved paths and `skipPrefix: true`, including in this registered manifest, to avoid applying the prefix twice. Validate effective root/data coverage. No new manifest fields. Declare guidance get separately from record writes. |
| Scope manifests | Separate account discovery/enrollment, app provisioning and ordinary-operation requests, each with one explicit space and fully resolved paths. Include only the required capabilities. |
| Original operation plan | Bound target/IDs, intended values, first-dispatch timestamp when applicable, reconciliation query, state and eventual readback; linked from `plan.json`. This can be prepared now and completed after ordinary access is verified. |

State each boundary as `pending`, `dispatched`, `verified`, `uncertain` or `conflict`, with its actual readback, not just a boolean command success. Mark dispatch before mutation. Store the full authored schema/content as well as any hashes; a hash of a cached manifest is not canonical readback. Record and retain the plan path as the continuation handle. On continuation read it before choosing resources or requesting new scope.

For a basic todo, document at least stable ID, exact user title, initial `open` status, and creation/update UTC timestamps. Define `open` → `completed` and reopening → `open`, title edits and permanent deletion of the selected ID; define any completion timestamp if used. Do not invent due dates, priorities, assignees or recurrence. A revision/last-operation field is useful only with a specified update/retry contract. Preserve unrelated fields during edits. KV get-then-put is not conditional update: document the single-writer limit for edits, and stop if known concurrent edits cannot be reconciled. SQL may use a revision predicate. A create retry reads the original ID and compares the complete intended object; a distinct request receives a distinct ID even if its title is identical.

For any model, the root must define required/default fields, valid values, dates/timezone rules, exact keys/tables, ID generation, read/create/edit/delete semantics, status transitions if relevant, side effects, preconditions, retries and readback. State that explicit one-off tasks use a durable operation identity and need no native chat adapter. Recurring automatic capture is a different workflow. Maintain a useful root before registration; a bare schema or a root saying “see the setup plan” is insufficient for a fresh agent.

## 3. Obtain separate, exact authority

Keep three roles explicit: discovery context, provisioner context and ordinary task context. Preserve any protected reader. Create an unused provisioner profile/home through supported CLI commands if suitable setup authority does not already exist. Never copy credential files. A narrow new grant cannot reduce the existing authority of a broad profile. The ordinary profile must never receive schema, guidance-write or registry-put authority merely to simplify setup. Use the same intended owner and host for every role and verify safe `context` output and actual access.

Derive scope from the saved prospective targets before human signing:

| Role | Scope |
| --- | --- |
| Discovery | Account KV `get`/`list` on `applications/`; selected app guidance/data reads when needed. |
| Enrollment | Account KV `get`/`list` on `applications/`, plus `put` on the **one exact** `applications/APP_ID` key. No account SQL index permission. |
| KV app provisioning | `get`/`put` on the exact new knowledge key; `list` on the exact prospective record prefix; `get` on the planned first item key for absence checks. No first-item write is needed by the provisioner. |
| SQL app provisioning | SQL `read` and `schema` on the one exact database; KV `get`/`put` on the exact knowledge key. The disposable-node check verified `tinycloud.sql/schema` permits `CREATE TABLE`, while `read`/`write` alone is denied; `admin` is unnecessary. Check actual command/server compatibility rather than guessing wider authority on a different version. |
| Ordinary operation | Guidance KV `get`; only necessary record KV `get`/`list`/`put`/`del`, or SQL `read`/`write` on the exact app database. Account discovery reads can remain. No guidance writes, schema/admin or registry puts. |

Every consent manifest uses one explicit top-level full space, `defaults: false`, `includePublicSpace: false`, fully qualified service names, fully resolved paths and `skipPrefix: true`. The chosen OpenKey flow also needs `tinycloud.capabilities` `read` on path `""` in that space. Preserve the existing primary login; obtain additional space authority with `auth request --manifest FILE --grant`. For a new profile use scoped `auth login --method openkey --manifest FILE --owner EXPECTED_OWNER --expiry 1h` for setup; ordinary tasks can use their documented duration. See the installed `tc-cli/AUTH.md` and actual help. Keep the CLI alive while the human signs. Use the entry's supported consent transport; signed responses must never pass through model chat, tool arguments, scripts or agent stdin. Reuse genuinely suitable saved grants and do not promise one approval before checking.

Missing hosting is a distinct prerequisite. Prefer the existing hosted private and account spaces. If real reads establish that required owned hosting is absent, use the installed owner `space create/host` flow with only the exact necessary `tinycloud.space/host` authority, after saving that addition in the plan; verify hosting with actual operations. Do not silently use broad login or another space to evade a denial. New-space/hosting behavior requires its own verified owner flow and is not established by tests on already hosted spaces.

## 4. Recheck discovery and exact targets

After consent, rerun `account apps list --live` and [canonical normalization](../quickstart/retrieve-data.md#4-select-the-app-and-its-declared-resources). If a compatible app appeared, reconcile the pending plan and reuse it before further setup writes; do not delete partial resources. A relevant malformed/undocumented registration remains a blocker. Check the exact prospective `applications/APP_ID` KV key in the account space. Only explicit `NOT_FOUND` means absent. Compare any present canonical manifest structurally, preserving names, descriptions, permission descriptions, versions and other metadata. An unexpected differing record is a conflict even if a cached registration hash agrees.

Check every planned resource in the app space before mutation:

```sh
"$TC_BIN" --profile "$SETUP_PROFILE" --host "$HOST" kv get "$KNOWLEDGE_KEY" --space "$APP_SPACE" --json
"$TC_BIN" --profile "$SETUP_PROFILE" --host "$HOST" kv list --prefix "$RECORD_PREFIX" --space "$APP_SPACE" --json
"$TC_BIN" --profile "$SETUP_PROFILE" --host "$HOST" kv get "$FIRST_ITEM_KEY" --space "$APP_SPACE" --json
```

Run only commands applicable to the saved representation; setup-only has no first item. All subprocesses use the role's selected `TC_HOME`. For SQL instead inspect the exact planned database:

```sh
"$TC_BIN" --profile "$SETUP_PROFILE" --host "$HOST" sql query \
  'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name' \
  --db "$DATABASE" --space "$APP_SPACE" --json
```

A denied or unavailable read is not absence. On initial setup, unexpected data, tables, indexes, triggers or guidance are conflicts to preserve. On restart, compare them with the saved plan and prior verified state; matching planned schema/guidance/registration is reusable. Inspect column declarations, types, nullability, keys, defaults, constraints and indexes from the stored SQL; `IF NOT EXISTS` alone proves nothing. Never overwrite a conflicting resource, silently rename a target, clean a prefix, or drop a partial table.

## 5. Provision and read back each boundary

1. **Storage:** for KV, retain the verified empty prospective prefix (there is no creation mutation). For SQL, mark dispatch, create the planned table with the verified schema ability, then inspect the actual schema and zero-record state. On resume, a matching existing table needs no DDL. Preserve any existing records; compare the original item by ID when it may already have been dispatched.
2. **Guidance:** missing exact root permits `kv put KEY --file knowledge.md --space FULL_SPACE`; read it with `kv get ... --raw` and compare the complete content. A matching existing document skips put. Different content stops for reconciliation. Mark the knowledge boundary verified before registration.
3. **Registration:** recheck live discovery and exact canonical key immediately before dispatch. Publish only after required resources and complete useful guidance are verified. If the canonical record is absent, run `account apps register application.json --json`. An equivalent existing record skips register. Then list live and get the exact canonical KV record, parse the envelope's string `data` once, and validate its `app_id` and every manifest against the saved one. Preserve other existing metadata; do not rewrite to repair the decoder. A cached hash or successful exit cannot replace this comparison. Missing/differing canonical readback leaves enrollment unverified; report it and reconcile rather than claiming success or adding account-index authority.
4. **Fresh ordinary discovery:** use the ordinary task profile, never the provisioner, to list live, normalize the canonical record, read its root and inspect its resources. Obtain only missing discovery/ordinary scope. Read the maintained guidance as a later agent would. The logical app should be discoverable by its maintained purpose; do not rely on plan locators for this check.
5. **Original operation:** return to [general guide step 3](../quickstart/tinycloud.md#3-understand-the-apps-operation) with the original request and bound operation plan. Use ordinary permissions to save precisely the requested item and verify it. Registering an empty app is not completion of “add buy milk.” For setup-only, verify an empty ready app and end without a record.

These writes span independent resources and are not a transaction. Never delete partial resources as automatic rollback. Record exactly which boundary succeeded and which is uncertain. Keep setup context out of ordinary connection hints; retain it only in the private continuation plan while needed for setup reconciliation.

## 6. Resume without duplicating or overwriting

On explicit continuation, validate the saved host/owner/CLI context and use the original app, resource and operation IDs. Re-run live discovery, target schema/prefix inspection, exact root readback and normalized canonical registration readback before any missing step. The plan's status is a hint; remote state wins. A lost receipt after storage, guidance or registration may already have completed that boundary. Matching state means skip the mutation, update verified state and continue. A conflicting state means preserve it and identify the exact mismatch. No new UUIDs, blanket rewrites or cache-based success.

If the first item was dispatched or its receipt was lost, use ordinary authority to read its bound ID first. Identical intended state confirms success with no second mutation. If it is definitely absent and the preconditions hold, retry using the same ID, values and retained first-dispatch timestamp. A changed item or unreadable result needs reconciliation. For a new independent request after completed setup, rediscover the app and allocate a new operation; do not read or require the provisioning plan.

Report the saved item only after exact readback, or report the precise remaining gap with its continuation handle. Keep private plans and raw authentication/test artifacts out of shared reports. Registry discovery establishes no matching registered app, not universal absence of unregistered data. Synthetic fixture success establishes local behavior, not human consent or hosted onboarding.
