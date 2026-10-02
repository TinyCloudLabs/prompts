# Retrieval enrollment validation

September 29, 2026. [Owner setup](../setup/conversational-data.md#enroll-an-existing-or-newly-prepared-tracker) now links both new preparation and existing trackers to explicit enrollment. It preserves existing locations, adds a small knowledge root, and uses the existing account registry. The logical application ID is `xyz.tinycloud.conversational-data`, independent of setup/client permission-request identities.

This enrollment lane performed no live login, consent, registration, data write, credential read, installation, or publication. The separate fresh-reader trial is recorded in [retrieval verification](retrieve-data-validation.md). The existing OpenCode integration was not changed: automatic enrollment would require account authority absent from its current app-only consent. Its users must run the owner enrollment step separately. This is an implemented guide, not completed live enrollment.

## Executed checks

The [synthetic probe](validation/retrieval-enrollment-probe.ts) extracts the two JSON manifests directly from the setup guide, substitutes synthetic resource names, then executes the inspected SDK validator/resolver, CLI permission loader, and AccountService with an in-memory KV adapter. Network access throws. The controlled index adapter supplies only the cached-hash outcome or a deliberately stale list.

```sh
bun run docs/validation/retrieval-enrollment-probe.ts /absolute/path/to/inspected/web-sdk
```

Run from this prompts repository. The source root must have its dependencies installed. The initial invocation against the reference worktree stopped because its `ms` dependency was absent; nothing was installed there. The successful invocation used the existing dependency-installed inspection archive. All three source files below were then compared byte-for-byte with reference worktree HEAD `e7512cda678b8d3a4acfe2b9f9fc1dbb1641bc5a`; they were identical.

| Check | Observation |
| --- | --- |
| Documented manifests | Both validate. CLI and SDK agree on explicit resource spaces, paths and actions; application comparison excludes the SDK's implicit capabilities-read entry. |
| Knowledge key | `synthetic/private` plus `knowledge/index.md` resolves to `synthetic/private/knowledge/index.md` through SDK `applyPrefix`. This tests the selected join, not an automatic knowledge loader. |
| Registration | One registration writes `applications/xyz.tinycloud.conversational-data`; canonical info and live list return the supplied manifest. |
| JSON text from KV | Returning that same stored record as JSON text makes account info lose its manifests. Explicit canonical KV normalization recovers the unchanged app ID and manifest. The guide now requires this normalization for incomplete listing entries and enrollment comparison/readback. |
| Matching retry | Canonical inspection returns an equivalent manifest; the protocol simulation omits another registration and the write count stays one. |
| Differing metadata | Canonical inspection retains a custom name/version. A stale matching cache lets `register` report success without changing that different canonical record; readback detects the mismatch. |
| Stale list | Indexed listing returns a synthetic stale application; canonical listing returns the current record. |
| Partial response | A simulated failed response after the KV write leaves the correct canonical record, recoverable through info/live reads without another write. |
| App data boundary | Registry method calls access only the synthetic account space and expected registry key. No SQL/data adapter is provided. |

These are parser/method checks and a manual enrollment-protocol simulation. They do not prove an agent follows the guide, enforce signed permissions, resolve browser callbacks, host an account space, or preserve a real dataset under concurrent writers. Concurrent enrollment remains unsupported; the guide requires one writer and stops on conflicts or canonical mismatch.

| Inspected source | SHA-256 |
| --- | --- |
| `packages/sdk-core/src/manifest.ts` | `884c0e28aaa428ee72af6f3ec664a4798b5467b960b57bde593a0350e714770c` |
| `packages/sdk-core/src/account/AccountService.ts` | `b274faf76e0526f6eeb2cd56ece49817bf675584501c7d54e0f70db0ced14f4d` |
| `packages/cli/src/lib/permissions.ts` | `36446e485a31a4f50d0069c5efa4321cecfe38e60b8aa1c525cc8251bd07075f` |

CLI `0.10.0` returned successful help in a temporary empty `TC_HOME` for `account apps list`, `account apps info`, `account apps register`, `profile create`, `auth login`, and `kv put`. This verifies the documented `--live`, owner profile posture/operator, scoped-login manifest/owner/expiry, loopback/manual-paste, and space/value options exist. No authenticated command was executed by these checks.

## Hosted enrollment follow-up

After the user authorized completing local enrollment, a separate owner profile obtained narrow registry consent. Existing catalog/schema and absence checks passed; setup added the knowledge root and one registry entry. Canonical KV normalization, list and info readback verified the intended entry. Private record/catalog/guidance content hashes were identical before and after enrollment. No observations, intentions, database locations or schemas changed.

A real parser issue was exposed before dispatching the root put: YAML `---` at the start of the value was treated as an option. The recipe now uses `kv put --space SPACE --json -- KEY VALUE`; an unauthenticated parser probe confirms that form passes argument parsing, and hosted put/readback then succeeded.

A fresh Codex receiving only the new local one-line prompt discovered this registration and generated a narrow app reader request. After human consent, another independent Codex completed the real month comparison and full rediscovery using saved registry/app authority. Its means, counts, units, coverage and difference matched an independent live query. A separate hosted insert into a verified-absent synthetic table returned `AUTH_UNAUTHORIZED`, without touching real records. See [retrieval verification](retrieve-data-validation.md) for scope and remaining release limitations. No synthetic number is a result for the user's records.
