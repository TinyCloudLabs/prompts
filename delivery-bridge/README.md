# Native delivery bridge

This local bridge supports **configured Codex app-server mode**, tested with Codex CLI **0.153.4** on October 1, 2026. It receives the original human submission, waits for Codex's native `userMessage` notification, and exposes the binding during execution through a dynamic tool. It does not scrape transcripts or infer identity from message text. Plain Codex CLI/TUI/desktop sessions, OpenCode and Claude Code are **pending** for automatic capture with this implementation.

The bridge is a delivery component, not a TinyCloud writer. Activation still needs the selected account/app, exact grants, compatible maintained guidance, storage verification, and the consumer's working write/readback path. A remote active intention alone does not configure a client or make the skill discoverable.

## Install and configure

Requires Node.js 22+ and a separately installed, authenticated Codex CLI. No Node packages are required. Retain an immutable **complete source checkout** of the same prompts commit as the fetched guide and installed skill; copying only `SKILL.md` loses relative references and the writer guard. Use an existing immutable source revision; do not substitute an invented release URL or mix files from different commits.

For a published guide, take `GUIDE_COMMIT` from its full 40-character immutable URL, and choose a **new destination**:

```sh
git clone --no-checkout https://github.com/TinyCloudLabs/prompts.git "$NEW_DESTINATION"
git -C "$NEW_DESTINATION" checkout --detach "$GUIDE_COMMIT"
git -C "$NEW_DESTINATION" rev-parse HEAD
node --test "$NEW_DESTINATION"/delivery-bridge/ledger.test.mjs "$NEW_DESTINATION"/delivery-bridge/codex-client.test.mjs
```

Check the printed revision against the guide; stop on any failure. Do not overwrite an existing checkout or silently update installed user skills. Install the matching conversational skill through the pinned guide. Set the client instructions to its absolute `SKILL.md` path and the retained immutable source-root path, plus the already selected nonsecret TinyCloud connection context. Protect the separate delivery state directory (0700 directory, 0600 files); it contains human text and planned values, never signed authentication responses or credentials. Back it up with the task's private continuation state.

A minimal embedding, run by the configured terminal/client receiving human input:

```js
import { CodexDeliveryClient } from '/ABSOLUTE_PINNED_SOURCE/delivery-bridge/codex-client.mjs';
const client = await CodexDeliveryClient.open({
  directory: '/PRIVATE_DURABLE_STATE/this-conversation',
  onText: text => process.stdout.write(text),
});
try {
  const threadId = await client.start({
    cwd: '/SELECTED_TASK_DIRECTORY',
    instructions: trustedConfiguredContext, // Skill/source paths and selected nonsecret context.
    sandbox: 'workspace-write',
    // threadId: savedNativeThreadId, // Only to resume this bridge's own known thread.
  });
  const result = await client.submit(humanText, { timezone: 'Europe/Lisbon' });
  // Persist/display threadId and result.delivery.event_id for explicit continuation.
  // result.status must be completed; this alone does not establish a TinyCloud write.
} finally {
  await client.close();
}
```

The embedding must distinguish direct human submissions from summaries, tool output and imported context. Only direct text goes to `submit`; injected instructions belong in trusted configuration. The current mode accepts one text input at a time; it does not support concurrent steering, attachments, forked sessions or arbitrary external transcript imports. Do not re-send an uncertain submission as new text. A separately submitted identical human sentence is a new observation.

`start` passes through a chosen `model` when supplied; otherwise it preserves Codex's configured default. `sandbox` supports Codex's actual modes, including `danger-full-access` for a separately authorized test environment. No permission widening is implied by installation. Runtime approval requests that require a client UI are rejected; preserve pending work and use the supported terminal/browser callback consent route. Authentication responses must never be passed into these tools or stored in the ledger.

