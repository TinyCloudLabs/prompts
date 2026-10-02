# Publish a document to TinyCloud — quickstart

Five steps. Works in Codex, Claude Code, OpenCode, or OMP. Requires Node 22.20+ and `@tinycloud/cli` ≥ `1.0.0-beta.16` (`npm install --global @tinycloud/cli@beta` — never `@latest`, which is still 0.9.0).

## 0. Get the CLI and this skill

```sh
npm install --global @tinycloud/cli@beta
npx --yes skills@1.7.0 add <cli-tarball-url> --skill tc-cli --global --copy --agent YOUR_CLIENT --yes
```

`TC_BIN` is the absolute path to `tc`, provided by the operator — `command -v tc` can hit `/usr/sbin/tc` and is not reliable.

## 1. Check the CLI and profile

```sh
"$TC_BIN" --version                              # >= 1.0.0-beta.16
"$TC_BIN" enable share --help                    # exists
"$TC_BIN" --profile publisher context --json     # host, spaceId, session — may be absent on first use
```

## 2. Consent — `enable share` (once per profile)

```sh
"$TC_BIN" init --name publisher --key-only
"$TC_BIN" --profile publisher enable share > /tmp/enable-share.log 2>&1 &
```

The waiter prints `Approve on your phone: https://openkey.so/device?user_code=XXXX-XXXX (code XXXX-XXXX)` and waits ~10 minutes. Send the owner the link and code on the agent's own channel (iMessage, email — not a paste buffer), then keep the process alive until it prints `authenticated: true` or exits on expiry.

### What the owner sees

On their phone at `openkey.so/device`: a list of the three capabilities the agent requests — a capability-list read (required), KV get/put on `xyz.tinycloud.share/shares/`, and KV get/metadata/put/list on `shares/` — plus the lifetime, the Share and Node origins, and the warning "Only approve if you started this on your own device". They tap "Sign in and review delegation", sign in with a passkey and pick their key, tick "I started this request myself, on a device I control", review the list (optional items can be unchecked), and press **Approve**. The page then says "Authenticated". The CLI finishes and saves the scoped session.

## 3. Publish

Owner-only (private — default choice for anything not explicitly public):

```sh
"$TC_BIN" --profile publisher share publish ./report.md --to email:owner@example.com --expires 7d
```

Public (only when the owner asks or the content is clearly shareable):

```sh
"$TC_BIN" --profile publisher share publish ./report.md --expires 7d
```

Both print the URL on one line. Keep `--expires` inside the session's remaining lifetime (`context --json` → `session.expiresAt`); over-running it fails `SESSION_LIFETIME_EXCEEDED`.

## 4. Verify — every time, before reporting

```sh
URL=…                                             # the printed URL
printf '%s' "$URL" | "$TC_BIN" --profile publisher share receive - --stdout | sha256sum
sha256sum ./report.md                             # must match
```

For an owner-only link, `printf '%s' "$URL" | "$TC_BIN" --profile publisher share inspect - --json` shows `target.kind: email`, `resource.path`, `expiresAt`. The recipient opens the link in a browser and proves the mailbox with an 8-digit code — no TinyCloud account needed.

## 5. Manage

```sh
"$TC_BIN" --profile publisher share list
"$TC_BIN" --profile publisher share show <id> --reveal-link
"$TC_BIN" --profile publisher share revoke <id>   # addressed links only
```

Bearer links are un-revocable until TC-545 — expiry is the only bound, so keep it short.

## HTML and rendering

- **Bearer `.html`/`.htm`** renders live in a sandboxed frame: scripts run but can't touch the viewer, cookies, storage or the link fragment; external resources are blocked. Publish one self-contained file — inline CSS, JS and data-URI images; no CDN links or fetches.
- **Addressed HTML** downloads rather than rendering.
- **Markdown** renders (headings, lists, bold, tables); Mermaid blocks show their source, not a diagram (TC-546).
- Both viewers show "Sender unverified" and "Read-only" — the link proves the content, not who sent it.

## Errors

`{code, message, hint}` on stderr, non-zero exit. `AUTH_REQUIRED` → re-run `enable share`. `PERMISSION_DENIED` → profile lacks the share-publishing scope. `SESSION_LIFETIME_EXCEEDED` → shorten `--expires`. `ORIGIN_MISMATCH` → wrong host. Never echo server text.

## Never

- Never paste link fragments, user codes, session keys, delegations or signed responses into chat, logs or files — except the link the owner asked for, sent on the owner's channel.
- Never report a publish without the hash check above.
- Never publish publicly without the owner asking, or make private content a bearer link.
