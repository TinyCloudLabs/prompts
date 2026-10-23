# TinyCloud MCP in ChatGPT: fresh-user production todo

2026-10-20. **Scope:** a person starts at https://agents.tinycloud.xyz/connect with no OpenKey account, no signing key, no TinyCloud storage and no TinyCloud connection in ChatGPT. Give the setup route first; address sign-in or workspace restrictions only when encountered.

**Status: planned, not production-certified.** This checklist carries forward the findings in the [first-user MCP audit](tinycloud-mcp-first-user-readiness-todo.md). No new authenticated ChatGPT run was performed to create this document. Every checkbox remains open until its acceptance evidence exists.

**Route:** existing custom remote MCP on ChatGPT web, using `https://mcp.tinycloud.xyz/mcp` and OpenKey OAuth. No CLI, local skill, temporary code sandbox, wallet import or user-supplied API key. Public-directory approval, publisher verification and ZIP submission are a separate [public-plugin release plan](tinycloud-chatgpt-plugin-release-plan.md); they are not prerequisites for this custom-connection checklist. Do not transfer public-directory eligibility or mobile claims to custom MCP.

## 1. Setup first; troubleshoot observed blockers

The owner reported successfully connecting after ChatGPT warned that their Free account might not support custom MCP. That connection result takes precedence over a documentation-based restriction. It does not by itself certify first-record writes or read-back.

**Initial response contract:** a bare `/connect` link in ChatGPT is a setup request. If TinyCloud tools are not available, give only four numbered steps in at most 120 words: open the direct Plugins link; enter name, description, exact `/mcp` URL and OAuth; create/sign in with OpenKey/install; select `@TinyCloud` and resume the request or use the setup-only example. No introduction, images, feature menu, plan or price caveats, extra sections or closing questions. If tools are available, continue through them instead.

Do not infer eligibility, denial or a required upgrade from Free/Go/Plus/Pro labels or gaps in general provider documentation. Do not ask the owner to establish eligibility before trying setup. Diagnose only reported or observed UI/tool blockers; ask one targeted question only when necessary for the next action. Preserve genuine restrictions, and never label mutating tools read-only to evade them.

**Internal account QA, not an onboarding preflight:** record the actual plan, workspace role, available UI and create/install → OAuth → write → read-back outcomes. Cover both available and blocked capabilities rather than preassigning outcomes by plan. A documented route is not account-level proof; a missing documentation promise is not account-level denial.

**Pricing research, not a setup prerequisite:** published Business Standard pricing was $25/seat/month monthly or $20/seat/month annually, minimum two seats: $50/month on monthly billing or $480/year on annual billing, before regional/tax differences. Discuss pricing only when asked or when an actual purchase gate is encountered, using current checkout terms. Do not recommend a subscription as a speculative fix. Enterprise/Edu contract costs were not established.

**TinyCloud costs are separate and unresolved:** actual new-owner free allowance, credit requirements, upgrade price and retention policy need authorized verification. Public pricing says Early Access; the billing UI's 100 MiB fallback is not proof of entitlement. No purchase or monetary seed-credit requirement was found in the inspected normal OpenKey bootstrap source, but that is not a commercial guarantee.

## 2. Target ChatGPT journey

1. User opens the ChatGPT section of `/connect`; the assistant gives the short setup steps without eligibility checks, pricing commentary or a questionnaire.
2. User opens **Plugins → + → Add custom MCP server**, enters TinyCloud and `https://mcp.tinycloud.xyz/mcp`, selects OAuth, reviews the warning and follows **Create as a plugin**. Only if the actual workspace UI blocks creation, use its administrator-approved installation path or explain the specific restriction. Verify exact labels in the current account UI.
3. OpenKey offers new-account email verification or Google signup. Passkey enrollment is optional; the managed signing key is normally created automatically. No separate human TinyCloud identity should need manual creation.
4. OAuth returns to ChatGPT. User completes installation and selects **@TinyCloud** in the message containing the original request.
5. ChatGPT calls the actual tools, presents the returned account-registry approval and then personal-record approval as needed. User approves in OpenKey, never by pasting a code into chat.
6. User returns to the same conversation and sends **“@TinyCloud continue my original request.”** App selection applies per message when another tool action is needed. Successful OAuth or `connected: true` alone is not proof of storage readiness.
7. Storage becomes usable; ChatGPT asks for the owner's city or IANA timezone once, resumes the original request, writes through the hosted tools and reads the record back.
8. ChatGPT confirms the actual saved record and how to retrieve or delete it later. A new conversation can retrieve it. Optional searchable-copy approval is not required for the first basic save.

