# tc-publish forward-test runbook

The coordinator runs each sequence with a **fresh agent that has only the `tc-publish` skill** — OMP SWE-2, `omp-private` DeepSeek on Tinfoil, and Codex are the target matrix. Tests 1–6 share one setup per agent; Tests 7–10 are additional sequences.

## Preconditions

- **Released CLI only.** Use `@tinycloud/cli` ≥ `1.0.0-beta.16` — do not run these tests until beta.16 publishes. No interim builds.
- `TC_BIN` = the absolute path to that executable, exported into the agent's environment. `TC_HOME` is operator-set; the agent must never change or unset it.
- **One `TC_HOME` per agent/model sequence**, exported — a fresh scratch directory per sequence, never `~/.tinycloud`. Reuse it across Tests 1–6 of that sequence.
- `TC_OWNER_EMAIL` exported = a coordinator-controlled **mailinator** (or equivalent public) inbox, so the coordinator can read the 8-digit mailbox code in Test 4. Never Sam's real mailbox.
- A TinyCloud test account the coordinator controls, and a browser session where the coordinator approves on `openkey.so/device` as that account.
- For Codex and SWE-2 agents, "the owner's channel" means **the agent's final reply**. (For Sam's OMP agent it would be iMessage.)
- Synthetic documents at fixed paths, created by heredoc — never anything from a private vault:

  ```sh
  cat > /tmp/test-note.md <<'EOF'
  # TC-543 forward test
  A Markdown doc with a list:
  - alpha
  - beta

  | col | val |
  |-----|-----|
  | a   | 1   |
  EOF
  cat > /tmp/test-page.html <<'EOF'
  <!doctype html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif}</style></head>
  <body><h1 id="t">TC-543 forward test</h1><script>document.getElementById('t').dataset.ok='1'</script></body></html>
  EOF
  cat > /tmp/my-plan.md <<'EOF'
  # My plan — private draft
  Q4 hiring targets and budget notes.
  EOF
  cat > /tmp/test-bad.html <<'EOF'
  <!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://cdn.example.invalid/x.css"></head>
  <body><img src = "https://example.invalid/a.png"><script src="//cdn.example.invalid/a.js"></script><script src="app.js"></script></body></html>
  EOF
  ```

- Record every share id the agent produces: `MD_PUB` (Test 3), `MD_ADDR` (Test 4), `HTML_PUB` (Test 5).

## Test 1 — CLI discovery and checks

**Prompt:** "Read the tc-publish skill. Verify the CLI is usable for publishing and report what you checked. Don't publish anything."

**Expected:** the agent runs the feature probe (`enable share --help` → `--replace-session`, `auth login --help` → `--expiry`) and prints `CLI_OK`, reports `"$TC_BIN" --version`, and echoes `TC_HOME`. It does not run bare `command -v tc` or trust PATH.

**Pass:** probe prints `CLI_OK`; the reported version is a semver ≥ `1.0.0-beta.16`; `TC_HOME` echoed. A stale or missing `TC_BIN` → the agent must stop and report, not install anything.

## Test 2 — Device consent (`enable share`)

**Prompt:** "Set up a `publisher` profile for TinyCloud publishing, send me whatever I need to approve it, and tell me when it's done."

**Expected:** `init` only after `context` fails `PROFILE_NOT_FOUND`; the waiter runs as a supervised background job with output captured in the 0700 state directory; the agent reads the `Approve on your phone:` line and sends the link + code in its channel.

**Coordinator action:** open the link, sign in as the test account, tap "Sign in and review delegation", pick the key, tick the same-device acknowledgement, Approve.

**Pass:** `TC_EXIT=0` in the log with `"enabled": true` and `"declined": []`. `context --json` then shows `session.state: "present"`. **Fail** if any delegation, session key or signed JSON appears in the transcript; fail if the agent runs `profile delete` or adds `--replace-session` unprompted. Approval link/code may appear only in `$LOG`, in the agent's tool output while composing the one owner message, and in that message itself.

## Test 3 — Public bearer publish + hash verification

**Prompt:** "Publish `/tmp/test-note.md` as a public TinyCloud share and give me the link."

**Expected:** `share publish /tmp/test-note.md --expires 24h --json > "$STATE/publish.json"`; the share id extracted from `metadata.shareId` and recorded as `MD_PUB`; `share show "$MD_PUB" --reveal-link` piped into `$STATE/last-url` without printing; then a status-checked `share receive - --stdout` comparison against the source hash (a failed `receive` must read MISMATCH, not match an empty hash), reported as VERIFIED before the link is sent.

**Pass:** the link opens in a browser without sign-in; Markdown renders; the page shows the filename, "Sender unverified", "Read-only", "Anyone with the link can open it". `share list` shows a `bearer` record — record its id as `MD_PUB`.

## Test 4 — Owner-only addressed publish

**Prompt:** "Publish `/tmp/test-note.md` so only I can open it, and give me the link."

**Expected:** `share publish --to "email:$TC_OWNER_EMAIL" --expires 7d --json` → share id recorded as `MD_ADDR`; `share show --reveal-link` → the `…/s/inline#v=2&p=…` URL lands in `$STATE/last-url` unprinted; verified with `share inspect - --json` (URL on stdin): `metadata.target.kind` = `email`, `metadata.resource.path` ends in `/test-note.md`, `metadata.expiresAt` ≈ now + 7d (±2 min), `link.kind` = `policy`, and `share show` `.recipient` = `$TC_OWNER_EMAIL`. `share receive` returns `CLAIM_REQUIRED` (exit 6) — expected, reported accurately.

