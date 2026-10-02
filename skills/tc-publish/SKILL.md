---
name: tc-publish
description: Publish a document or HTML page to TinyCloud and return a shareable link. Use when the user asks the agent to publish, share, or host a file for a person or the public — private owner links, public bearer links, verification, and revocation.
metadata:
  version: "0.1.0"
---

# Publish documents and HTML with `tc share`

Publish a file to the owner's TinyCloud space and return a link. The agent holds a scoped delegation approved by the owner through an OpenKey device authorization — no passwords, no copied credentials.

Requires `@tinycloud/cli` release `1.0.0-beta.15` or newer (device login with `--manifest`, `builtin:share-publishing`, and `tc share publish`). Earlier releases return `INVALID_ARGUMENT` on `share publish` from OpenKey sessions.

## 1. Verify the CLI before anything else

The `tc` executable is bundled with the `tc-cli` skill, not the system PATH. Resolve it by absolute path and check its version:

```sh
TC="$(command -v tc)"                       # verify it is not /usr/sbin/tc or another shim
"$TC" --version                              # must be >= 1.0.0-beta.15
"$TC" auth login --help | grep -- --manifest # device login + manifest must exist
"$TC" share publish --help | grep -- --to    # publish with --to must exist
```

If the version or flags are missing, install or upgrade the CLI and `tc-cli` skill per `tc-cli/INSTALL.md` (`npm install --global @tinycloud/cli@latest` after TC-540 merges; pin the release named there) and re-run the checks. Do not proceed with an older CLI: `share publish` will fail with `INVALID_ARGUMENT` on the adapter's `publish` call.

Then confirm the session profile:

```sh
"$TC" --profile PROFILE context --json
```

Reports `profile`, `ownerDid`, `host`, `spaceId`, `session.state`. A `host` of `http://` (not `https://`) or a missing `spaceId` means the profile is stale or the CLI predates TC-540 — stop and fix the install before continuing. Keep `profile`, `host`, and `space` explicit on every `tc` command.

## 2. Obtain consent — device login with the publishing manifest

Skip this step if `context --json` already shows a live session for this profile. Otherwise request a scoped delegation:

```sh
"$TC" --profile PROFILE auth login --device \
  --manifest builtin:share-publishing --expiry 7d
```

The CLI prints a consent URL and a user code, then keeps a waiter running. Three rules are non-negotiable:

- Run the waiter in the background (`&` / `nohup` / a detached process). It exits when the owner approves, declines, or it expires (~10 minutes). The delegation is invalid until then.
- Surface the URL and code to the owner on the agent's own channel — iMessage, email, a signed status page — not in an untrusted paste buffer or relayed chat transcript. The owner approves from their own device (typically their phone).
- Never relay the signed response, session key, delegation, or proof material back through chat or into logs. Approval flows directly from the owner's device to OpenKey and the TinyCloud node.

On success the waiter writes `authenticated: true` and the profile's `context` shows a `session.expiresAt`. On failure it reports the machine-readable error and a non-zero exit.

## 3. Publish — choose the link type first

Two link types, different trust models. Pick before publishing; never default silently.

**Private / owner-addressed** (`--to email:<address>`) — the interim private link. Only the addressed account can open it; the viewer requires a TinyCloud identity. Until TC-533 lands, address it to the owner's email. After TC-533, address the owner's OpenKey DID instead:

```sh
"$TC" --profile PROFILE share publish FILE --to email:owner@example.com --expires 7d
```

The returned URL encodes the share and recipient; access requires the recipient's session.

**Public / bearer** (no `--to`) — anyone holding the URL can open it. The decryption key lives in the URL fragment (`#tc1=…`); browsers do not send fragments to servers, so the server never sees the key:

```sh
"$TC" --profile PROFILE share publish FILE --expires 7d
```

The full URL *is* the credential. Treat it accordingly — see "Handling links" below.

Both accept `--expires <duration>` (e.g. `24h`, `7d`, `30d`). `--json` emits the share `cid` and `resource.path` for downstream tooling; the `link` field then contains only the share reference, not the URL — combine it with `share show --reveal-link` to recover the openable URL.