## 3. P0 — Block production sign-off

Suggested owners are teams/repositories, not assigned people. Each item requires observed evidence, not just code review or a successful health check.

- [ ] **CG-01 — Verify actual account capabilities without plan-based setup gates.** **Owner:** product + ChatGPT QA.
  - Cover no ChatGPT account, Free/Go/Plus/Pro, Business owner/admin/member, Enterprise/Edu creator/publisher, wrong workspace, unpublished connection and blocked write actions. Record observed capabilities; do not assume a plan is read-only or unsupported. Cover actual provider account/location/age restrictions without bypassing them.
  - Direct setup to ChatGPT web; record UI rollout differences rather than assuming every account has the same menu. Do not add speculative mobile or developer-mode warnings to the initial response.
  - **Done when:** the short setup response is given without inferred plan restrictions, every advertised write-capable route has a real create/install → OAuth → write → read-back pass, and actual blockers receive specific troubleshooting without an invented upgrade requirement.

- [ ] **CG-02 — Establish the real new-user TinyCloud cost contract.** **Owner:** billing/account + OpenKey + node.
  - Use a brand-new authorized owner with no manually seeded credits, billing row, spaces or grants. Determine effective free storage, whether zero credits affect KV/SQL at all, paid triggers, credit expiry/reset and data retention after cancellation.
  - Distinguish OpenAI subscription charges from TinyCloud charges and from chat-provider message/model limits. Never buy a plan or credits automatically.
  - **Done when:** first-save prerequisites and actual costs are documented from authenticated evidence. No “free forever,” “must buy credits,” or 100 MiB entitlement claim is inferred from frontend defaults or missing checkout screens.

- [ ] **CG-03 — Make ChatGPT connector installation reproducible.** **Owner:** prompts/docs + ChatGPT QA.
  - Verify Plugins navigation, exact server URL including `/mcp`, OAuth, risk warning, create/publish/install steps and the ordinary-member branch. Current documentation says the Plugins flow does not require Developer Mode; remove conflicting legacy instructions for this route.
  - Cover missing option, wrong URL/transport, duplicate installation, stale discovery/tool metadata, inability to read `/connect`, partial HTML/Markdown retrieval and assistant routing to a CLI or sandbox.
  - **Done when:** an uncoached user receives the four-step response and follows the actual UI without a feature menu, closing questionnaire, speculative plan/price warnings, directory search, client-secret invention, shell commands or a false claim that reading the page installed anything.

- [ ] **CG-04 — Complete signup inside the originating OAuth flow.** **Owner:** OpenKey + ChatGPT QA.
  - Cover email signup from both sign-in and explicit registration, OTP delivery/spam/typo/resend/expiry/rate limits, account-creation confirmation, concurrent signup and existing-email recovery. Cover Google cancellation, wrong Google identity, blocked/closed popup and provider outage.
  - Preserve the original redirect, state, PKCE and resource through signup, optional-passkey enrollment/skip and recovery. Codes stay in OpenKey, never in ChatGPT.
  - **Done when:** genuinely new email and Google accounts return to the initiating ChatGPT connection without losing the request, creating unintended duplicate accounts or requiring a preexisting passkey.

