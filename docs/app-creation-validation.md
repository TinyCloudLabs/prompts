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

October 2 runner update: the reproduction below now explicitly selects `synthetic` mode. The September 30 results above remain historical component evidence, not acceptance of the public entry.

```sh
python3 docs/validation/run-app-creation-agent.py \
  --mode synthetic \
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

## October 2, 2026: public-entry runner boundary

The [runner](validation/run-app-creation-agent.py) now separates `synthetic` component runs from `public-entry` candidate runs. The existing negative and storage-interruption callers explicitly select synthetic mode. Synthetic runs retain their generated connection/consent wrapper and continuation handles; they cannot establish public-link acceptance or human consent.

Public mode supplies exactly the natural request, a blank line, and `Use TinyCloud: <exact public URL>`. It does not generate an entry document, copy connection selections, inject app locators or a plan handle, preanswer questions, or provide a consent transport. `--connection`, `--state`, and `--continuation` are rejected before creating evidence. Client execution uses an empty child workspace, outside the private evidence files, and retains the ordinary installed Codex configuration and approval policies. Declare any existing client rules/plugins and prepared state; do not use custom per-trial instructions, fixture launchers, synthetic consent, or observer files for public acceptance.

### Preparation and publication gate

The planned final URL is:

```text
https://raw.githubusercontent.com/TinyCloudLabs/prompts/refs/heads/docs/initial-setup-split/quickstart/tinycloud.md
```

It returned 404 during October 2 planning. **Do not retry that known unpublished URL until publication has changed.** Neither publication nor human consent is available in this implementation session. A candidate-commit rehearsal is not final acceptance of the default-branch URL.

To inspect the input without fetching the guide or invoking a CLI/client:

```sh
python3 docs/validation/run-app-creation-agent.py \
  --mode public-entry --prepare-only \
  --directory /private/new-public-input-evidence \
  --guide "$EXACT_PUBLIC_URL" --guide-revision "$PUBLISHED_CANDIDATE_COMMIT" \
  --starting-state 'Disposable existing hosted owner; declare installation and saved grants' \
  --request "$NATURAL_REQUEST"
