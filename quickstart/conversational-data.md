# Track personal data through conversation

Use this guide for a task such as “Track my weight,” correcting a saved expense, or recovering what the user tracks in a new conversation. Preserve the original request throughout setup. A request only to install the skill ends after installation checks; it does not activate tracking or write an example record.

`tc-conversational-data` version `0.1.0` covers prepared tables, a known private KV catalog and one writer. Installation does not provision storage, authenticate, or grant access. Stable delivery/item/operation IDs are a client requirement for retry-safe capture. If these prerequisites are missing, report the specific preparation gap and continue independent work; do not ask the everyday user to design an app or invent technical IDs.

## 1. Reuse the CLI and its core skill

Follow [the shared TinyCloud setup module](../setup/tinycloud.md) only for missing prerequisites. Supply the current client (`opencode`, `codex`, or `claude-code`), the user's original task, this guide's location, and the return heading **2. Install the workflow skill into the project**. Its reviewed pins are CLI `0.10.0` and installer `skills@1.7.0`; the combined setup requires Node.js 22.20 or later. Reuse a compatible installation and preserve unrelated packages and settings. Use the [generic quickstart's Node preparation](tinycloud.md#1-prepare-a-durable-node-installation) if needed, then return here.

Load the installed `tc-cli` skill and its relevant references. Keep authentication and detailed command behavior in that owning package. A separate OpenKey CLI is not required for this workflow.

## 2. Install the workflow skill into the project

Run from the intended destination project, not the prompts source directory. Inspect an existing same-named skill and preserve local modifications. Installing replaces the selected copied skill; resolve a conflict instead of silently overwriting it. Choose only the clients in use.

From a reviewed local checkout of this repository:

```sh
npx --yes skills@1.7.0 add /absolute/path/to/prompts \
  --skill tc-conversational-data --agent opencode codex --copy --yes
```

For a published version, replace `FULL_COMMIT_SHA` with an existing full 40-character commit containing the reviewed skill and references:

```sh
npx --yes skills@1.7.0 add 'TinyCloudLabs/prompts#FULL_COMMIT_SHA' \
  --skill tc-conversational-data --agent opencode codex --copy --yes
```

The project-scoped installer is the default; omit `--global`. For OpenCode/Codex the copied folder is `.agents/skills/tc-conversational-data/` and the installer writes project `skills-lock.json`. Use `--agent claude-code` for that client and follow the installer-reported location. Do not hand-copy only `SKILL.md` and lose its references. `#COMMIT` selects a source revision; `@...` is the installer's skill-name selector, not a commit pin.

Read the installed `SKILL.md`, confirm metadata version `0.1.0`, and verify its linked references are present. Installing instructions does not change command-execution permissions. Use the client's normal discovery procedure; if a new session is needed, retain the original task and trusted bootstrap. A fresh session must recover active intentions from TinyCloud, not an operator-written summary of prior records.

The companion starter currently targets the review branch `Codex/roman/tc-conversational-data`. Before distributing a release starter, replace that mutable guide URL with a retained commit URL and select the same reviewed revision for installation. Do not advertise a proposed or deleted branch as an immutable release.

## 3. Supply or reuse the prepared context

Obtain the trusted bootstrap already selected for this task: CLI/profile/host/owner/full space URI, exact prepared databases, private KV prefix and catalog key, message date/timezone context, and stable delivery IDs. The installed [storage contract](../skills/tc-conversational-data/references/storage-contract.md) describes the catalog and baseline tables. Read its installed copy during execution so it matches the skill revision.

Use an existing intended profile with suitable authority when available. If authentication or grants are missing, use the installed `tc-cli/AUTH.md` for that identity and the exact prepared scope. Human identity selection and consent remain in the supported CLI/browser flow; do not transfer signed return codes or keys through model chat. The generic quickstart's note manifest is not the tracking permission set. A new profile, local session, permission listing, or selected space is not evidence of storage access.

For this version, owner-side table/catalog preparation must already be complete. A catalog can list prepared targets with no active intentions. Verify real catalog, guidance and schema reads in the approved scope before relying on them. Do not treat missing resources as empty trackers, make up a catalog key, or create a new account to obtain access.

## 4. Continue the conversation

Use `tc-conversational-data` for the original request. It handles intention activation, clear self-reports, corrections, uncertain outcomes and fresh-session discovery. Ask only about material ambiguity. Keep dates, units, currency and record identity according to the stored domain guidance.

Report confirmed outcomes briefly. If preparation, source identity, schema agreement or access is missing, name that exact gap without claiming a save. The packaged skill does not turn the earlier prepared-scope trial into a zero-setup or browser-auth acceptance claim. See [validation and remaining limits](../docs/tc-conversational-data-validation.md).
