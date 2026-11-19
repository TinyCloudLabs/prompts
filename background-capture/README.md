# Local background import

This route imports an explicitly selected local JSON feed into a prepared TinyCloud KV app. A detached Node process polls the directory after the command that started it exits. No open chat, model call, browser, or agent session is required. It is a local process, not a deployed service: it stops when the machine shuts down and needs an explicit resume or an independently configured OS supervisor after reboot.

Source choice and connection remain user decisions. Do not connect email, a finance account, or another real source from “track automatically” alone. The implemented source is an immutable structured import feed; its producer must assign durable source/event/item identifiers and supply resolved occurrence dates, timezones, units/currencies and unknown values. No text extraction, inferred categories, native chat identity, or finance/email connector is provided here.

Existing execution facilities were inspected before adding this adapter. The prompts repo had no executing import path; the installed Smithers CLI offers generic `cron add/list/rm/start`, and available hosted tools offer Pages/Sites scheduling. Those facilities do not supply this app's source mapping or scoped TinyCloud writer. This worker can be supervised by an existing local service manager without adding an agent orchestration stack. No schedule or deployment outside the local worker is installed automatically.

## Prepare an explicit app contract

Use existing app discovery/setup and scoped authentication. This route requires an app that explicitly adopts `tinycloud-import-record/v1`; it does not reinterpret or migrate another app's records. A setup-authorized actor creates a separate JSON import contract under protected knowledge and an ordinary intention outside knowledge, then reads both back. Existing schemas, registrations and guidance remain intact.

The exact contract value is:

```json
{
  "format": "tinycloud-import-feed/v1",
  "sourceId": "SELECTED_IMPORT_SOURCE",
  "recordsPrefix": "APP_PREFIX/records/",
  "intentionKey": "APP_PREFIX/intentions/import.json"
}
```

The intention contains its stable ID and `status: "active"`. The surrounding app owns pending/activate/stop/resume semantics. A worker checks that intention before every attempt. Remote intention state alone never means a job exists or runs. Stopping this job does not stop an independently active interactive intention; stopping the remote intention blocks the job as well. Both routes preserve records.

Use a **dedicated ordinary import profile**, authenticated through the supported shared flow with one exact scoped session. The worker checks `tc status`, selected owner/host/full space, stored contract, and active intention. Its permission set must be exactly:

| Resource in the selected full space | Actions |
| --- | --- |
| Exact records prefix, ending in `/` | `tinycloud.kv/get`, `tinycloud.kv/put` |
| Exact JSON contract key | `tinycloud.kv/get` |
| Exact intention key | `tinycloud.kv/get` |
| Capability metadata | `tinycloud.capabilities/read` |

Set `defaults: false`, `includePublicSpace: false`, and `skipPrefix: true` for these resolved resources in the consent manifest. No list/delete/schema/admin/registry or protected-guidance write authority is needed. Profiles with extra authority, missing authority, active additional delegations or an expired session fail readiness. The worker never authenticates, refreshes via a hidden owner credential or widens permissions. Local session inspection is a prerequisite check; server enforcement and each actual read/write/readback remain authoritative. Expiration or denial blocks capture with an observable error until that dedicated profile is renewed through supported consent.

## Configure and run

Requires Node.js with ES modules and the published TinyCloud CLI `0.10.0` API. Validated using Node `25.6.1`, CLI `0.10.0` and node `1.17.1`. No npm dependencies or root signing key are used by the worker. Keep credentials in the CLI profile store. Keep the following configuration, source directory, job state and guard directory private (`0700` directories, `0600` files); config references credential locations and contains no signing material.

```json
{
  "format": "tinycloud-import-job/v1",
  "cliCommand": ["/ABSOLUTE/PATH/TO/tc"],
  "tcHome": "/PRIVATE/CLI_HOME",
  "profile": "selected-import-writer",
  "host": "https://SELECTED_NODE",
  "owner": "EXPECTED_OWNER_DID",
  "space": "EXACT_FULL_SPACE_URI",
  "sourceId": "SELECTED_IMPORT_SOURCE",
  "recordsPrefix": "APP_PREFIX/records/",
  "contractKey": "APP_PREFIX/knowledge/import.json",
  "intentionKey": "APP_PREFIX/intentions/import.json",
  "sourceDirectory": "/PRIVATE/IMPORT_FEED",
  "stateDirectory": "/PRIVATE/IMPORT_JOB_STATE",
  "guardDirectory": "/PRIVATE/SHARED_WRITER_GUARDS",
  "pollMs": 1000,
  "backlog": "drain-on-resume"
}
```

The source directory must already exist. Use the verified host origin with no trailing slash. Bind configuration before starting; changes after first use are rejected against the saved binding. Restore the original config to stop or recover an existing job. Do not point an existing job at another owner/source/prefix.

```sh
node background-capture/runner.mjs start /PRIVATE/job.json
node background-capture/runner.mjs status /PRIVATE/job.json
node background-capture/runner.mjs stop /PRIVATE/job.json
node background-capture/runner.mjs resume /PRIVATE/job.json
```

`start`/`resume` verify readiness and launch a detached worker. Repeating either reconciles the same job. `status` reports desired state, observed process presence, phase (`running`, `blocked`, `stopping`, `stopped`, `interrupted`), heartbeat, last error, attempts and per-file receipts. Process presence is local PID liveness, not remote capture proof; inspect heartbeat/errors and independent record readback. Private diagnostics are in `stateDirectory/worker.log`. A running process with a failed source, grant or app check is blocked, not successfully capturing.