- [ ] **CG-05 — Gate usable owner identity and repair failed key creation.** **Owner:** OpenKey.
  - Existing source catches automatic key-generation failures and maps existing keys into OAuth owner claims. **[INFERENCE]** a new account can reach OAuth with no usable owner key. Reproduce under controlled failure before changing the contract.
  - Verify best-effort repair and the generated-key response's type/selection behavior; source suggests a missing `keyType` can misroute manual repair toward wallet signing. This inference is not a confirmed production failure.
  - Cover TEE/DB failure, repeated generate clicks, reload, archived/multiple keys, a newly added key after token issuance and switching OpenKey account mid-flow.
  - **Done when:** usable MCP authorization requires valid owner identity; failed provisioning has a same-account repair path; no wallet detour, duplicate owner or stale-key selection is presented as success.

- [ ] **CG-06 — Prove ChatGPT OAuth and token lifecycle.** **Owner:** OpenKey + SDK/MCP + ChatGPT QA.
  - Exercise actual ChatGPT client registration, authorization-code flow, PKCE S256, exact redirect/resource audience, `tinycloud:mcp`, owner claims and refresh-token issuance. Verify offline access behavior rather than assuming discovery guarantees a refresh token.
  - Cover registration rejection/rate limit, missing/wrong scope, invalid state/issuer/audience/signature, expired access/refresh tokens, rotation/reuse/revocation, signing-key rotation, clock skew and connection metadata caching.
  - **Done when:** ChatGPT initializes, discovers tools, invokes them and renews access; invalid credentials fail closed and reconnect preserves ownership. No API keys, bearer tokens, signed delegations or OAuth codes are requested in chat.

- [ ] **CG-07 — Explain and enforce the distinct approvals.** **Owner:** product + OpenKey + SDK/MCP.
  - Explain OAuth identity access, account-registry delegation, personal-record get/list/put/delete under `xyz.tinycloud.agent-data/`, optional SQL-copy access and ChatGPT's own tool confirmation as distinct controls.
  - Show owner/key, scope, duration and revocation instructions. Correct `tinycloud_apps_context` and `tinycloud_apps_query` read-only annotations while they persist timezone or refresh derived storage; don't use misleading metadata to fit a read-only plan.
  - Cover narrowed/declined grants, blocked write tools, changed preview identity and repeated prompts. Do not require blanket tool approval to finish setup.
  - **Done when:** denial prevents unauthorized operations and repeated requests; optional search can be declined independently; actual ChatGPT-visible tool metadata matches side effects.

- [ ] **CG-08 — Make approval links and return-to-chat recoverable.** **Owner:** MCP + OpenKey + prompts/docs.
  - Replace the observed raw-JSON browser dead end with safe human recovery instructions. Preserve the machine-readable error contract where needed.
  - Cover malformed/missing/expired/spent links, link previews/scanners, double-click/reload/back, two outstanding requests, closed tabs, wrong owner, forwarded links, callback CORS/network failure and completed approval with a lost response.
  - Distinguish MCP link expiry from OpenKey's shorter prepared approval context; recover after context loss/restart without loosening binding checks. Tell the user to return to the correct conversation and reselect **@TinyCloud**.
  - **Done when:** each state has a concrete next action; completed approvals are recognized; cancellation does not trigger a new loop; no signed URL/state/credential is exposed in support output.

- [ ] **CG-09 — Make new-owner storage readiness accurate.** **Owner:** OpenKey + node + MCP.
  - Identify the deployed revision. Current OpenKey source already hosts the requested space first, waits within a budget and retries eligible background failures; reuse that mechanism where deployed rather than adding a competing setup flow.
  - Cover slow setup, HTTP success without actual activation, pending background registry/schema seeding, missing `default`, failed node/account service, concurrent setup and retry exhaustion. Test managed keys with Auto-Sign on/off, external-wallet keys and unsupported host/chain/configuration.
  - **Done when:** an authorized catalog read proves usable storage; approval alone never does. Pending is bounded and distinct from permanent/manual-setup-required states. Turning Auto-Sign on requires an explained user choice, not a silent fix.