App-server does not support the `codex exec --ignore-user-config` flag. The embedding retains installed runtime authentication/configuration. Optional `serverArgs` accepts explicit app-server flags/`-c` overrides; it does not promise an isolated configuration. An empty `mcp_servers` override merges configuration and does not remove inherited servers. The bridge starts one private stdio process and `close()` terminates only that child. It never attaches to the shared daemon or lists unrelated sessions.

## Model-visible contract

The application installs three tools on `thread/start`. Codex restores them when resuming that thread. The **server request** supplies `threadId` and `turnId`; model arguments cannot select the delivery.

1. `tinycloud_delivery_context({})` returns `format: "tc-delivery/v1"`, `event_id`, `native: {thread_id, turn_id, message_id}`, original text/receive time/local date/timezone/runtime timestamp, and the saved plan if present. The bridge's human receive time fixes “today”; runtime time is retained separately. The native tuple comes directly from `item/started`, never a generated UUID or text hash.
2. `tinycloud_delivery_plan({items: [...]})` freezes the complete ordered original-message plan **before write consent**. Each item contains `action: "create" | "correct"`, an exact `target` with `host`, `owner`, `space`, `app`, and either KV `key` or SQL `database`/`table`; `occurrence_date`; and `values`. Include all payload/precondition/readback context needed by the selected app in this object. Item order is fixed by the original human message. No mutation is performed by this tool.
3. `tinycloud_delivery_dispatch({item_id: "1"})` durably records/returns `first_dispatched_at` immediately before dispatch. Retain it on retries. Corrections preserve the original record's capture timestamp; this timestamp describes the correction's dispatch.

For a create, the bridge returns `source_key = event_id + ":item:" + ordinal` and `operation_id = source_key + ":create"`. The default `record_id` is the same source string. If an existing app requires a UUID record ID, allocate that **record ID only** once and pass it as `record_id` in the frozen plan; it is never native provenance. Derive a KV key from the known source/ordinal or this app-compatible record ID **before freezing**, following the app's documented key encoding. Do not use an arbitrary UUID where an app requires native source identity or reinterpret incompatible guidance.

A correction supplies the original `source_key`, original `record_id` and `expected_revision` in its plan. Its new operation ID derives from the correction message's own native tuple/item ordinal. The plan retains both identities. The bridge does not guess which earlier item a correction refers to; ambiguous corrections need clarification.

Read the existing plan first. Repeating a plan must retain its exact item payload, order, target and precondition. Freeze does not grant permissions, validate app schemas or make operations atomic. Follow [the storage contract](../skills/tc-conversational-data/references/storage-contract.md) and [SQL reconciliation](../skills/tc-conversational-data/references/sql-patterns.md). Preserve a later correction when an earlier creation event replays: read by source/record, recognize the existing observation, and do not overwrite it with the old create payload. Use operation history where the app supports it.

Lifecycle transitions use a separately persisted private plan; `tinycloud_delivery_plan` accepts observations/corrections only. A lifecycle event can therefore have `plan: null` in this ledger even after its transition completed. Read its verified context and recover the transition plan by a deterministic event-based locator. The exercised single-transition pattern is `<action>-<sha256(event_id)>.json` in the retained private operation directory. Bind and verify the exact owner, host, full space, app, intention locator/ID, action, native event ID/tuple, original request/date/timezone, frozen operation UUID, expected revision/state and intended result. Persist this plan before consent or dispatch, retain its first-dispatch timestamp, and preserve its directory with the bridge state. These are application-side continuation files, not a new tool or wire schema.

