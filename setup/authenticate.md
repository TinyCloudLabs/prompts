# Select a TinyCloud account and authorize the pending task

This module orchestrates CLI `0.10.0` authentication for the [general task guide](../quickstart/tinycloud.md), [read-only discovery](../quickstart/retrieve-data.md) and their scoped app operations. [Shared prerequisites](tinycloud.md) remain installation-only. Do not invoke authentication for an installation-only request. No TinyChat pack, standalone OpenKey CLI or new owner identity is needed.

The caller supplies the original request, actual client and execution mode, request date/timezone, its exact return heading, the role (reader, ordinary task or provisioner), and a narrowly scoped manifest when known. Return there automatically after verified consent; installation or a login receipt does not finish the user's operation.

Every `auth login` and `auth request --grant` in this procedure includes `--manifest FILE`. If a CLI error hint or general installed example omits it, keep this caller's scoped procedure. Prepare and inspect the manifest before launching consent; a missing manifest is not permission to request the CLI's broad defaults.

## 1. Select and retain the context

Use safe supported commands with the selected absolute `TC_BIN` and any intended `TC_HOME`:

```sh
"$TC_BIN" profile list --json
"$TC_BIN" context --json
```

Preserve explicit caller selections, `TC_PROFILE`/`TC_HOST` selections and the intended saved context. Inspect individual candidate profiles with `--profile PROFILE context --json` if necessary. A missing explicitly selected profile, stale session or failed request does not authorize switching to another owner. Do not read credential files, copy grants, or invent owner metadata. `profile list` exposes profile names and hosts; its `did` is the session DID. Use `context.ownerDid` for an authenticated primary owner. Fresh context may report `ownerDid: null` and a missing session; defer `context --space account` until scoped login, since it cannot resolve that space without an owner.

When no custom host is selected or saved, use **`https://node.tinycloud.xyz`**, the canonical hosted endpoint. A fresh hosted user need not provide a DID, host or space. Preserve a known custom host and make the chosen `--host` explicit thereafter; do not silently redirect it to the canonical endpoint, scan servers or assume different hostnames share data. CLI `0.10.0` supplies a default host to its SDK; this route does not discover arbitrary owner-specific deployments.

Reuse the intended suitable profile. A selected default alone is not reason to ask about every other profile; ask a meaningful account choice only when multiple plausible saved accounts leave the task's intended owner ambiguous. Present safe account/profile labels, not keys. Preserve the user's default selection. An explicitly protected reader stays read-only, and a provisioner is never the ordinary task context. Standalone retrieval uses a suitable reader; general discovery may use the ordinary task profile even if it already has valid write grants. A new narrow grant does not reduce previous authority.

If no suitable local session profile exists, choose an unused durable **configuration home** and profile for the required role, then initialize it:

```sh
TC_HOME="$TASK_TC_HOME" "$TC_BIN" init --name "$PROFILE" --host "$HOST" --key-only
```

Do not overwrite an existing profile or change a default in an existing home. The isolated home has its own default. `--key-only` creates a local session key, not an authorized account or replacement primary owner. In a new profile the browser selects the intended existing signing account; its returned primary owner is authoritative, never the local session-key DID. When an expected owner is already known, retain it for `--owner` on login.

Before leaving for consent, save the nonsecret continuation in the caller's private task-state directory (directory `0700`, files `0600`, atomic updates). Include CLI path, selected configuration home/profile/host, expected owner if known, client/mode, calling guide/revision and return heading, original request, resolved dates/timezone, manifest path, pending phase, and any existing operation/provisioning plan handles. Reuse their allocated IDs; do not make a new operation on each approval. Let the CLI manage credentials. Never store keys, signed responses, tokens or grants in this file. Record the continuation path for a fresh process.

## 2. Prepare exactly the missing scope

First try the caller's required live reads with suitable saved authority. An expired session, access denial, unavailable host or missing owner metadata is a specific condition, not an empty account. Do not create replacement data or broaden scope to conceal it.

