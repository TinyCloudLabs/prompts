# `/connect` evaluation handoff

## Start here

This PR hands over an executable evaluation harness and the **2026-10-23 checkpoint**, not a claim that every client can onboard. The catalog covers **14 client surfaces and 144 scenarios**, with public HTTP probes counted separately. Product runtime, `/connect` deployment, MCP and OpenKey are not changed by this work.

- [Runbook](README.md): commands, fixture isolation, operator review, native/TUI capture and CI.
- [Portable checkpoint](checkpoints/2026-10-23/): the frozen run header, **26 append-only attempts**, and **20 public or reviewed text/JSON attachments**. No raw native/browser captures or authenticated state are included.
- Acceptance provenance: [MCP lifecycle matrix](../../tinycloud-mcp-first-user-readiness-todo.md#6-edge-case-acceptance-matrix) and [ChatGPT acceptance runs](../../tinycloud-chatgpt-first-user-readiness-todo.md#5-required-chatgpt-acceptance-runs). These are requirements/historical audits, not current passing evidence.

The checkpoint run is `3bee6759-cc98-418e-b5ec-bd6f50aa7e58`, candidate `disposable-native-onboarding`, created 2026-10-22. Its tested deployment is explicitly **unverified**. Do not relabel it with this PR's source commit: the source checkout and the deployed guide/MCP versions are different identities.

## Reproduce the saved matrix without accounts or network

Requirements: Node.js 22 or newer; a shell with `cp`. The harness has no npm dependencies to install.

From the repository root, with a fresh destination:

```sh
npm --prefix evals/connect test
mkdir -p .evals/connect
cp -R evals/connect/checkpoints/2026-10-23 .evals/connect/handoff-baseline
node evals/connect/runner.mjs report --run .evals/connect/handoff-baseline
```

Open `.evals/connect/handoff-baseline/matrix.html`; `matrix.md` is the text equivalent. Keep the copied `evidence/` beside the reports. Generating a report verifies the catalog/evidence hashes; it does not rerun clients, grant access, or turn observations into acceptance passes. Generated HTML is intentionally not checked in.

Treat the checked-in checkpoint as immutable. Copy it into ignored `.evals/` before generating reports, reviewing private evidence, or working with a candidate. Never append new attempts to the checked-in historical bundle.

## What actually ran

These are dated observations. Old evidence that says a process or request is waiting is not a current liveness claim; old authorization codes are not reusable. Multiple recorder/observation entries can describe one native conversation, so attempt counts are not counts of independent onboarding runs.

| Surface | Observed outcome | Remaining acceptance boundary |
| --- | --- | --- |
| OpenCode 1.18.31, `opencode/big-pickle`, native `--mini` | The historical bare-URL variant passed routing/setup-intent only. Later, owner-approved synthetic KV setup saved the starter and `Test TinyCloud`, read it back, and retrieved the same record in a fresh conversation after restart. Returning-session discovery performed a fresh catalog list without reinstall, reauthorization or a write. | Persistence and returning-session rows remain `needs_review`; raw transcript/state proof was not published. The returning-session turn did not freshly read the sentinel body. This is not a verified zero-account signup/billing fixture or default-full-TUI result. |
| omp 18.4.8, `openai-codex/gpt-6-astra`, scoped gateway | Existing provider authentication worked in an isolated container. The exact bare URL fetched the guides, installed TinyCloud CLI 1.3.1, verified eight skill files and created a key-only local profile. | Paused before executing device authorization; no new OpenKey request, owner grant or save. Row is `needs_review`, not an end-to-end pass. |
| Codex 0.160.0, `gpt-6.1-sol` | Existing lab authentication supported a bounded real workspace write/read; outside synthetic sentinel access was denied. | This provider-readiness smoke is not full container onboarding. Older fresh-container rows remain blocked; no pass was copied between fixtures. |
| Claude Code 2.1.304, `claude-opus-5-5` | Existing lab authentication supported restricted in-workspace reads and denied the outside synthetic sentinel. | Full container onboarding remains unverified; the restricted Read-only surface cannot install/run TinyCloud. |
| Gemini consumer web, anonymous 3.5 Flash-Lite | The exact bare URL produced Claude web/Desktop connector instructions, including enabling that connector in the current conversation. | Wrong-client routing observation retained as `needs_review`. No TinyCloud connector, consent or storage operation occurred. |
| Copilot / Microsoft | A dedicated agent-controlled mailbox received an authenticated verification email and the real signup UI accepted its code. | Country/region and date of birth were required next. Signup incomplete; no identity details invented. |
| Meta Muse | The same dedicated inbox completed the real Meta email verification step. | First name, last name and birthday were required next. Signup incomplete; no Muse chat or TinyCloud integration reached. |
| Claude / ChatGPT / Perplexity | Actual dedicated-browser attempts hit provider verification/challenge gates before usable signup forms. | Human verification or legitimately provisioned test accounts; do not bypass challenges or infer product capability from the gate. |
| Grok | Actual browser entry showed an access-denied block. | No signup or TinyCloud conversation reached. |
| Dots | Shared ChatGPT account prerequisite was blocked; official documentation additionally requires eligible account/workspace access. | Dots itself was not reached. Do not treat ordinary ChatGPT or provider API access as Dots coverage. |
| Cursor / Gemini CLI | Binaries were not found on the operator's PATH. | Not executed; remain `not_run`, not unsupported. |
| Public HTTP | Entry and OAuth discovery probes passed. | Skill probe failed on the frozen manifest contract described below; HTTP success is not native onboarding proof. |

Provider-readiness and mailbox observations above supplement the matrix; they do not create synthetic scenario passes. The latest recorded native cells contain **one narrow routing pass, 11 blocked cells and four review-needed cells**. Most lifecycle/platform cells have not run. No newly completed web signup is claimed.

### Known public probe contract drift

The frozen `HTTP-skill` case and current probe implementation require exactly four skill files. The published manifest listed eight at the checkpoint. The probe therefore failed before its file-integrity loop. A separate download/hash-only diagnostic matched **all eight** published checksums, against the same manifest digest; see [the diagnostic](checkpoints/2026-10-23/diagnostics/skill-manifest.json).

This is a known contract mismatch, not evidence of corrupted downloads. The public CI gate can remain red while this mismatch persists. Keep the historical failure and catalog hash unchanged. To support a new published contract, update the future catalog/probe deliberately, preserve filename/path and checksum validation, and create a new candidate rather than rewriting old results to green.

## Continue with a new candidate

```sh
node evals/connect/runner.mjs init --out .evals/connect/candidate-next --candidate candidate-next
node evals/connect/runner.mjs probe --run .evals/connect/candidate-next
node evals/connect/runner.mjs report --run .evals/connect/candidate-next --baseline .evals/connect/handoff-baseline
node evals/connect/runner.mjs list --platform opencode --tier smoke
node evals/connect/runner.mjs packet --run .evals/connect/candidate-next --platform opencode --scenario core-bare-url --variant reviewed-native --out .evals/reviews/opencode-bare.json
```

A failed probe exits 1 and retains evidence; run `report` afterward even on failure. For a preview, pass its actual `--connect-url` and, when different, `--mcp-url` to `init`. Set `--revision` only when the tested deployment identity is known. Operator prompts and displayed instructions resolve the candidate endpoints; canonical source references and historical snapshots remain unchanged.

Execute the printed prompt in the actual client. Record exact model, build, permission policy, account class and fixture conditions; different conditions need distinct variants. Complete the packet only after reviewing the real behavior and every proposed attachment. `record --redacted` is a human redaction attestation, not a way to automatically grade raw transcripts:

```sh
node evals/connect/runner.mjs record --run .evals/connect/candidate-next --input .evals/reviews/opencode-bare.json --redacted
node evals/connect/runner.mjs report --run .evals/connect/candidate-next --baseline .evals/connect/handoff-baseline
node evals/connect/runner.mjs compare --run .evals/connect/candidate-next --baseline .evals/connect/handoff-baseline
```

Comparisons require matching scenario/variant and environment context. `compare` exits 1 for regressions/lost coverage and 2 for incomparable context. A `gate --tier full` failure is expected while required native cases remain unrun, blocked or ungraded. Capture duration is not the duration of the full onboarding journey.

## Authentication and private continuation

- Keep provider authentication separate from synthetic TinyCloud identities. Reuse explicitly authorized provider sessions safely; an empty container is not a reason to ask the owner to repeat every login. Never copy a personal provider credential store into an eval container.
- The exercised omp transport used an official 18.12.6 gateway, an 18.4.8 host broker, and a policy pinned to one existing OAuth identity and one model. Provider credentials and broker/master tokens stayed on the host; the worker received a scoped client token. The test-owned socket-only read-only mount was an explicit exception to the initial no-bind-mount fixture, not an owner-home or Docker-socket mount. This is a distinct transport variant, not direct-login parity.
- Gateway policies, supervisor configuration, tokens and the live reusable worker are **not portable PR fixtures**. On another host, configure an authorized scoped route using the [official broker/gateway documentation](https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/auth-broker-gateway.md), or use the client's normal authorized login. Codex/Claude full-container routes were not wired to this gateway.
- On the original operator host only, ignored `.evals/connect/resume-state.json` maps private evidence, named sessions and service continuation/stop controls. It is deliberately absent from this PR. Coordinate private review with the operator; do not paste credentials, mailbox codes, cookies or authorization returns into issues or PR comments.
- The original omp fixture was paused before starting its device-authorization command. Resume only when the owner is ready to authorize the intended **test identity**. Do not issue unused expiring requests or automatically consent. Existing authorized OpenCode state is a different fixture; do not infer it authorizes another identity.
- The owner's TinyCloud document **“TinyCloud connect evaluation matrix”** holds the complete matrix and execution-readiness history. The checkpoint update was read back exactly. That personal record and its access credentials are not required to run this PR and are not exported here. Test writes must never use the owner's personal-record profile.

## Next acceptance work

1. Privately review the retained OpenCode persistence, Gemini routing and omp bootstrap evidence; add honest check-level judgments and redacted attachments. Do not equate a synchronized VHS frame or model claim with a storage read-back.
2. When the owner is ready, finish the omp test-identity grant, save/read-back and fresh-conversation path. Preserve the existing conversation and separate it from a genuinely fresh-install case.
3. Supply legitimate test-account identity details or provisioned accounts and complete necessary human verification for hosted clients. Establish actual connector/tool capability and account eligibility before running storage cases. No fabricated age/identity, challenge bypass or paid-plan purchase is authorized by this handoff.
4. Resolve the future skill-manifest contract without altering the archived failure; verify the resulting public CI gate against the intended deployment.
5. Run the remaining smoke/lifecycle cases in authorized synthetic fixtures, including denial/expiry/revocation, storage failures, quotas, cross-turn waiters and accessibility. Destructive/fault/payment cases require their specified controlled staging fixtures.

## Harness hardening included in the PR

Publication review found two harness defects: preview packets could instruct an operator to test production, and cancelling a slow native version lookup could still launch the model command. Candidate instructions now resolve consistently across operator packets, reports and native prompts without changing frozen definitions. SIGINT/SIGTERM during version capture now produce a blocked, ungraded result without launching the main command; an ordinary unavailable version remains a separate condition. Behavioral regression tests cover these boundaries.

The [CI workflow](../../.github/workflows/connect-evals.yml) runs the contract suite and anonymous public probes, retains only allowlisted reports/evidence, and supports a selected historical baseline. It does not automate native account access, consent, signup, payments or acceptance grading. The archived `needs_review` and blocked outcomes are intentionally preserved.

## Verification performed for this handoff

- `npm --prefix evals/connect test`: **19 passed**, zero failures or skips on Linux.
- Actual CLI packet generation used the configured preview URL. A real Chromium report view showed that preview URL in the executable S01 prompt, while retaining canonical scenario provenance.
- Actual CLI cancellation smokes for both SIGINT and SIGTERM returned exit 2 / `blocked`, left every acceptance check ungraded, and did not launch the synthetic main command. No provider/model was used for these harness checks.
- An offline copy of the portable checkpoint regenerated HTML/Markdown and verified the frozen catalog and all attachment hashes: 26 attempts, 20 attachments, unchanged recorded outcomes. The rendered Gemini observation remained `needs_review`.
- No live public probe or authenticated onboarding was repeated during PR preparation. The known historical skill-probe failure remains visible; local verification does not claim a successful GitHub-hosted workflow run.
