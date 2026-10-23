# Fresh-user TinyCloud MCP: production-readiness todo

Audit: 2026-10-20. Entry: https://agents.tinycloud.xyz/connect. Scope: hosted custom MCP, starting with no OpenKey account, no keys and no TinyCloud storage. Address client sign-in or capability restrictions when actually encountered, not as a plan-based preflight. This is not a public-directory submission plan or a CLI implementation task.

**Verdict: do not certify the zero-account journey as production-ready yet.** The public entry and OAuth challenge are reachable; source and documentation expose concrete gaps, but no authenticated zero-account first-save run was performed in this audit. All release tasks below remain unchecked.

## 1. Evidence boundaries

- **LIVE:** inspected `/connect` in a fresh managed browser at desktop and 390px mobile width; followed OpenKey home → signup → login without submitting; inspected the hydrated billing login gate and invalid MCP approval page. Sent an unauthenticated MCP `initialize`: HTTP 401 with the correct protected-resource metadata challenge. Read live OAuth discovery. These are not authenticated MCP acceptance passes.
- **DOC:** official provider eligibility, pricing and TinyCloud contracts. Account-specific rollouts, permissions and checkout amounts still require real-account verification.
- **SOURCE:** public SDK `master` inspected while HEAD was `d80291559407b35b4610fe9861ae25434942c0e9`; OpenKey source at `79259f26a6fbccbcea6ad6dd3e3e361f9a1df1c4`; node source at `1f430390db7e165dd6b7e7333367354a1c6a4665`. Local worktrees helped locate code but are older. The exact deployed MCP/OpenKey revisions were not established.
- **[INFERENCE]:** a consequence or risk from source inspection, not an observed production failure. Matrix rows below are required scenarios, not claims that they currently fail.
- **NOT RUN:** email delivery/verification, Google login, passkey enrollment/recovery, OAuth grant/token issuance, authenticated tool discovery/calls, actual new-owner entitlements, checkout, revocation, or first-record read-back. No account, grant, payment or production data was created. Audit browser tabs were closed.
- **OWNER REPORT:** after this audit, the owner reported successful ChatGPT connection despite an upfront warning that their Free account might not support it. Accept that connection result; do not infer a denial from generic documentation. This is not a zero-account first-record write/read-back certification.

## 2. What the fresh user experiences

The normal intended route is **one OpenKey human identity, an automatically generated managed signing key, and TinyCloud storage associated with that key**. OAuth identity and storage delegation are separate approvals. A session `did:key` is not another human account. Source does not establish a normal requirement to buy crypto, import a wallet, create a second identity, or seed monetary credits.

| Step | Current documented/source-backed journey | Production acceptance |
| --- | --- | --- |
| 1. Give the current client's setup steps | `/connect` presents a universal paste prompt and routes by the current client. The owner reported that a plan-based warning preceded successful ChatGPT connection. | Give the direct setup steps, with no eligibility preflight, pricing commentary or feature menu. Troubleshoot only actual reported/observed blockers. Preserve the original request. |
| 2. Add/enable TinyCloud | Manually add `https://mcp.tinycloud.xyz/mcp`, OAuth, then install/enable/select the connector. This is not automatically installed merely by reading the page. | Exact instructions for the actual UI; no CLI, temporary sandbox, API key or client secret required from the user. |
| 3. Create OpenKey identity | Live login offers email, Google and existing-passkey sign-in. Source: new email is verified by a six-digit, five-minute OTP, then account creation is confirmed; direct registration handles that confirmation within signup. | Clear “new here” path; code stays in OpenKey, never chat; cancellation and duplicate-account recovery work. |
| 4. Create the signing key | Source: signup normally creates managed Key 0 automatically; passkey enrollment is optional and can be skipped. Bootstrap Auto-Sign defaults on. | Key creation must succeed or provide same-account repair before claiming a usable MCP identity. Explain Auto-Sign without implying unrestricted data access. |
| 5. Finish OAuth | Return to the original client OAuth request and approve identity access. | Preserve callback, state, PKCE and resource; explain identity disclosure separately from data access. |
| 6. Connect storage authority | The assistant calls `tinycloud_connect`; the user follows a separate OpenKey account-registry delegation link and returns to chat. | Show the same owner/key and exact permission purpose. `connected: true` must not be presented as proof that records are writable. |
| 7. Approve personal records | First personal-app operation asks for get/list/put/delete under `xyz.tinycloud.agent-data/` in `default`. Optional SQL-copy access is separate. The chat client may additionally ask to approve a write tool. | Explain why another approval appears and that delete permission is included. Decline stops this workflow; optional copy decline must not block basic records. |
| 8. Finish storage setup | Managed key + Auto-Sign + supported host/chain can provision storage. Current OpenKey source waits for the requested space and continues remaining setup in the background. Deployment not established. | Distinguish pending, ready, failed and manual-setup-required. Read the actual catalog successfully; a green approval screen is insufficient. |
| 9. Establish local time | Hosted tools request the owner's city/IANA timezone before record writes. This extra first-use question is not explained in `/connect`. | Ask once, preserve the answer, and derive dates from hosted context rather than a guessed clock. |
| 10. Deliver first value | Resume the original request. Setup-only instructions create `Try my personal apps`; catalog records precede the todo and the open/done twin prevents recreation. | Report every operation outcome; read the saved record back; no duplicate on retry/reconnect and no surprise claim of success. |
| 11. Return later | Tokens, session and grants have different expiry clocks. ChatGPT requires app selection again on a follow-up needing tools; Claude must have the connector enabled. | Short, working resume/renew/revoke instructions. No unnecessary recreation of account or storage. |