The initial registry manifest is supplied by [retrieval step 3](../quickstart/retrieve-data.md#3-obtain-registry-read-access): logical `space: "account"`, KV `get`/`list` on `applications/`, and capability metadata `read` on path `""`. Keep `defaults: false`, `includePublicSpace: false`, fully qualified service names and `skipPrefix: true`. Do not add hosting, registry writes, SQL/index access or app data before discovering the target.

**First-login bootstrap:** a logical `account` space is supported when the owner is not known yet. Scoped login preserves that logical name in the OpenKey request. The browser selects the owner, resolves its account space, and returns signed authority. CLI verification binds that response to the selected owner's full `tinycloud:<primary DID without did:>:account` space and the requested permissions. Do not substitute a session-key space, ask the user for a DID, or run unscoped login to discover one. After consent, obtain the actual full URI from `context --space account --json`.

Once the owner is known, resolve each app space using safe `context --space ... --json` and use its full URI in subsequent manifests. CLI `0.10.0` scoped login accepts one space per request. Request only the selected app's necessary reads/writes or exact provisioning abilities; different spaces can require several consents. Inspect the effective requested resources and actions, not just the manifest's display name.

## 3. Complete consent through a supported transport

For a fresh profile, or renewal of an expired primary login, use the caller's saved manifest:

```sh
TC_HOME="$TASK_TC_HOME" "$TC_BIN" --profile "$PROFILE" --host "$HOST" auth login \
  --method openkey --manifest "$MANIFEST" --expiry 7d
```

Add `--owner "$EXPECTED_OWNER"` when known; setup profiles should use the caller's shorter expiry, normally `1h`. Never clear a valid primary login to obtain another space's authority. For a profile with a valid primary login, request only missing scope:

```sh
TC_HOME="$TASK_TC_HOME" "$TC_BIN" --profile "$PROFILE" --host "$HOST" auth request \
  --manifest "$MANIFEST" --grant --expiry 7d
```

Additional grant duration is capped by the active session. Reuse valid grants that pass actual reads. `ACCOUNT_SPACE_UNAVAILABLE` from a restored delegated profile needs a supported owner-backed login/context; a broader manifest does not repair absent owner metadata.

Use the CLI's **browser/loopback callback** in Codex, Claude Code and OpenCode when the browser can reach the waiting CLI on the same machine. Keep the command running in a persistent tool/terminal session, retain its process handle, tell the human to complete the displayed browser approval, and poll for completion. CLI `0.10.0` times out a callback after five minutes; distinguish expiry from denial, retain the pending task, and retry the same scope when the human is ready. Do not end the conversation asking for an arbitrary “continue,” kill the waiter because consent is not immediate, or start competing logins. The authorization URL is a request; the returned signed response is secret and must go directly to the CLI callback. If browser launch is suppressed (`--no-popup` or `TC_AUTH_NO_POPUP=1`) or no window opens, give the human the exact approval URL emitted by the waiting CLI. Do not claim a browser opened without evidence. This request URL contains the public session key and requested scope, not a signed response; opening it is the browser intervention. Keep its matching callback waiter alive.

If the browser cannot reach that loopback, classify that transport limitation before changing routes. Use a **human-operated interactive terminal on the machine that owns this configuration home**. Provide the exact nonsecret command with absolute executable/manifest paths, configuration home, profile and host. For first login add `--paste`; `auth request --grant` supports direct interactive input without a `--paste` flag. The human enters any signed response directly into that waiting native CLI, never into model chat or an agent tool. Stop only this task's previous waiter before starting the replacement. Keep polling safe context/live reads from the agent and resume the original task when they verify the required access. Record the terminal intervention; do not claim uninterrupted automatic capture.

Client boundaries:

| Client | Generic route and boundary |
| --- | --- |
| Codex / Claude Code | Browser callback, or the human-operated native terminal above. No private chat-paste interceptor is provided by this guide. TinyChat's `login --code-file` is its helper option, not a `tc auth login` option, and only consumes a file created by some other private channel. Do not invent that channel or have the model write a response file. |
| OpenCode local TUI | The same CLI callback/terminal route. TinyChat's native tools and interceptor are tied to its app configuration and permission manifest, so do not install or invoke them for generic registry/app consent. Their stock `1.18.31` local macOS direct-TUI activation contract does not make them a generic adapter. |
| OpenCode `run`, `serve`, `attach`, wrappers or remote clients | TinyChat native capture is unsupported in these modes. A reachable CLI callback may still work; otherwise the human-operated terminal is an explicit intervention. Without either supported route, report the transport blocker and retain the pending task. |

Never say “paste the code here” without a verified native interceptor that captures it before model delivery. Never reproduce signed responses in tool arguments, generated files/scripts, chat or agent-controlled stdin. A loader file is not proof of active capture. If no supported transport is available, stop only the consent-dependent work; preserve the original task and report the exact missing route without substituting broad login.

## 4. Verify and resume the caller

After consent, run safe context with the same selected home/profile/host and requested space. Compare actual host, primary owner, full space and session validity with the retained selection. On first login bind the browser-selected owner; on later consents reject a mismatch and keep the pending task on its intended owner. Do not switch owners to make reads succeed.

Verify the caller's live reads. For initial discovery, run `account apps list --live --json` and continue the [canonical-record decoding and selection procedure](../quickstart/retrieve-data.md#4-select-the-app-and-its-declared-resources). Context, `auth caps`, `auth retry`, a cached registry and a successful login receipt are not proof of data access. A denied/unavailable registry must not become a no-match or permission to create an app.

On cancellation or denial, record the pending phase and that the original operation has not completed. Do not repeatedly launch consent after refusal. On expiry, preserve selections and renew only the necessary scope when the user resumes. A supported approval resumes the recorded return heading in this conversation without another task prompt. If an operation may already have been dispatched, reconcile its original IDs/readback before retrying; preserve the original date across midnight and never allocate a replacement identity merely because the receipt was lost.

Missing hosting is separate from missing authority. A registry failure must first be classified; standalone reads do not enroll or host spaces. For an explicit storage task whose required owned space is confirmed unhosted, retain the exact error, selected owner/host/full space and pending task. Complete the host's supported owner enrollment before repeating discovery; if that procedure is unavailable, report that specific dependency. CLI `0.10.0` `space host` requires an owner signing context and does not repair an OpenKey session-only profile; do not suggest it as a working fallback or ask for a private key. Browser sign-in/delegation activation alone does not prove hosting. Any separate setup context must remain separate from ordinary authority, and actual subsequent reads must verify enrollment. Never label a pre-hosted fixture as fresh-owner acceptance.
