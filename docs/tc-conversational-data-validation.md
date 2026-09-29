# Conversational-data skill 0.1.0 validation

Validation date: September 29, 2026. The package is authored in this repository; CLI command/auth documentation remains in `@tinycloud/cli`.

## Package and installer

- `skill-creator` frontmatter/name validation passes for `skills/tc-conversational-data`.
- Pinned `skills@1.7.0` discovers this repository's `skills/` layout and copies the complete named skill into the destination project's `.agents/skills/` for OpenCode and Codex.
- The actual skill and both references were installed into a fresh temporary project. Their SHA256 hashes match the authored files byte-for-byte. The installer also creates project `skills-lock.json`.
- Local installs were exercised. Full-commit remote pin syntax was checked against the pinned installer's implementation; remote installation of the new unpublished revision is not claimed here. The review starter's mutable branch URL is explicitly distinguished from a release pin.
- No global skill, settings, personal TinyCloud profile or production resource was changed.

## Behavioral forward tests

Independent agents received only the installed skill/core dependency, trusted profile/host/owner/space/resource bootstrap and a realistic user message. They did not receive prior conclusions, expected answers or operator fixtures. The agents issued CLI commands themselves against a newly provisioned disposable localhost node. These are agent behavior tests against real storage; client automatic skill selection is a separate concern.

Environment: CLI `0.10.0`; node `v1.17.1`, release target `7a58693f8bcd0d4e9d4df40dd464abd8c9c763ed`; separate fresh owner and delegated agent identities; two flat prepared SQL databases and one private KV prefix. The scoped profile's allowed reads and an explicit authorization denial against an existing owner-readable sibling were verified. All state is synthetic. The new `tc-conversational-data/v1` catalog marker was used with the baseline prepared schema.

| Case | Result |
| --- | --- |
| Fresh recovery | Passed: recovered weight/sleep/spending intentions, latest 80.1 kg on September 29, 6.25 hours sleep and EUR 24.25 spending. Both schema reads used `sqlite_master` successfully. |
| Ambiguous correction | Passed: asked whether 80.1 kg on September 29 or 79.6 kg already on September 28 was intended. Operator equality checks confirmed both rows and all other records unchanged. |
| New capture | Passed: saved 8.25 hours on the supplied September 30 wake date, with a stable source ID, actual UTC capture time and revision 1. Readback confirmed exactly one new row. |
| Correction | Passed: changed that sleep record to 7.75 hours at revision 2. Record ID, source, original message, wake date and capture time remained unchanged. The update checked the expected revision. |
| Immediate correction replay | Passed: the identical correction operation caused one read and no write. The corrected row remained byte-for-byte equivalent, including revision 2. |
| Original capture redelivery after correction | Passed: the original source item caused one read and no write. It neither inserted a duplicate nor reverted the later correction. |

The September 30 message date is intentionally supplied synthetic context, distinct from the actual September 29 capture clock. These checks verify that event dates and capture times are not conflated.

[Compact validation evidence](validation/tc-conversational-data-0.1.0.json) records installed-file hashes, scope probes, state checks and the 19 successful agent storage commands. There were exactly two mutations: one insert and one revision-checked update, each affecting one row. All seeded records remained unchanged. The disposable node was gracefully stopped and its listener was confirmed closed. Credentials, signed grants and the temporary harness are excluded from this repository.

The earlier prepared-scope trial additionally exercised intention activation, spending capture, a hypothetical without a write, real CLI response loss, repeated capture/correction, cold-session recovery and export artifacts. That trial's `PRAGMA table_info` authorization failure produced the explicit `sqlite_master` instruction in this package. Its results support the workflow design; they do not substitute for checks of this packaged revision.

## Scope and remaining acceptance

This version depends on prepared tables, a trusted catalog locator, stable delivery/item/operation IDs, one writer and caller-selected authority. Installation does not provide those prerequisites. Automatic provisioning, real-user browser consent, client delivery-ID integration, account-registry discovery, migrations, concurrent writers, connectors, new record types and full restore are not certified by these checks.

The forward tests use independent Codex agents with an explicitly loaded installed skill. They do not claim a new OpenCode UI discovery or generic onboarding run. Production distribution should use a retained full commit pin, and should test the intended client's discovery and message-identity adapter before unattended capture.
