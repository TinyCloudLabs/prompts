# Track personal data through conversation

Use this guide for a task such as “Track my weight,” correcting a saved expense, or recovering what the user tracks in a new conversation. Preserve the original request throughout setup. A request only to install the skill ends after installation checks; it does not activate tracking or write an example record.

For a read-only question such as comparing existing weight records, start with the [retrieval quickstart](retrieve-data.md). It obtains the storage context from registered application guidance and does not require tracking activation, table preparation, stable writer IDs, or the OpenCode onboarding adapter. Return here only if the user also requests tracking or changes.

For an explicit one-off request such as “record my weight as 76.2 kg today,” start with the [general TinyCloud guide](tinycloud.md). It discovers the app and its operation guidance without requiring a particular chat client. An explicit write does not activate recurring tracking. This tracker's local contract permits a durable `agent-task:` source identity for that one bound task; recurring automatic capture still requires client delivery IDs. See [the one-off identity contract](../skills/tc-conversational-data/references/storage-contract.md#explicit-one-off-operation-identity). Stored guidance that requires a different provenance rule must be reconciled before writing.

`tc-conversational-data` version `0.1.0` covers prepared tables, a known private KV catalog and one writer. Installation does not provision storage, authenticate, or grant access. Stable client delivery/item/operation IDs are required for automatic capture that survives redelivery; a one-off plan covers only continuations bound to that plan. If these prerequisites are missing, report the specific preparation gap and continue independent work; do not ask the everyday user to design an app or invent technical IDs. The local one-off extension has not yet been validated by fresh-agent live recording.

## 1. Reuse the CLI and its core skill

Follow [the shared TinyCloud setup module](../setup/tinycloud.md) only for missing prerequisites. Supply the current client (`opencode`, `codex`, or `claude-code`), the user's original task, this guide's location, and the return heading **2. Install the workflow skill into the project**. Its reviewed pins are CLI `0.10.0` and installer `skills@1.7.0`; the combined setup requires Node.js 22.20 or later. Reuse a compatible installation and preserve unrelated packages and settings. Use the [general quickstart](tinycloud.md) for prerequisite guidance if needed, then return here.

Load the installed `tc-cli` skill and its relevant references. Keep authentication and detailed command behavior in that owning package. A separate OpenKey CLI is not required for this workflow.

If a calling workflow also needs direct OpenKey CLI commands, reuse [the shared OpenKey setup module](../setup/openkey.md). That module installs the optional standalone tool. TinyCloud browser sign-in and scoped access use the installed `tc-cli/AUTH.md` in step 3 below; standalone `openkey login` does not grant the conversational agent TinyCloud permissions. Both shared modules return to their caller with the original request preserved.

