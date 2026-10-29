This is how an agent posts requested cards to your TinyCloud Home feed, receives your answers, and reports what it did.

# Creating a post

## Before you start

This is the SQLite feed cutover draft, not a claim that the deployed guide or published CLI already supports it. Published `@tinycloud/cli@1.5.0-beta.25` does **not** contain these feed commands. Use the reviewed feed-enabled CLI and SDK build paired with the corresponding Home build; `tinycloud feed --help` must expose the commands below. Do not guess a package version or install a beta tag as proof of support.

The SDK's public feed contract is `@tinycloud/sdk-services/feed`. The guide, installed skill reference, and Home's “Creating a post” knowledge must switch together after the reviewed SDK release and Home dependency pin. Until that coordinated cutover, leave the deployed guide unchanged. Do not create a second canonical KV feed or teach parallel KV/SQLite posting.

Post only what the owner requested, including an explicit standing instruction. An answer expresses the owner's decision; it does not grant extra storage, release, deployment, or spending authority.

## Connect the actual agent once

Use an existing authenticated **owner** profile with posture `owner-openkey` or `local-owner-key` for provisioning. An existing `delegate-session` bot is not an owner provisioner. Do not use `init --key-only`, change a bot's posture, or broaden its grant to work around missing owner authority.

Create the bot's delegated profile on the intended node:

```sh
tinycloud profile create feed-weight --posture delegate-session --operator agent --host "$NODE_ORIGIN"
```

Use the actual `did` printed by that command as `AGENT_DID`. `NODE_ORIGIN` is the node used by the owner's Home deployment. A profile name, label, or agent token is not a DID and conveys no authority.

With the owner's existing profile, connect one stable token to that exact agent:

```sh
tinycloud --profile "$OWNER_PROFILE" feed connect --agent weight --to "$AGENT_DID" --label "Weight bot" --expiry 24h
```

`feed connect` initializes two distinct databases, activates one bundled delegation, and records the owner-controlled agent/resource binding. Give only the returned `delegation` object to the intended agent as a private JSON file, then import it into the same bot profile:

```sh
tinycloud --profile feed-weight auth import ./feed-grant.json
```

Check the actual returned scope and expiry. A generated profile, pending request, or saved JSON file is not an activated owner grant. Stop on refusal, expiry, or a different owner/agent/resource binding; do not replace it with broader authority.

For token `weight`, the resources in the owner's `applications` space are:

| Resource | Agent authority |
| --- | --- |
| `xyz.tinycloud.tinychat/feed/feed_output_weight` | `tinycloud.sql/read`, `tinycloud.sql/write` |
| `xyz.tinycloud.tinychat/feed/feed_responses_weight` | `tinycloud.sql/read` only |
| Hooks path `sql/xyz.tinycloud.tinychat/feed/feed_responses_weight` | `tinycloud.hooks/subscribe` only |
| `xyz.tinycloud.tinychat/home_feed` | None: owner registry, settings and private state |

The full database names matter. Do not substitute short names, another agent's database, or a wildcard hook. The Home/owner provisioning namespace is `xyz.tinycloud.tinychat/feed/`, **including its trailing slash**; agent grants name the exact resources above. Only the owner initializes schemas. Agents get no schema authority, response writes, owner-registry access, or cross-agent access.

The registry label is display text; the authenticated agent DID and signed grant determine authority. Private notes, partial task ticks, read/snooze state and selector preferences belong only in the owner's registry/state, not agent handling records.

## Publish a durable card

Save a card as JSON and publish it through the bot profile:

```sh
tinycloud --profile feed-weight feed publish --agent weight --file ./card.json
```

For example:

```json
{
  "cardId": "8e8513f5-e1f1-4a21-bb03-f3bda9075640",
  "revision": 1,
  "issuanceId": "4dcbb155-ef57-4e50-bdcf-48156599939b",
  "kind": "ask",
  "needsResponse": true,
  "title": "Prepare a review of the draft?",
  "body": "I can prepare a short review, or skip it.",
  "choices": [
    {"id": "review", "label": "Prepare the review"},
    {"id": "skip", "label": "Skip"}
  ],
  "urgency": 1,
  "createdAt": "2026-10-29T12:00:00.000Z"
}
```

