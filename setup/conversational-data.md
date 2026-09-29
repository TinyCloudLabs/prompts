# Prepare the fixed conversational-data scope

This is an owner-side preparation recipe for `tc-conversational-data` 0.1.0, CLI 0.10.0 and node 1.17.1. It creates the existing baseline contract, with empty records and no active tracking intentions. It does not authenticate a user, install a message-ID adapter, or make the conversational agent an administrator. Complete authentication using the installed `tc-cli/AUTH.md` first.

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

Prepare local `fitness.md` and `finance.md` files containing the actual database/table/column mapping, no active intentions, and the installed contract's semantics: kg weight, hours of sleep on the local wake date, EUR integer cents, unknown category as NULL, no undocumented conversions, event date distinct from UTC capture time, retained provenance on correction, stable client operation identity and expected-revision updates. These become durable domain guidance. They must contain no credentials or instructions to widen access.

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

## Grant only the conversational scope

Use the installed core skill's scoped-login/delegation flow for the intended identity. The permission set is SQL read/write for the two exact flat database resources and KV read/write/list only under the selected private prefix. Do not grant SQL admin/schema authority to the conversational agent. Do not substitute the generic note manifest or a whole-space grant. Human consent, when used, stays in the supported browser/CLI return channel.

Verify the delegated profile by actually reading the catalog, both guidance keys, and both schemas. Independently create and read an owner-only SQL sibling and a KV sibling outside the prefix, then verify that the delegated profile gets an explicit authorization denial on those same existing resources. Missing resources do not prove scope enforcement.

Pass only nonsecret context to the client: CLI path, delegated profile, host, expected owner/full space, approved domain-to-database mapping, private prefix and catalog locator. Supply local message timezone and stable native message/item/operation metadata through the client's supported integration. Credentials, signed grants, owner setup commands and prior conversation answers do not belong in the bootstrap.

Return to [the conversational quickstart](../quickstart/conversational-data.md#4-continue-the-conversation) with the original user request. Owner preparation is a separate step; the installed workflow does not provision these resources automatically.
