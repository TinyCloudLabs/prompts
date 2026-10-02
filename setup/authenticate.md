# Select a TinyCloud account and authorize the pending task

Use this conditional procedure with published CLI `0.10.0`. Retain the original request, date/timezone, role, selected context and caller's return heading; successful consent resumes that operation, not another setup prompt. Installation alone does not require login.

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

Reuse the intended suitable profile. Ask an account question only when genuinely competing saved accounts leave the owner ambiguous. Create a separate role profile only when necessary, for example to separate setup authority from ordinary operations or protect a reader:

```sh
"$TC_BIN" profile create "$PROFILE" --host "$HOST" --posture owner-openkey --operator agent
"$TC_BIN" --profile "$PROFILE" --host "$HOST" context --json
```

Use an unused name; do not change the saved default or overwrite a profile. Creation is local session-key initialization, not authorization or a new primary owner. Keep expected owner when known; otherwise the browser's selected primary owner must be verified after first login. Save necessary nonsecret continuation under the entry's [private pending path](../quickstart/tinycloud.md#pending-operations-and-recovery), not in another account catalog.

## 2. Prepare exactly the missing scope

First try required live reads with suitable saved access. Classify expired authority, permission denial, missing owner metadata and unavailable/unhosted space separately. None establishes an empty registry.

For registry discovery use the [registry-read manifest](../quickstart/retrieve-data.md#3-obtain-registry-read-access). Logical `space: "account"` is supported for scoped first login before the owner is known: OpenKey selects the primary owner, resolves its account space and the CLI verifies the returned scope. Do not ask for a DID merely to bootstrap or run broad login. After consent obtain the full URI with `context --space account --json`.

For app operations, resolve logical spaces through `context --space ... --json` for the selected owner. Generate a separate consent manifest with one explicit top-level space, `defaults: false`, `includePublicSpace: false`, fully qualified services, fully resolved resource paths and `skipPrefix: true` on every permission. Include the OpenKey-required `tinycloud.capabilities` action `read` on path `""`. CLI `0.10.0` prefix/per-entry-space loading differs from SDK resolution; never copy a broad registered app manifest into consent. Verify exact effective resources and actions. First login supports one space; several app spaces can require several approvals.

## 3. Complete consent through a supported transport

For an absent or expired primary session, use the prepared scoped manifest:

```sh
"$TC_BIN" --profile "$PROFILE" --host "$HOST" auth login \
  --method openkey --manifest "$MANIFEST" --expiry 7d --no-popup
```

Add `--owner "$EXPECTED_OWNER"` when known. Setup consent should be short-lived, normally `--expiry 1h`. Preserve a valid primary session when adding missing authority:

```sh
"$TC_BIN" --profile "$PROFILE" --host "$HOST" auth request \
  --manifest "$MANIFEST" --grant --expiry 7d --no-popup
```

`--no-popup` explicitly prints the approval URL for the agent to relay. Reuse grants that pass actual reads; request no new consent just because a new subprocess started. Do not assume every additional grant is universally capped by primary-session expiry; inspect the resulting validity and actual access.

Use the browser/loopback callback when the human's browser can reach the waiting CLI on the same machine. Keep one waiter running for its full **five-minute** window, using a persistent process handle or at least **six minutes** of tool timeout (for tools using milliseconds, `360000`). Retain the handle and observe completion; do not kill it because approval is not immediate or start competing logins. The approval URL is not a signed response.

**CLI 0.10.0 warning:** callback failures can be mislabeled “Cannot open browser in non-interactive mode.” Preserve observed timing and underlying diagnostics; this message alone does not prove browser-launch failure or human refusal. Keep this warning until a corrected CLI and dependency chain are published and verified.

If loopback is unreachable or the agent cannot retain the waiter, use a **human-operated native terminal** on the machine holding this same CLI home. Provide the exact nonsecret command with absolute executable/manifest paths, home/profile/host. First login supports `--paste`; additional-grant mode accepts private interactive terminal input but has **no `--paste` flag**. Stop only this task's former waiter before replacement. Signed responses go directly into the human's waiting CLI, never through model chat, generated files, tool arguments or agent-controlled stdin. Record the intervention and resume from safe context/live reads. No plugin, TinyChat interceptor or unpublished helper is required or implied.

Distinguish reported refusal, local cancellation, timeout and transport failure. Closing a browser window is not machine-observed denial. After refusal do not repeatedly launch consent. With no supported transport, keep the task pending and report that precise missing prerequisite; do not broaden login.

## 4. Verify and resume the caller

Use the same home/profile/host to inspect context and the requested space. Bind the browser-selected owner on first login; reject unexpected owner/host/resource changes on later approvals. Then perform the caller's actual live reads. Context, a login receipt, `auth caps` or `auth retry` alone is not proof of data access.

Resume the saved caller heading automatically with the original request, dates and IDs. If a mutation may already have been dispatched, reconcile remote state before retrying. Consent refusal/expiry leaves the original operation accurately pending, not completed.

Missing hosting is separate from missing permission. A restored OpenKey session-only profile cannot repair an unhosted space with CLI `space host`, which requires an owner signing context. Preserve the exact host/owner/full-space error and use the host's supported owner enrollment process if available. Do not request private keys or switch spaces to evade denial. If enrollment is unavailable, report that concrete prerequisite. Browser sign-in and tests on already-hosted owners do not establish a fresh-owner hosting journey.