**Target first-time response:** use the known client's route without asking the owner to choose it. For ChatGPT, give four numbered steps in at most 120 words: Plugins link; name, description, exact MCP URL and OAuth; create/OpenKey/install; `@TinyCloud` and the original request or setup-only example. No introduction, images, plan/price caveats, extra sections or closing questions. Handle actual approvals when reached; discuss cost only if asked or an actual purchase gate appears.

## 3. Internal capability and pricing research

These are dated documentation findings, not account-level connection tests or rules for refusing setup. The owner's successful ChatGPT connection contradicts an inferred Free-plan denial. Keep this research out of the initial setup reply; verify actual capabilities in QA and troubleshoot actual UI/tool restrictions when encountered.

| Layer | Established | Required disclosure / unresolved point |
| --- | --- | --- |
| Claude Free | Official custom-connector docs explicitly allow **one custom connector**. No paid-only write restriction is stated. Web/Desktop is the primary custom-setup route; same-account mobile use is supported. | Best documented no-client-subscription route to test first. Existing occupied connector slot and shared usage limits can block it. Do not remove another connector automatically. |
| Claude Pro / Max | Custom connectors supported. Published Pro price is $20 monthly or $200 annually; Max starts at $100 monthly. | Upgrade is not required for the first Free custom connector. Paid plans still have usage limits. |
| Claude Team / Enterprise | Owner adds organization connector; Enterprise can also authorize the relevant library-management role. Members authenticate individually. Organization policy can block writes. | Separate owner/admin setup from member setup; a paid seat does not imply permission to add or write. |
| ChatGPT Free / Go / Plus | The cited help did not establish a full custom-write path. The owner subsequently reported successful connection after a Free-plan warning. | Lack of documentation is not denial. Give setup steps without a plan warning; distinguish connection from verified record writes. Do not infer universal entitlement or recommend an upgrade. |
| ChatGPT Pro | The cited FAQ distinguishes read/fetch from full MCP. Actual account capabilities were not exercised in this audit. | Do not preassign a read-only outcome from the plan label. Try the normal setup route and diagnose only actual UI/tool restrictions. |
| ChatGPT Business | Documentation describes workspace creator/member roles and full MCP on web. Published Standard price: $25/seat/month monthly or $20/seat/month annually, minimum two seats. | Explain admin requirements only when the actual workspace requires them. Pricing research is not a recommendation to buy Business; discuss current checkout terms only if asked or an actual purchase gate appears. |
| ChatGPT Enterprise / Edu | Documentation describes workspace roles and publication/action policies; contract price was not established here. | Use the actual account UI and action results. Direct setup to the browser; do not add speculative plan or mobile warnings to the initial reply. |
| OpenKey | Source supports email/Google signup, automatic managed-key creation and optional passkey enrollment. No purchase or monetary seed-credit gate found in the inspected normal bootstrap path. | No verified public commercial guarantee. Do not claim paid keys, crypto, or a mandatory hardware key are required. |
| TinyCloud hosting | Public `/pricing` says Early Access / request a demo. Billing is sign-in-gated. Shipped UI contains Free Plan and Early Access upgrade paths. Node quota enforcement is real. | **Unknown:** effective new-owner free quota, free credits, whether zero credits affect KV/SQL, credit expiry/reset rules, upgrade price, eligibility and post-cancellation retention. The billing UI's **100 MiB fallback is not an entitlement**. Resolve before launch copy promises “free.” |
| Ongoing usage | Chat-provider message/model/tool allowances apply after installation. Storage quota is a separate gate. | Distinguish provider limits, connector-slot limit, TinyCloud capacity and any actual credit policy. Never automatically upgrade, buy credits or suggest broader permissions as a quota fix. |

