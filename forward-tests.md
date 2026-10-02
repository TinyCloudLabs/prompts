# tc-publish forward-test runbook

Forward tests for the `tc-publish` skill: the coordinator runs each test with a **fresh OMP SWE-2 agent** against a prepared test profile, then verifies the outcomes below. Each test is independent; run them in order only so shared setup is reused.

## Preconditions

- A test workspace with `tc-publish/SKILL.md` and `QUICKSTART.md` installed into the agent's skill path (`~/.agents/skills/tc-publish/`), plus `tc-cli` ≥ `1.0.0-beta.15` on PATH or resolvable by absolute path.
- A dedicated test profile (`--profile agent` in examples below). Do **not** run against a real user profile.
- The owner's throwaway account must be OpenKey-bootstrapped before addressed (`--to`) publishes — a brand-new account without the bootstrap step fails with `NETWORK_NOT_FOUND` because the encryption network doesn't exist yet. Bearer publishes work without it. The coordinator's device-authorization harness must call `ensureEncryptionNetwork` (or equivalent) as part of approval, mirroring what OpenKey bootstrap does on first real login.
- A scratch file for each test. Use distinct content per test so hash verification is meaningful.

## Test 1 — CLI and profile discovery

**Prompt:** "Read the tc-publish skill. Then verify the `tc` CLI is at least version `1.0.0-beta.15`, that `auth login` supports `--manifest`, and that `share publish` supports `--to`. Report the absolute path of `tc` and the profile's host and spaceId. Don't publish anything yet."

**Expected commands:** `command -v tc` / `--version`; `auth login --help | grep -- --manifest`; `share publish --help | grep -- --to`; `context --json`.

**Verify:** agent reports the absolute path (not `/usr/sbin/tc`), a version ≥ `1.0.0-beta.15`, both flags present, and a non-empty `host` + `spaceId` from `context`. Any `INVALID_ARGUMENT` or missing flag → the CLI is stale; stop and fix the install.

## Test 2 — Device login consent flow

**Prompt:** "Run `tc auth login --device --manifest builtin:share-publishing --expiry 7d` on profile `agent`. Keep the waiter alive in the background, print the consent URL and user code for me to approve on my phone, and tell me when it's approved. Do not paste any signed response or key material into this conversation."

**Expected behavior:** waiter runs detached (background `&`, `nohup`, or `hub`-style process); the agent relays only the URL and code — never the response, delegation, session key, or proof; the agent reports `authenticated: true` (or the expiry/decline error) when the waiter exits.

**Verify:** `context --json` shows `session.state: "present"` and an `expiresAt` ~7 days out. The conversation contains no delegation JSON, no session key, no signed payload — only the URL, code, and the authenticated outcome. Waiter expiry (~10 min) without approval → agent reports the failure, does not fabricate success.

## Test 3 — Public bearer publish

**Prompt:** "Publish `/tmp/note.md` as a public TinyCloud share expiring in 24 hours and give me the link."

**Expected commands:** `share publish /tmp/note.md --expires 24h` → stdout is the full URL `https://share.tinycloud.xyz/viewer#tc1=…`.

**Verify:** the returned URL opens the file content in a browser; `share list` shows a `bearer` entry with a ~24 h `expiresAt`; the URL fragment is never written to logs, test output, or messages. The agent should verify by piping the link to `share receive - --stdout | sha256sum` and matching `sha256sum /tmp/note.md` byte-for-byte.

## Test 4 — Private addressed publish

**Prompt:** "Publish `/tmp/private.md` to TinyCloud so only `owner@example.com` can open it, expiring in 24 hours, and give me the link."

**Expected commands:** `share publish /tmp/private.md --to email:owner@example.com --expires 24h` → returns a `…/s/…#v=2&p=…` addressed URL.

**Verify:** `share inspect <link> --json` shows `target.kind: "email"`, `recipient: owner@example.com`, and the expiry. `share receive` from the publishing profile returns `CLAIM_REQUIRED` — expected: only the recipient's session can claim it. Open the link in the owner's browser session to confirm content. **Known harness dependency:** this requires the account's encryption network; a fresh synthetic account fails `NETWORK_NOT_FOUND` until bootstrap runs — that is an account/harness gap, not a skill failure.

## Test 5 — HTML publish and viewer behavior

**Prompt:** "Publish `/tmp/page.html` (self-contained, inline CSS) publicly for 24 hours and tell me what a recipient sees."

**Expected:** `share publish` succeeds and returns a bearer URL. In a browser the viewer shows a filename, a download button, and "Sender unverified" — the HTML does **not** render inline until TC-542 lands.

**Verify:** the agent correctly reports download-only behavior and does not claim the HTML renders; it warns the file must be self-contained (no external CSS/JS/images, no tracking). Markdown in the same flow *does* render inside a `sandbox=""` iframe with CSP `default-src 'none'`.

## Test 6 — Lifecycle: list, reveal, revoke

**Prompt:** "List my active TinyCloud shares, show me the link for the public one again, then revoke the private one."

**Expected commands:** `share list`; `share show <id> --reveal-link`; `share revoke <id>`.

**Verify:** `share list` shows all shares with type (`bearer`/`email`) and expiry. `--reveal-link` returns the full URL for the bearer share. `share revoke` on the addressed share prints `revoked` and `share show` then reports `revoked: true`. `share revoke` on a **bearer** share is rejected (`share delegation revocation was rejected`) — the agent must report this honestly and note expiry is the only bound on bearer links, not hide the failure.

## Failure-injection checks (optional but recommended)

- **Stale CLI:** run Test 3 with `tc` < `1.0.0-beta.15` — expect `INVALID_ARGUMENT` … `adapter.publish` and the agent to stop at the version check rather than retry blindly.
- **Expired waiter:** start Test 2, don't approve for 11 minutes — waiter exits non-zero; agent reports expiry.
- **Bearer inspect:** `share inspect` on a bearer link → `UNSUPPORTED_LINK`; agent must not claim inspection succeeded.

## What a pass looks like

All six tests complete with the exact commands above; every link's content round-trips byte-for-byte (`share receive` hash matches source); no key material or signed responses appear in the transcript; bearer links carry `--expires`; the agent reports the `CLAIM_REQUIRED`, `UNSUPPORTED_LINK`, and bearer-revoke behaviors accurately instead of papering over them.
