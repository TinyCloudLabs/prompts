# Select a TinyCloud account and authorize the pending task

Retain the original request, date/timezone, role, selected context and caller's return heading. Usable saved context goes straight to the caller's actual discovery/reads. Missing login or required authority follows scoped consent below; successful verification resumes the original operation in this conversation without another task prompt. Invalid saved configuration follows recovery, not a new login. The published CLI baseline is `0.10.0`; installation alone does not require login.

## 1. Select and retain the context

Use the standard home by default. If `TC_HOME` is intentionally configured, use that same absolute durable **parent home** in every subprocess: state lives in `$TC_HOME/.tinycloud`, not directly in `$TC_HOME`. Do not invent a new temporary home for every task.

Profile precedence is explicit `--profile`, then `TC_PROFILE`, then saved default, then `default`. Preserve that selection. Use redacted context, and list profiles only when initialization or selection is unresolved:

```sh
"$TC_BIN" context --json
"$TC_BIN" profile list --json
"$TC_BIN" --profile "$PROFILE" context --json
```

`context` says `access: not-tested`; verify access with the operation's actual reads. A missing profile differs from an existing key-only profile with `ownerDid: null`. Profile-list `did` identifies the session key, not the primary owner. Use `context.ownerDid` after owner-backed login. Do not read raw credential files or use `profile show --json` for safe discovery; `status --json` covers all profiles, not just the selected one.

Retain explicit/environment/saved host intent. Without an explicit host the CLI can discover a local node; inspect the resolved context instead of assuming the hosted default. If deliberately initializing a hosted connection with no other host intent, use `https://node.tinycloud.xyz`. Once resolved, supply that exact `--host` on subsequent commands. Failed access never authorizes a host/profile switch.

**If saved configuration is invalid:** preserve it and the selected home/profile/host. Retain the exact nonsecret command, diagnostic/error code and client version/mode; do not repeat a reported failed authentication merely to reproduce it. If safe context selection has not been inspected, use the redacted commands above, not raw credential files. Distinguish malformed configuration, an absent profile, missing owner metadata, expired authority and denied scope. Apply only an existing documented nondestructive repair that matches the observed diagnostic, then retry safe context inspection. Do not delete/reset configuration, overwrite a profile, change the saved default or substitute a fresh home/account/host. If no supported repair matches, keep the lookup pending and report the diagnostic and the specific repair/access prerequisite; request only the missing nonsecret detail, not a private session export.

Reuse the intended suitable profile. Ask an account question only when genuinely competing saved accounts leave the owner ambiguous. If the intended profile is absent, initialize it with the CLI below; the OpenCode adapter requires an existing selected profile and will not create or switch one. Create a separate role profile only when necessary, for example to separate setup authority from ordinary operations or protect a reader:

```sh
"$TC_BIN" profile create "$PROFILE" --host "$HOST" --posture owner-openkey --operator agent
"$TC_BIN" --profile "$PROFILE" --host "$HOST" context --json
```