- [ ] **CG-10 — Unify ChatGPT instructions and actual hosted errors.** **Owner:** prompts/docs + SDK/MCP.
  - Reconcile `/connect`'s two-minute retry advice with hosted rules saying not to wait. Recognize `NODE_ERROR` with `details.reason: space_not_hosted`, not just raw `SPACE_NOT_HOSTED`.
  - Remove chat-path dependence on CLI skill sections and `date -u`; use hosted context time and timezone. Preserve the original request and explain how to continue with **@TinyCloud** after each external action.
  - Cover unavailable tools, assistant inability to fetch the guide, new conversation/context loss and wrong-environment routing.
  - **Done when:** one consistent hosted contract reaches first value without shell access, fabricated links, broader sign-in, conflicting waits or premature success.

- [ ] **CG-11 — Prove first save, read-back and reconnect from zero state.** **Owner:** ChatGPT QA + MCP.
  - Test both setup-only and a concrete request. For setup-only, create only the documented starter catalogs/todo after approval; check both open/done keys before creating it. For a concrete request, save that record rather than adding an unrelated starter.
  - Cover empty catalog, missing app/kind, timezone unknown/invalid/ambiguous or declined, explicit timezone, local-midnight/DST boundaries, repeated prompt, two conversations and partial first-save completion.
  - **Done when:** actual returned operation results and authoritative read-back match the user's request; a new ChatGPT conversation retrieves the same record; reconnect does not duplicate or resurrect a completed starter. Document how the user deletes it.

- [ ] **CG-12 — Preserve safe write and retry behavior in ChatGPT.** **Owner:** SDK/MCP + ChatGPT QA.
  - Per-operation errors must retain distinctions needed for recovery; a top-level `ok` or generic `NODE_ERROR` is insufficient. Cover validation failure, quota refusal, pre-write timeout/busy response, unknown write outcome, partial batches, partial moves, stale ETags, `EXISTS`, `CHANGED` and `CATALOG_CHANGE`.
  - Read authoritative state before retrying a write that may have committed. Reconcile conflicts without blind overwrite or force-delete. Preserve successful KV writes when optional-copy maintenance fails.
  - **Done when:** injected failures never produce duplicate records, silently lost updates, hidden committed work or full-batch replay after partial success. ChatGPT accurately reports what did and did not happen.

- [ ] **CG-13 — Verify tenant isolation, revocation and trust boundaries.** **Owner:** security + OpenKey + MCP.
  - Use two synthetic OpenKey owners and separate ChatGPT users/workspaces; also test multiple keys and simultaneous conversations. Exercise enforcement at the server, not only through model prompts.
  - Cover wrong-owner approval, stale identity claims, guessed other-owner resources, malicious catalog/record instructions, cross-conversation confusion and access after revocation.
  - Explain that hosted MCP processes plaintext inputs/results and ChatGPT may retain tool output. Review the discovered tool set against the personal-record claims; don't retrieve real secrets for testing. Any public-directory credential restrictions belong to the separate publication plan.
  - **Done when:** no cross-owner data/grants, no unauthorized writes from stored instructions, revoked authority is rejected and privacy/scope copy matches actual behavior.

- [ ] **CG-14 — Bind acceptance to a durable deployed candidate.** **Owner:** operations + MCP/OpenKey + QA.
  - Record source/image identities, relevant host/configuration and the actual ChatGPT plan/workspace/browser. Respect the MCP filesystem store's single-replica boundary; preserve state secret and tenant volume.
  - Cover restart during signup/approval/write, lost in-memory OpenKey approval context, disk-full/state failure, pending bootstrap recovery, rollback and restore. Do not add speculative distributed-state infrastructure as a prerequisite if supported single-replica operation suffices.
  - **Done when:** the identified deployment passes the first-save and negative cases, and supported restart/restore preserves authority or supplies accurate recovery without creating a different owner.

## 4. P1 — Complete before broad rollout