`stop` serializes behind the in-flight mutation, persists stopped state and waits for worker exit. Only a successful stop result establishes that the job stopped; a lock/deadline error requires inspection and retry. **Backlog behavior is explicit:** first start imports all queued files; stopped arrivals remain untouched; resume drains every still queued file in filename order. No files are deleted or skipped. This includes source events queued while the remote intention was stopped. Choose this behavior with the user before enabling the job; it is not a conversational backfill policy. To choose a different backlog policy, leave this route pending until implemented and reviewed.

## Feed identity and corrections

The producer writes a temporary file then atomically renames it to a unique, lexically ordered `.json` filename. Publish whole regular files of at most 1 MiB. Keep published files immutable and retained. Filenames are queue positions, **not record identity**. Publish prerequisite creates before corrections. Inserting an earlier file while another is pending blocks until that original pending event can reconcile; do not reorder a live queue.

```json
{
  "version": 1,
  "sourceId": "SELECTED_IMPORT_SOURCE",
  "eventId": "source-purchase-482",
  "itemId": "line-1",
  "kind": "create",
  "occurrence_date": "2026-09-30",
  "timezone": "Europe/Lisbon",
  "values": { "amount_minor": 650, "currency": "EUR", "category": null },
  "source_message": "Imported expense supplied by the selected source"
}
```

The key is the configured records prefix plus a SHA-256 encoding of the **source/event/item ID tuple**, plus `.json`. This is stable imported-source identity; it is neither a content-hash duplicate heuristic nor a claimed native chat ID. Separately submitted equal values with different source IDs create distinct records. Replaying the same operation with changed content fails as a conflict. The producer's source-ID guarantees are required for real collection; synthetic IDs validate only this import protocol.

A correction has its own event/item identity, `kind: "correct"`, `target: {"eventId":"source-purchase-482","itemId":"line-1"}`, and `expectedRevision: 1`. Supply the complete corrected `values`, occurrence date/timezone and correction description. Read the unique target first; never infer which of several identical purchases to edit. Values are preserved as structured data without conversion or domain inference.

Records contain the immutable original source identity, original source description, original capture timestamp, current values/date/timezone, revision, last operation identity and an append-only `history` of operation IDs, payload fingerprints and snapshots. Corrections increment the revision and retain earlier values. Replaying an original event after correction recognizes its earlier applied operation and preserves the corrected state. Stale corrections fail. Deletion/history compaction are deliberately unsupported because removing replay evidence could recreate or overwrite an edited record.

Before dispatch, the worker atomically saves the pending file identity, a job-wide event-to-payload binding and first-dispatch UTC clock in private state. That binding also rejects retargeting a correction to another record under the same operation identity. Keep one retained state directory/job for each source and target; recreating it under a new directory does not preserve that job-wide guarantee. Per-record remote history is not a global operation index. A committed write whose receipt is lost is read back by the same original identity. Proved absence permits that same write; failed reads remain errors. A local receipt is persisted only after exact remote readback (or recognition of an already applied operation). Restart preserves pending identity/clock, bindings and local receipts. The durable feed plus remote history also reconcile an event whose local receipt was lost. A missing pending source file stays blocked, including when the feed is empty; restore its original payload. State replacement is atomic for process interruption; this is not a power-loss durability or cross-resource transaction claim.

## Shared local writer guard

Every interactive or background mutation touching this app must use the same canonical owner/host/full-space context and the **same local guard directory**. Wrap the whole read/reconcile/write/readback transaction, not just each `tc` call:

```sh
node background-capture/runner.mjs guard /PRIVATE/job.json -- node /PRIVATE/correct-import-record.mjs
```

JavaScript consumers can import `withWriterGuard` from `writer-guard.mjs` and call `withWriterGuard({directory, owner, host, space}, async () => { /* whole transaction */ })`. For interactive corrections to imported records, queue a correction event through the same job so its identity binding, revision check and history are preserved. A custom tool must not call `runner guard` recursively from inside an already-held guard.

Atomic directory creation serializes cooperating local processes across profiles and jobs. Locks wait up to 30 seconds and release on normal completion/errors. No stale lock is automatically stolen. After an unclean process death, inspect `holder.json`, PID/command and machine ownership, ensure every possible holder and child is gone, and only then remove that exact abandoned lock and resume. Likewise inspect and remove an abandoned `stateDirectory/run.lock` before restarting a killed worker. PID reuse and suspended processes make age alone insufficient. Never remove a busy lock to make a test pass.

This mechanism provides no distributed exclusion, server compare-and-swap, protection from another device, or protection from writers that bypass it. Different guard directories or different host aliases do not coordinate. Keep those modes pending until a stronger protocol exists. Ordinary interactive agents must use this guard in the selected local mode; merely installing the conversational skill is not enforcement.

## Verification

```sh
node --test background-capture/*.test.mjs
# First start a NEW task-owned docs/validation/app-creation-fixture.mjs --keep.
node background-capture/acceptance.mjs /PRIVATE/FRESH_FIXTURE/fixture-context.json
```

Unit checks cover stable identity, multiple items, correction history, immutable-ID conflicts, pre-commit and lost-receipt retries, exact scope readiness, and guard serialization in separate processes. The acceptance harness uses a newly generated synthetic owner, an exact ordinary writer profile, real published CLI commands and an actual loopback TinyCloud node. A separate observer profile reads stored records. The starter process exits before source emission; no interactive client is open. Acceptance checks replay, distinct identical input, stop without write, declared resume backlog, fresh-worker correction preservation, deliberately lost write receipts and sibling denial. The harness always stops its own worker; the caller must also stop its fixture services.

These tests establish a local synthetic-import route. They do not establish a real finance/email connection, an unassisted hosted signup, native conversational event binding, production deployment, or reboot supervision. Select the real source, verify its identity/mapping guarantees, obtain exact scoped consent, and configure the desired local supervisor before enabling real collection.