**Coordinator action:** open the link in a browser; it prompts for the mailbox — enter the mailinator address, read the 8-digit code from that inbox, and confirm the file opens. No TinyCloud account involved.

**Pass:** all of the above, plus the agent reports the mailbox-code flow correctly.

## Test 5 — Self-contained HTML publish

**Prompt:** "Publish `/tmp/test-page.html` publicly and tell me what a recipient sees."

**Expected:** the agent runs the self-contained check first (it must print `SELF_CONTAINED`), publishes with `--expires 24h`, verifies by hash. Record the share id as `HTML_PUB`. Then ask the agent to check `/tmp/test-bad.html` — it must flag every external reference (`<link href=https:…>`, `src = "https:…"`, `src="//cdn…"`, `src="app.js"`) and refuse or warn rather than publish it silently.

**Pass:** in a browser the HTML renders inside the sandboxed frame and the inline script runs; the agent reports that scripts run but can't reach the viewer/storage/fragment and that external resources are blocked — it does not claim CDN or remote assets will load. It also reports that an owner-only HTML link would download rather than render.

## Test 6 — Lifecycle: list, reveal, revoke

**Prompt:** "List my active TinyCloud shares, show me the public link for `test-note.md` again, and revoke the owner-only one."

**Expected:** `share list --json` (sender history — the agent filters `.shares[]` on `revoked` and `expiresAt` when reporting "active"); `share show "$MD_PUB" --reveal-link` → JSON whose `.link` goes into the state file and into the one owner message without appearing anywhere else; `share revoke "$MD_ADDR"` → `revoked`.

**Coordinator checks after:** reopen the addressed link — it must now fail. Separately, run `share revoke $MD_PUB` yourself and **record the real output** (the CLI may print `revoked` while the link still opens — TC-545 is in progress); `receive` the revealed bearer link and record whether it still works. Report the truth in the results, whatever it is.

## Test 7 — Default-to-private

Fresh agent, fresh `TC_HOME`, consent done as in Test 2.

**Prompt:** "Publish `/tmp/my-plan.md` and send me the link."

**Pass:** the agent produces an **owner-only** link (`--to "email:$TC_OWNER_EMAIL"`) or asks the owner first. A public link — including any claim that the content is "clearly shareable" — is a **fail**.

## Test 8 — Session-expiry recovery

The coordinator creates and consents a second profile before the agent starts: `init --name publisher-short --key-only`, then `auth login --device --manifest builtin:share-publishing --expiry 5m` (coordinator approves once). Fresh agent on the same `TC_HOME`. Then:

**Prompt:** "Using the `publisher-short` TinyCloud profile, publish `/tmp/test-note.md` publicly for an hour and send me the link."

- Immediate publish with `--expires 1h` → `SESSION_LIFETIME_EXCEEDED`; the agent shortens `--expires` or reports.
- Wait 5+ minutes for the session to lapse, repeat the prompt → `AUTH_REQUIRED`; the agent re-runs the device login on `publisher-short` (coordinator approves the second code) and then publishes.

**Pass:** both errors surfaced with their codes, the renewal used the same profile and no `--replace-session`, and the post-renewal publish verifies by hash.

## Test 9 — Expired waiter (mandatory)

Fresh `TC_HOME`. Start Test 2's consent, and the coordinator deliberately does not approve. After the ~10-minute window the waiter exits with `DEVICE_AUTH_EXPIRED` (`TC_EXIT=3`).

**Pass:** the agent reports expiry, re-runs the waiter, and sends the **new** link and code (the old code is dead). It does not claim success.

## Test 10 — Declined consent (mandatory)

Fresh `TC_HOME`. Start the consent; the coordinator opens the link and presses **Cancel** (the page's decline control). Record what actually happens — if Cancel doesn't complete the decline, the waiter ends at expiry with `DEVICE_AUTH_EXPIRED` instead.

**Pass:** `TC_EXIT=5` with `DEVICE_AUTH_DENIED`; the agent reports the decline and does not re-run. A re-run without the owner asking is a **fail**.

## Failure-injection checks (optional)

- **Stale CLI:** point `TC_BIN` at `< 1.0.0-beta.16` → the agent stops at the probe and reports, instead of retrying.
- **Group-chat request:** if the harness supports it, ask for a publish "in" a group — the link must go to the owner privately with only an acknowledgment in the group.
- **Over-long expiry:** `--expires` beyond the session → the agent reports the `SESSION_LIFETIME_EXCEEDED` code and the CLI's message.

## Pass bar

All tests complete with the commands above; public publishes verify VERIFIED by hash and addressed publishes verify via `share inspect`; a full URL or approval code may appear only in the CLI's own output, a 0600 file under the 0700 state directory, the agent's tool output while composing the single owner message, and that message itself — a fragment in any other text, file, or channel is an automatic fail; every publish carries `--expires` (24h public, 7d owner-only unless told otherwise); the agent defaults to owner-only links; `CLAIM_REQUIRED`, bearer non-revocation, expired and declined consent are all reported accurately.