Use an unused name; do not change the saved default or overwrite a profile. Creation is local session-key initialization, not authorization or a new primary owner. Keep expected owner when known; otherwise the browser's selected primary owner must be verified after first login. Save necessary nonsecret continuation under the entry's [private pending path](../quickstart/tinycloud.md#pending-operations-and-recovery), not in another account catalog.

## 2. Prepare exactly the missing scope

First try required live reads with suitable saved access. Classify expired authority, permission denial, missing owner metadata and unavailable/unhosted space separately. None establishes an empty registry.

For registry discovery use the [registry-read manifest](../quickstart/retrieve-data.md#3-obtain-registry-read-access). Logical `space: "account"` is supported for scoped first login before the owner is known: OpenKey selects the primary owner, resolves its account space and the CLI verifies the returned scope. Do not ask for a DID merely to bootstrap or run broad login. After consent obtain the full URI with `context --space account --json`.

For app operations, resolve logical spaces through `context --space ... --json` for the selected owner. Generate a separate consent manifest with one explicit top-level space, `defaults: false`, `includePublicSpace: false`, fully qualified services, fully resolved resource paths and `skipPrefix: true` on every permission. Include the OpenKey-required `tinycloud.capabilities` action `read` on path `""`. CLI `0.10.0` prefix/per-entry-space loading differs from SDK resolution; never copy a broad registered app manifest into consent. Verify exact effective resources and actions. First login supports one space; several app spaces can require several approvals.

Keep nonsecret setup configuration and its referenced consent manifest in private durable files (directories `0700`, files `0600`). Each pending scope is immutable; use a separate manifest/configuration for a different scope after the current approval finishes. Retain every file still referenced by saved setup, including after the task completes, so return visits can reuse it. Do not put a referenced manifest inside a pending-operation directory scheduled for deletion on completion.

## 3. Complete consent through a supported transport

### OpenCode

For missing authority in OpenCode, use the existing integration's **`0.1.1-generic.1` branch preview**, not TinyChat's app-specific setup or meeting permissions. [Install/load the pinned preview only if needed](tinycloud.md#opencode-private-sign-in). Continue only when `tinychat_setup`, `tinychat_authorize` and `tinychat_signin_status` are callable. The [versioned transport contract](https://d33365c2.tinychat-4jq.pages.dev/agents/tinychat-retrieval/0.1.1-generic.1/references/setup.md#selected-context-preview) documents this extension; it is not a production release.

The adapter inherits `TC_HOME` (or `HOME`) and resolves `tc` from OpenCode's startup `PATH`. It must be the same executable as the selected `$TC_BIN`, with the same durable home in subsequent CLI commands. Do not silently substitute another installed CLI or override the home in app configuration.

Write a private JSON configuration at an absolute `CONFIG` path using these exact fields:

| Field | Value from this pending operation |
| --- | --- |
| `schemaVersion` | `1` |
| `profile` | The existing selected CLI profile |
| `host` | The exact resolved host |
| `space` | The manifest's top-level space: `account`, a logical app space or its full URI |
| `manifestPath` | The absolute durable path to the narrow manifest from section 2 |
| `expectedOwner` | The known primary DID, if any; otherwise omit |

The manifest must use `manifest_version: 1`, a nonempty `app_id`, and the explicit permission form in section 2. Configuration `space` and manifest `space` must match. Existing TinyChat selection can adopt this configuration only with its same saved profile and host, retaining the bound owner. `CONTEXT_MISMATCH` is a blocker, not permission to replace saved selection.

1. Call `tinychat_setup` with `configPath` set to `CONFIG`. On return visits to that same saved scope, omit `configPath`. A `ready` result still means `access: not-tested`: go directly to section 4 and real reads. For `login-required` or `grant-required`, continue below; the latter preserves the primary session and adds only missing authority. `PROFILE_NOT_FOUND` returns to profile selection; `SETUP_CONFIG_INVALID` returns to nondestructive diagnostic handling, not consent.
2. Call `tinychat_authorize` with no arguments. On `delivery.status: launch-requested`, say **“Complete sign-in in the browser, then paste the code here.”** This is the existing adapter's private chat capture: it intercepts the human's original single text part before model processing and native conversation persistence, and passes it to official CLI verification. Never request a paste unless capture is loaded and armed for this conversation; never read, reconstruct or supply the response as a model tool argument/file. Browser launch is not proof of approval.
3. Call `tinychat_signin_status` with no arguments to observe the bound authorization outcome. Only verified completion advances to section 4. Missing responses remain pending; do not start competing approvals. If scope or selected context changes while approval is pending, do not reuse that approval for the changed request. Complete approval in the same running conversation.

If browser launch fails or the human reports no page, open the returned `delivery.artifactPath` locally. It is the private HTML carrying the exact approval URL; do not read out, decode or reconstruct it. Keep it until completion/cancellation. If the actual client cannot deliver this artifact and privately capture the response, report the transport blocker rather than substituting a model-visible paste.

Never run raw `tc auth login` or `tc auth request` as an OpenCode fallback, start a shell callback waiter, or send the human to a terminal to bypass unavailable capture. If the actual client/version/launch mode lacks the private transport, report that exact blocker. Do not claim URL delivery, setup completion or an open browser proves approval.

Distinguish reported refusal, local cancellation, timeout and transport failure. Closing a browser window is not machine-observed denial. After refusal do not relaunch consent; after an unavailable transport preserve the task and state the missing prerequisite. Never broaden authority to make a failed approval pass.

### Other CLI-capable clients only

This is not an OpenCode fallback. In another client with a supported private browser/loopback transport, use the same prepared manifest and selected context:

```sh
# Missing or expired primary session:
"$TC_BIN" --profile "$PROFILE" --host "$HOST" auth login \
  --method openkey --manifest "$MANIFEST" --expiry 7d --no-popup
# Valid primary session, missing authority (use instead of login):
"$TC_BIN" --profile "$PROFILE" --host "$HOST" auth request \
  --manifest "$MANIFEST" --grant --expiry 7d --no-popup
```

For login, add `--owner "$EXPECTED_OWNER"` when known. Setup-only consent should be short-lived, normally `--expiry 1h`. Relay the approval URL, not a signed response. The human's browser must reach the waiting CLI; retain one process for its full five-minute callback window (at least six minutes of tool timeout). If unavailable, stop and state that transport prerequisite rather than mixing this route with OpenCode capture. Do not assume additional grants are universally capped by primary-session expiry; inspect validity and actual access.

CLI `0.10.0` can mislabel callback failure as “Cannot open browser in non-interactive mode.” Preserve timing and underlying diagnostics; that message alone proves neither browser-launch failure nor refusal.

## 4. Verify and resume the caller

Use the same home/profile/host to inspect context and the requested space. Bind the browser-selected owner on first login; reject unexpected owner/host/resource changes on later approvals. Then perform the caller's actual live reads. Context, a login receipt, `auth caps` or `auth retry` alone is not proof of data access.

Resume the saved caller heading automatically with the original request, dates and IDs. If a mutation may already have been dispatched, reconcile remote state before retrying. Consent refusal/expiry leaves the original operation accurately pending, not completed.

Missing hosting is separate from missing permission. A restored OpenKey session-only profile cannot repair an unhosted space with CLI `space host`, which requires an owner signing context. Preserve the exact host/owner/full-space error and use the host's supported owner enrollment process if available. Do not request private keys or switch spaces to evade denial. If enrollment is unavailable, report that concrete prerequisite. Browser sign-in and tests on already-hosted owners do not establish a fresh-owner hosting journey.
