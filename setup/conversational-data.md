# Prepare or enroll conversational data

This is the preserved owner-side prepared-SQL recipe for the `tc-conversational-data` 0.1.0 layout, also readable by skill 0.2.0, CLI 0.10.0 and node 1.17.1. Generic new recurring apps use [first-use creation](create-application.md) and [separate mutable intention state](../skills/tc-conversational-data/references/intention-lifecycle.md). Do not impose these two baseline domains on another app. New preparation creates the existing baseline contract, with empty records and no active tracking intentions. It does not install a message-ID adapter or make the conversational agent an administrator. Complete app-side authentication using the installed `tc-cli/AUTH.md` first; enrollment below separately obtains account authority when needed.

For a new tracker, prepare and verify the resources below, then complete [application enrollment](#enroll-an-existing-or-newly-prepared-tracker) before reporting that it is discoverable. For an existing tracker, go directly to enrollment: retain its database names, private KV prefix, catalog, guidance, observations, and intentions. Enrollment creates only a knowledge root and an account registry record when they are absent. A retrieval request alone authorizes neither preparation nor enrollment; use the [retrieval quickstart](../quickstart/retrieve-data.md) for a read-only question.

The owner selects the CLI executable, owner profile, host, full space URI, two fresh unique flat SQL database names, and one fresh private KV prefix ending in `/`. Keep this owner profile separate from the conversation's delegated profile. Below, `TC`, `PROFILE`, `HOST`, `SPACE`, `FITNESS_DB`, `FINANCE_DB`, and `PREFIX` denote these already selected values. Use the expected owner DID to verify `context`; do not infer the owner from a session-key DID.

## Check the targets before writing

```sh
"$TC" --profile "$PROFILE" --host "$HOST" context --space "$SPACE"
"$TC" --profile "$PROFILE" --host "$HOST" sql query 'SELECT name, sql FROM sqlite_master WHERE type = ?' --params '["table"]' --db "$FITNESS_DB" --space "$SPACE" --json
"$TC" --profile "$PROFILE" --host "$HOST" sql query 'SELECT name, sql FROM sqlite_master WHERE type = ?' --params '["table"]' --db "$FINANCE_DB" --space "$SPACE" --json
"$TC" --profile "$PROFILE" --host "$HOST" kv get "${PREFIX}catalog.json" --space "$SPACE" --json
```

Both schema reads must succeed with zero tables, and the catalog must explicitly report missing. A denied read is not an empty target. Check that `${PREFIX}fitness.md` and `${PREFIX}finance.md` are also absent. If any target already exists, stop and inspect it; this recipe neither resets an active tracker nor migrates an existing schema. A repeated invocation must stop before writes once preparation exists. Interrupted preparation needs reconciliation, not blind repetition.

## Create the two fixed tables

Run these only with owner/setup authority and the verified fresh targets:

```sh
"$TC" --profile "$PROFILE" --host "$HOST" sql execute 'CREATE TABLE measurements (id TEXT PRIMARY KEY, source_key TEXT NOT NULL UNIQUE, occurrence_date TEXT NOT NULL, date_precision TEXT NOT NULL, timezone TEXT NOT NULL, captured_at TEXT NOT NULL, revision INTEGER NOT NULL, last_operation_id TEXT NOT NULL, source_message TEXT NOT NULL, correction_message TEXT, metric TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL)' --db "$FITNESS_DB" --space "$SPACE" --json
"$TC" --profile "$PROFILE" --host "$HOST" sql execute 'CREATE TABLE expenses (id TEXT PRIMARY KEY, source_key TEXT NOT NULL UNIQUE, occurrence_date TEXT NOT NULL, date_precision TEXT NOT NULL, timezone TEXT NOT NULL, captured_at TEXT NOT NULL, revision INTEGER NOT NULL, last_operation_id TEXT NOT NULL, source_message TEXT NOT NULL, correction_message TEXT, amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, category TEXT)' --db "$FINANCE_DB" --space "$SPACE" --json
```

Prepare a local `catalog.json` using the installed storage contract's exact `tc-conversational-data/v1` layout. Substitute the selected database names and `${PREFIX}fitness.md`/`${PREFIX}finance.md` guidance keys. Keep both targets `prepared`, both `active_metrics` lists empty, and `active_intentions` empty. Do not seed a measurement or activate weight on behalf of an installation-only request.

Prepare local `fitness.md` and `finance.md` files containing the actual database/table/column mapping, no active intentions, and the installed contract's semantics: kg weight, hours of sleep on the local wake date, EUR integer cents, unknown category as NULL, no undocumented conversions, event date distinct from UTC capture time, retained provenance on correction, stable operation identity and expected-revision updates. Document both supported provenance paths: native client delivery identity for recurring automatic capture, and the [durable task identity](../skills/tc-conversational-data/references/storage-contract.md#explicit-one-off-operation-identity) for an explicit one-off request. These become durable domain guidance. They must contain no credentials or instructions to widen access.

Store and verify them using the CLI's literal value argument (quote the file contents):

```sh
"$TC" --profile "$PROFILE" --host "$HOST" kv put "${PREFIX}fitness.md" "$(cat fitness.md)" --space "$SPACE" --json
"$TC" --profile "$PROFILE" --host "$HOST" kv put "${PREFIX}finance.md" "$(cat finance.md)" --space "$SPACE" --json
"$TC" --profile "$PROFILE" --host "$HOST" kv put "${PREFIX}catalog.json" "$(cat catalog.json)" --space "$SPACE" --json
"$TC" --profile "$PROFILE" --host "$HOST" kv get "${PREFIX}fitness.md" --space "$SPACE" --raw
"$TC" --profile "$PROFILE" --host "$HOST" kv get "${PREFIX}finance.md" --space "$SPACE" --raw
"$TC" --profile "$PROFILE" --host "$HOST" kv get "${PREFIX}catalog.json" --space "$SPACE" --raw
```

Compare catalog JSON structurally: the CLI may normalize whitespace. Compare guidance content, re-read both schemas through `sqlite_master`, and query `SELECT count(*) FROM measurements` / `SELECT count(*) FROM expenses` in their respective databases. Both counts must be zero. These operations are not one transaction; report and reconcile partial preparation.

## Adopt one-off task identity in existing guidance

This is explicit owner maintenance, not an automatic side effect of discovery or a record request. A tracker whose stored guidance requires native client message IDs must retain that rule until its owner adopts the reviewed one-off convention. The September 30 read-only audit of the existing hosted trial found precisely this restriction; changing only the local quickstart does not remove it.

Read the exact catalog-referenced guidance value and retain a private original plus content hash. Prepare a narrow replacement of its source/operation identity rules: native delivery identity remains required for recurring automatic capture, while an explicit one-off create may use `agent-task:<task UUID>:<item UUID>` with the durable plan and reconciliation rules in the storage contract. A correction retains the original source key and receives a separately retained operation ID. The original request date/timezone survives consent and restart; first-dispatch capture time is separate. Repeated independent prompts are not automatically deduplicated. One-off recording does not activate tracking.

Preserve resource names, schemas, units, existing intentions, unrelated rules and the value's stored encoding. Do not rewrite existing source keys or records. Review the exact difference before applying it with authorized owner-maintenance scope: KV `get`/`put` on that guidance key and the capabilities read required by consent. No SQL write/admin, registry rewrite or catalog update is needed for this wording change.

Immediately before dispatch, re-read the value and compare it with the retained original. A changed value needs reconciliation. This is a single-maintainer procedure, not atomic KV compare-and-set. Apply the prepared value once and read it back exactly; a lost response requires readback before retry. If it already matches, no put is needed. Record the maintenance result separately from any user observation, then return to the original task with ordinary task permissions. Do not use owner maintenance authority to capture observations.

## Adopt a recurring lifecycle in existing guidance

This is explicit owner maintenance when an existing app lacks cancel/stop/resume, stores live intention state in protected guidance, or needs a new native-delivery contract. An ordinary record/tracking request or skill installation does not silently authorize rewriting a maintained contract. Report its exact gap and present a narrow adoption proposal. Keep the existing logical app, registration, data resources, records and intention IDs.

Refetch the exact root/catalog/domain guidance and current intention state, retain their complete original values and hashes privately, then review the precise changed rules and resource scopes. Prefer the existing mutable catalog/key if it already supports the lifecycle under ordinary tracking authority. Otherwise select one exact intention key outside protected guidance, declare it in the existing app manifest through authorized enrollment maintenance, and specify it in the root. Never rename or clear the old catalog as an incidental upgrade.

Copy current intention IDs, statuses, capture rules and provenance without changing observations. Map a documented pending intention to pending; map an explicit stopped intention to stopped. Ambiguous historical state requires clarification, not guessed activation. Make static guidance point to the mutable state as the single source of current status; preserve all unrelated rules and stored encoding. A native-ID-only owner rule remains in force unless its specific change is also approved.

Obtain exact maintenance get/put only for affected guidance/state keys and, only if the declared resources change, the one canonical registration key. No record write or SQL schema/admin is required for this lifecycle adoption. Keep these maintenance credentials out of the ordinary profile. A new state key may be prepared under maintenance authority, but later transitions must pass with ordinary exact-key authority.

Use the single-maintainer guard. Immediately before dispatch refetch and compare originals. Apply and read back each required state/guidance/registration boundary; equivalent content skips put, conflict stops that boundary, and an uncertain response requires readback before retry. There is no cross-resource transaction: retain a partial plan and do not activate until all required declarations agree. Finish with fresh ordinary discovery, verify record preservation and the original intention IDs, then independently test cancel/stop/resume under ordinary authority. Existing incompatible real-owner guidance remains untouched without this explicit adoption.

## Enroll an existing or newly prepared tracker

Enrollment uses the existing account application registry. The stable logical app ID for this single conversational tracker is `xyz.tinycloud.conversational-data`; setup and delegated-client app IDs are permission-request identities, not separate logical applications. Reuse an existing logical registration that already identifies these resources. If this ID belongs to another tracker or any metadata differs, preserve it and stop for owner reconciliation; do not overwrite it, allocate a second tracker automatically, or rename stored resources. One owner-side enrollment writer at a time is required: the CLI has no compare-and-set registration operation.

Retain the original task and return point. Reuse the selected host and `TC_HOME` for every subprocess; use explicit `--profile`, `--host`, and full `--space` on data commands. Preserve the existing app owner `PROFILE`. In this section `APP_ID` is the logical ID above, `SPACE` is the existing full app-space URI, and `PREFIX` is its existing private KV prefix with one trailing `/`. Obtain the actual database names and catalog locator from the app's existing owner setup context, then verify them against the stored catalog and schemas. These are enrollment inputs, not inputs a future standalone reader must receive. Do not read credential files, use a delegated session-key DID as the owner, or copy private owner addresses/local paths into public examples.

### Separate owner registration authority

Use a wallet/OpenKey-backed `REGISTRY_PROFILE` for the same owner and host. It may equal `PROFILE` only when that profile already has both the required app authority and account authority. Account APIs derive the owner's account space; they have no `--space` option. `ACCOUNT_SPACE` below is the verified full account-space URI belonging to the same owner, and `OWNER_DID` is the verified primary DID from app setup.

Owner enrollment needs account KV `get`/`list` on `applications/`, and `put` on the exact `applications/APP_ID` key. App-side enrollment needs `get` on the existing catalog/guidance, SQL `read` for schema checks, and `get`/`put` on `${PREFIX}knowledge/index.md`. Ordinary readers need no registry `put`, app `put`, SQL write/schema authority, or account SQL index permissions. Registration attempts best-effort index maintenance, but canonical KV readback is the success criterion; do not grant account SQL authority just to make its cache current.

If account authority is missing, keep the existing app profile intact. Select an unused profile name after `tc profile list --json`, and create a separate owner-backed profile. Prepare `enrollment-permissions.json` locally, substituting only the selected stable app ID if an existing compatible registration uses another one:

```json
{
  "manifest_version": 1,
  "app_id": "xyz.tinycloud.conversational-data.enrollment",
  "name": "Enroll my conversational tracker",
  "space": "account",
  "defaults": false,
  "includePublicSpace": false,
  "permissions": [
    { "service": "tinycloud.capabilities", "path": "", "skipPrefix": true, "actions": ["read"] },
    { "service": "tinycloud.kv", "path": "applications/", "skipPrefix": true, "actions": ["get", "list"] },
    { "service": "tinycloud.kv", "path": "applications/xyz.tinycloud.conversational-data", "skipPrefix": true, "actions": ["put"] }
  ]
}
```

```sh
"$TC" --host "$HOST" profile create "$REGISTRY_PROFILE" --posture owner-openkey --operator human --json
"$TC" --profile "$REGISTRY_PROFILE" --host "$HOST" auth login --method openkey --manifest enrollment-permissions.json --owner "$OWNER_DID" --expiry 1h
"$TC" --profile "$REGISTRY_PROFILE" --host "$HOST" context --space "$ACCOUNT_SPACE" --json
```

Keep the login process alive for the supported browser loopback callback while the human selects the existing identity and approves. Do not send return codes through model chat or tool arguments. If callback fails, the human can run the CLI's supported `--paste` path directly in their terminal; record that extra step. This is a separate owner enrollment consent, not the read-only retrieval grant. The explicit capabilities read is required by current OpenKey; it does not grant registry access. Check that returned owner/host/account context matches the existing app context. `ACCOUNT_SPACE_UNAVAILABLE` is a missing owner-context problem, an authorization denial is missing authority, and an unhosted account space is a hosting prerequisite. None means the tracker or registry is empty. Resolve only the reported prerequisite; do not silently request a whole-space grant.

### Inspect canonical registration and existing data

```sh
"$TC" --profile "$REGISTRY_PROFILE" --host "$HOST" account apps list --live --json
"$TC" --profile "$REGISTRY_PROFILE" --host "$HOST" account apps info "$APP_ID" --json
"$TC" --profile "$REGISTRY_PROFILE" --host "$HOST" kv get "applications/$APP_ID" --space "$ACCOUNT_SPACE" --json
"$TC" --profile "$PROFILE" --host "$HOST" kv get "${PREFIX}catalog.json" --space "$SPACE" --raw
"$TC" --profile "$PROFILE" --host "$HOST" kv get "${PREFIX}knowledge/index.md" --space "$SPACE" --raw
```

Inspect the live list for an existing registration of these resources under a different ID before choosing the stable ID. Use [the reader's canonical KV procedure](../quickstart/retrieve-data.md#canonical-record-decoding-cli-0100) for incomplete entries and enrollment readback. Compare the actual stored record; do not overwrite it to repair a decoder.

An explicit missing-key result for the exact registry key establishes absence; a failed or denied command does not. Preserve the normalized canonical `manifests` array and any different names, descriptions, version fields, permission descriptions, or other metadata. Compare JSON structurally, not by whitespace or a cached hash. An equivalent existing entry needs no registration write. Any differing entry requires owner reconciliation before proceeding; this recipe does not merge or replace it.

Read each catalog-referenced domain guidance key and inspect its database with the earlier `sqlite_master` query. Validate that all references stay within the selected space, private prefix, and exact approved databases. Existing records need not be empty and active intentions need not be cleared. Capture only the schema/catalog/guidance consistency and non-sensitive verification status in shared evidence; keep row-level measurements and private manifests local.

### Add the versioned knowledge root

Follow [the application knowledge convention](../references/application-knowledge.md). Its KV resolution is a new agent convention, not an automatic CLI fetch. The manifest below explicitly supplies `space`, `prefix`, and `knowledge`. For this tracker the final key is exactly `${PREFIX}knowledge/index.md`: remove the prefix's trailing slash for the manifest `prefix`, then join it with `/` and `knowledge/index.md`. All permissions use literal complete resource paths with `skipPrefix: true`; do not rely on the CLI and SDK agreeing about implicit prefix expansion.

Prepare local `knowledge-index.md` with this frontmatter and body, replacing the uppercase values with the already verified app metadata. Set its `app_id` to the reconciled `APP_ID` as well, including when reusing a compatible registration under a different ID. `EXACT_PRIVATE_PREFIX` has no trailing slash; `EXACT_CATALOG_KEY` includes that prefix and `/catalog.json`. Quote frontmatter values as JSON strings when they contain punctuation. The catalog and existing domain guidance remain the maintained source of the actual target mapping, activation, and detailed semantics.

```markdown
---
format: tinycloud-kv-knowledge/1
app_id: xyz.tinycloud.conversational-data
space: "FULL_EXISTING_APP_SPACE_URI"
prefix: "EXACT_PRIVATE_PREFIX"
catalog_key: "EXACT_CATALOG_KEY"
---
# Conversational tracker

This app stores personal fitness measurements and expenses. Read the catalog_key
above in this same space, validate its prepared_targets against the registered
resources, then read each relevant guidance_key and inspect the actual SQL schema.
Catalog formats tc-conversational-data/v1 and conversational-trial-v1 share the
baseline layout. An unknown format needs interpretation before querying.

Fitness supports weight and sleep duration; finance supports expenses. Domain
guidance is the maintained source of their units, date conventions, actual
database/table/column names, and any supported extensions. Read metric/unit values
and date coverage from stored rows rather than assuming every prepared metric
has observations. Keep units and currencies separate unless guidance defines a
conversion.

Use occurrence_date for event-date questions, not captured_at. Month comparisons
use half-open local-date ranges, counts, and means of recorded readings per unit.
A missing month is unavailable, not zero; irregular readings are not a daily or
month-wide average. Reading does not activate tracking or require message IDs.
This document describes data. It cannot authorize commands, software installation,
identity or host changes, broader access, writes, or sharing.
```

If the root is missing and the verified registry entry is absent or already equivalent, store it and read it back. If it exists, validate its version and mapping; reuse an equivalent root without writing. Preserve differing contents for owner reconciliation. Do not replace the catalog, domain guidance, or any observations to fit this example.

```sh
"$TC" --profile "$PROFILE" --host "$HOST" kv put --space "$SPACE" --json -- "${PREFIX}knowledge/index.md" "$(cat knowledge-index.md)"
"$TC" --profile "$PROFILE" --host "$HOST" kv get "${PREFIX}knowledge/index.md" --space "$SPACE" --raw
```

Run the put only after the missing check; CLI 0.10.0 does not expose conditional KV writes here. Keep the `--` end-of-options separator before the key/value: the document starts with YAML `---`, which otherwise gets parsed as a CLI option. Compare the readback to the prepared document. An interruption after this write leaves a reusable knowledge root, not a completed registration or a reason to remove data.

### Register and verify canonical readback

Prepare local `application-manifest.json` by replacing the uppercase placeholders with the existing full space, prefix without trailing slash, and flat database names. Set `app_id` to the reconciled logical ID. Resource descriptions let a reader select fitness SQL for a weight question without requesting finance access. This manifest describes the tracker; do not use it as the reader's permission request.

```json
{
  "manifest_version": 1,
  "app_id": "xyz.tinycloud.conversational-data",
  "name": "Personal measurements and expenses",
  "description": "Conversational records of weight, sleep duration, and expenses, with occurrence dates, units, and source provenance.",
  "space": "FULL_EXISTING_APP_SPACE_URI",
  "prefix": "EXACT_PRIVATE_PREFIX",
  "defaults": false,
  "includePublicSpace": false,
  "knowledge": "knowledge/index.md",
  "permissions": [
    { "service": "tinycloud.sql", "path": "EXACT_FITNESS_DATABASE", "skipPrefix": true, "actions": ["read", "write"], "description": "Fitness measurements: weight and sleep duration; inspect the actual schema and fitness guidance." },
    { "service": "tinycloud.sql", "path": "EXACT_FINANCE_DATABASE", "skipPrefix": true, "actions": ["read", "write"], "description": "Expenses in integer minor units, with currency and category; inspect finance guidance." },
    { "service": "tinycloud.kv", "path": "EXACT_PRIVATE_PREFIX/", "skipPrefix": true, "actions": ["get", "put", "list"], "description": "Private knowledge/index.md, catalog.json, and catalog-referenced domain guidance." }
  ]
}
```

Immediately before registering, repeat canonical `apps info` and the exact registry KV read/normalization. If the entry appeared or changed since inspection, stop and reconcile it. Only an explicit absence permits the registration below; an equivalent entry skips the write and continues to readback.

```sh
"$TC" --profile "$REGISTRY_PROFILE" --host "$HOST" account apps register application-manifest.json --json
"$TC" --profile "$REGISTRY_PROFILE" --host "$HOST" account apps info "$APP_ID" --json
"$TC" --profile "$REGISTRY_PROFILE" --host "$HOST" account apps list --live --json
"$TC" --profile "$REGISTRY_PROFILE" --host "$HOST" kv get "applications/$APP_ID" --space "$ACCOUNT_SPACE" --json
```

Success requires live list/info to identify the intended app, the normalized canonical KV record to contain the structurally equivalent manifest, and the app profile to read the root and only the catalog, domain guidance and existing schemas relevant to its granted operation. Record the CLI decoding limitation if list/info still display an empty manifest array despite correct canonical content; do not claim the SDK decoder is repaired. The SDK's registration hash cache can report success without writing canonical KV. If the app is absent or its normalized canonical contents differ after registration, stop with that precise partial result; do not blindly retry, rebuild the account index, bypass the CLI, or claim enrollment succeeded. A timeout or failed register response is also indeterminate until canonical readback. On retry, restart with live inspection: reuse matching registry/root documents without writes; preserve differences. Registration and knowledge storage are separate operations with no cross-resource transaction or concurrency guarantee.

Registration grants no reader authority, creates no app tables, and proves no reader access. Verify subsequent retrieval through the [discovery/read recipe](../quickstart/retrieve-data.md), reusing saved scope or obtaining only missing consent. The existing OpenCode setup integration prepares app storage but does not run this enrollment or request account authority; its existing installations need this explicit owner enrollment step. Keep that live gate visible instead of describing app preparation as automatic account discovery.

## Grant only the conversational scope

Use the installed core skill's scoped-login/delegation flow for the intended identity. Derive permissions from the selected maintained operation. Records need SQL read/write only for the relevant exact database, with exact catalog/guidance KV reads. A compatible legacy mutable catalog needs get/put on its exact key; new/adopted lifecycle state needs get/put on its declared exact intention key. Do not request prefix-wide puts that include protected guidance. If legacy activation requires guidance writes, complete the explicit adoption above before using it with an ordinary profile. Do not grant SQL admin/schema authority to the conversational agent. Do not substitute the generic note manifest or a whole-space grant. Human consent, when used, stays in the supported browser/CLI return channel.

Verify the delegated profile by actually reading only the granted catalog/guidance resources and relevant database schemas. A grant for one domain does not require reading another. Do not create synthetic siblings or probe unrelated user resources during onboarding. Negative authorization checks against known existing SQL/KV siblings belong only in disposable validation; missing resources do not prove scope enforcement.

Pass only nonsecret context to the client: CLI path, delegated profile, host, expected owner/full space, approved domain-to-database mapping, private prefix and catalog locator. Supply local message timezone and stable native message/item/operation metadata through the client's supported integration. Credentials, signed grants, owner setup commands and prior conversation answers do not belong in the bootstrap.

Return to [the conversational quickstart](../quickstart/conversational-data.md#4-continue-the-conversation) with the original user request. Owner preparation is a separate step; the installed workflow does not provision these resources automatically.