- [ ] **CG-15 — Handle ChatGPT quota and tool-availability limits.** **Owner:** product + ChatGPT QA.
  - Cover message/model/feature limit reached before approval, while returning or after a write; temporary model/tool unavailability; workspace policy change; connection removed or no longer selected.
  - **Done when:** ChatGPT identifies the actual provider gate, preserves completed state and gives supported wait/reselect/admin guidance. It does not blame TinyCloud storage, request broader OpenKey access, promise unlimited use or automatically recommend a purchase.

- [ ] **CG-16 — Complete billing and full-storage recovery.** **Owner:** account + node + MCP.
  - Cover HTTP 402 quota full versus 413 capacity/payload refusal, account-wide usage, wrong-owner billing session, expired billing login, cancelled/declined checkout, bank authentication, unsupported payment region/currency, duplicate submission and delayed entitlement propagation.
  - Cover credit reset/expiry if relevant, downgrade/cancellation/payment failure, reads/export while full and optional SQL/history still using storage. Logical KV deletion does not guarantee immediate quota relief.
  - **Done when:** safe refusal and actual costs are clear; no duplicate charge or automatic purchase; effective quota is verified before retrying; retention/exit behavior matches policy. Run payment scenarios only with explicitly authorized test/sandbox payment access.

- [ ] **CG-17 — Make optional query failure nonblocking.** **Owner:** MCP + ChatGPT QA.
  - Cover declined/expired SQL-copy grant, absent/stale copy, `COPY_PARTIAL`, copy unavailability, failed maintenance after a saved record, malformed catalog, missing ETag, pagination errors and oversized/truncated results.
  - **Done when:** fresh KV remains authoritative, no incomplete aggregate is presented as complete, limits receive narrowing guidance, and optional search failure does not restart identity/storage onboarding or repeat a successful write.

- [ ] **CG-18 — Verify browser and access UX.** **Owner:** OpenKey + prompts/product + QA.
  - Exercise supported ChatGPT web in Chrome/Safari/Firefox, private browsing, cookie/tracking restrictions, blocked popups, in-app links, cross-device approval, refresh/back, two tabs and slow/failed hydration.
  - Test narrow layout, 200% zoom, keyboard-only use, screen readers and visible pending/error states. Clearly direct unsupported native-mobile setup back to the documented web route without claiming native compatibility.
  - **Done when:** the supported route works without losing identity/state, or presents a precise recoverable limitation; no indefinite blank page, clipped action or inaccessible consent control.

- [ ] **CG-19 — Complete returning-user recovery and offboarding.** **Owner:** OpenKey + MCP + account/support.
  - Cover new conversation with **@TinyCloud**, reinstall, different workspace, OAuth/session/grant expiries, expired optional-copy permission, lost passkey with email/Google recovery, restored archived key and loss of all recovery factors.
  - Distinguish ChatGPT disconnect/removal, OpenKey sign-out, disabling future signing, revoking existing grants and deleting records/account. Explain scope when the same owner uses multiple integrations; don't revoke unrelated authority accidentally or claim removal erased records.
  - **Done when:** returning users reach original data without creating a new identity; supported recovery/export/deletion paths work and retention limits are explicit. Do not promise recovery after irreversible key/access loss.

- [ ] **CG-20 — Ship safe support and release evidence.** **Owner:** support + operations + QA.
  - Reuse existing stage/code/duration diagnostics and deployment identity for signup, key creation, OAuth, callback, provisioning, node and billing failures. Provide privacy/support links before signup and an escalation owner for each dependency.
  - **Done when:** support can distinguish plan restriction, denied authority, lost key, provisioning delay, quota refusal and unknown write outcome without requesting OTPs, private keys, tokens, full approval URLs or personal records. Evidence is redacted; outage/rollback and ownership are documented.

## 5. Required ChatGPT acceptance runs

Use authorized synthetic identities and exact deployed candidates. These rows are **not run** unless a later evidence record explicitly changes the status. Fault injection belongs in a controlled equivalent environment, not destructive production experiments.