The setup module includes a [project-local installation option](../setup/tinycloud.md#project-local-setup) for isolated projects. Record its absolute CLI path in the trusted bootstrap and start OpenCode after installing both skills. The September 29 acceptance run observed automatic selection of both skills from the ordinary request “Track my weight.” With no prepared context or message-ID adapter, the client correctly kept tracking inactive; discovery alone did not complete setup.

## 2. Install the workflow skill into the project

Run from the intended destination project, not the prompts source directory. Inspect an existing same-named skill and preserve local modifications. Installing replaces the selected copied skill; resolve a conflict instead of silently overwriting it. Choose only the clients in use.

From a reviewed local checkout of this repository:

```sh
npx --yes skills@1.7.0 add /absolute/path/to/prompts \
  --skill tc-conversational-data --agent opencode codex --copy --yes
```

When following an immutable public guide URL, take `PROMPTS_REV` from its full 40-character commit and install the matching skill without a checkout:

```sh
npx --yes skills@1.7.0 add "https://github.com/TinyCloudLabs/prompts/tree/$PROMPTS_REV" \
  --skill tc-conversational-data --agent opencode codex --copy --yes
```

Resolve all relative guide links against that same revision. Do not substitute the historical `b09981215f5873a9c24e3bcb890a7074d9ebefb6` skill: it lacks the later one-off identity and retrieval changes. For a local source, use the reviewed checkout above.

The project-scoped installer is the default; omit `--global`. For OpenCode/Codex the copied folder is `.agents/skills/tc-conversational-data/` and the installer writes project `skills-lock.json`. Use `--agent claude-code` for that client and follow the installer-reported location. Do not hand-copy only `SKILL.md` and lose its references. `#COMMIT` selects a source revision; `@...` is the installer's skill-name selector, not a commit pin. For another version, select an existing full 40-character commit containing the reviewed skill and references.

Read the installed `SKILL.md`, confirm metadata version `0.1.0`, and verify its linked references are present. Installing instructions does not change command-execution permissions. Use the client's normal discovery procedure; if a new session is needed, retain the original task and trusted bootstrap. A fresh session must recover active intentions from TinyCloud, not an operator-written summary of prior records.

The companion starter uses this guide's local path. Before distributing a release starter, supply a retained published commit URL and select the same reviewed revision for installation. Do not advertise a proposed or deleted branch as an immutable release.

## 3. Supply or reuse the prepared context

If the selected OpenCode project already advertises `tc_setup`, `tc_authorize`, and `tc_delivery_item`, use that installed app adapter first. Call `tc_setup`; on `login-required`, immediately call `tc_authorize` so OpenKey opens. Tell the user to finish in the browser and paste the returned code into the native chat capture. Never read or transcribe that code yourself. After the verified receipt, call `tc_setup` again to finish preparation and verify conversational access, then continue the original task. The adapter supplies host, space and resource names, and derives conversational access from the same consent. Do not ask the user to choose infrastructure, run a second login, or repeat their original request. This path requires the installed native capture adapter; ordinary model chat is not an authorization transport. Use `tc-context.json` only after the tool reports verified storage readiness.

The manual preparation guidance below applies when no app onboarding adapter is installed.

Obtain the trusted bootstrap already selected for this task: CLI/profile/host/owner/full space URI, exact prepared databases, private KV prefix and catalog key, original message date/timezone context, and the appropriate source identity. Recurring automatic capture requires stable client delivery IDs. For an explicit one-off operation, use the durable plan described in the installed [storage contract](../skills/tc-conversational-data/references/storage-contract.md), which also describes the catalog and baseline tables. Read its installed copy during execution so it matches the skill revision. Preserve that plan through authentication, retaining the original request, IDs, values and resolved date; an independently repeated prompt is not proof of continuation.

Use an existing intended profile with suitable authority when available. If authentication or grants are missing, follow the installed `tc-cli/AUTH.md` for the selected tracking scope. Recurring tracking across both prepared domains uses the two exact SQL databases with read/write and the private KV prefix with get/put/list. An explicit one-off write needs only the relevant exact database's read/write and the KV reads needed for discovery/guidance; do not request the other domain or catalog writes merely to record one item. Follow the general guide for scoped login and additional grants while preserving existing account discovery authority. The TinyCloud CLI opens the OpenKey authorization flow itself; installing or signing in through the standalone OpenKey CLI is not a prerequisite. Keep the TinyCloud CLI running for its browser callback; if using its paste mode, the human enters the return proof directly in that waiting terminal. Do not transfer signed return codes or keys through model chat. A new profile, local session, permission listing, or selected space is not evidence of storage access; verify real reads in the intended scope before continuing.

For this version, owner-side table/catalog preparation must already be complete. A catalog can list prepared targets with no active intentions. Verify real catalog, guidance and schema reads in the approved scope before relying on them. Do not treat missing resources as empty trackers, make up a catalog key, or create a new account to obtain access.

For a fresh selected scope, the owner can follow the [fixed baseline preparation recipe](../setup/conversational-data.md). Keep that setup authority separate from the conversational profile. Preparation must finish before any capture, and client message-ID integration must finish before recurring automatic capture. The durable one-off plan does not satisfy that automatic delivery requirement.

## 4. Continue the conversation

Use `tc-conversational-data` for the original request. It handles intention activation, clear self-reports, corrections, uncertain outcomes and fresh-session discovery. Ask only about material ambiguity. Keep dates, units, currency and record identity according to the stored domain guidance.

Requests to export this chat or agent session use the client's local transcript export. TinyCloud data export applies only to requested stored tracking data; an export request alone does not authorize uploading or publishing.

Report confirmed outcomes briefly. If preparation, source identity, schema agreement or access is missing, name that exact gap without claiming a save. The packaged skill does not turn the earlier prepared-scope trial into a zero-setup or browser-auth acceptance claim. See [validation and remaining limits](../docs/tc-conversational-data-validation.md).