Generate fresh full IDs for a new card/issuance; do not reuse these example IDs. Persist `cardId`, positive `revision`, and `issuanceId` before publishing. Retry an identical issuance with the same identity and content. A correction or re-ask is an explicit new revision/issuance or linked follow-up, not a silent edit of the existing question. Choice IDs are stable identifiers, not their display labels.

Use `needsResponse: false` for information. Information must not masquerade as unanswered work. Preserve applicable typed payloads, source/report links, recommendation versus default, expiry and issuance windows; do not turn every kind into a generic ask. Never put private codes in titles, bodies, links or other visible fields.

The feed API refuses changing an existing issuance's content. The underlying output SQL write grant is **not** an add-only capability: do not claim it cryptographically prevents an authorized agent from modifying its own database. Never use raw SQL to overwrite or delete card/handling history.

## Answers, messages and private payloads

Home saves an owner's inline answer in that agent's separate response database. An owner can also use:

```sh
tinycloud --profile "$OWNER_PROFILE" feed respond --agent weight --file ./answer.json
```

An answer carries its own durable full response ID and the exact question identity:

```json
{
  "responseId": "f974086c-0f6a-4a6c-a74b-ed3833d4bf9a",
  "cardId": "8e8513f5-e1f1-4a21-bb03-f3bda9075640",
  "revision": 1,
  "issuanceId": "4dcbb155-ef57-4e50-bdcf-48156599939b",
  "kind": "answer",
  "choiceId": "review",
  "createdAt": "2026-10-29T12:01:00.000Z"
}
```

Retain the same `responseId` when retrying the same saved answer. An explicit replacement uses a new response ID, `kind: "followup"` and `supersedesResponseId` identifying the earlier response. It does not promise cancellation of work already accepted or performed. Full card/revision/issuance/response identities govern handling; short aliases are display/convenience references only.

For conversation or context without answering a card, use `feed message --agent weight --file ./message.json` with the owner profile:

```json
{
  "responseId": "9a58e6d5-e09b-41d5-9252-43112d7d706c",
  "cardId": "8e8513f5-e1f1-4a21-bb03-f3bda9075640",
  "revision": 1,
  "issuanceId": "4dcbb155-ef57-4e50-bdcf-48156599939b",
  "kind": "message",
  "text": "Context only; this is not an approval.",
  "createdAt": "2026-10-29T12:02:00.000Z"
}
```

A message never answers, supersedes, or clears a card. Keep private owner notes and partial task state in owner-only storage instead of sending them as messages.

For an approval code or other private typed data, attach a private file to `respond` or `message` with `--payload-file ./private-payload.json`. Its envelope is `{ "type": "...", "version": 1, "data": ... }`; `type` is a nonsecret format identifier, `version` is a positive integer, and `data` is the private JSON value. Protect the file and grant material from other users.

Do **not** put the code in header `text`, choice IDs, handling details, notifications, URLs, or ordinary stdout/stderr. Response headers can contain visible text; only `payloadType` and `payloadVersion` describe the private payload there. The intended authorized agent reads its data explicitly:

```sh
tinycloud --profile feed-weight feed payload --agent weight --response f974086c-0f6a-4a6c-a74b-ed3833d4bf9a --card 8e8513f5-e1f1-4a21-bb03-f3bda9075640 --revision 1 --issuance 4dcbb155-ef57-4e50-bdcf-48156599939b
```

That command intentionally returns private data. Do not forward its output into a generic notification, transcript, telemetry event, or error message.

## Deliver responses to a real runtime

Use Bun or Node.js **22.13+** for the durable local SQLite handoff. Configure the existing runtime's real durable-inbox adapter as a JSON argv array in `RUNTIME_ARGV_JSON`; a logging/printing command is not an acceptance adapter.