### What's rendered where

- **Markdown, plain text, images** render in the share viewer inside a sandboxed iframe (`sandbox=""` with CSP `default-src 'none'`). The reader sees styled content; scripts in the source do not run.
- **HTML** currently downloads rather than renders — TC-542 wires sandboxed `text/html` preview into the viewer. Until then publish HTML as a self-contained single file (inline CSS, no external resources, no tracking) and tell recipients to download and open it.
- Any file the viewer can't preview gets a download link plus filename, size, and expiry.

## 4. Verify before reporting done

Every publish is verified against the source hash, not by trusting stdout:

```sh
LINK="$("$TC" --profile PROFILE share publish FILE --expires 7d | tail -1)"
echo "$LINK" | "$TC" --profile PROFILE share receive - --stdout | sha256sum
sha256sum FILE    # hashes must match byte-for-byte
```

`share inspect` accepts an addressed (`--to`) link and shows metadata — target kind, recipient, path, expiry — without revealing content. It does **not** accept bearer links (`UNSUPPORTED_LINK`); for those, `share receive` + hash comparison is the verification, and `share list` shows the share id and expiry. `share show --reveal-link <shareId>` returns the full openable URL from a stored share id.

## 5. Lifecycle — list, reveal, revoke

```sh
"$TC" --profile PROFILE share list                    # all active shares, type, expiry
"$TC" --profile PROFILE share show ID                 # metadata only
"$TC" --profile PROFILE share show ID --reveal-link   # include the full URL
"$TC" --profile PROFILE share revoke ID               # addressed links: revokes access
```

Important asymmetry: **bearer links cannot be revoked.** The key is embedded in the link, so `share revoke` is rejected for them — publish them with the shortest viable `--expires` and treat the link itself as the credential. Addressed links revoke cleanly and `share show` then reports `revoked: true`.

`tc share` returns non-zero and a `{code, message, hint}` JSON error on failure; do not guess exit-code meanings from other `tc` commands.

## Handling links — rules that prevent leaks

- The fragment (`#tc1=…`) is the decryption key. Never log it, paste it into shared channels, or include it in test output, diffs, or issue text. When citing evidence, use the share `cid` from `--json` output or `share list`, not the URL.
- `share receive` fetches content using the fragment locally; nothing about the key leaves the client.
- `--expires` is required for forward tests and strongly recommended everywhere — bearer links are un-revocable, so expiry is the only bound.
- If a link leaks, revoke addressed links immediately; for bearer links, delete the KV entry (`share list` → resource path → `tc kv delete`) and publish a fresh link — the old fragment becomes useless once the data moves.

## Errors you will hit and what they mean

| Error | Cause | Fix |
|---|---|---|
| `INVALID_ARGUMENT` on `share publish` | CLI < `1.0.0-beta.15` or OpenKey session on a stale node | Reinstall the CLI per step 1; re-login if the profile is old |
| `NETWORK_NOT_FOUND` (encryption) on `--to` publish | The owner account has no default encryption network — happens on brand-new throwaway accounts that skipped OpenKey bootstrap | Real accounts bootstrap at first login; for throwaways the coordinator must run the bootstrap step |
| `CLAIM_REQUIRED` on `share receive` of an addressed link | Only the addressed recipient's session can claim it — a fresh agent profile cannot | Receive addressed links only from the recipient's own profile; verify them with `share inspect` instead |
| `UNSUPPORTED_LINK` on `share inspect` of a bearer link | Inspect accepts addressed links only | Verify bearer links via `share receive` + hash |
| Consent URL expires (~10 min) | Owner didn't approve in time | Re-run `auth login --device`; the waiter exits non-zero |

## Notes

- Addressed links need the node's encryption network, created by OpenKey bootstrap on the owner's first real login. This is why `--to` publish can fail `NETWORK_NOT_FOUND` on synthetic accounts even when bearer publish works — it is a property of the account, not the skill.
- The viewer sends `referrerpolicy="no-referrer"` on the preview iframe and shows "Sender unverified" — the link proves content integrity, not sender identity. Do not claim otherwise to the user.
