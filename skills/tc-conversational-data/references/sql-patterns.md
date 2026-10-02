# SQL capture and reconciliation

Use the installed core CLI help for syntax. The patterns below assume the baseline `measurements` schema has been successfully inspected. Replace context/identifier placeholders from the trusted bootstrap and schema; bind values as a JSON parameter array. Illustrative IDs, dates, and measurements below are not user observations to save.

## Inspect with read authority

```sh
tc --profile PROFILE --host HOST sql query \
  'SELECT name, sql FROM sqlite_master WHERE type = ?' \
  --params '["table"]' --space SPACE --db DATABASE --json
```

Check the returned DDL and constraints, not merely whether the tool ran. An authorization error is a failed schema read. The tested node requires admin authority for `PRAGMA table_info`; use the supported `sqlite_master` query without requesting admin.

## Capture once

Before an insert, query the intended stable source/record ID:

```sh
tc --profile PROFILE --host HOST sql query \
  'SELECT * FROM measurements WHERE source_key = ? OR id = ?' \
  --params '["SOURCE_ITEM_ID","RECORD_ID"]' \
  --space SPACE --db DATABASE --json
```

A matching existing row is the prior capture. If it has since been corrected, retain that later state; redelivering the original observation is not a request to undo its correction. Compare original provenance and the relevant operation state. Conflicting source content, two different matching rows, or an unexpected revision require reconciliation before writing.

After a successful read proves this is a new item, use `sql execute`, not `sql query`:

```sh
tc --profile PROFILE --host HOST sql execute \
  'INSERT INTO measurements (id, source_key, occurrence_date, date_precision, timezone, captured_at, revision, last_operation_id, source_message, correction_message, metric, value, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)' \
  --params '["RECORD_ID","SOURCE_ITEM_ID","2026-01-14","morning","Europe/Lisbon","2026-01-14T09:15:00Z",1,"CAPTURE_OPERATION_ID","82.4 kg this morning.",null,"weight",82.4,"kg"]' \
  --space SPACE --db DATABASE --json
```

Build the parameters from the current message and actual capture clock. Retain the chosen IDs and attempted content across timeouts. Then query the same IDs and verify the resulting row before acknowledging success. If the response was lost but the intended row exists, no further insert is needed. If a successful lookup proves absence, retry the same intended operation using the same IDs. A failed lookup leaves the outcome unknown; stop automatic retries and report that uncertainty.

For expenses, use the inspected `expenses` columns and integer `amount_minor`, currency and category. Do not route an expense into `measurements` or create a new table to reuse this example verbatim.

## Apply a correction once

Read the target row first. If the target is ambiguous, clarify before any update. If `last_operation_id` already equals the correction operation ID, compare the intended corrected values and return the recorded outcome without another update.

Otherwise, use the observed revision as the expected revision. This example changes date and value while retaining the original capture/source fields:

```sh
tc --profile PROFILE --host HOST sql execute \
  'UPDATE measurements SET occurrence_date = ?, date_precision = ?, value = ?, correction_message = ?, revision = revision + 1, last_operation_id = ? WHERE id = ? AND revision = ? AND last_operation_id <> ?' \
  --params '["2026-01-13","morning",82.1,"That weight was yesterday morning, and it was 82.1 kg.","CORRECTION_OPERATION_ID","RECORD_ID",1,"CORRECTION_OPERATION_ID"]' \
  --space SPACE --db DATABASE --json
```

An affected-row count of zero is not a success acknowledgement. Read again and distinguish an already-applied operation from a revision conflict or missing target. A lost response needs the same readback. Verify corrected values, retained ID/source/capture time and exactly one revision advance. Never select a newer revision merely to force the same old correction through after a conflict.

The single `last_operation_id` supports the immediate replay tested in the trial. It cannot prove whether an older correction was applied before later operations. If that history is required, surface the limitation and reconcile the requested outcome; do not invent an operation ledger or migrate the schema during capture.