```sh
tinycloud --profile feed-weight feed watch --agent weight --recipient weight-runtime-v1 --runner "$RUNTIME_ARGV_JSON" --handoff ./state/feed-weight.sqlite
```

`--recipient` is a stable runtime key for the local handoff ledger. Keep it and the SQLite file across restarts. It is not a substitute for the authenticated agent DID or a legacy logical-recipient mapping.

The watcher consumes the authorized subscription before draining rows. Server `ready` means the broadcast subscription exists; only then does the first durable catch-up run. SSE events are wakeups, coalesced into durable response-row drains, not durable replay or execution evidence. Reconnect and ticket renewal reconcile rows again, including offline answers and answers arriving during catch-up. Default renewal is five minutes while connected; outages extend recovery. There is no fast idle SELECT polling loop.

The runner receives allowlisted response-header JSON on stdin, with `shell: false`. Use a trusted argv array, not a shell command or `sh -c`. Exit **0 only after the external runtime has durably accepted that response ID**. Printing JSON, receiving an SSE event, or placing it in volatile memory is not durable acceptance.

An interrupted or ambiguous send remains **unconfirmed**. Do not automatically resend it, erase its ledger, or change recipient keys to bypass deduplication. Reconcile the real runtime's durable receipt before any explicit retry. Execution deduplicates by full `responseId`; exactly-once external effects are not promised. Check the exact card revision, issuance and applicable approval/expiry rules before acting.

Legacy logical recipients require their own explicit owner-approved mapping to runtime recipients. Never fall back to the current profile DID or broadcast an unresolved target. Unknown targets stay held.

## Report receipt and outcome separately

After durable runtime acceptance, the agent publishes a handling record in its own output database:

```sh
tinycloud --profile feed-weight feed handling --agent weight --file ./handling.json
```

```json
{
  "handlingId": "2853ce62-60d1-4235-89f8-632c19885746",
  "responseId": "f974086c-0f6a-4a6c-a74b-ed3833d4bf9a",
  "cardId": "8e8513f5-e1f1-4a21-bb03-f3bda9075640",
  "revision": 1,
  "issuanceId": "4dcbb155-ef57-4e50-bdcf-48156599939b",
  "phase": "acknowledged",
  "createdAt": "2026-10-29T12:03:00.000Z"
}
```

Use a fresh handling ID for a terminal `succeeded` or `failed` outcome, retaining the same complete response/question identity. Publish success only after the actual work succeeds; include a nonsecret result in `detail`. Do not rewrite the owner's response.

| Home state | Evidence |
| --- | --- |
| Answer saved | Owner response committed durably |
| Agent received | Agent acknowledgement for that exact response after durable runtime acceptance |
| Completed / Failed | Agent terminal outcome for that exact response |

The watcher does not manufacture the acknowledgement or outcome. A saved answer is not received work, and received work is not completed work. Profile/author labels are display metadata, not authority.

Use `feed show <full-card-id> --agent weight` to inspect the current answer, acknowledgement and outcome separately; messages do not become the current answer. `feed responses --agent weight --after 0 --limit 100` reads an ordered history page, including messages. Page with the returned durable sequence; do not use timestamps or short aliases as execution checkpoints.

## Migration and publication boundaries

All-ten-kind parity and lossless import remain work in progress: `ask`, `task`, `approval`, `incident`, `work`, `ship`, `order`, `claim`, `hold`, `progress`. A proven first loop is not proof of every typed renderer, issuance window, approval-code workflow, thread receipt or migration case.

Preserve original typed payloads, relationships, IDs and per-recipient delivered/pending/held/unconfirmed state during migration. Import must not trigger historical approvals or replay delivered/unconfirmed events. Do not read a live board, fence writers, delete records, broaden production grants, or enable two canonical stores as part of following this guide.

Publish this guide and its matching Home knowledge only with the actual reviewed/released SDK and corresponding Home pin. Keep the existing deployed guide until that single coordinated cutover; no invented installed version or premature migration-complete claim.

The installed reference copy of this section is [creating-a-post.md](creating-a-post.md).