| Run | Starting condition / action | Required evidence | Covers |
| --- | --- | --- | --- |
| T01 | Free/Go/Plus account with custom-server UI available | Direct setup steps without plan warning or upgrade suggestion; record actual connection and write/read-back outcomes separately | CG-01, CG-03 |
| T01b | Any account reports a missing custom-server option or actual policy rejection | Targeted troubleshooting of that UI/error; no invented cause, entitlement or upgrade promise | CG-01, CG-03 |
| T02 | Actual read-only or blocked-write tool access, regardless of plan | Explain the observed action restriction; no false write-ready claim or mutating tools disguised as read-only | CG-01, CG-07 |
| T03 | Eligible Business owner/admin; entirely new email identity; setup-only request | Connector install, signup, OAuth, required grants, storage readiness, timezone, starter write and authoritative read-back | CG-02–CG-11 |
| T04 | Fresh eligible account; Google signup; explicit todo request | Original todo saved once, no unrelated starter; optional-passkey skip and enrollment covered across T03/T04 | CG-04–CG-11 |
| T05 | Business ordinary member | Admin prerequisite when absent; approved connection plus separate member OAuth when available | CG-01, CG-03, CG-13 |
| T06 | Enterprise/Edu creator/member role and blocked action | RBAC/publication/write restrictions enforced; run for each advertised supported workspace class | CG-01, CG-03, CG-07 |
| T07 | Return after approval, then fresh conversation/reinstall | @TinyCloud selection works; same record retrieved; no duplicate or resurrected starter | CG-08, CG-10, CG-11, CG-19 |
| T08 | Expired/wrong OTP, signup cancellation, Google denial and passkey cancellation | Correct same-account recovery or clean stop; no secret in transcript | CG-04, CG-19 |
| T09 | Key-generation/sealing failure followed by repair | No usable-authority claim with missing owner; managed-key repair, original OAuth state retained | CG-05, CG-06 |
| T10 | Slow/failed storage bootstrap; Auto-Sign off/external wallet | Pending versus manual/permanent failure distinguished; no endless wait or broader grant | CG-09, CG-10 |
| T11 | Decline OAuth, records or optional SQL access; block ChatGPT write tool | No unauthorized mutation or repeated consent loop; basic KV remains usable when only copy is declined | CG-07, CG-17 |
| T12 | Expired/spent link, wrong-owner link, duplicate approval and lost callback | Human recovery, single-use binding and correct return to original chat | CG-08, CG-13 |
| T13 | Access/refresh/session/grant expiry and actual revocation | Correct renewal boundary; denied access after revocation; no new owner | CG-06, CG-13, CG-19 |
| T14 | Two owners/workspaces plus stored prompt-injection content | Server-side isolation, unchanged unauthorized state, no unexpected tool authority | CG-13 |
| T15 | First-write partial batch, ETag conflict, move failure and response lost after commit | Exact committed state; safe reconciliation; no duplicate/overwrite | CG-11, CG-12 |
| T16 | Storage full/oversized write, provider quota and payment/entitlement failure | Distinct actionable gates; no automatic charge or destructive quota advice | CG-02, CG-15, CG-16 |
| T17 | Optional-copy stale/partial/unavailable; oversized or incomplete result | Correct KV fallback/narrowing, no false complete answer or duplicate save | CG-12, CG-17 |
| T18 | Browser/privacy settings, cross-device return, accessibility and unsupported mobile entry | Actual supported screens usable; safe state continuation; unsupported surface explained | CG-01, CG-18 |
| T19 | Restart/rollback/restore during approval and after first save | Same ownership/data and safe pending-flow recovery tied to deployment identity | CG-14 |
| T20 | Update, delete, disconnect, revoke, recover and export | Authoritative lifecycle outcomes and accurate retained-data/privacy/support statements | CG-11, CG-13, CG-19, CG-20 |

### Per-run evidence

