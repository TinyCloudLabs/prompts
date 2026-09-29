# Use TinyCloud from OpenCode

Use this guide to enable an ordinary TinyCloud task, such as saving a note or reading an existing value. Keep the user's original task throughout setup, then return to it. If they asked only for setup, stop after the verification described below; do not create example data automatically.

For recurring conversational tracking, correction or recall, follow the [conversational-data quickstart](conversational-data.md). It reuses the CLI prerequisites and core skill, then loads the workflow skill and the caller's prepared tracking scope. Do not substitute this guide's example KV manifest or general default-space login for that scope.

This guide uses the TinyCloud CLI and its core `tc-cli` skill. It does not require TinyCloud Chat, an app skill pack, a custom MCP server, or a separate OpenKey CLI login. Preserve existing agent settings, model-provider login, packages, skills and TinyCloud profiles.

The commands below use a POSIX shell. Replace uppercase placeholders with the selected values before running them; pass user-supplied values as literal subprocess arguments. Keep profile, host and space explicit in subsequent commands, even when a new tool invocation does not retain shell variables.

## 1. Prepare a durable Node installation

Use the current process's `HOME`, executable search path and operating system. Do not assume another user's home directory or reuse paths from a previous trial. Check `command -v node`, `node --version`, `command -v npm` and `npm --version`.

