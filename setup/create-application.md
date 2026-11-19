# Create a private application for the original task

Use this conditional recipe from [the generic entry](../quickstart/tinycloud.md#3-find-the-relevant-applications) only when successful live discovery establishes **no compatible registered app**, with no unresolved relevant malformed/inaccessible registration, known unregistered target or pending setup. An explicit storage request permits the minimal app and its requested item; a read, hypothetical discussion or installation request does not. Do not create a replacement to evade denied access or different existing structure.

This is a logical registration, private resources and readable guidance—not a frontend, deployment, plugin or schema framework. Existing hosted app/account spaces and appropriate setup/ordinary consent are prerequisites. This does not establish new-owner hosting.

## 1. Bind the task and a single provisioner

Retain the original request/date/timezone and selected CLI home/profile/host/primary owner. Start with `context --json` on that profile **without a space override** to retain its actual session-bound data space. Resolve the account space separately. A `context --space ...` result merely resolves a URI; it does not prove hosting or access. Choose a suitable existing data space from this verified context or discovered resources, and confirm it through the required live reads. Private storage does not mean a space literally named `private`: do not invent a logical space from that adjective. If no existing hosted data space is established, retain that prerequisite rather than allocating a space name, scanning unrelated hosts/storage or switching targets to evade denial.

**One provisioner for this owner, host and purpose at a time, across devices.** A local lock coordinates only cooperating local sessions; it is not distributed protection. Under `${TC_HOME:-$HOME}/.tinycloud/agent-tasks/`, use atomic directory creation for a shared provisioning guard, recording its owning continuation handle. Inspect a present guard and bound plan; never delete it just because it is old. Reclaim for explicit continuation only after establishing the prior provisioner stopped. Release only your own guard after verified completion or orderly pause. If cross-device coordination is uncertain, pause setup rather than claim concurrent provisioning is safe.

Locate existing pending plans before allocating. Ambiguous resume-versus-new intent needs clarification, not prompt-hash deduplication. Completed plans are not app discovery; later ordinary sessions use the live registry and remote guidance.

## 2. Design and persist the minimal plan

Choose KV for suitable independent documents or SQL when queries, constraints or conditional updates require it. Reuse a suitable database when safe and authorized; no database-per-app rule. A KV prefix is virtual and requires no sentinel/example record. Setup-only creates no item.

Allocate once: collision-safe logical app ID/private resource prefix, any needed SQL identifiers, and allowed original-operation/record IDs. Save the full intended schema/content and scope before consent or dispatch in a private operation directory beneath the selected home's `agent-tasks/`. Use directory `0700`, files `0600`, atomic updates. Save only necessary request/context, resource/ID selections, intended changes, preconditions, per-boundary dispatch state and reconciliation/readback. Never save credentials or signed responses. Preserve unresolved plans; remove completed personal payloads when no longer needed.

Prepare:

- The minimal [version 2 knowledge root](../references/application-knowledge.md#version-2-general-application-guidance): exact resources, identity, relevant meanings, supported operation preconditions, reconciliation and readback. No universal fields, complete lifecycle manual or recurring-capture setup.
- An existing-schema application manifest: `manifest_version: 1`, stable `app_id`, meaningful `name`/`description`, full `space`, explicit `prefix`, `defaults: false`, `includePublicSpace: false`, `knowledge: "knowledge/index.md"`, and declared resource permissions. Use fully qualified services, fully resolved paths and `skipPrefix: true`; separate guidance reads from ordinary record writes. No new manifest fields.
- Separate setup/enrollment and ordinary scope manifests, with only necessary actions. Keep the original item's bound operation plan through approvals and restarts.

Mark each boundary pending, dispatched, verified, uncertain or conflict with actual observations. Dispatch state must be saved before mutation. An old hash or local success flag is not remote verification.

## 3. Obtain separate, exact authority

Keep discovery, provisioner and ordinary roles distinct. Reuse suitable existing profiles; otherwise create an unused role profile through [context selection](authenticate.md#1-select-and-retain-the-context), without changing defaults or copying credentials. Same owner/host, but setup authority must not leak into ordinary context. A narrow grant does not remove earlier broad authority. Protected readers remain read-only.

| Role | Necessary scope |
| --- | --- |
| Discovery | Account KV get/list on `applications/`, plus needed selected-app reads. |
| Enrollment | Account KV get/list on `applications/` and put on the single exact `applications/APP_ID` key; no account SQL/index writes. |
| KV provisioning | Get/put on the exact knowledge key; list on the prospective record prefix; get on the planned first-item key if one exists. No first-item write. |
| SQL provisioning | Read/schema on the exact database and get/put on the exact knowledge key. Use inspected command/server support; do not request admin merely for convenience. |
| Ordinary operation | Guidance get and only needed KV record-prefix get/list/put/del or SQL read/write. No registry put, protected-guidance put, schema or admin. |

Every consent manifest uses one explicit top-level full space, `defaults: false`, `includePublicSpace: false`, resolved paths with `skipPrefix: true` and the OpenKey-required capability metadata read on `""`. Follow [scoped consent](authenticate.md#3-complete-consent-through-a-supported-transport): setup normally expires in `1h`; additional authority preserves a valid primary login. Several spaces may need several approvals. Never broaden login to bypass missing hosting; use the [owner-enrollment boundary](authenticate.md#4-verify-and-resume-the-caller).

## 4. Recheck discovery and exact targets

After consent, refresh live discovery and the [canonical-record procedure](../quickstart/retrieve-data.md#canonical-record-decoding-cli-0100). A newly appeared compatible app should be reused after reconciling partial setup; preserve partial resources. Relevant malformed guidance remains a blocker.

Check the exact prospective registry key, knowledge key and applicable storage targets. Only explicit not-found is absence; denial/network failure is not. For KV:

```sh
"$TC_BIN" --profile "$SETUP_PROFILE" --host "$HOST" kv get "applications/$APP_ID" --space "$ACCOUNT_SPACE" --json
"$TC_BIN" --profile "$SETUP_PROFILE" --host "$HOST" kv get "$KNOWLEDGE_KEY" --space "$APP_SPACE" --json
"$TC_BIN" --profile "$SETUP_PROFILE" --host "$HOST" kv list --prefix "$RECORD_PREFIX" --space "$APP_SPACE" --json
"$TC_BIN" --profile "$SETUP_PROFILE" --host "$HOST" kv get "$FIRST_ITEM_KEY" --space "$APP_SPACE" --json
```

Omit the item read for setup-only. For SQL inspect the chosen database's real schema:

```sh
"$TC_BIN" --profile "$SETUP_PROFILE" --host "$HOST" sql query \
  'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name' \
  --db "$DATABASE" --space "$APP_SPACE" --json
```

Every subprocess uses the same selected durable home. In a reused SQL database, preserve unrelated objects and verify intended tables/constraints do not conflict; inspect only what is relevant after initial selection. Unexpected content at planned new targets is a conflict, not permission to overwrite. On continuation, compare schema, guidance and registration with the full saved plan and actual records. Inspect columns/types/nullability/keys/defaults/constraints/indexes as relevant; `IF NOT EXISTS` alone proves nothing. Do not silently rename targets, clean prefixes or drop partial tables.

## 5. Provision and read back each boundary

1. **Storage:** KV readiness is verified access to the empty prospective prefix and absence of exact new targets, with no creation write. SQL creates only the planned missing structure with schema authority, then verifies actual schema and zero rows in new tables. Matching partial structure on resume skips DDL. Preserve all existing data.
2. **Guidance:** only an absent exact root permits `kv put "$KNOWLEDGE_KEY" --file "$KNOWLEDGE_FILE" --space "$APP_SPACE"`. Read back raw content and compare it completely. Matching content skips put; differing content stops for reconciliation.
3. **Enrollment:** only after storage and useful guidance are verified, recheck live discovery and exact canonical key immediately before `account apps register "$APPLICATION_MANIFEST" --json`. An equivalent existing entry skips the write. Then list live and read the canonical record through the centralized procedure, comparing the complete manifest structurally, including metadata. Preserve other metadata. A cached registration hash, successful exit or incomplete decoded list cannot establish enrollment.
4. **Ordinary discovery:** return to the ordinary profile, never the provisioner. Verify selected context and granted scope with supported CLI capability inspection and actual reads; do not read credentials or use all-profile `status --json` as selected-context proof. A profile previously granted setup rights is not made ordinary by adding a narrow grant. Rediscover the registered app/root/resources under ordinary access, retaining the resulting bundle for execution.
5. **Original operation:** continue [the requested operation](../quickstart/tinycloud.md#5-perform-the-requested-operation) with its original dates, IDs and preconditions. Save exactly the requested item and verify it. An empty registration alone does not complete a storage request. Setup-only ends with an empty ready app, without sample rows or KV sentinels.

These are independent resource boundaries, not a transaction. Never delete partial resources as automatic rollback. Retain precise partial completion and uncertainty, keeping provisioner selections only in the private setup plan rather than ordinary connection hints.

## 6. Resume without duplicating or overwriting

Verify the bound context, live registry, relevant storage, root and canonical registration before a missing step. Remote state wins over saved flags. Matching state skips that mutation; conflicting state is preserved and reported. Do not allocate new IDs or blanket-rewrite after a lost receipt.

If the first item may have been dispatched, read its original identity under ordinary authority. Exact intended state reconciles success; definite absence permits retry with the same ID/values/original dates only if current preconditions hold. Unreadable or changed state remains unresolved. Preserve unrelated fields; KV get-then-put is not conditional update. New independent requests after completed setup receive their own identities where required and discover the app without the setup plan.

Report completion only after exact readback, otherwise the remaining gap and private continuation handle. [Optional recurring capture](../quickstart/conversational-data.md) has separate app-owned lifecycle and delivery requirements; it is not prepared or activated by this ordinary creation recipe. Historical [creation validation](../docs/app-creation-validation.md) records its own tested revision and limitations, not acceptance of this rewrite.