For lifecycle replay, reuse the frozen UUID and expected revision; read current remote transition history under the shared writer guard. A matching completed operation is a no-op that preserves later transitions. An absent operation permits the original transition only if its frozen precondition still matches. Missing original binding/plan, conflicting history or a failed read leaves replay pending, never a newly allocated transition. In particular, an old stop must not undo a later resume. The bridge retains native identity but does not enforce recovery of these separate plans; follow [the lifecycle contract](../skills/tc-conversational-data/references/intention-lifecycle.md#transitions-and-readiness). This clarification alone establishes no additional client or remote-storage acceptance.

## Consent, restart, replay and failures

Before any model-visible metadata is returned, the bridge persists the native binding using a synced private file and atomic rename. It retains original dates/timezones and frozen item plans across consent and process restarts. Directory `client.lock` serializes this bridge's local ledger; it does **not** serialize TinyCloud writers. Every actual interactive/background write must use the same host/owner/space [writer guard](../background-capture/README.md), sharing its guard directory on one machine. This is cooperating single-host serialization, not distributed exclusion.

To continue a **known** delivery, resume `delivery.native.thread_id` through `start({threadId: ...})`, then call `client.replay(delivery.event_id)`. Replay starts a `toolOutput` turn and binds it to the retained original native event; it does not manufacture a new human message. This works after consent, an uncertain write, or a completed event that needs readback. Do not infer replay from equal text or values. The embedding should expose a “continue this pending item” action that already carries the saved event identity; users should not need to type technical IDs.

If the process dies after submitting text but before saving a native binding, the ledger retains an **unknown pending delivery** and refuses another submission. No automatic transcript search, text match, invented ID or blind resend repairs it. Keep capture pending and reconcile the task-owned runtime submission/remote effects through a separately reviewed recovery procedure. If the binding exists, replay uses that binding. A leftover lock is never automatically stolen; verify the task-owned writer has exited before manually removing only its lock directory. Storage read failures keep outcomes unknown.

The library trusts its embedding and private state directory. It is not an authorization boundary against another process running as the same OS user. Only bridge-owned native notifications are trusted; a `user` role in imported JSON is insufficient.

## Verification and supported outcomes

Run offline tests with:

```sh
node --test delivery-bridge/ledger.test.mjs delivery-bridge/codex-client.test.mjs
```

Run the opt-in native identity probe using the installed Codex login:

```sh
TC_NATIVE_TEST=1 node --test delivery-bridge/codex-client.test.mjs
```

The native probe creates only task-owned synthetic threads, instructs the agent to use only the delivery context tool and verifies the observed tool calls, submits two identical self-reports, closes/restarts app-server, resumes the known thread and replays the first delivery. It checks actual model-visible native identity, distinct identical submissions and original identity on restart replay. It does not connect a TinyCloud owner or establish hosted storage, human consent, generic capture, a fresh public-guide entry, or no-URL app discovery. Those need separate acceptance against selected apps. Unit tests additionally cover mismatch/injected-message rejection, multiple items, frozen plans, unknown-delivery fail-closed behavior, corrections and durable dispatch time.

| Client/mode | Outcome |
| --- | --- |
| Codex 0.153.4, this configured app-server embedding | Native execution + distinct identical input + restart/replay identity probe passed. Experimental protocol; retest when upgrading. |
| Stock Codex CLI/TUI/desktop or guide URL alone | No installed native bridge in that mode; recurring capture remains pending. Existing explicit `agent-task:` one-off mode remains available where app guidance permits. |
| OpenCode 1.18.31 | Stored message/part IDs were observed in prior synthetic audit, but live association/transport-replay integration is not implemented here. Pending; no cross-client pass. |
| Claude Code 2.1.234 | This bridge is not integrated. Prior synthetic attempt stopped at expired client OAuth; no native delivery or TinyCloud compatibility pass. Pending. |

Configured no-URL use requires this embedding to load the pinned skill, selected context and app discovery instructions. It is a separate case from a fresh unconfigured guide-URL request. The bridge does not automatically configure unrelated projects or recover intentions without the account/registry read path.

Protocol sources: [official Codex app-server documentation](https://learn.chatgpt.com/docs/app-server) and the installed `codex app-server generate-json-schema --experimental` output for version 0.153.4. The implementation uses runtime `item/started`, `turn/started`, `item/tool/call`, `turn/completed`, `thread/start`, `thread/resume` and `turn/start.toolOutput`. Dynamic tools and protocol fields are experimental.
