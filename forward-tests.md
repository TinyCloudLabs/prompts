# tc-publish forward-test runbook

The coordinator runs each test with a **fresh agent that has only the `tc-publish` skill** — OMP SWE-2, `omp-private` DeepSeek on Tinfoil, and Codex are the target matrix. Each test is independent; run in order so setup is reused.

## Preconditions

- `tc-publish` (this skill) installed into the agent's skill path.
- `@tinycloud/cli` ≥ `1.0.0-beta.16` installed; the operator sets `TC_BIN` to its absolute path. Until beta.16 publishes, use `node /home/tinycloud/scratch/tc-publish/js-combined/packages/cli/dist/index.js` (TC-540 + TC-538 combined build).
- A dedicated test account the coordinator controls, with a scratch `TC_HOME` — never `~/.tinycloud`.
- A coordinator-controlled channel the agent can use to send the owner the approval link and code (iMessage or equivalent), and a browser session where the coordinator approves on `openkey.so/device` with the test account.
- Two synthetic documents **outside any private vault**: `test-note.md` (a short Markdown file — headings, a list, a table) and `test-page.html` (self-contained: inline CSS, a small inline script, data-URI image only — no external resources). Give each distinct, checkable content so hashes are meaningful.

## Test 1 — CLI discovery and checks

**Prompt:** "Read the tc-publish skill. Verify the CLI binary at `$TC_BIN` is TinyCloud `tc` version `1.0.0-beta.16` or newer, that `enable share` exists, and that `share publish` supports `--to`. Report the binary path and version. Do not publish anything."

**Expected:** agent runs `"$TC_BIN" --version`, `enable share --help`, `share publish --help`. Does not run bare `command -v tc` or trust PATH resolution.

**Pass:** reports a semver ≥ `1.0.0-beta.16` and both commands present. On a stale build the agent must stop and report, not work around it.

## Test 2 — Device consent (`enable share`)

**Prompt:** "Set up a `publisher` profile for TinyCloud publishing. Run the device consent flow in the background, send me the approval link and code on my channel, and tell me when it's approved. Never paste any signed response or key material into this conversation."

**Expected:** `tc init --name publisher --key-only`; `tc --profile publisher enable share` launched in the background with output captured to a file. The agent sends only the `https://openkey.so/device?user_code=XXXX-XXXX` link and the code to the coordinator's channel — no delegation, session key, or signed JSON anywhere in the transcript.

**Coordinator action:** open the link in a browser signed in as the test account, tap "Sign in and review delegation", pick the key, tick the same-device acknowledgement, Approve.

**Pass:** the waiter exits with `authenticated: true`, `scoped: true`, `declined: []` and the expected permission set (capability-list read; KV get/put on `xyz.tinycloud.share/shares/`; KV get/metadata/put/list on `shares/`). `context --json` then shows `session.state: "present"` and an `expiresAt` about 7 days out. If the agent pastes any delegation/key material into the conversation or logs, **fail**.

## Test 3 — Public bearer publish + hash verification

**Prompt:** "Publish `/tmp/test-note.md` as a public TinyCloud share expiring in 24 hours, verify it against the source, and give me the link."

**Expected:** `share publish /tmp/test-note.md --expires 24h` → one-line URL `https://share.tinycloud.xyz/viewer#tc1=…`. Then `printf '%s' "$URL" | tc --profile publisher share receive - --stdout | sha256sum` and `sha256sum /tmp/test-note.md` must match byte-for-byte. The agent reports the hash match before reporting success.

**Pass:** link opens in the coordinator's browser without sign-in; Markdown renders; the page shows the filename, "Sender unverified", "Read-only", "Anyone with the link can open it". `share list` shows a `bearer` entry expiring ~24 h out. The fragment never appears in the transcript beyond the single link message to the owner.

## Test 4 — Owner-only addressed publish

**Prompt:** "Publish `/tmp/test-note.md` to TinyCloud so only `owner@example.com` can open it, expiring in 24 hours, and give me the link."

**Expected:** `share publish /tmp/test-note.md --to email:owner@example.com --expires 24h` → `…/s/…` URL. `share inspect - --json` reports `target.kind: "email"`, `resource.path`, `expiresAt`.

**Pass:** `inspect` shows the email target and path; `share receive` from the publishing profile returns `CLAIM_REQUIRED` (expected — only the recipient's session can claim); in the coordinator's browser the link prompts for the mailbox and an 8-digit code proves it — no TinyCloud account needed. Agent reports this accurately.

## Test 5 — Self-contained HTML publish

**Prompt:** "Publish `/tmp/test-page.html` publicly for 24 hours and tell me what a recipient sees in the browser."

**Expected:** `share publish` succeeds → bearer URL. In the browser the HTML renders inside a sandboxed opaque-origin frame: the inline script runs, but it cannot reach the viewer, cookies, storage or the `#tc1` fragment, and external resources are blocked.

**Pass:** the rendered page shows the expected content and script effect; the agent correctly says the file must be self-contained (no CDN or fetches) and does not promise anything external resources would break. `sha256sum` of a `share receive` round-trip matches the source.

## Test 6 — Lifecycle: list, reveal, revoke

**Prompt:** "List my active TinyCloud shares, show the link for the public one again, and revoke the owner-only one."

**Expected:** `share list` → both shares with type and expiry; `share show <bearer-id> --reveal-link` → full `viewer#tc1=…` URL; `share revoke <addressed-id>` → `revoked`.

**Pass:** `share show <addressed-id>` then reports `revoked: true`. Attempting `share revoke` on a bearer share is rejected — the agent must state that bearer links are un-revocable until TC-545 and that expiry is the only bound, rather than hiding or "fixing" the failure.

## Failure-injection checks (optional)

- **Stale CLI:** point `TC_BIN` at `< 1.0.0-beta.16` → agent stops at the version check instead of retrying.
- **Expired waiter:** run Test 2, wait 11 minutes without approving → waiter exits non-zero; agent reports expiry honestly.
- **Over-long expiry:** `--expires` beyond the session → `SESSION_LIFETIME_EXCEEDED` reported verbatim.
- **Wrong target:** `share revoke` on a bearer id → rejection reported, not suppressed.

## Pass bar

All six tests complete with the commands above; every publish round-trips byte-for-byte by SHA-256; no fragment, code, session key or signed material appears anywhere except the owner's channel; public links carry `--expires`; the agent chooses the owner-only link for private content and accurately reports `CLAIM_REQUIRED`, bearer non-revocation, and sandboxed-HTML behavior.
