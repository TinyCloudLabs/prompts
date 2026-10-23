# TinyCloud connect evaluations

Evaluate the actual journey that starts with `https://agents.tinycloud.xyz/connect`, keep every platform/scenario visible, and compare candidates without carrying old passes forward.

**Requirements:** Node.js 22 or later. No package installation, service, database or paid model dependency is needed for public probes, operator packets or reports. Native capture additionally needs the installed client and explicitly supplied evaluation credentials. This suite does not change or deploy `/connect`, the CLI, MCP, or OpenKey.

**Continuing this campaign?** Start with the [developer handoff](HANDOFF.md). It includes the portable 2026-10-23 checkpoint, offline reproduction commands, actual outcomes, private-state boundaries and remaining blockers. Earlier smoke notes below describe their original fixtures, not current platform certification.

## Coverage

The catalog has **14 client surfaces, 144 scenarios**, and a separate public-infrastructure column:

| Platform IDs | Actual surface / execution |
| --- | --- |
| `chatgpt`, `claude` | Native web/Desktop/app UI and hosted MCP; operator records actual connector and tool outcomes |
| `grok` | Actual Grok app; integration capability must be observed, not inferred from its model API |
| `claude-code`, `codex`, `omp`, `opencode` | Interactive native sessions via operator packets; executable noninteractive capture is also provided |
| `muse` | Default identity: [Meta Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), not a similarly named service; TinyCloud integration unverified |
| `dots` | Default identity: [OpenAI Dots](https://openai.com/index/introducing-dots/), distinct from ordinary ChatGPT; TinyCloud integration unverified |
| `gemini`, `copilot`, `perplexity`, `cursor`, `gemini-cli` | Additional native surfaces; capability unverified, not assumed unsupported |
| `public-web` | Anonymous endpoint/discovery/integrity checks only; not a client |

“All platforms” is an extensible registry, not a claim of exhaustive future support. New clients get distinct platform IDs. Different models, plans, workspace roles, browser/mobile builds and permission policies get distinct `variant` IDs and environment labels. Do not substitute an OpenAI/Anthropic/xAI model API for the corresponding consumer app, or a print-mode CLI for its interactive permission/turn lifecycle.

The smoke tier contains 17 client scenarios and 3 public probes. The full tier includes all smoke cases, 103 lifecycle matrix rows from [the MCP audit](../../tinycloud-mcp-first-user-readiness-todo.md#6-edge-case-acceptance-matrix), and 21 [ChatGPT acceptance runs](../../tinycloud-chatgpt-first-user-readiness-todo.md#5-required-chatgpt-acceptance-runs). Every case has prerequisites, prompt, actions and observable check rubrics. Check the individual applicability: unknown capability is never automatically N/A.

The lifecycle cases cover entry/routing, new identities, existing sessions, approvals/denial/expiry, permissions, storage provisioning, first save and authoritative read-back, idempotency, partial writes, conflicts, billing/quotas, outages, return visits, revocation, mobile and accessibility. The metrics are duration in milliseconds, conversation turns, and human approvals. They expose friction without inventing an SLA.

## First run and matrix

From the repository root:

```sh
node evals/connect/runner.mjs init --out .evals/connect/candidate-a --candidate candidate-a
node evals/connect/runner.mjs probe --run .evals/connect/candidate-a
node evals/connect/runner.mjs report --run .evals/connect/candidate-a
```

Open `.evals/connect/candidate-a/matrix.html` in a browser. It is an offline, self-contained report with status/platform/stage/search filters, expandable instructions, expected versus observed checks, evidence and attempt history. `matrix.md` is the text equivalent. Keep the report beside its `evidence/` directory so links work.

`init` snapshots the entire catalog and its hash. Use `--revision` for the **actual tested deployment/source identity**, not an unrelated checkout SHA. When unknown, the default explicitly says the remote deployment revision is unverified. Public guide bytes, final response URLs and SHA-256 hashes are retained by `probe`. For a preview deployment, set `--connect-url https://YOUR_PREVIEW/connect` and optionally `--mcp-url https://YOUR_MCP/mcp`; guide/skill assets are resolved on the connect origin. Public probes do not test unpublished local prompt changes.

Public probes exercise:

- `HTTP-entry`: readable entry, Markdown alternate and coding guide. Not a semantic HTML/Markdown equivalence or agent-understanding check; those require E09/native evidence.
- `HTTP-oauth`: unauthenticated MCP initialize → 401/Bearer challenge → resource metadata → OAuth/OIDC issuer/endpoints and PKCE S256. No client registration, signup, token request or grant.
- `HTTP-skill`: the checksum manifest and exactly its four expected skill files. Downloads are hashed, never installed or executed. Checksums prove integrity against that manifest, not publisher authenticity.

A failed probe exits 1 but retains its evidence; run `report` afterward even on failure.

## Execute a client scenario

Inspect a platform's cases or make a review form:

```sh
node evals/connect/runner.mjs list --platform chatgpt --tier smoke
node evals/connect/runner.mjs packet --run .evals/connect/candidate-a --platform chatgpt --scenario core-bare-url --variant free-chrome --out .evals/reviews/chatgpt-bare.json
```

`packet` prints the actual prompt, prerequisites and actions, and writes a JSON form. Start the real client in the specified fixture, send the prompt verbatim, and observe what happens. Do not coach the assistant with undocumented repair commands. A setup case is not complete merely because the connector was installed: required first writes must be read back from authoritative storage.

Fill the form:

- `environment`: exact model, client build, OS/device, native surface/product URL, account **class**, workspace/role, and fixture conditions. Use stable synthetic cohort labels for comparisons, not emails, owner keys or unique per-run identity values. Explicitly explain fields the client does not expose.
- `reviewer` and `observed`: who assessed it and what actually happened, including the blocked stage or error code.
- Every `checks[]` entry: `passed`, `failed`, `blocked`, or `not_run`, an observation, and relative evidence paths. A conditional check must explain why its condition does or does not apply; never silently omit it.
- `evidence`: unique paths to reviewed attachments **inside the form's directory** (or its descendants). Each passing/failing check must cite an attachment. Supported formats: text, Markdown, JSON, PNG/JPEG/WebP and PDF, up to 10 MiB each.
- `metrics`: optionally `durationMs`, `turns`, `approvals`; count the complete journey, including external approval waits. Native capture duration measures only its captured process, not full onboarding.
- `controlledFixture: true` only after provisioning an authorized controlled fixture for a scenario that requires it. Fault injection, payment testing, owner-mismatch checks, malicious records and destructive recovery belong in isolated staging/test infrastructure, not production.

Then import and refresh:

```sh
node evals/connect/runner.mjs record --run .evals/connect/candidate-a --input .evals/reviews/chatgpt-bare.json --redacted
node evals/connect/runner.mjs report --run .evals/connect/candidate-a
```

`--redacted` is a human attestation for both JSON and attachments. The additional secret-pattern guard is not a complete redaction engine and cannot inspect image/PDF contents. Never include personal records, email addresses, passwords, private keys, tokens, OTPs, delegations or full approval-state URLs. Use synthetic records. Evidence is copied and hashed; later edits to the source cannot change recorded observations, and changed stored evidence is rejected when loading the run.

Every import appends an attempt; it never edits a prior outcome. Imports into one run are serialized by an explicit writer lock; a competing writer must be retried after the current writer exits. A stale lock is not removed automatically. Missing/duplicate checks, foreign-run packets and missing pass/fail evidence are rejected. The last attempt wins, not the best outcome. An ungraded check prevents a pass. Human-reviewed outcomes are still judgments, not cryptographic proof of a client's behavior.

## Native CLI capture

Built-in launchers exist for Claude Code, Codex, omp and OpenCode. Set `EVAL_MODEL` to an exact model available to your chosen client. Example:

```sh
node evals/connect/runner.mjs native --run .evals/connect/candidate-a --platform codex --scenario core-bare-url --model "$EVAL_MODEL" --timeout 180
```

This executes the actual binary, captures its version and stdout/stderr, and records either `needs_review` or an execution `blocked` outcome. **Exit zero never passes a behavioral check.** To grade it, create an operator packet and attach only a redacted extract plus the required state evidence. Authored model claims about its own success are not sufficient.

The launcher uses a fresh private HOME, TinyCloud state and XDG directories, and a new native conversation. It does not copy owner credentials, inherit arbitrary environment variables, change permission settings or approve OpenKey. `--inherit-env OPENAI_API_KEY` (or the corresponding provider variable) explicitly allows that variable into the child; the value is not stored in the result. Otherwise authenticate the client in the reported isolated home and reuse that state with `--state ID`. Native capture does not automate login or interactive consent.

**Fresh HOME is state isolation, not an OS security sandbox.** Run installation/sign-in journeys in a disposable VM/container with authorized test credentials and bounded network access. The Codex launcher is read-only; Claude uses `dontAsk`; omp enables only read/search; OpenCode retains its native permission behavior. These are capture policies, not certification of a normal interactive user's setup. Use the actual TUI/operator path for escalation, background waiters, consent and cross-turn survival. Noninteractive capture kills its whole process group when complete, timed out, interrupted or over its output cap; it must not be used to judge a waiter that is expected to outlive the turn. POSIX process-group capture is implemented; Windows sessions use the operator path.

For another native client or an explicitly configured policy, supply `--adapter FILE`. This JSON requires:

```json
{
  "platform": "omp",
  "command": ["omp", "--print", "--mode", "json", "--no-session", "--no-extensions", "--no-skills", "--no-rules", "--no-lsp", "--tools", "read,web_search", "--model", "EXACT_MODEL_ID", "{prompt}"],
  "versionCommand": ["omp", "--version"],
  "model": "EXACT_MODEL_ID",
  "surface": "omp native noninteractive read/search capture",
  "passEnv": []
}
```

Commands are argv arrays, never shell-interpolated. Exactly one argument must be `{prompt}`; `{workspace}`, `{home}` and `{state}` are optional standalone path arguments. Keep secrets out of adapter files; pass named environment variables. Version can instead be supplied with `--client-version`. Preserve the actual permission policy in the surface/variant label. No generic command adapter makes a web app automatically runnable.

## Disposable native runners and browser access

[`Dockerfile`](Dockerfile) provides a digest-pinned Node 22 base with Bun 1.4.2, Codex 0.160.0, Claude Code 2.1.304, OpenCode 1.18.31 and omp 18.4.8. TinyCloud itself is deliberately **not preinstalled**: installation remains part of the agent's test. Build from this directory, not the repository root, so unrelated files and local `.evals/` credentials never enter the build context.

```sh
sudo -n docker build --tag tinycloud-connect-eval:local evals/connect
RUNNER=tc-connect-codex-test
sudo -n docker run --detach --name "$RUNNER" --init \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 256 --memory 4g --cpus 2 \
  --tmpfs /tmp:rw,nosuid,nodev,size=512m \
  --mount "type=volume,source=$RUNNER-home,target=/home/node" \
  --mount "type=volume,source=$RUNNER-work,target=/work" \
  tinycloud-connect-eval:local
```

Use a unique container name and separate home/work volumes for each client/campaign. This host supports Docker through `sudo -n`; hosts with ordinary authorized Docker access can omit that prefix. Do not change socket permissions, use `--privileged`, mount the Docker socket, bind-mount an owner home, or publish container ports. The image runs as the non-root `node` user. Only its home/work volumes and temporary directory are writable; outbound networking is available. This is container isolation, not a separate-kernel VM or an egress allowlist.

Authenticate the provider **inside the new container** using its normal human login:

```sh
sudo -n docker exec -it "$RUNNER" codex login --device-auth
sudo -n docker exec -it "$RUNNER" codex
```

Use the corresponding `claude auth login --claudeai`, `opencode auth login`, or `omp login` in that client's own container. Do not copy host OAuth token files: refresh-token rotation could couple the disposable fixture to the original login. Do not paste tokens or callback credentials into chat or review packets. The image contains no authenticated accounts. Browser-dependent callbacks may need the client's supported device/manual flow; container localhost is not the operator workstation's localhost.

The suite is available at `/opt/connect-evals/runner.mjs`; save runs under `/work`. Use an actual interactive client for permission prompts, long-lived approval waiters and continuation turns. The `native` capture command remains deliberately bounded and does not become an interactive acceptance run just because it is inside Docker. Keep native permissions intact; record container image ID and permission policy in environment/fixture labels. Never automatically approve OpenKey. Use only a dedicated synthetic TinyCloud identity and scenario-owned records.

Keep provider login state distinct from TinyCloud test fixtures. A new container/home is the clean boundary for a fresh installation; reuse a fixture only for scenarios that explicitly require return visits. A fresh local folder alone does not create a zero-account TinyCloud identity.

After review, export only `run.json`, `results/`, `evidence/`, `matrix.html` and `matrix.md` from the run directory. Do not export provider homes, `.tinycloud`, or `private/`. Stop campaign containers when no longer needed; remove their volumes only after reviewed evidence is exported and those test logins/state are no longer required.

For consumer apps, use a **dedicated Chrome profile**, not provider API substitutes or an existing personal browser profile. Install the official relay extension with `omp browser-relay install --dir PATH`, load that directory unpacked in the test profile, and configure its options to the dedicated relay port. The current evaluation relay uses loopback port **9333**, separate from any existing default relay on 9224. On a remote runner, forward the operator workstation's localhost:9333 to the runner's localhost:9333; do not expose the relay publicly. A 503 response from `/json/version` saying the extension is not connected is a browser-attachment blocker, not a successful connection.

The operator signs into the native apps and approves test-account grants directly in the dedicated browser. Never copy cookies or credentials into the matrix. Check the connected profile and selected test account before driving any setup UI. A running relay process, installed extension or HTTP health result does not prove a logged-in native app session.

## Persistent terminal evidence with VHS

`terminal` records a **real, already-running native UI** without owning its lifecycle. It attaches a read-only, `ignore-size` tmux client, waits for an operator-selected screen regexp, and saves PNG/GIF plus before/after pane text under `RUN/private/terminals/`. It does not submit prompts, press permission buttons, log in, or reset the fixture. Keep using the scenario packet for the exact prompt and actions.

The recording host needs **VHS 0.12.1 or later**, ttyd, ffmpeg, tmux 3.2 or later, and Chrome/Chromium on `PATH`. The local verification used [VHS 0.12.1](https://github.com/charmbracelet/vhs/releases/tag/v0.12.1) and [ttyd 1.7.7](https://github.com/tsl0922/ttyd/releases/tag/1.7.7), with downloads checked against their published SHA-256 manifests. These are optional recorder dependencies; public probes and reports remain dependency-free. VHS uses a separate temporary browser profile, not the operator's logged-in browser.

Start the native client in a dedicated **single-window, single-pane** tmux session. Use a disposable container from the section above, an explicit available model, and its ordinary permission policy. For example:

```sh
# RUNNER is the dedicated Codex container; EVAL_MODEL is its exact selected model.
tmux new-session -d -s tc-eval-codex -x 120 -y 40 \
  sudo -n docker exec -it -w /work "$RUNNER" \
  codex --model "$EVAL_MODEL" https://agents.tinycloud.xyz/connect
tmux attach-session -t tc-eval-codex
```

The image includes `procps`: Codex 0.160.0's default interactive app-server startup invokes `ps`. Without it, Codex can exit before showing its login/UI. Do not mistake that runner-dependency error for a TinyCloud failure.

Equivalent **interactive** launch arguments for the other clients:

| Client | Command inside its container |
| --- | --- |
| Claude Code | `claude --model "$EVAL_MODEL" https://agents.tinycloud.xyz/connect` |
| omp | `omp --model "$EVAL_MODEL" https://agents.tinycloud.xyz/connect` |
| OpenCode | `opencode --model "$EVAL_MODEL" --prompt https://agents.tinycloud.xyz/connect --mini` |

Label OpenCode's `--mini` surface explicitly. Its native loader needs executable temporary storage: create `/home/node/.tmp` inside that container and pass `docker exec -e TMPDIR=/home/node/.tmp`, rather than weakening the container's `/tmp` mount or root filesystem policy. Existing provider sign-ins and TinyCloud state stay in their dedicated container; record whether the scenario is a fresh install or a return visit.

After observing the actual screen, choose a bounded synchronization pattern and record from another terminal:

```sh
node evals/connect/runner.mjs terminal \
  --run .evals/connect/candidate-a --platform codex --scenario core-bare-url \
  --session tc-eval-codex --wait 'Sign in|Welcome' --timeout 45 \
  --model "$EVAL_MODEL" --client-version 'codex-cli 0.160.0' \
  --fixture 'dedicated test container; provider login incomplete; no TinyCloud state'
```

Use `--socket NAME` for a named tmux server and `--variant ID` to separate native surfaces/fixtures. `--wait` is a Go regexp without slash delimiters or line breaks; its match is **synchronization, never a rubric pass**. Choose a pattern actually visible in that client's build. The default wait is 45 seconds (1–300 allowed), with an additional bounded 60 seconds for browser startup/rendering. Successful recording yields `needs_review`; recorder failure yields `blocked`, not a product verdict. Every acceptance check remains `not_run`.

The underlying tmux session survives recording completion, timeout and interruption. Continue human interaction through the returned `attach` command; detach with tmux's normal prefix then `d`. Complete provider login and OpenKey consent **outside recording**. Do not renew expired requests until the operator is ready, and do not put credentials into a tape.

Review PNG/text locally and copy only redacted evidence to the review packet directory before using `record --redacted`. Raw pane history, GIFs and recorder logs may contain approval URLs, codes, personal data or terminal history; they must never be published or attached wholesale. VHS `Hide` is not redaction. Recording an old session's replay does not constitute a fresh scenario execution, and a screenshot cannot prove storage save/read-back.

## Reusable authentication and test accounts

Keep provider login separate from the synthetic TinyCloud fixture. Reuse explicitly authorized provider sessions in place; an empty container home is not a reason to ask the owner to repeat every login. A model-auth smoke is execution readiness, not native `/connect` acceptance.

- **Native clients:** bounded Codex workspace execution and Claude Code restricted reads were exercised using existing lab authentication. Their full container onboarding remains unverified. A separate omp worker exercised an interactive tool approval, persistent continuation and service restart through a scoped official gateway. Provider credentials stay in the host broker; the worker receives only a one-account, one-model token. Usage/credential endpoints and an ungranted model were denied. The test-owned socket-only read-only mount is a deliberate exception to the original no-bind-mount fixture; it does not expose the owner home or Docker socket. Keep this custom-transport variant distinct from direct provider login.
- **Native `/connect` smoke:** the isolated omp TUI installed TinyCloud CLI 1.3.1, verified all eight skill files and created a local key-only profile. Its catalog read required authentication. Leave the fixture paused before executing device authorization until the owner is ready; a successful install is not a saved-record or end-to-end acceptance pass. The captured transcript and pending authorization screen remain private.
- **Web apps:** use a small pool of authorized test accounts and dedicated persistent browser profiles. The agent-controlled receive-only mailbox completed actual Microsoft and Meta/Muse email verification. Those signup flows then required identity/age details. Claude, ChatGPT, Grok and Perplexity entry attempts encountered provider verification or access gates. Do not invent required identity details, bypass checks, purchase plans, or substitute model API access for the app UI.
- **Coverage:** preserve incomplete signups, account eligibility and native integration capability as separate prerequisites. Dots requires an eligible ChatGPT account/workspace; ordinary ChatGPT access would not prove Dots access. The anonymous Gemini bare-link response supplied Claude connector instructions, retained as an ungraded native observation rather than a passing route.
- **Private state:** keep mailbox keys, email codes, cookies, gateway policies/tokens and raw sessions out of reports. Record safe observations and continuation/stop controls in the local resume metadata. Update the owner's existing complete matrix document through `tc-apps` and verify its read-back; never upload the private run tree.

The current campaign's frozen `HTTP-skill` probe expects four files, while the published manifest now lists eight. An independent download/hash diagnostic matched all eight published checksums. Preserve the frozen probe's failure and identify the contract drift; do not rewrite historical results or claim a content-integrity failure from the count mismatch.


## Compare changes and enforce coverage

Start a new run for each candidate rather than mixing deployments in one run:

```sh
node evals/connect/runner.mjs init --out .evals/connect/candidate-b --candidate candidate-b
node evals/connect/runner.mjs probe --run .evals/connect/candidate-b
# Execute/import the same native cases and variants for candidate-b.
node evals/connect/runner.mjs report --run .evals/connect/candidate-b --baseline .evals/connect/candidate-a
node evals/connect/runner.mjs compare --run .evals/connect/candidate-b --baseline .evals/connect/candidate-a
```

Differences distinguish regressions, improvements, lost coverage, and changed comparison context. Different scenario definitions or client/model/account/fixture environments are **incomparable**, not fabricated regressions or improvements. Omitted attempts and removed scenarios/platforms retain their baseline coverage-loss entries. Candidate revision changes are expected. Comparisons use exact platform/scenario/variant identities, never a different account's passing row.

- `compare`: exit 1 on regression/lost coverage; exit 2 for incomparable context (or invalid input); 0 otherwise. Inspect its JSON classifications.
- `gate --run RUN --platform public-web --tier smoke`: require just the three public probes; useful for CI, **not launch approval**.
- `gate --run RUN --platform chatgpt --tier smoke`: require all applicable ChatGPT smoke cells, for every recorded variant.
- `gate --run RUN --tier full`: require all applicable catalog cells and recorded variants; unrun/blocked/review-needed cells fail. `full` includes smoke.

A passing honest-unsupported-stop case cannot pass first-save cases. The matrix displays `passed`, `failed`, `blocked`, `needs_review`, `not_run` and explicit `not_applicable` separately. Public infrastructure coverage is always counted separately from native/client coverage.

To add platforms/cases, edit `catalog.json` or use `init --catalog FILE` with the same schema. Add a platform ID to applicable explicit scenario lists; `*` covers every non-public platform automatically. Preserve stable IDs for the same behavior and introduce a new ID when the behavior is materially different. Existing run snapshots intentionally do not change with the catalog.

## CI and data layout

[The GitHub Actions workflow](../../.github/workflows/connect-evals.yml) runs evidence-contract tests and public probes on relevant pushes/PRs, daily, and on demand. It uploads `connect-evaluation`: immutable run header, results, public/redacted evidence, HTML and Markdown. A manual `baseline_run_id` selects a prior artifact for comparison. Automatic native account access is deliberately not configured. Source revisions are labeled as workflow-source, not falsely claimed deployed MCP/OpenKey revisions.

```
RUN/
  run.json           immutable candidate/catalog snapshot
  results/           append-only attempts
  evidence/          public probe documents or human-reviewed attachments
  matrix.html        regenerated report
  matrix.md          regenerated report
  private/           raw native captures and isolated client state; NEVER publish
```

Runs default to caller-selected directories; use ignored `.evals/` locally. Run files are 0600 and created directories 0700. Back up/share only the reviewed artifact paths, never the whole run tree. CI artifacts expire after 30 days; archive reviewed runs elsewhere if longer history is required. Never point a capture at your normal TinyCloud profile.

## Verification and known limits

```sh
npm --prefix evals/connect test
```

Contract tests cover missing read-back evidence, incomplete review, later failures replacing earlier passes, stale run IDs, duplicate checks, evidence tampering/path escape, controlled-fixture approval, variant separation, lost coverage, incomparable environments, credential guards, OAuth identity/PKCE boundaries, and terminal tape/shell injection rejection.

The initial local smoke exercised public probes, packet creation/import, a real Codex launch, coverage gating and the rendered browser dashboard. All three public groups passed. The isolated Codex launch was **blocked by missing provider authentication** before any setup response; it did not certify a model or TinyCloud setup. No authenticated ChatGPT/Grok/Claude/Muse/Dots journey, OpenKey signup/approval, payment or personal-record write was performed. GitHub-hosted workflow execution requires the repository's Actions service and is not claimed by local smoke tests.

Subsequent read-only first-response runs used existing isolated lab provider logins. Codex authenticated but encountered a native web-fetch error and sandbox DNS failure. Claude Code (`claude-opus-5-5`) fetched both pages, received a summary rather than the complete coding guide, and asked whether setup was intended; that failed the bare-link criteria in the restricted fixture. These are real native observations, not conclusions about ordinary full-tool/TUI behavior.

The disposable image was built and smoke-tested on Linux x64: all four pinned client executables launched, the suite created a run/review packet in its writable work volume, and the connect page returned HTTP 200 from inside the container. Containers ran as UID 1000 with read-only root filesystems, all capabilities dropped, no privilege escalation, no host bind mounts, and no published ports. No host credentials were copied into them. The dedicated loopback browser relay was prepared, but an attached test browser and human provider/OpenKey sign-ins remain prerequisites for full onboarding acceptance.

The resumed terminal lane captured the real OpenCode mini UI from the earlier conversation, including its expired-consent stop. A deliberately unmatched screen wait returned `blocked`, left every acceptance check ungraded, published no raw evidence, and preserved the native pane/process and its dimensions. This is recorder verification, **not a fresh onboarding pass**. The corrected image also exercised `ps` and reached Codex's actual sign-in menu with its default app-server behavior; provider authentication remains a human prerequisite.

Known guide conflicts remain visible scenarios, not suite fixes: hosted setup still references CLI time/skill instructions (`D04`), and provisioning retry guidance differs between the live connect page and hosted acceptance requirements (`S02`/CG-10). Judge the actual deployed behavior and preserve failures; do not weaken rubrics just to make the dashboard green.