```

Use a new private directory outside repository/instruction ancestry. The revision must be the full actual published candidate commit, not a fabricated future hash. Preparation validates the input but leaves `servedRevision`, versions, measurements and acceptance unverified. It is safe to inspect a proposed URL with `--prepare-only`; preparation does not establish its availability.

Only after publication, authorized disposable resources, and any required real human consent are available, omit `--prepare-only` and use another new directory. Before launching Codex, the runner fetches the **exact supplied URL**, compares its bytes with that repository's immutable `quickstart/tinycloud.md` at the declared commit, and records the matching entry hash/revision. This checks entry bytes, not the revision of every supporting document. Independently check that the entire linked document set is published coherently and unchanged during acceptance. It must still use the published CLI `0.10.0` baseline and its documented workarounds unless a separately verified release is adopted.

The default client deadline is 900 seconds, with `--timeout` available for a declared longer trial; timeout is not refusal. The runner does not implement browser approval, accept signed responses, or operate a native terminal on the human's behalf.

### Private evidence and independent completion

The directory and newly created evidence files use private permissions. `request.txt` contains the exact model input; `invocation.json`, `events.jsonl`, `stderr.log`, `final.txt`, and `evidence.json` remain private. Standard output reports only directory, exit status and outcome, not raw records or the final answer. Do not upload raw evidence, signed responses, credentials, account identifiers, or private records to shared reports.

`evidence.json` records:

- Declared starting state: fresh installation versus existing installation, existing hosted owner versus new/unhosted owner, saved grants and any other prepared state.
- Client name, observed version and execution mode; CLI versions observed via `tc --version` before/after execution. If the agent installs outside the runner's PATH, the version remains unknown until independently recorded from that actual installation and private invocation evidence.
- Exact guide URL, declared revision, verified served entry revision/hash, start time, client outcome and exit code. Exit zero remains **independent acceptance pending**, not a pass.
- Prompt-to-client-exit wall time. `completedToolEvents` counts completed Codex command, MCP, web-search and file-change events; it is not a model-call count or a complete audited invocation total.
- Separate fields for observed human-approval seconds, non-approval seconds, audited CLI/tool invocations, consent count, repeated questions, human interventions, and independent state verification. These begin as `null` (unmeasured), never synthetic zeroes.

An independent observer must complete those private fields from actual events and disposable state, recording evidence paths, expected/actual outcomes, and intervention timing. Record callback approval separately from human-operated native-terminal intervention, cancellation, timeout, or refusal. Compute non-approval time only when approval timing is known. Do not infer no consent or no repeated questions from a successful exit. Summarize only sanitized aggregates and genuinely observed outcomes in a dated shared report; retain incomplete prerequisites explicitly. Historical CLI counts do not supply timings or budgets.

### Required public journeys (not yet exercised)

| Journey | Independent evidence required |
| --- | --- |
| Existing SQL and KV apps | Create/read/correct/delete requested records; renamed or restructured non-tracker app reused; unrelated records, guidance, registry and permissions unchanged. |
| Missing app and fresh-session reuse | Declared empty registry, already-hosted disposable owner, smallest suitable app plus exact original item; fresh session rediscovers without plan/app locators; separate setup-only task leaves zero records. Not new-owner hosting. |
| Cross-app question | Independently scoped resources, correct dates/units/relationships and coverage; unavailable resource reported; competing targets elicit clarification rather than unintended creation. |
| Authority transitions | Valid grants reused, only missing scopes requested, protected reader remains read-only; actual human cancellation/expiry preserves the original request; no profile/owner/host switching. |
| Uncertain write and separate identical request | Suppressed receipt independently reconciled without duplicate mutation; a separately submitted identical request remains distinct when app semantics permit. Preserve identity and original date on continuation. |

Across all journeys, independently reject tracking activation, sample records, synthetic sibling creation, and unrelated changes. Negative-scope resources belong only to disposable validation. Observe overhead before choosing budgets; do not certify another client, hosted writes, consent, or new-owner signup without exercising it.

### Local verification observed

On October 2 the implementation parent ran `python3 docs/validation/test-run-app-creation-agent.py`: three boundary tests passed, covering exact pure input/private permissions and rejection of synthetic injection and nonpublic/credential-bearing links before filesystem effects. The same tests first failed against the old runner. `python3 docs/validation/run-app-creation-agent.py --help` succeeded. The disposable `python3 docs/validation/retrieval-query-probe.py` passed its nine fixture SQL checks after removing extraction from guide prose.

These are local input-boundary and SQLite component results only. No public-link client run, hosted operation, human consent or new-owner journey is established by them.

### October 2 docs-only implementation verification

The user limited this implementation to the prompts repository. No SDK fix, package release, merge or deployment is included. The candidate is a local working tree based on prompts PR #2 commit `4a61f38803bb9852953b6544b6d7631edc8a8711`, not a new served public revision. The canonical-record decoding procedure and callback-error warning remain necessary for the published baseline.

Runtime actually installed in a disposable directory: Node `22.23.2`, `@tinycloud/cli@0.10.0`, node-sdk `2.11.0`, operations `0.3.2`, node-sdk-wasm `1.7.6`. Local server: published TinyCloud Node `v1.17.1`, binary SHA-256 `34cd369549b63f87ab2d4185145adbae5f8acf57faa0cce621712bf07914670a`; release archive checksum verified. No existing account credentials or private records were used.

| Check | Observed result and boundary |
| --- | --- |
| Durable context | Created a disposable `agent-smoke` profile and resolved it in another CLI process. Host/profile persisted, `ownerDid: null`, session missing, `access: not-tested`; saved default remained `default`. This is not authorized access. |
| Document consistency | All 133 relative Markdown links/anchors across 25 documents resolved; four JSON examples in the generic/supporting document set parsed. Modified Python and fixture JavaScript syntax checks passed. |
| Optional helper relocation | Fifteen existing release tests passed. A separate builder invocation omitted `--guide`, read the moved default source and preserved archive path `quickstart/tinycloud-opencode-read.md` with identical bytes. This used a synthetic packaging-only runtime, not an installable or functioning experimental helper. |
| SQL/KV component fixture | Actual published CLI and disposable node passed live discovery/canonical recovery, SQL and KV CRUD/readback, stable-ID reconciliation, preserved baseline rows, sibling denial, reader-write denial and ordinary-profile schema denial. Consent/proofs were synthetic. |
| Empty-registry component fixture | Actual CLI login/additional grants with synthetic callback signing established empty hosted app/account spaces; SQL read/schema versus read/write boundaries and sibling/registry-write denials passed. The fixture creates its own negative-test siblings, never ordinary onboarding. |
| Local request-plus-guide rehearsal | A fresh Codex `0.154.0` process received a natural request plus the local generic guide path, with prepared synthetic grants selected through durable CLI home/default profile. It discovered a KV app and SQL app without injected app IDs, saved the exact requested note and reported the correct March-to-August difference with units and one-observation-per-month coverage. Independent CLI reads confirmed the note and unchanged canonical registrations, guidance and SQL rows. No approval, repeated question or tracking activation occurred. This was not the public URL. |

That request-plus-guide rehearsal took **154.474 seconds**, with **16 completed command-tool calls**, **14 audited CLI invocations**, **zero consent requests** and **zero human-approval seconds**. These are one local observation, not an SLA or a model-call count. No reliable cross-client budget follows from one run.

The first synthetic new-app rehearsal stopped after requesting a space inferred from the adjective “private”; the fixture rejected that unhosted target. Independent observation found zero applications and zero remote mutation attempts. The task remained pending. Its 169.399 seconds and 13 completed command-tool calls are a failed rehearsal, not a creation pass. The creation guide was then clarified: start with the selected profile's session-bound data space without an override; URI resolution alone establishes neither hosting nor authority.

Fixture portability now uses the operating system's temporary directory instead of macOS-only `/private/tmp`, and the creation fixture references the CLI's packaged skill rather than assuming a separate discovery installation. Linux startup first failed at the old temporary path, then both fixtures ran successfully with these changes.

After the clarification, the same creation request was run against a fresh hosted disposable fixture. Independent reads found **one app and exactly one KV record**, with the requested title, original completion date and verbatim note; existing validation siblings were unchanged. The agent performed one guidance put, one registration and one item put, under separate setup and ordinary profiles. The original protected reader remained the default. This synthetic-wrapper rehearsal took **289.347 seconds**, **19 completed command-tool calls**, **32 CLI invocations** and **four synthetic consent invocations**. It is not real-human or public-entry acceptance.

A new ordinary Codex process then received the identical natural request plus the local guide, with only the saved home/profile selected through the environment—no app IDs, setup-plan locators or synthetic consent launcher. It discovered and reused the app. Independent reads found **two distinct record IDs with the same requested values**, the original record preserved, and identical registration and guidance. This confirms separate-request identity rather than text-based deduplication for this app. The reuse rehearsal took **149.660 seconds**, **10 completed command-tool calls**, **nine CLI invocations**, **zero consent requests**, **zero repeated questions** and **zero human-approval seconds**.

The tested local entry SHA-256 was `f7f5d5e2df3f409f9bdc759830445e447801d12c00a9d67e51eb8f76d7e56172`; the corrected creation guide SHA-256 was `9530a2b224371593feb256895e03d985bc8a96cfe4d97e5b7bcae6895f360fe0`. These identify local bytes, not a published commit or hosted acceptance.

A separate setup-only request produced one new KV app with its guidance and registration, **zero record keys**, and no sample/sentinel item. Independent observation found the reading app's canonical and guidance hashes unchanged. This synthetic-wrapper trial took **227.305 seconds**, **16 completed command-tool calls**, **29 CLI invocations** and **four synthetic consent invocations**; its only remote mutations were the guidance put and registration.

The public five-journey sequence remains unpassed. In particular, no new human consent/cancellation/expiry, public-link competing-target trial, or public-link suppressed-receipt continuation was exercised. The new identical-request reuse check does not by itself prove uncertain-write recovery. Prepared synthetic fixtures and local guide paths are not substitutes for the complete published link, real-human approval, hosted writes or new-owner enrollment.

All three disposable node endpoints were confirmed closed after their processes were stopped. Disposable installations, generated identities, fixture data, raw local transcripts and throwaway rehearsal/packaging scripts were removed. The sanitized results above are the retained evidence; no generated auth material or validation scaffolding is part of the change set.
