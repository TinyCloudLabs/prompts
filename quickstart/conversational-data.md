# Track personal data through conversation

Use this guide for a task such as “Track my weight,” correcting a saved expense, or recovering what the user tracks in a new conversation. Preserve the original request throughout setup. A request only to install the skill ends after installation checks; it does not activate tracking or write an example record.

For a read-only question such as comparing existing records, start with the [generic TinyCloud entry](tinycloud.md). Its supporting discovery recipe obtains context from registered application guidance without tracking activation, table preparation, stable writer IDs or an onboarding adapter. Return here only for explicitly requested recurring behavior.

For an explicit one-off request such as “record my weight as 76.2 kg today,” start with the [general TinyCloud guide](tinycloud.md). It discovers the app and its operation guidance without requiring a particular chat client. An explicit write does not activate recurring tracking. This tracker's local contract permits a durable `agent-task:` source identity for that one bound task; recurring automatic capture still requires client delivery IDs. See [the one-off identity contract](../skills/tc-conversational-data/references/storage-contract.md#explicit-one-off-operation-identity). Stored guidance that requires a different provenance rule must be reconciled before writing.

`tc-conversational-data` version `0.2.0` supports generic app-authored KV and compatible prepared SQL contracts with a persistent intention lifecycle. Installation does not authenticate, grant access or connect native delivery. Missing delivery leaves a discoverable, cancellable pending intention; automatic capture requires the selected client's verified integration. A one-off plan covers only continuations bound to that plan. Do not ask the everyday user to design tables or manufacture technical IDs.

## 1. Reuse the CLI and its core skill

Follow [the shared TinyCloud setup module](../setup/tinycloud.md) only for missing prerequisites. Supply the current client (`opencode`, `codex`, or `claude-code`), the user's original task, this guide's location, and the return heading **2. Install the workflow skill into the project**. Its reviewed pins are CLI `0.10.0` and installer `skills@1.7.0`; the combined setup requires Node.js 22.20 or later. Reuse a compatible installation and preserve unrelated packages and settings. Use the [general quickstart](tinycloud.md) for prerequisite guidance if needed, then return here.

Read the packaged `tc-cli` skill and relevant references. For this optional feature's automatic client skill discovery, also use the setup module's [optional client-discovery installation](../setup/tinycloud.md#optional-client-discovery) if not already installed. Keep authentication and command behavior in that owning package. A separate OpenKey CLI is not required.

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

Read the installed `SKILL.md`, confirm metadata version `0.2.0`, and verify its linked references are present. Installing instructions does not change command-execution permissions. Use the client's normal discovery procedure; if a new session is needed, retain the original task and trusted bootstrap. A fresh session must recover active intentions from TinyCloud, not an operator-written summary of prior records.

The companion starter uses this guide's local path. Before distributing a release starter, supply a retained published commit URL and select the same reviewed revision for installation. Do not advertise a proposed or deleted branch as an immutable release.

## 3. Discover the app and establish readiness

Use [the general guide's live discovery and create/reuse decision](tinycloud.md#3-find-the-relevant-applications), retaining the original tracking request, selected owner/host and occurrence context. A compatible general KV app needs no baseline SQL tables or catalog. If no compatible app exists and creation safeguards pass, follow [first-use creation](../setup/create-application.md), then author this optional feature's [recurring contract](../skills/tc-conversational-data/references/intention-lifecycle.md). Preparation alone does not activate delivery.

The app root supplies exact resources and the mutable intention locator. For an existing prepared SQL tracker, retain its catalog, tables and maintained rules; the [prepared contract](../skills/tc-conversational-data/references/storage-contract.md) and [owner recipe](../setup/conversational-data.md) remain available for that layout. They are not universal prerequisites. Ordinary tracking can write only its declared mutable state and observations; protected guidance, registry and schema maintenance remain separate.

Follow [shared scoped authentication](../setup/authenticate.md) for missing authority. Retain the original task/plan and use exact manifests with the selected owner, host and full space. Activation needs the specific intention and record capabilities, not unrelated domains or private-prefix guidance writes. Cancel/stop needs only intention get/put plus necessary reads. Keep the CLI alive for the supported callback; signed responses go directly through that callback or the human's native terminal. Verify actual reads and state readback after consent.

For native delivery, inspect tools actually advertised by this client. The [configured Codex app-server bridge](../delivery-bridge/README.md) exposes `tinycloud_delivery_context`, `tinycloud_delivery_plan` and `tinycloud_delivery_dispatch`; its runtime binds the executing turn to the original human message. Install/configure that reviewed mode from the same source revision before relying on it. Do not claim that ordinary Codex CLI/TUI/desktop automatically exposes these tools. OpenCode and Claude Code need their own verified bridge; exported IDs alone do not activate capture.

An existing OpenCode app adapter advertising `tc_setup`, `tc_authorize` and `tc_delivery_item` is a separate integration: verify its own receipt, storage scope and original-human binding before use. Its native code capture may handle a signed response only through its installed human interface; generic model chat cannot. Do not infer generic registry enrollment or compatibility from a meeting-specific adapter or installed tool name.

Read the current intention and perform [activate/cancel/stop/resume](../skills/tc-conversational-data/references/intention-lifecycle.md#transitions-and-readiness). A remotely active intention still requires readiness in each consuming client. For a missing integration, report pending capture and the concrete supported setup action. No-URL recovery requires the configured project to load the installed skill and saved nonsecret context; remote intentions cannot configure an unrelated client.

For “while this chat is closed,” use [background capture](../background-capture/README.md). Establish the user-selected source, scoped connection, trigger, independent worker and observable lifecycle before enabling real collection. The synthetic local import-feed acceptance is separate from production source activation.

## 4. Continue the conversation

Use `tc-conversational-data` for the original request. It handles intention activation, clear self-reports, corrections, uncertain outcomes and fresh-session discovery. Ask only about material ambiguity. Keep dates, units, currency and record identity according to the stored domain guidance.

Requests to export this chat or agent session use the client's local transcript export. TinyCloud data export applies only to requested stored tracking data; an export request alone does not authorize uploading or publishing.

Report confirmed outcomes briefly. If preparation, source identity, schema agreement or access is missing, name that exact gap without claiming a save. An installed skill, a stored intention and a running delivery bridge establish different prerequisites; report only those actually verified in this client and owner context. See [validation and remaining limits](../docs/tc-conversational-data-validation.md).
