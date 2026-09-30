# First-use application creation validation

September 30, 2026. Validated locally and submitted in [PR #2](https://github.com/TinyCloudLabs/prompts/pull/2). No merge, deployment or hosted mutation was part of these creation tests.

The [general entry](../quickstart/tinycloud.md) now routes explicit storage requests through live discovery, reuse or [minimal private creation](../setup/create-application.md), and returns to the original item with ordinary permissions. The short local entry routes to that guide. Replace the path placeholder in this example:

```text
Add buy milk to my todos. Use TinyCloud: <absolute path to your local entry>
```

Later requests use the same entry and discover the remote app without a database name, setup plan or original conversation. This creates a logical private app, storage and maintained guidance; it does not build a frontend or deploy a service. The implementation is instructions over existing CLI commands. No production CLI/SDK change was necessary.

## Observed results

The [fixture](validation/app-creation-fixture.mjs) started with an empty application registry and hosted synthetic private/account spaces. It prepared no target app, schema or guidance. The [fresh-process runner](validation/run-app-creation-agent.py) launched ordinary Codex outside repository/playground ancestry, providing only a natural-language task, this revision's guide, nonsecret connection selections and a supported synthetic callback transport. Continuations additionally received their explicit private plan handle. The test process retained synthetic signing keys privately and delivered signed proof directly into the unchanged CLI's callback; proof material never went through agent chat or arguments.

| Case | Independently observed result |
| --- | --- |
| Baseline before this change | The old guide stopped at the empty registry and saved nothing. This reproduced the missing creation branch before testing the replacement instructions. |
| First todo | A fresh agent authored a KV app, complete v2 knowledge and exact permission manifests, registered it, switched to an ordinary profile and saved one open todo. Independent CLI reads found one app and exactly the requested item. |
| Second fresh session | With a new local state directory containing only ordinary connection hints, and the setup profile deleted, another agent discovered the same app and saved the second todo. Registration and guidance were unchanged. Exactly one item put occurred; missing permission was an ordinary exact-key grant, not setup authority. |
| Fresh ordinary operations | Separate fresh processes read the todos, changed the first title and completed it, then reopened it and deleted the second item. Independent reads checked retained ID/creation time, preserved unrelated item during editing, final open state and exact deletion. Registration and knowledge hashes remained unchanged. |
| Semantic reuse | A separate fresh agent reused a pre-enrolled “Errands” app with an unrelated ID. Exactly one new item was added; existing values, registration and guidance survived unchanged. This is reuse evidence, not new-app creation evidence. |
| No storage intent | Empty-registry read and hypothetical discussion created no storage, app, guidance, plan or write grant. |
| Discovery gaps | Actual registry denial, malformed canonical registration, potentially relevant missing guidance, and two materially ambiguous compatible apps all stopped without replacement or write grants. Missing guidance acquired only a read grant; ambiguity asked which app. |
| Exact scope | On the new todo app, ordinary access was denied for actual sibling KV/SQL reads and writes, guidance put and exact registry put. The protected reader was denied item writes. Separate real-node SQL probes established `read` + `schema` permits CREATE; `read` + `write` permits INSERT but denies CREATE. The new ordinary SQL profile was also denied schema creation on its own app database, guidance put and exact registry put. No account SQL index grant was supplied to agents. |
| Another new model | A fresh agent authored a SQL reading log from the natural book request, created its table and v2 guidance, and enrolled it. The original book was saved under ordinary SQL authority with its preallocated ID; both requested summary queries were verified. No target app/schema was supplied by the fixture. |
| Restart boundaries | Fresh continuations reused the original schema and guidance after a stop before registration. After an actual registration write lost its receipt, canonical readback established the same app with zero book records before the pending item proceeded. No duplicate app or schema was created. |
| Lost first-item acknowledgement | After the original item was stored, the test suppressed its receipt and marked only its local receipt uncertain. A fresh continuation read the same original row, confirmed the task and issued **zero remote mutation attempts**. Independent before/after snapshots were identical. See the precise simulation below. |
| Schema, knowledge and canonical conflicts | Fresh continuations preserved an unexpected table containing a sentinel, differing knowledge, and changed canonical manifest metadata. None mutated remote state or inserted the pending item. The harness restored only its own synthetic conflict injections between cases. |

The six guardrail cases and semantic reuse have [sanitized results](app-creation-negative-results.json) and a [reproduction helper](validation/app-creation-negative.py). Raw manifests, identities, records, CLI events, local plans and auth state stay in private temporary directories, outside shared reports.

The setup-only [storage-interruption test](validation/app-creation-storage-interruption.py) also passed: a fresh agent independently chose SQL for an empty cellar app; receipt loss stopped it just after CREATE, with no KV or registry change. Its fresh continuation reused the original schema with zero DDL attempts, wrote one root and one registration, and left zero records. The fixture's [actual CLI/server checks](app-creation-fixture-results.json) record exact schema authority and its empty starting registry.

The main creation, reuse, operation, conflict and retry checks have [sanitized agent results](app-creation-agent-results.json). Final main-fixture reads found exactly two agent-created apps, one remaining todo and one reading-log row, with the original synthetic siblings intact. Both disposable fixture processes and their nodes were stopped after verification.

## Test instrumentation limits

The first process-stop monitor allowed an in-flight helper to finish guidance; its observed boundary is after storage and guidance, before registration. A separate armed receipt-loss test established the exact post-CREATE boundary. An initial registration monitor matched a help command; independent readback rejected that attempt as evidence, help commands were excluded, and the actual registration interruption was rerun. Those initial attempts are not counted as passes.

For the lost first-item receipt case, the CLI receipt was suppressed, but an in-flight helper completed local verification before it stopped. The harness therefore discarded only the local verification receipt and marked that bound operation uncertain, retaining its stored row, original IDs and dispatch timestamps. This explicitly simulates a crash before durable acknowledgement; it does not claim an operating-system crash at an exact instruction. The fresh retry reconciled the original row without another mutation; the complete remote snapshot remained unchanged.

The first semantic-reuse observer assumed KV data was JSON text and failed on an already parsed object. The observer now handles both forms; a separately snapshotted fresh request verified one additional item and preserved the prior item. These are test-harness corrections, not production CLI changes.

## Regression and document checks

The existing [SQL/KV fixture](validation/general-operations-fixture.mjs) was rerun successfully: two registered models, live canonical decoding, CRUD/readback, ID reconciliation, reader-write denial, ordinary schema denial and preserved baseline rows. Those pre-enrolled apps prove regression only. The existing [monthly retrieval query probe](validation/retrieval-query-probe.py) also passed, including date bounds, units, counts and missing-month behavior. The earlier [hosted read result](general-operations-hosted-read-results.json) remains historical evidence; no new hosted trial was run here.

Local links/anchors, JSON examples, Python/JavaScript syntax and whitespace checks passed. The final check counts are recorded in `app-creation-static-results.json`. Installed CLI help verified auth login/request, KV put file input, SQL query/execute and application register commands. Reviewed CLI/core skill remains `0.10.0`; the fixture result records the actual node binary hash.

## Reproduce

Start a disposable fixture with an installed CLI package and compatible local node binary:

```sh
node docs/validation/app-creation-fixture.mjs /absolute/path/to/@tinycloud/cli /absolute/path/to/tinycloud --keep
```

Keep that process alive for synthetic callback signing. Its private fixture context supplies observer/log/stop selections; give the agent only the separate agent connection file. All test profiles must use that fixture's selected `TC_HOME`. Use the unchanged installed CLI through the fixture's test-only launcher, which logs invocations and opens synthetic consent URLs; it does not implement app provisioning.

```sh
python3 docs/validation/run-app-creation-agent.py \
  --connection /private/fixture/agent/connection.json \
  --guide /absolute/prompts/quickstart/tinycloud.md \
  --directory /private/new-fresh-process-directory \
  --state /private/task-state \
  --request 'Add buy milk to my todos.'
```

Use a different process directory for each run. For the second request supply only a new state directory with the ordinary nonsecret connection hints; do not copy setup plans or give app locators. [Independent snapshots](validation/observe-app-creation.py) read canonical KV, maintained guidance and actual data through the separate synthetic observer. Never provide those observer selections or snapshot contents to the fresh agent.

The [interruption monitor](validation/interrupt-app-creation-agent.py) arms one CLI receipt loss, watches an actual successful mutation (excluding help), and terminates the fresh process. Run it before the agent with the private fixture context, future process directory and stage `storage`, `guidance`, `registration` or `item`. Independently inspect the exact boundary before continuing with `--continuation /private/plan.json`. Do not count a successful tool exit, a monitor label or a cached registration hash as remote evidence. Stop only the exact fixture PID it reports after testing; it owns its node child.

## Limits and live gates

- Callback signing is synthetic. Hosted human setup/write consent and new hosting remain untested. These tests use already hosted synthetic spaces and do not establish a no-account first-run flow.
- Setup assumes one provisioner per owner/host/purpose across devices. The mandatory local guard serializes cooperating local sessions; it is not distributed exclusion. KV updates use the app's documented single-writer contract, not atomic compare-and-set.
- Plans bind explicit continuations, not independent redelivery of identical prompts. Different requests can create equal-valued records. No universal exactly-once claim is made.
- The denied-registry case stopped after the real server denial; it did not test consent rejection/recovery. Successful creation separately exercised scoped login and additional grants.
- Fresh-agent acceptance used Codex. Cross-client behavior, arbitrary app layouts, unsupported operations and concurrent writers are not established by these checks.
- No user record or hosted application was changed. The separate hosted fitness-guidance proposal remains unapplied; todo creation does not depend on changing it. Existing dirty work was retained.

## Changed paths for this task

- Local entry: the private caller entry outside this repository.
- Routing and starter: `quickstart/tinycloud.md`, `quickstart/tinycloud-prompt.txt`, `quickstart/retrieve-data.md`, `README.md`.
- New procedure and maintained guidance: `setup/create-application.md`, `references/application-knowledge.md`.
- Validation: this report; `docs/app-creation-agent-results.json`, `docs/app-creation-fixture-results.json`, `docs/app-creation-negative-results.json`, `docs/app-creation-static-results.json`; `docs/validation/app-creation-fixture.mjs`, `app-creation-negative.py`, `app-creation-storage-interruption.py`, `run-app-creation-agent.py`, `interrupt-app-creation-agent.py`, and `observe-app-creation.py`. The related conversational and retrieval changes are included in the same PR.