Sources: [Claude custom setup](https://claude.com/docs/connectors/custom/add-unlisted), [Claude connector/mobile guide](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities), [Claude pricing](https://claude.com/pricing), [ChatGPT custom MCP](https://help.openai.com/en/articles/12584461), [ChatGPT Business](https://help.openai.com/en/articles/8792828), [ChatGPT app limits](https://help.openai.com/en/articles/11487775), [TinyCloud pricing](https://tinycloud.xyz/pricing). OpenAI help pages required a fresh browser in this audit; direct static requests returned 403.

## 4. Concrete findings to address

1. **LIVE — Human setup information needs staging.** The page says “Sign in with OpenKey”; signup and later tool approvals have additional steps. At 390px width the ChatGPT heading begins about 1,269px down, after coding-agent instructions; no horizontal overflow was observed. Keep initial setup short; explain signup/consent/recovery at the step where it matters, not in an upfront essay.
2. **OWNER REPORT / DOC — Eligibility assumptions caused a false warning.** The owner successfully connected after ChatGPT warned about Free-plan access. Generic FAQ distinctions must not become account-specific denials or preflight questions. Remove the speculative Developer Mode caveat; the Plugins instructions do not require it. Keep `@TinyCloud` explicit for messages needing tools.
3. **SOURCE — New-user provisioning failure can leave no usable owner.** Automatic key creation catches/logs failure; best-effort repair can continue; OAuth owner claims map existing active keys without a nonempty-key gate. **[INFERENCE]** a new account can finish identity login with empty owner DIDs and fail later. Not runtime-reproduced.
4. **SOURCE — First-key repair needs an acceptance case.** Generate-key response omits `keyType`; the delegate page immediately selects it and chooses managed versus external signing by that field. **[INFERENCE]** manual repair may select browser-wallet signing until reloaded. Do not describe normal signup as requiring a wallet.
5. **SOURCE/DOC — Provisioning guidance conflicts.** `/connect` says retry `SPACE_NOT_HOSTED` with backoff for about two minutes. Current hosted source maps it to nonretryable `NODE_ERROR` with `details.reason: space_not_hosted`; hosted rules say ask the user to retry later and **do not wait**. Auto-Sign-off/external-wallet missing spaces will not become ready just by waiting.
6. **SOURCE — OpenKey provisioning has already changed.** Current source hosts the requested space first, waits 10s by default, and retries eligible background failures after 5s/15s/45s. This is more than the old “everything happens in the background” plan. Verify deployment and integrate the existing state contract rather than inventing another bootstrap service.
7. **LIVE — Broken approval links are a dead end.** `https://mcp.tinycloud.xyz/connect` without state renders raw JSON: `{"error":"The approval link is invalid or expired."}`. There is no human recovery instruction or return link. This exercised missing state, not a genuinely elapsed valid grant.
8. **SOURCE/DOC — The setup-only recipe mixes environments.** `/connect` tells chat assistants to use tools, but its copied recipe still refers to CLI skill sections and `date -u`. Hosted instructions prohibit shell use and provide `context.now`; record writes require timezone. Align them without changing the coding-agent route.
9. **SOURCE — Write errors lose recovery detail.** `apps.ts` projects several per-operation failures to only `outcome: appsFailure(error).code`. Rich distinctions such as no-write retry versus unknown outcome, provisioning reason or billing guidance can disappear. **[INFERENCE]** a generic per-op `NODE_ERROR` is insufficient for safe retry decisions.
10. **SOURCE — Tool annotations understate side effects.** `tinycloud_apps_context` persists timezone and `tinycloud_apps_query` refreshes derived data, but both are marked read-only in current source. Correct classification and prove actual client confirmation/eligibility behavior; never relabel a write read-only to evade plan limits.
11. **DOC/SOURCE — Quota recovery copy can mislead.** Error text says “free up space or upgrade”; published storage docs say logical KV deletion does not necessarily reclaim retained blob bytes. Do not encourage destructive deletion as guaranteed immediate relief.
12. **EVIDENCE GAP — Existing onboarding runbook is not a pass.** It states ChatGPT has not been verified and its results table is empty. Public metadata/401, old preseeded-key tests, or a deployed landing page do not establish zero-account success. No supplied evidence proves the advertised universal fresh-user outcome.

## 5. Prioritized todo list

Suggested owners are repository/team roles, not assigned people. **P0 blocks production sign-off for the advertised journey. P1 completes resilience and usability before a broad rollout.** Each item must link observed acceptance evidence; source review alone cannot close it.

### P0 — Release blockers

- [ ] **P0-01 — Verify actual client/account capabilities without plan-based setup gates.** Owner: product + client QA. Run fresh custom creation, OAuth, tool discovery, write and read-back on advertised clients/accounts; record observed read-only or blocked branches separately. **Done when:** `/connect` gives short setup steps first, does not infer restrictions or upgrades from plan names, handles actual missing options/policy errors and Claude's observed connector-slot limit, and has dated real-account results for advertised capabilities. Cases E01–E10.
- [ ] **P0-02 — Prove the actual new-owner entitlement.** Owner: billing/account + OpenKey + node. Use an authorized brand-new owner, no manually provisioned storage/credits. Record effective allowance, whether KV/SQL needs any credits, paid triggers, upgrade/cancellation terms and retention. **Done when:** first save either works under a published free allowance or clearly exposes the true prerequisite before signup; no fallback constant or absence of a checkout is treated as policy. Cases B01–B08.
- [ ] **P0-03 — Gate usable identity and repair keyless accounts.** Owner: OpenKey. Cover fresh email and Google paths, passkey skip, TEE/key-generation failure, best-effort repair and original OAuth continuation. Fix the generated-key type/selection contract if the inferred repair bug reproduces. **Done when:** connection does not advance with unusable owner claims; retry preserves the same owner and returns a usable managed key without a wallet detour or duplicate identity. Cases I01–I13.
- [ ] **P0-04 — Make provisioning state truthful and recoverable.** Owner: OpenKey + node + MCP. Identify whether requested-space-first provisioning is deployed; use its ready/pending/failed fields and existing retries. Distinguish requested-space activation from registry/catalog usability and background seeding. **Done when:** ordinary new signup reaches an authoritative catalog read; transient waits are bounded; permanent failure has a concrete same-owner recovery; Auto-Sign-off/external-wallet missing-space users are not trapped in a wait loop. Cases S01–S10.
- [ ] **P0-05 — Align landing instructions, tool rules and actual error contracts.** Owner: prompts/docs + SDK/MCP. Reconcile `SPACE_NOT_HOSTED` versus `NODE_ERROR/space_not_hosted`, waiting policy, `context.now`, timezone and setup-only default-record rules. Keep local `/apps` behavior separate. Update stale OAuth/developer-mode instructions. **Done when:** a fresh chat reaches first value using only hosted tools, with no shell, skill fetch, conflicting recovery advice or invented approval URL. Cases E09–E10, S02, D01–D05.
- [ ] **P0-06 — Prove OAuth/client interoperability and renewal.** Owner: OpenKey + MCP + client QA. Verify DCR, exact redirect/resource, PKCE S256, scope, owner claims, refresh issuance/rotation, expired/revoked credentials and client metadata caching. Claude now offers published identity/CIMD versus DCR: use and document the mode actually supported. **Done when:** the real clients connect and renew; invalid authority fails closed; recovery does not require user-supplied tokens or API keys. Metadata alone is not a pass. Cases A01–A12.
- [ ] **P0-07 — Explain and enforce all consent layers.** Owner: OpenKey + MCP + product. Separate OAuth identity, account registry, records including deletion, optional SQL copy and client tool confirmation. Correct read-only annotations for mutating tools. Explain duration, owner, data scope and how to revoke; do not require Always allow. **Done when:** narrowing/declining stops unauthorized work and repeated prompts; optional copy remains optional; actual discovered metadata matches side effects. Cases C01–C09.
- [ ] **P0-08 — Preserve safe error and partial-write semantics.** Owner: SDK/MCP. Carry recovery distinctions through per-operation results, not just the outer envelope: no-write retryable, unknown write outcome, storage full, permission failure and partial move. **Done when:** fault-injected first-save/batch/move cases never duplicate records, silently overwrite, hide committed work, or retry an unknown outcome without read-back. Cases D06–D13, F01–F08.
- [ ] **P0-09 — Ship recoverable approval/callback UX.** Owner: MCP + OpenKey. Replace raw browser error dead ends with safe human guidance; retain machine-readable errors as needed. Handle missing/expired/spent links, denial, account mismatch, callback loss and closed tabs. **Done when:** user can return to the correct client, obtain a fresh request only when needed and resume without widening scope, exposing state, or looping after decline. Cases A06–A12, C02–C06, F05.
- [ ] **P0-10 — Verify identity isolation and revocation boundaries.** Owner: security + OpenKey + MCP. Two authorized synthetic owners, multiple keys, multiple clients and concurrent sessions. Test server enforcement, not model refusal. Distinguish sign-out, connector removal, disabling future signing and actual delegation revocation. **Done when:** no cross-owner data/approval binding; revoked access is denied; switching/restoring keys has explicit, correct data consequences; another client's grants are not accidentally invalidated or silently retained contrary to copy. Cases I09–I13, C05–C09, R01–R06.
- [ ] **P0-11 — Define first-value success and prove it from zero state.** Owner: client QA + MCP. Run both “Set up TinyCloud” and a concrete request such as “Save a todo called Test TinyCloud.” Include timezone, catalog creation, original-request resume, default open/done deduplication and authoritative read-back. **Done when:** exact expected record is visible from a later fresh conversation, no unrelated record is changed, and reconnect/retry does not create another default todo. Cases D01–D09, R01.
- [ ] **P0-12 — Verify deploy durability and identify the accepted candidate.** Owner: operations + MCP/OpenKey. Record revisions/digests and relevant configuration. Respect the MCP filesystem store's documented single-replica boundary; preserve tenant state and state secret. Exercise restart during onboarding, rollback and restore with synthetic accounts. **Done when:** existing identities/grants survive supported restarts or receive accurate recovery; no second replica is pointed at the same volume; release evidence identifies the actual candidate. No speculative distributed-state rewrite is required. Cases A10, F06–F08, R07–R09.

### P1 — Before broad rollout

- [ ] **P1-01 — Put the human MCP path first.** Owner: prompts/product. Provide concise client-specific steps, exact URL copy affordance and short return instructions. Explain OpenKey/consent when reached; show costs only if asked or an actual purchase gate appears. Keep machine-readable HTML/Markdown equivalent and retain coding-agent routing. **Done when:** uncoached users reach the right path without CLI internals, speculative plan warnings or a feature-choice questionnaire; keyboard/screen-reader/zoom checks pass. Cases E01–E10, U01–U04.
- [ ] **P1-02 — Finish browser/device and recovery coverage.** Owner: OpenKey + client QA. Real Safari/Chrome/Firefox, Claude Desktop/iOS/Android, supported ChatGPT web, private mode and in-app link handling. Verify email/Google/passkey recovery, popup/cookie restrictions and cross-device return. **Done when:** supported routes complete; unsupported routes explain a working alternative without losing the owner or original request. Cases I01–I13, U01–U06.
- [ ] **P1-03 — Make billing/quota recovery accurate.** Owner: account + node + MCP. Show authenticated effective quota and charges, same-owner billing entry, reads/export while full where supported, and actual reclamation/cancellation behavior. **Done when:** 402/413 and payment failures are actionable, upgrade propagation is verified, no automatic purchase occurs, and logical delete is not sold as guaranteed space reclamation. Cases B01–B10.
- [ ] **P1-04 — Keep optional search and returning use nonblocking.** Owner: MCP + client QA. Test SQL-copy refusal, stale/partial rebuilding and unavailability; token/grant expiry; connector re-enable/re-mention; lost-device and restored-key paths. **Done when:** KV records remain usable when optional copy fails, answers are not silently partial, and return visits do not repeat full onboarding unnecessarily. Cases D11–D15, R01–R09.
- [ ] **P1-05 — Provide privacy, offboarding and support information.** Owner: product/security/support. Explain hosted plaintext processing, client transcript retention, what disconnect/revoke/delete each do, and retained blobs/backups. Expose privacy/support links before signup and a safe support reference on failure. **Done when:** users can revoke, export and request deletion through documented supported paths; no promise of instant physical erasure; support never asks for keys, codes, tokens or raw approval links. Cases C07–C09, B09–B10, R04–R09.
- [ ] **P1-06 — Make onboarding failures diagnosable without collecting records.** Owner: operations/support. Reuse existing safe diagnostics for stage, code, duration and deployment identity; cover auth/key/bootstrap/callback/node/billing outages. **Done when:** support can distinguish provider quota from key failure, pending hosting, denied authority and unknown write outcome; logs/screenshots omit personal values, email addresses, tokens, signed proofs and approval state. Publish escalation ownership and an outage/rollback procedure. Cases F01–F08.

## 6. Edge-case acceptance matrix

Every row is unexecuted unless explicitly identified as LIVE in section 4. Add a run result, evidence reference and candidate/client/account labels to each row during implementation. The required outcome is the acceptance contract, not a claim of current behavior. This is a lifecycle coverage matrix, not a guarantee that arbitrary future clients have no other failure modes.

### Entry, client eligibility and activation

| ID | Scenario | Required outcome |
| --- | --- | --- |
| E01 | No chat-provider account; unsupported country/age/account state | State the provider prerequisite before OpenKey; no account/region-policy bypass or unnecessary TinyCloud creation. |
| E02 | ChatGPT Free/Plus or another plan with custom-server UI available | Give direct setup steps without speculative plan warnings; record connection and write/read-back separately. |
| E02b | Any ChatGPT account with an actual missing option, read-only restriction or policy error | Diagnose the observed blocker; no invented cause, upgrade promise or false setup success. |
| E03 | Claude Free already uses its one custom-connector slot | Explain the slot limit and user-controlled choices; do not remove another connector or delete its data. |
| E04 | Managed workspace member cannot add; connector unpublished; action blocked | Correct owner/admin branch; distinguish installation rights from per-user OAuth and per-tool write rights. |
| E05 | Wrong ChatGPT/Claude workspace or provider account | Show selected workspace/account and switch safely before consent; don't attach the wrong identity. |
| E06 | ChatGPT mobile/native unsupported route; Claude mobile setup unavailable | Use documented web/Desktop setup; preserve the return path; only promise mobile use where supported. |
| E07 | Connector installed but not enabled; ChatGPT follow-up lacks @TinyCloud | Explain activation rather than re-registering/re-authenticating; select the app again for the message needing tools. |
| E08 | Wrong URL, missing `/mcp`, `/sse`, HTTP, old connector metadata, duplicate connector | Precise correction/reconnect instructions; no duplicate storage/identity; 401 challenge recognized as normal pre-auth behavior. |
| E09 | Assistant cannot browse page; fetch blocked/truncated; HTML/Markdown drift | Usable manual setup instructions and honest “not connected”; no fabricated page contents or success. |
| E10 | Client misidentified as coding agent; original request lost; assistant recommends sandbox CLI | Hosted tools only for chat; preserve original request and correct route; no secret pasting. |

### OpenKey signup, keys and identity recovery

| ID | Scenario | Required outcome |
| --- | --- | --- |
| I01 | Fresh email enters sign-in rather than explicit registration | Verify email then clearly confirm creation; return to original OAuth request. |
| I02 | Typo, delayed/spam/missing email; resend; expired/wrong code | Correctable email and clear resend/expiry guidance, no auto-created unintended account, no code sent to chat. |
| I03 | Expired/spent/wrong-email signup confirmation; concurrent signup wins | Handle `INVALID_SIGNUP_TOKEN` / `ACCOUNT_ALREADY_EXISTS`; reuse correct account without duplicate ownership. |
| I04 | OTP/registration rate limit, shared-IP limit, provider outage | Show bounded wait/retry guidance and actual reason; no loops or bypass of abuse controls. |
| I05 | Google denied/closed/blocked popup; wrong Google account; existing email collision | Cancel safely, preserve OAuth context and recover to the intended account without unsafe automatic linking. |
| I06 | New user chooses existing passkey; no authenticator; enrollment cancelled/unsupported | Explain email/Google path and optional passkey skip; do not make hardware/biometrics mandatory. |
| I07 | TEE/DB failure during automatic key creation; account exists but no keys | Recover same-account key provisioning before usable MCP authorization; no empty-owner success. |
| I08 | Generate-first-key repair response lacks key metadata; reload midway; repeated click | Correct managed signing path and stable key/owner; no surprise wallet prompt or accidental extra keys. |
| I09 | More than one key; wrong key selected; archived key; already-linked wallet | Explicit selection/restore; explain separate data ownership; don't create a new key as a substitute for restoring data. |
| I10 | Switch OpenKey account in another tab or in-place during approval | Clear stale key/preview state; reject mismatched owner and show same-owner recovery. |
| I11 | New device/lost passkey but email or Google still accessible | Recover the same account/key; optional replacement passkey; no new empty data identity. |
| I12 | Lost all authenticators plus email/provider access; deleted key; external wallet lost | Honest supported recovery limits and support path; no promise that another key restores old ownership. |
| I13 | New key added/archived after OAuth token issued | Revalidate/renew claims as needed; no stale-owner authority or endless mismatch loop. |

### OAuth, links and callback lifecycle

| ID | Scenario | Required outcome |
| --- | --- | --- |
| A01 | DCR unavailable/rate-limited/rejected; client asks for ID/secret | Show supported OAuth registration mode and actionable failure; don't ask user to invent credentials. |
| A02 | Claude chooses published client identity/CIMD | Either prove compatibility or document tested Register automatically/DCR choice; do not silently choose No sign-in. |
| A03 | Missing/wrong state, PKCE, redirect, resource, scope, issuer, audience or owner claim | Reject safely; recover with a new legitimate flow; no auth downgrade or callback open redirect. |
| A04 | Access token expires while using tools; refresh missing/expired/reused/revoked | Refresh when allowed or reconnect accurately; keep original task/data; respect token response lifetimes. |
| A05 | Clock skew/JWKS rotation/cache; network failure during exchange | Safe expiry/signature behavior and bounded recovery; no treating an invalid token as a new user. |
| A06 | User denies OAuth or storage consent, closes tab or leaves it idle | Explicit cancel/timeout state; no mutation, broadening or automatic repeated consent request. |
| A07 | Missing/malformed/expired/spent approval link; email/link scanner visits it | Human recovery instruction; no leaked state; nonconsenting GET cannot grant access; new link only when needed. |
| A08 | Double-click approve, reload/back, two open links or simultaneous chats | Request-bound single-use behavior; safe “already completed” or renewed-flow handling; no duplicate grants/data. |
| A09 | Approval completed but return-to-chat navigation fails or another device opens it | Explain where to return and how to resume; detect completed state instead of repeating signup. |
| A10 | Approval context expires before outer link; process restart/load balancing loses context | Recover the specific prepared context safely; don't imply all links live equally long. OpenKey's prepared context and MCP link have distinct lifetimes. |
| A11 | Callback CORS/origin/network rejection; partial session/delegation activation | No false green completion; exact safe recovery and original owner maintained. |
| A12 | Forwarded approval link opened by another owner/key or altered host/space | Server-side binding refusal; no cross-account grant and no user data in diagnostic output. |

### Consent and trust

| ID | Scenario | Required outcome |
| --- | --- | --- |
| C01 | Repeated OAuth, registry, records and client-write confirmation feels redundant | Each screen names a distinct purpose, scope, duration, owner and cancellation effect. |
| C02 | Records declined or individual actions unchecked | Stop blocked workflow without writes or repeated requests; never silently widen authority. |
| C03 | Optional SQL-copy declined | Continue basic KV records; no compulsory SQL approval or repeated prompt that conversation. |
| C04 | Client tool blocked / Always allow not selected | Honor client policy; distinguish it from OpenKey grant failure; no pressure to disable safeguards. |
| C05 | Read-looking context/query changes state | Honest metadata and confirmation/plan behavior for timezone and derived-copy writes. |
| C06 | Approval key/owner changes between preview and submit | Reject stale/mismatched request; re-review correct identity and scopes. |
| C07 | Sign out or disable future signing, but old delegations remain | Explicitly explain that this is not grant revocation; provide actual revocation path. |
| C08 | Remove one connector while same owner uses another client | Document and enforce revocation scope; stored records remain unless separately deleted. |
| C09 | Host sees plaintext; model reads malicious catalog/record content; user asks for secrets | Disclose trust boundary; treat records as untrusted data; no unauthorized actions or secret/code requests. Review exposed tool scope against advertised personal-record purpose. |

### Storage bootstrap

| ID | Scenario | Required outcome |
| --- | --- | --- |
| S01 | Brand-new managed key, Auto-Sign on, no spaces/billing history | No manual provisioning or funding shortcut; actual default catalog access proves readiness. |
| S02 | Requested-space setup slower than response or stated wait window | Pending state, bounded safe recheck and correct retry policy; no second/broader sign-in as a fix. |
| S03 | Auto-Sign off and space missing | Explain why waiting cannot fix it and provide supported explicit same-owner setup; don't silently enable Auto-Sign. |
| S04 | External-wallet key, unsupported chain/host or bootstrap disabled | Distinct supported/manual/unsupported branch; preserve owner; no fake automatic-ready claim. |
| S05 | Host HTTP success without requested space in `activated` | Not ready until actual activation and authorized read succeed. |
| S06 | Requested space hosted but account registry/catalog seeding unfinished | Resume remaining setup; no “no records” conclusion from failed discovery and no false complete state. |
| S07 | Peer-ID/host/schema/activation timeout, node unavailable, retry exhaustion | Separate transient from permanent failures; actionable support code after bounded retries. |
| S08 | Multiple onboarding attempts or keys; bootstrap lock/in-progress/stale state | No duplicate setup/identity, no stranded lock, and correct ready state for the requested owner/space. |
| S09 | Quota/account backend fails while hosting or seeding | Don't label every failure as provisioning delay; surface entitlement/outage cause and verify state before retry. |
| S10 | Old/new deployment mismatch, legacy host, restart mid-bootstrap | Correct source/config identity and recoverable state; don't treat public-main fixes as deployed. |

### Billing, storage capacity and exit costs

| ID | Scenario | Required outcome |
| --- | --- | --- |
| B01 | New owner has no billing row, no credits or unknown plan | Resolve actual supported entitlement; don't assume zero credits blocks KV or that UI defaults grant storage. |
| B02 | Free allowance exhausted at first write or shared across spaces/keys | Correct account-wide accounting and price/action explanation; no repeated permission request. |
| B03 | HTTP 402 storage full vs 413 write exceeds remaining capacity/value limit | Distinguish quota from payload limits; no write claimed; narrow payload only when that is actually sufficient. |
| B04 | Provider message/model quota or Claude connector-slot limit | Provider-specific wait/reset/optional upgrade instructions, not TinyCloud billing or reauthentication. |
| B05 | Billing opens with wrong key/account or billing session expired | Authenticate same owner and restore checkout context safely; never pay for a different empty owner by accident. |
| B06 | Checkout cancelled, payment declined, extra bank authentication, unsupported currency/country | No false upgrade, no automatic second charge, clear retry/support and unchanged data. |
| B07 | Payment succeeds but webhook/quota propagation delayed; duplicate submit | Idempotent payment handling and truthful pending entitlement; verify effective quota before replaying write. |
| B08 | Trial/credits expire, reset boundary, downgrade/cancel/payment failure | Published retention/read/write/access policy, warnings and no silent data loss or undisclosed charges. |
| B09 | User deletes records expecting quota relief; optional SQL/history still consumes space | Explain real accounting and reclamation; do not recommend destructive cleanup as guaranteed immediate relief. |
| B10 | User wants export/account deletion while full or unsubscribed | Working documented exit path and precise logical-delete/physical-retention distinction. |

### First record, consistency and optional query

| ID | Scenario | Required outcome |
| --- | --- | --- |
| D01 | Empty default catalog; setup-only request | Create only documented starter catalogs/todo after required approvals; show what was created and deletion option. |
| D02 | Concrete original record request | Save that record, not an unrelated starter todo; preserve requested units/value/date. |
| D03 | Timezone unknown/invalid/ambiguous city, user declines city, UTC/local midnight/DST | Ask for sufficient timezone information, accept explicit timezone, no guessed dates or false saved state. |
| D04 | Hosted chat lacks shell/CLI skill/time command | Use hosted context time and tool contracts; no dependency on `date -u` or fetched CLI skills. |
| D05 | Starter already open or done; setup rerun; two clients start together | No duplicate or resurrection of completed starter; handle conditional-create conflicts. |
| D06 | App created but kind/todo fails; batch partially succeeds | Report exact committed/missing parts; resume only needed operations. |
| D07 | Network timeout after a write may have committed | Read back before retry; no duplicate time-log suffix or second todo. |
| D08 | Stale ETag, `EXISTS`, `CHANGED`, `CATALOG_CHANGE` | Read fresh and reconcile intended change; never blind overwrite or force delete. |
| D09 | Move writes destination but source delete fails | Preserve/report completed steps; safe reconciliation rather than replay of entire batch. |
| D10 | Malformed/missing catalog, unexpected shape/version, missing ETag | Actionable error; don't erase/recreate unrelated data or invent an empty successful result. |
| D11 | Too many records, pagination mismatch, 1 MiB value or result-size limit | Honest bounded result/narrowing; never answer from silently incomplete data. |
| D12 | Optional copy absent/expired/stale; `COPY_PARTIAL` | KV remains truth; separate approval when needed; finish relevant rebuild before aggregate answer. |
| D13 | Copy write/quota failure after KV save, stale-marker failure | Preserve successful save and warn about derived-copy freshness; no duplicate KV write. |
| D14 | Copy unavailable (`NODE_ERROR`, reason `copy_unavailable`) | Use fresh KV; explain once and route node issue, no new database name or consent loop. |
| D15 | Malicious record text/SQL-like values; broad or invalid query | Values remain data/parameters; no unexpected tools, authority or writes; actionable narrowing/errors. |

### Network, operation and deployment failures

| ID | Scenario | Required outcome |
| --- | --- | --- |
| F01 | Offline, DNS/TLS/CDN failure, 429, 5xx at each service | Identify failed stage, safe retry/backoff where appropriate, preserve task and never report complete. |
| F02 | `AUTH_REQUIRED`, `SESSION_NOT_FOUND`, `PERMISSION_DENIED`, expired grant | Correct fresh link/renewal or denied-access message; not a catch-all wider sign-in. |
| F03 | `NODE_BUSY` / pre-write `REQUEST_TIMEOUT` | Retry only when no write began and contract says safe; bounded behavior. |
| F04 | `OUTCOME_UNKNOWN` flattened to `NODE_ERROR` | Preserve unknown-outcome meaning in per-op output; read authoritative state before any replay. |
| F05 | Callback succeeded but client response lost, cancelled tool call or client turn limit | Reconcile saved/connected state, not whole-flow replay or a false failure that duplicates work. |
| F06 | MCP process restart/crash, disk full, lost volume or changed state secret | Tested supported recovery; no silently new tenant; protect delegated credentials and storage ownership. |
| F07 | Burst onboarding, concurrent tool calls, unsupported multi-replica deployment | Respect existing locking/single-replica boundary; no cross-tenant state or duplicate key/grant creation. |
| F08 | OpenKey/node/account outage or incompatible deployment/schema during rollout | Accurate support/outage message and tested rollback/recovery; no credentials or record payloads in logs. |

### Return visits, disconnection and devices

| ID | Scenario | Required outcome |
| --- | --- | --- |
| R01 | New conversation/reinstall, same owner | Retrieve existing record; no repeat starter, new identity or forced full signup. |
| R02 | OAuth, OpenKey session, MCP session and records grant expire at different times | Renew only missing authority; no promise that 30-day delegation means 30-day token/session. |
| R03 | Optional copy grant expires but records grant remains | Basic records continue; separate optional-copy renewal. |
| R04 | Connector removed, grants revoked or app-signing disabled | Distinct truthful outcomes and enforcement; no conflation with data deletion. |
| R05 | Revoke one of multiple clients/keys | Exact documented scope; neither leaked continued access nor accidental unrelated disconnection. |
| R06 | Restore archived key or recover account on another device | Original data remains associated with original key; no data-migration fiction. |
| R07 | Server restart/restore with pending grants | Resume or issue safe replacement; no corrupt/duplicated tenant authority. |
| R08 | Export/delete-account/revoke request, retained history/backups | Supported path and retention statement; no “all copies erased” claim without evidence. |
| R09 | Host/client migration, changed MCP URL/tool set or rolled-back deployment | Explicit reconnect/migration guidance; preserve ownership and verify compatibility. |
| U01 | 390px mobile, 200% zoom, long URL, large text | Usable layout, readable instructions, no inaccessible clipped controls. |
| U02 | Keyboard-only/screen reader, pending/error feedback | Focus, labels, status announcements and action controls usable without pointer/color-only cues. |
| U03 | Safari/private mode/cookies disabled/tracking protection/ad blocker | Supported browser redirect path or specific actionable limitation; no repeated blank page. |
| U04 | JavaScript slow/blocked or hydration fails | Entry instructions readable; auth/billing failure explicit rather than indefinite blank UI. |
| U05 | In-app browser, blocked popup, cross-device passkey/link | Safe external-browser continuation with owner/state intact and clear return destination. |
| U06 | Two tabs/devices, back/refresh, chat/session disappears mid-onboarding | Reconcile completed stages and resume original task when available; no silent consent or duplicated records. |

## 7. Minimum launch proof

1. Run with authorized synthetic accounts: **no OpenKey user, no key, no space, no preseeded credit or grant, no installed connector**. Label the client plan, workspace role, browser/device and deployed candidate.
2. Prove the advertised client/account routes from actual UI and tool outcomes, including ChatGPT Free/Plus where available; record observed unsupported/read-only behavior separately rather than assuming it from the plan name. Use both email signup and Google signup, with optional-passkey skip and enrollment covered.
3. One uncoached walkthrough: short setup steps → connector → new identity/key → OAuth → registry approval → records approval → usable storage → timezone → requested save → authoritative read-back. Record time to first value and stalls without inventing an SLA.
4. Repeat from a new conversation, then update and delete the synthetic record and verify state. Reconnect and confirm the starter does not resurrect after being marked done.
5. Run cancellation, wrong-owner, expiration, slow/permanently failed provisioning, key-generation failure, quota-full, unknown-write-outcome and revocation cases. Confirm protected state remained unchanged where required.
6. Exercise supported Claude mobile use after web/Desktop setup; verify ChatGPT unsupported-mobile guidance. Inspect actual screens, not just HTTP/test output.
7. Keep per-case **passed / failed / blocked / not run**, expected and observed state, safe evidence reference, source/image identity and owner for every remaining issue. No tokens, OTPs, emails, private keys, full signed URLs or personal records in evidence.
8. Close P0 only with those observations. Close relevant P1 before broad promotion. A passing HTTP 401/health check, green build, public landing page, old user with pre-existing storage or this checklist cannot substitute.

## 8. Implementation map and sources

- **prompts/docs:** discovered `prompts-tc-connect-page/setup/connect.md`, `forward-tests-onboarding.md`, public [connect](https://agents.tinycloud.xyz/connect), [hosted MCP reference](https://docs.tinycloud.xyz/cli/mcp), [hosting/state boundary](https://docs.tinycloud.xyz/hosting/mcp). Keep public-directory packaging work in the separate [plugin release plan](tinycloud-chatgpt-plugin-release-plan.md).
- **SDK/MCP:** `packages/mcp/src/http.ts`, `remote-store.ts`, `oauth.ts`, `tools.ts`; `packages/operations/src/operations/apps.ts`, `tc-apps/kv.ts`, `tc-apps/preamble.ts`, `errors.ts`. [Source at audited SDK head](https://github.com/TinyCloudLabs/js-sdk/tree/d80291559407b35b4610fe9861ae25434942c0e9/packages).
- **OpenKey:** `apps/api/src/auth.ts`, `routes/keys.ts`, `routes/delegate.ts`, `services/tinycloud-bootstrap.ts`, `services/tinycloud-bootstrap-budget.ts`, `services/authorization-signing.ts`; web login/register/recover, OAuth consent and delegate routes. [Audited OpenKey source](https://github.com/TinyCloudLabs/openkey/tree/79259f26a6fbccbcea6ad6dd3e3e361f9a1df1c4/apps), [requested-space-first contract](https://github.com/TinyCloudLabs/openkey/blob/79259f26a6fbccbcea6ad6dd3e3e361f9a1df1c4/.changeset/tc-1608-host-requested-space-first.md).
- **Node/account:** [quota implementation](https://github.com/TinyCloudLabs/tinycloud-node/blob/1f430390db7e165dd6b7e7333367354a1c6a4665/tinycloud-node-server/src/quota.rs), [node storage contract](https://github.com/TinyCloudLabs/tinycloud-node/blob/1f430390db7e165dd6b7e7333367354a1c6a4665/README.md#storage-usage-and-full-space-writes), [billing entry](https://account.tinycloud.xyz/billing). Actual billing backend policy was not available in the discovered local/public source; an authorized entitlement/checkout run is the missing prerequisite.
- **Live discovery:** [MCP protected resource](https://mcp.tinycloud.xyz/.well-known/oauth-protected-resource/mcp), [OpenKey authorization server](https://api.openkey.so/.well-known/oauth-authorization-server/api/auth). These establish advertised protocol settings, not a completed OAuth flow.

Recommended execution order: verify actual account capabilities/costs for P0-01/P0-02 in QA and identify deployed revisions; resolve connector, identity, provisioning and contract gaps in their owning repositories; complete authentication/consent/error handling; run P0-11's zero-state proof plus negative cases; finish remaining P1 coverage. This research must not delay direct setup instructions or reintroduce speculative plan gates.