Record the date, runner, ChatGPT plan, workspace role, browser/interface, candidate revision/image, synthetic account labels, prompt, actual tool outcomes, authoritative saved-state result and a redacted evidence link. Use **passed / failed / blocked / not run**. Never publish emails, real personal data, OTPs, keys, tokens, signed delegations or approval-state URLs.

Suggested happy-path prompts:

- Fresh setup: `Set up TinyCloud using https://agents.tinycloud.xyz/connect`.
- After installation: `@TinyCloud save a todo called Test TinyCloud. Use Europe/London as my timezone.`
- After external approval: `@TinyCloud continue my original request.`
- New conversation: `@TinyCloud show my Test TinyCloud todo.`
- Lifecycle: `@TinyCloud mark Test TinyCloud done, then show its saved state.` Follow with a separately requested deletion and verify absence.

Use separate fixtures for setup-only and explicit-record runs. A real user may answer the normal timezone question; the tester must not rescue the assistant with undocumented commands or manual key/space/credit repair. Observe behavior without forcing a fabricated tool sequence.

## 6. Execution order and release decision

1. **CG-01–CG-02:** verify actual account capabilities and costs with authorized test-account operators, separately from the initial setup response. Do not turn QA uncertainty into a user-facing eligibility preflight or bypass actual admin/payment restrictions.
2. **CG-03–CG-10:** identify deployed revisions; reproduce and resolve connector, identity, OAuth, approval and storage blockers in their owning repositories. Independent fixes may proceed concurrently.
3. **CG-11–CG-14:** prove first value, safe failure behavior, isolation and restart durability on the identified candidate.
4. **CG-15–CG-20:** finish usage/billing, query, browser, offboarding and support coverage before broad promotion.
5. **Release only when** every advertised ChatGPT plan/role route has passed its relevant runs, all P0 items are closed with evidence and applicable P1 cases are complete. Unsupported routes need an observed honest stop, not a pretend success. Re-run affected cases after candidate changes.

A working landing page, unauthenticated HTTP 401, OAuth discovery document, existing account with preseeded storage, another client's successful connection or a green test suite is not proof of this zero-account ChatGPT journey.

## 7. Sources and implementation ownership

- [Existing detailed audit and source provenance](tinycloud-mcp-first-user-readiness-todo.md): live public observations, source-backed risks and unverified deployment/entitlement boundaries.
- [OpenAI custom-MCP availability and roles](https://help.openai.com/en/articles/12584461), [ChatGPT connection UI](https://developers.openai.com/plugins/deploy/connect-chatgpt), [Business pricing](https://help.openai.com/en/articles/8792828), [app usage limits](https://help.openai.com/en/articles/11487775). Current documentation is not a substitute for account-level acceptance.
- **prompts/docs:** `/connect`, its ChatGPT instructions and `forward-tests-onboarding.md`; [live entry](https://agents.tinycloud.xyz/connect), [MCP contract](https://docs.tinycloud.xyz/cli/mcp), [hosting/state contract](https://docs.tinycloud.xyz/hosting/mcp).
- **js-sdk:** `packages/mcp/src/{http,oauth,remote-store,tools,results}.ts`; `packages/operations/src/operations/apps.ts`, `tc-apps/{kv,preamble}.ts`, `errors.ts`.
- **OpenKey:** authentication/user-key creation, login/register/recover and OAuth continuation, key generation, consent/delegate UI, callback preparation and TinyCloud bootstrap. [Requested-space-first source contract](https://github.com/TinyCloudLabs/openkey/blob/79259f26a6fbccbcea6ad6dd3e3e361f9a1df1c4/.changeset/tc-1608-host-requested-space-first.md); deployment remains to be established.
- **node/account:** storage activation, quota enforcement, billing entitlements, payment propagation and retention; [pricing](https://tinycloud.xyz/pricing), [billing](https://account.tinycloud.xyz/billing). The real authenticated new-owner entitlement is an outstanding evidence requirement, not an assumed policy.
