# General TinyCloud agent guide validation

September 30, 2026. Implemented and tested locally; included in [PR #2](https://github.com/TinyCloudLabs/prompts/pull/2). No merge or deployment was part of validation.

The [general entry](../quickstart/tinycloud.md) defines the same task loop for Codex, OpenCode and Claude Code: retain the request, discover the app, inspect its semantics and schema, obtain operation-specific permissions, execute and verify. Fresh-agent acceptance below used Codex. The tested short local entry routes here. The public starter uses a placeholder for the caller's entry or matching checkout path.

## Changed contract

- Discovery steps 2–5 are reusable as a read-only phase of a write task; they return to the general guide without dropping the original operation.
- [Knowledge version 2](../references/application-knowledge.md) describes arbitrary app resources and maintained operations without imposing a tracker catalog. Version 1 remains compatible.
- Explicit one-off operations retain a private durable plan across consent, dispatch and reconciliation. This binds retries of an identified task, not independently redelivered prompts. The compatible tracker can use documented agent-task provenance; stricter stored app rules still apply.
- Recurring automatic capture retains its client delivery integration. A single write does not activate tracking. New write consent cannot silently expand the existing protected reader.
- General applicability depends on actual CLI support and sufficient maintained app semantics. It does not promise to understand undocumented apps or provide universal exactly-once delivery.

## Observed acceptance

| Check | Observation and evidence |
| --- | --- |
| Actual CLI and local node | [Disposable fixture](validation/general-operations-fixture.mjs) registered two apps with different models: SQL measurements and KV notes. Live discovery and canonical normalization recovered both v2 roots. SQL and KV create/read/update/delete passed, with ID reconciliation and readback. [Results](general-operations-fixture-results.json). |
| Scope enforcement | The local server explicitly denied sibling reads, read-only SQL/KV writes and operator schema creation. The two original synthetic rows remained unchanged. This is synthetic authority on a local node, not a hosted human-consent test. |
| Fresh SQL create | A new Codex outside repository/playground instruction ancestry received a weigh-in request plus the fixture entry. It discovered the SQL app, read guidance/schema, retained a private plan, performed one insert and read it back. |
| Fresh KV create | An independent Codex received a named-note request plus the same entry. It discovered the other app and its KV conventions, retained a plan, performed one put and read back the correct object. No tracker catalog or SQL model was imposed on this app. |
| Uncertain-operation continuation | After the SQL create, the test changed only the local plan from confirmed to uncertain and removed its local receipt. Another fresh Codex received that plan's continuation handle plus the entry. It rediscovered the app, verified the existing row, marked the plan confirmed and issued no mutation. |
| Fresh KV delete | Another new Codex received a delete request plus the same entry. It rediscovered the notes app, retained the target/precondition, performed one delete and verified the specific missing-key result. |
| Independent final readback | Separate CLI reads established exactly one new measurement, both unchanged baseline rows, the same created record ID, confirmed plan state, and absence of the selected note. All four fresh agents reused saved fixture grants without new consent or registration. [Agent results](general-operations-agent-results.json). |
| Hosted retrieval regression | A fresh Codex received the original short weight-comparison prompt pointing to the revised local entry. Its 19 commands discovered the real tracker, read guidance/schema and returned the previously independently verified means, counts, coverage and difference. It performed no auth changes or data mutations. [Sanitized results](general-operations-hosted-read-results.json). |
| Documentation | Local links/anchors, JSON examples, skill frontmatter, fixture syntax, the existing synthetic monthly SQL regression and `git diff --check` passed. |

The mutation agents received only their natural-language task and a fixture entry containing nonsecret host/profile/runtime selections. They were not given app/database names, schemas, prior answers, setup code or an OpenCode adapter. The retry test additionally received its explicit continuation-plan path. Fixture grants were generated for disposable synthetic identities and replayed by the actual CLI. This verifies saved-grant execution, not a new human OpenKey flow. The local node was stopped after acceptance; private fixture artifacts remain for diagnosis.

The fixture initially reproduced SDK-seeded registry data being invisible to the restored CLI, with address-format differences observed. Enrollment through a separate synthetic CLI setup profile resolved live discovery; that setup profile was deleted before fresh-agent tests. No production SDK change was made and the underlying cause was not established. This fixture issue is distinct from the confirmed canonical JSON-string decoding workaround already documented in the retrieval guide.

## Existing tracker compatibility and remaining limits

A read-only audit followed the actual hosted registry, canonical manifest, root and catalog to the stored fitness guidance. It explicitly defines `source_key` as client message/item identity and requires a supported client identity path before capture. It does not yet permit the new `agent-task:` provenance. Local instruction changes must not silently override this maintained rule.

A narrow owner-maintenance proposal is prepared in a private local directory: exact original and proposed values, a reviewable diff, and nonsecret target/hash metadata. It permits explicit one-off task identity while retaining native delivery IDs for automatic capture, preserves the stored literal backslash-newline encoding and all unrelated rules, and changes no schema, records or intentions. It has **not been applied**. The [adoption procedure](../setup/conversational-data.md#adopt-one-off-task-identity-in-existing-guidance) requires authorized owner maintenance and exact readback. Ordinary recording also needs its own appropriate write grant; the protected reader remains read-only.

The general discovery/execution flow is verified across two synthetic app models and the existing hosted reader. A hosted write using the new tracker identity convention remains unverified and currently needs the above guidance adoption. The fixture's simple SQL schema does not validate every field of the full tracker provenance schema. Fresh-agent update semantics, automatic capture, other CLI service families, arbitrary app layouts, concurrent writers and new human write consent are not established by these checks. An unsupported or undocumented operation must fail precisely rather than be invented.

## Reproduce the focused fixture

Use the installed CLI package and a compatible local TinyCloud node binary:

```sh
node docs/validation/general-operations-fixture.mjs /absolute/path/to/@tinycloud/cli /absolute/path/to/tinycloud
```

The default run stops and removes its successful disposable fixture. `--keep` retains the synthetic node and returns only synthetic verification context for independent agent acceptance; stop that exact returned PID afterward. Never substitute user profiles or hosted data for this fixture. To reproduce fresh-agent tests, create a temporary entry pointing to the same general guide with the returned nonsecret connection hints, installed core skill path and private operation directory. Do not provide its operator-only fixture context, app locators or setup code to the agent.