The combined setup requires **Node.js 22.20 or later** and npm. If either is missing or incompatible, follow the [official Node.js distribution instructions](https://nodejs.org/en/download) for this OS and architecture. Reuse a compatible installation; this guide does not call for upgrading the package pins below.

Install Node in a durable location. Its executable directory and npm's global executable directory must be discoverable by OpenCode and by later independent subprocesses. Do not install under a temporary directory or depend on adding `PATH=...` to each command. Prefer an existing appropriate writable directory already on the agent's `PATH`, without replacing another installation. If changing `PATH` is necessary, make it persistent for the environment that launches OpenCode and relaunch OpenCode from that environment. Editing a shell startup file or exporting a variable in one tool call does not update the running parent process. Retain the task and this guide's next heading across that restart.

After installation, repeat the Node/npm checks from a fresh OpenCode shell tool invocation without a per-command `PATH` prefix. If they fail, resolve the environment before proceeding.

## 2. Follow the shared prerequisites, then return here

Read and follow [the shared TinyCloud setup module](../setup/tinycloud.md). Its caller contract is:

- Original task: the user's task, unchanged.
- Client: `opencode` (substitute this for `CLIENT` in the module's installer command).
- Calling guide: this document, at the URL or local path from which it was read.
- Exact return heading: **3. Choose the profile, host and space**.

The reviewed pins are `@tinycloud/cli@0.10.0` and `skills@1.7.0`. Resolve relative links against this guide's location. Run only the needed installation steps, sequentially. If an existing executable or modified skill conflicts with the required release, report that specific conflict rather than replacing unrelated work or silently upgrading.

After the module returns, use another independent shell tool invocation to check:

```sh
command -v node
node --version
command -v npm
npm --version
command -v tc
tc --version
```

The selected `tc` must report `0.10.0`. Read the known installed skill directly at `$HOME/.agents/skills/tc-cli/SKILL.md`, then its `release.json`, `INSTALL.md` and `AUTH.md`. Do not search unrelated home directories. These paths belong to the pinned installer; follow `INSTALL.md` if the installation differs. Its documented automatic discovery procedure is to start a new session and ask it to use `tc-cli`. Directly reading the installed files lets you follow their instructions now; it does not promise hot activation or change OpenCode's command permissions. Preserve the task and next step if a new session is needed.

For reference, the release includes [SKILL.md](https://unpkg.com/@tinycloud/cli@0.10.0/skills/tc-cli/SKILL.md), [INSTALL.md](https://unpkg.com/@tinycloud/cli@0.10.0/skills/tc-cli/INSTALL.md), [AUTH.md](https://unpkg.com/@tinycloud/cli@0.10.0/skills/tc-cli/AUTH.md), [REFERENCE.md](https://unpkg.com/@tinycloud/cli@0.10.0/skills/tc-cli/REFERENCE.md) and the [CLI README](https://unpkg.com/@tinycloud/cli@0.10.0/README.md). Use the installed references for detailed commands.

Standalone OpenKey is optional: use [its setup module](../setup/openkey.md) only for a task that explicitly needs direct `openkey` commands, then return to step 3. That module pins `@openkey/cli@0.1.4`. Its login needs a caller-supplied OAuth client ID; never invent one. Installing or signing in with `openkey` does not authorize TinyCloud storage. The `tc` login in step 4 already provides OpenKey authentication.

## 3. Choose the profile, host and space

If the user asked only to install the prerequisites, go directly to **Completion and later live verification** now and report that storage access was not tested. Continue into profile selection and authentication only when requested or needed for the original data task.

Start with `tc profile list`. Reuse the user's intended profile and identity when available. For an existing profile, inspect its safe local context with `tc --profile PROFILE context`; then record the intended host and space explicitly. Do not dump key files, session files or whole profile files into the conversation.

For a new profile, choose an unused name other than `default` when preserving an existing default-profile selection, then run:

```sh
tc init --name PROFILE --host HOST --key-only
```

`--key-only` creates local keys and profile configuration without starting consent. Plain `tc init` starts browser authentication. If the name exists, reuse it only if it is the intended profile; otherwise choose another name. Do not delete a profile to make the example work or change the user's default profile merely for this task. The first profile becomes the default when no valid default exists; creating a profile named `default` also changes that selection.

For a fresh general-purpose account, the CLI defaults are host `https://node.tinycloud.xyz` and space name `default`. Use these only when appropriate for the user's task. Existing data requires its actual host, owner identity and space. A new local profile is not a new OpenKey account. Short space names resolve against the selected owner; retain the full resolved space URI from `context` after login and use it for later operations when possible.

Choose permissions before login. General login without a manifest requests broad default-space consent, including writes; selecting `--space` on a later command does not narrow that grant. For a read-only or otherwise limited task, use the task-scoped path in step 4. Reusing a profile preserves its existing grants, so a narrow new grant does not make the whole profile read-only.

For a dedicated smoke test, choose the scratch key before requesting permissions: `quickstart/<fresh UUID>/note`, with a newly generated UUID for this run. Record the exact key and selected space. It must not be an existing user note. An ordinary task should instead use its own intended resource.

## 4. Let the human authenticate

If the selected profile already has a suitable session, proceed to the real access check in step 5. Local session status is only a hint; renew consent when access requires it. Otherwise choose one login path:

- **Task-scoped access:** follow the installed `AUTH.md` and prepare a permission manifest for the intended resource and actions in one space. Run the scoped command below. When the expected primary owner DID is known, also pass `--owner PRIMARY_DID`.
- **General default-space access:** if the user wants that broader authority, run the general command below and have them review the displayed permissions. Do not use broad login as a fallback for a failed scoped grant.

```sh
# Task-scoped login; FILE is the absolute path to the task permission manifest.
tc --profile PROFILE --host HOST auth login --method openkey --manifest FILE --expiry 7d --no-popup

# Alternative: general default-space consent, when that is the chosen scope.
tc --profile PROFILE --host HOST auth login --method openkey --no-popup
```

Always specify `--method openkey`; a non-interactive login without an explicit method can choose local-key authentication. `--no-popup` prints the browser URL and leaves the CLI waiting for its local callback. The human opens that URL, selects the intended signing identity and approves consent. Keep the CLI running while they do so.

For a simple KV task, this is a minimal CLI manifest shape. Replace `SPACE` and `EXACT_KEY` before saving it as `FILE`; a read-only task needs only `get`. For the explicitly requested note smoke test, use its chosen scratch key and actions `get`, `put` and, if cleanup is wanted, `del` (the capability action used by `kv delete`).

```json
{
  "app_id": "generic-tinycloud-task",
  "space": "SPACE",
  "permissions": [
    { "service": "kv", "path": "EXACT_KEY", "skipPrefix": true, "actions": ["get"] }
  ]
}
```

Here `app_id` is a manifest identifier, not an app to install. `skipPrefix: true` keeps the requested key exact rather than adding the identifier to its path. The manifest describes a request; the human's signed consent grants access. See `AUTH.md` for signed scope verification and additional-space grants.

The browser must be able to reach the CLI's loopback callback. If the agent tool cannot keep that flow running or expose the required interactive input, give the human the selected login command to run in their own terminal on the same machine, with the same `HOME`, CLI and profile. They may add `--paste` to the chosen command and paste the complete return code **directly into the waiting CLI prompt**. Keep all scope and owner flags. In interactive callback mode the CLI also offers terminal paste.

Never ask the human to paste a signed return code, grant or session file into model chat. Do not route it through a shell argument, a model-created file or an agent stdin tool. This generic guide has no in-chat paste capture. After the human finishes the terminal step, continue with safe context inspection; no return code needs to enter the conversation.

```sh
tc --profile PROFILE --host HOST context --space SPACE
tc --profile PROFILE --host HOST auth caps
```

Check the owner, host and resolved space against the intended task. A `did:key` is the session identity, not the data owner's primary identity. `context` deliberately reports `access: "not-tested"`; local session metadata and listed capabilities do not prove that storage works.

Login saves the space returned by OpenKey. Selecting a space does not create or host it, and the CLI's restored-session storage path does not create it automatically. Browser approval may report activation; verify the actual resource next. If the space is missing or unhosted, stop and check the intended owner, host and space, then use the documented owner hosting flow appropriate to that identity. Do not assume an empty space should be created or that `tc space create` will repair an OpenKey session.

## 5. Verify real access and continue the task

Choose the check that matches the original request:

- **Read-only task:** read the intended, known authorized resource in the selected space. For KV, use `tc --profile PROFILE --host HOST kv get KEY --space SPACE --json`. For SQL, follow the core reference and use the task's authorized query. Do not create a demo key.
- **Task that writes:** perform the requested write, then verify its stored value with a read when authorized. Preserve unrelated data and do not add a second example object.
- **Setup only:** finish the requested installation and, if requested, authentication. Verify an explicitly chosen existing resource if one is available and authorized. Otherwise report that prerequisites/local session were checked and storage access remains untested; stop without writing a demo.
- **Explicit quickstart smoke test:** use the harmless note below. This is a live storage write and must be the selected task, not an automatic side effect of setup or documentation checking.

For the note smoke test, use the previously chosen scratch key in every command. First read that exact key:

```sh
tc --profile PROFILE --host HOST kv get SCRATCH_KEY --space SPACE --json
```

Proceed only on the CLI's specific missing-key `NOT_FOUND` result. If a value already exists, choose a fresh key and adjust any exact-key permission request before retrying. A permission error, network failure or `SPACE_NOT_HOSTED` is not evidence that the key is unused.

Then save and read the note:

```sh
tc --profile PROFILE --host HOST kv put SCRATCH_KEY 'Hello from my TinyCloud quickstart.' --space SPACE
tc --profile PROFILE --host HOST kv get SCRATCH_KEY --space SPACE --json
```

Confirm that the returned JSON `key` is the chosen scratch key and `data` is exactly `Hello from my TinyCloud quickstart.`. A successful write message alone is insufficient. The explicit JSON form avoids confusing a returned value with CLI status text or its stored serialization.

If cleanup was chosen and authorized, delete only that exact scratch key, then read it again and require the specific missing-key result:

```sh
tc --profile PROFILE --host HOST kv delete SCRATCH_KEY --space SPACE
tc --profile PROFILE --host HOST kv get SCRATCH_KEY --space SPACE --json
```

Keep a note the user asked to save. Never delete a prefix, another key or a space as quickstart cleanup. If access fails, report the actual error and selected context, and resolve the missing capability or hosting issue without switching identities or widening consent silently.

Return to the user's task in the same conversation. The installed `REFERENCE.md` covers SQL, spaces, sharing and delegation; use `SDK.md` only when the task needs integration code. Do not introduce app schemas or retrieval helpers for ordinary TinyCloud work.

## Completion and later live verification

Report what is installed, the selected profile/host/space, what operation actually succeeded and whether the scratch note remains. Distinguish prerequisite checks, local session checks and confirmed storage access. For setup only, stop here.

This draft was checked against the pinned package documentation and shared modules. It has **not** been validated by a generic OpenCode end-to-end run. A later, separately authorized live trial should check:

1. A fresh OpenCode process and subsequent independent tool commands can resolve Node, npm and `tc` from durable paths; the core skill is readable and discovered as documented.
2. The user can complete callback or direct terminal login without exposing the signed response to the model, selecting the intended existing identity and the chosen scope.
3. For a fresh identity, the approved default space is actually hosted on the selected node; any browser activation report is followed by a real storage check.
4. The chosen scratch note round-trips exactly and optional cleanup affects only that key; read-only and setup-only requests produce no unsolicited writes.

An earlier app-specific TinyChat trial does not validate this generic flow.
