---
name: tc-publish
description: Publish a document or HTML page to TinyCloud and return a shareable link. Use when the owner asks the agent to publish, share, or host a file — private owner-only links, public bearer links, verification, and revocation.
metadata:
  version: "0.2.0"
---

# Publish documents and HTML with `tc share`

Publish a file from the owner's TinyCloud space and return a link. The agent holds a scoped delegation the owner approves through OpenKey device authorization — no passwords, no copied credentials.

Requires `@tinycloud/cli` **1.0.0-beta.16 or newer** (TC-540: `tc enable share`, device login with `--manifest` and `--expiry`; TC-538: publish from OpenKey sessions). Install with `npm install --global @tinycloud/cli@beta` or an exact version pin — never `@latest` (still 0.9.0).

## Rules that are never optional
- **Always verify a publish before reporting it.** Public links: `share receive - --stdout` piped to `sha256sum`, matching the source. Addressed links: `share inspect - --json` — the agent cannot `receive` an addressed link (the recipient's session is required; `CLAIM_REQUIRED`).
- **Never log or paste** link fragments (`#tc1=…`), user codes, session keys, delegations or signed responses — except the link the owner asked for, sent on the owner's own channel.
- **Choose the link type explicitly.** Use the owner-only email link for anything private; use a public link only when the owner asks for one or the content is clearly shareable. Bearer links are un-revocable until TC-545.

## 1. Locate and check the CLI

`tc` is an npm-installed CLI, not bundled with a skill, and `command -v tc` can resolve to `/usr/sbin/tc` (Linux traffic control). Use the absolute path the operator provides — conventionally `TC_BIN` — and check it prints a TinyCloud semver:

```sh
"$TC_BIN" --version                 # must be >= 1.0.0-beta.16
"$TC_BIN" enable share --help       # enable share must exist
```

If the version or command is missing, install/upgrade `@tinycloud/cli@beta` and re-check. Do not proceed on an older CLI.

## 2. One-time setup per profile

Use a dedicated profile — scoped login refuses to replace an existing session:

```sh
"$TC_BIN" init --name publisher --key-only
LOG=$(mktemp /tmp/enable-share.XXXXXX.log)
nohup "$TC_BIN" --profile publisher enable share > "$LOG" 2>&1 &
```

`enable share` is `auth login --device --manifest builtin:share-publishing` with the reason "Allow this TinyCloud CLI profile to publish Share links." Its only option is `--replace-session` — it has no `--expiry`; it requests the maximum 30-day session and the owner may pick a shorter lifetime on the consent page. For a shorter request use:

```sh
nohup "$TC_BIN" --profile publisher auth login --device --manifest builtin:share-publishing --expiry 7d > "$LOG" 2>&1 &
```

`--expiry` accepts 1 minute to 30 days; anything else is `INVALID_EXPIRY`.

Read the `Approve on your phone: https://openkey.so/device?user_code=XXXX-XXXX (code XXXX-XXXX)` line from `$LOG` and send the owner the link and code on the agent's own channel (e.g. iMessage) — never through a shared paste buffer. The waiter exits in about 10 minutes: exit 0 with `authenticated: true` in `$LOG` means approved; any non-zero exit means expired or declined — re-run.

On success the JSON shows `authenticated: true`, `scoped: true`, the approved `permissions`, `declined: []`, `expiresAt` (session lifetime, up to 30 days).

Check the profile afterwards: `"$TC_BIN" --profile publisher context --json` → `host` (`https://tee.node.tinycloud.xyz`), `spaceId` (`tinycloud:pkh:eip155:1:0x…:default`), `ownerDid`, `session.state`/`session.expiresAt`.

If `AUTH_REQUIRED` later reports the session expired, re-run the same `enable share` (or the same `auth login --device --manifest …`) on the same profile — renewing the same scope needs no `--replace-session`; only narrowing or shortening the scope does.

## 3. Publish

```sh
# Owner-only (private): addressed to the owner's email
"$TC_BIN" --profile publisher share publish FILE --to email:owner@example.com --expires 7d

# Public: anyone with the link (only when the owner asks)
"$TC_BIN" --profile publisher share publish FILE --expires 7d
```

Both print one line: the URL. For bearer links it's `https://share.tinycloud.xyz/viewer#tc1=…`. The fragment carries an access delegation plus key — the whole URL is the credential (the file is stored unencrypted in the owner's space). `--json` deliberately omits the URL; read it from human-mode stdout or recover it later with `share show <id> --reveal-link`.

Share lifetime is clamped to the session's end. An explicit `--expires` beyond the session fails `SESSION_LIFETIME_EXCEEDED`; under 60 s is refused. Pick a duration inside the session's remaining lifetime (`context --json` → `session.expiresAt`).

## 4. Verify — always, before reporting

Public (bearer) links — round-trip and hash:

```sh
printf '%s' "$URL" | "$TC_BIN" --profile publisher share receive - --stdout | sha256sum
sha256sum FILE     # must match byte-for-byte
```

Addressed (`--to email:`) links — `receive` is not possible without the recipient's session (`CLAIM_REQUIRED`); inspect instead:

```sh
printf '%s' "$URL" | "$TC_BIN" --profile publisher share inspect - --json
```

Check `metadata.target.kind` is `email`, `metadata.resource.path` matches the published file, `metadata.expiresAt` is the requested expiry, and `link.kind` is `policy`.

## 5. What each link does

- **Public (`viewer#tc1=…`)**: opens without sign-in; Markdown renders; `.html`/`.htm` executes in a sandboxed opaque-origin frame (scripts run, can't reach viewer/storage/fragment; external resources blocked → self-contained files only). "Sender unverified" — the link proves content, not identity.
- **Owner-only (`--to email:`)**: a policy link; the recipient proves the mailbox with an 8-digit code in the viewer — no TinyCloud account needed. HTML downloads instead of rendering.

## 6. Lifecycle

```sh
"$TC_BIN" --profile publisher share list                    # active shares
"$TC_BIN" --profile publisher share show <id>               # metadata
"$TC_BIN" --profile publisher share show <id> --reveal-link # full URL
"$TC_BIN" --profile publisher share revoke <id>             # addressed links only
```

Bearer links cannot be revoked until TC-545 — use the shortest workable `--expires`.

## Errors — `{code, message, hint}`, never server text

| Code | Meaning | Action |
|---|---|---|
| `AUTH_REQUIRED` | Session expired or invalid | Re-run `enable share` (device login) |
| `PERMISSION_DENIED` | Scope missing `builtin:share-publishing` | Re-enable on this profile |
| `SESSION_LIFETIME_EXCEEDED` | `--expires` outlives the session | Shorten `--expires` or re-login |
| `ORIGIN_MISMATCH` | Session bound to another host/origin | Re-login against the right host |

See `QUICKSTART.md` for the minimal checklist and a plain-words description of what the owner does on their phone.
