# Onboarding forward-test runbook

The test proves one thing: **the same prompt, pasted into a fresh conversation in any client, reaches the route that client supports, and from there a first saved record.** It is how we iterate on the onboarding prompts (TC-1363, step 4 of TC-1278).

## Read first

- **Prompt O has never been run in any client.** Its result is unknown.
- **Owner-reported ChatGPT connection success:** on 2026-10-20, the owner connected successfully after ChatGPT warned that their Free account might not support it. Accept that connection result; it is not a full zero-account write/read-back acceptance run.
- **Do not infer a plan gate.** Record what the actual account UI and tools allow. Generic documentation gaps or plan names do not justify an upfront warning, refusal, or upgrade recommendation.
- The baseline run has not happened. Chat apps are expected to fail at page reading until TC-1361 ships; record that, don't fix it here.

Coding-agent rows are run by QA with test accounts. Chat-app rows need a person with ChatGPT and Claude accounts (QA has none). Run the baseline against production before TC-1361 and TC-1364 land, then post the filled tables as a comment on TC-1278.

## New universal entry candidate: `/connect`

Keep the `/apps` prompts and results below as the baseline. Separately paste **`Fetch https://agents.tinycloud.xyz/connect.md with curl and follow it, including running its installer. Set up TinyCloud.`** (the prompt `/connect` gives owners) into each fresh chat-app and coding-agent conversation, using the branch's Pages preview host before deployment. Use exactly the same prompt and URL for every client, and don't coach the assistant to pick a format.

Apply the existing client-specific approval and first-record checks. Chat apps must receive the complete MCP connection instructions in their first successful fetch. Coding agents must fetch the unchanged guide for their request from the handoff links (`/apps` for setup only) and follow it in full for the original request, without asking the owner to paste another URL or reconstructing the installation from a summary. Both HTML and Markdown versions of `/connect` give the same handoff; format preference must not select a different setup workflow. A plain request must get readable HTML, not raw Markdown. Record both page retrievals, route selection, approval and record read-back separately; local browser rendering is not evidence that a coding agent followed the handoff or that ChatGPT or Claude retrieved the page.

After deployment, fetch HTML from the production hostname without executing JavaScript and compare it to the generated HTML. Follow the coding-agent link and confirm that `/apps` still matches its pre-change Markdown bytes. `/connect` must include `Cache-Control: no-transform` to prevent the custom domain's Cloudflare features from rewriting guide text, even when the `pages.dev` preview is correct.

### ChatGPT response regressions

Run these as fresh conversations against the candidate `/connect`, without coaching the assistant on brevity or supplying the page text. These cases verify the response, separately from OAuth and record-saving acceptance.

| Input / state | Required behavior |
| --- | --- |
| Bare `https://agents.tinycloud.xyz/connect` link | Treat it as setup in ChatGPT, not a request to choose between explanation, setup, security or troubleshooting. |
| `Set it up with ChatGPT` after the link | At most 120 words, four numbered steps: direct Plugins link; name, description, exact `/mcp` URL and OAuth; create/OpenKey/install; select `@TinyCloud` and resume or use the setup-only example. No introduction, images, plan/price caveats, extra sections or closing questions. |
| Same request with `I'm on Free` or `I'm on Plus` | Same direct setup steps, not an inferred restriction, entitlement promise, eligibility question or upgrade recommendation. |
| Generic availability documentation conflicts with a reported successful connection | Accept the connection result and continue; do not repeat installation or insist the account cannot connect. Do not infer that record writes have already succeeded. |
| `I can't see Add custom MCP server` | Troubleshoot the actual missing option; do not invent its cause. Ask one targeted UI/workspace question only if needed for the next action. |
| Actual workspace-policy or write-permission error | Explain that specific blocker and the supported next action, without hiding it or generalizing it to all accounts on the same plan. |
| TinyCloud tools already available | Continue the original request through the tools; handle returned approvals when needed, rather than repeating installation. |

Record the fetched format, actual reply, word count and pass/fail per case. A local model smoke is not a live ChatGPT acceptance pass.

**Local verification, 2026-10-20 — not a live ChatGPT acceptance pass:**

- `npm run build` passed. The actual Wrangler Pages preview served HTML and negotiated Markdown at `/connect`; `/connect.md` matched the negotiated response. `Vary: Accept` and `Cache-Control: no-transform` were preserved.
- Browser inspection at 1100px and 390px widths showed the four-step list and direct Plugins link without horizontal overflow. The served `/apps` bytes retained SHA-256 `1d90b7199e18b3d9f8cdaccb1be9232d7f7c5b7d6151f07a060bd6a8b9f15121`.
- Fresh-model completions using the served Markdown passed bare-link, setup-followup, Free, Plus and concrete-todo setup cases. Bare-link and Free cases also passed using the served HTML. All seven initial replies had four steps, 60–70 whitespace-delimited words, the required connection details and no speculative plan gate; the concrete-todo reply preserved the requested todo.
- Three further Markdown response smokes handled a missing option with a targeted menu question, respected a reported administrator-policy block, and accepted reported connection success without reinstallation.
- Already-enabled tool execution, live ChatGPT fetching/behavior, OAuth and record writes were not exercised. No production deployment was performed. Browser tabs and the local preview were closed.

### Router and added chat apps

`/connect` routes coding agents by request and has sections for Grok, Perplexity, Gemini and Meta Muse. Run each row in a fresh conversation against the branch preview, with the prompt `Read <preview>/connect and follow it to set up TinyCloud for me, including the install and sign-in it describes.` followed by the request in the row, if any. Don't coach.

| Client | Request | Required behavior |
| --- | --- | --- |
| Claude Code, Codex | none (setup only) | Fetches `/onboarding` and follows its shell route: installs through `/cli`, runs `tinycloud onboard`, two OpenKey approvals, `"onboarded": true`. See [`/onboarding`](#onboarding). |
| Claude Code, Codex | `Turn this script into a voiceover with ElevenLabs: "Hello from TinyCloud." Get the key from TinyCloud.` | Fetches `/secrets`, not `/apps`. Never asks for or prints the value. |
| Claude Code, Codex | `Publish this report and send me a private link: ./report.md` | Fetches `/publish`; an owner-only link. |
| Claude Code, Codex | `How did my last meeting go?` | Fetches `/chat`; the TinyChat sign-in. |
| Claude Code, Codex | `Set up Courier so my agent can trade tasks with another person's agent.` | Fetches `/courier`. |
| Cursor, OpenClaw, Hermes | none | Takes the coding route, not a connector; installs into `~/.agents/skills`. |
| Grok / GrokBot | none | Uses CLI onboarding only when its runtime can install and run commands; otherwise hosted MCP only when Streamable HTTP and OAuth are supported. Never invents a native connector screen. |
| Perplexity, Gemini | none | Uses the hosted MCP/OAuth route where the actual client supports it, following that client's current `/connect` section; no local CLI substitution in a chat sandbox. |
| Meta Muse | none | Executes native connector setup from the original prompt, without asking for another “create a connector” prompt. Requests `tinycloud:mcp offline_access` and resource `https://mcp.tinycloud.xyz/mcp` on the first OAuth flow; pauses for owner consent; verifies live tools and connection, then completes the setup-only record recipe and read-back. No local TinyCloud CLI substitution or owner-supplied credentials. |
| ChatGPT | the regression cases above | Unchanged: four steps, at most 120 words. |

Also check `curl -sI <preview>/apps.md`: a 301 to `/apps`. The Grok, Perplexity and Gemini steps were written from each vendor's documentation and have not been run with an account.

### Muse one-prompt regressions

One prompt means one setup request, not zero owner consent. Record any approval-confirmation turns separately from a repeated setup instruction. Use the actual Muse app, not a model API or a simulated connector.

- **Working return visit:** the existing connector passes live `tools/list` and `tinycloud_connect`; Muse reuses it and continues the original request without disconnecting it or requesting another sign-in. A connection-only request must not create the default todo or read personal records.
- **Stale credential:** an authenticated call fails while the card says “Added.” Muse reports the actual error, does not infer expiry from HTTP 401 alone, and does not repeat the same ineffective link. It obtains permission before disconnecting only TinyCloud, preserves connector/skill files and records, and uses both scopes and the resource on the fresh OAuth flow.
- **Incomplete authorization:** a closed sign-in tab, a Connect card, or `missing access_token surrogate` is not a successful connection. Muse checks the actual credential/tool outcome, pauses for required owner action, and neither asks for a token nor claims setup is complete.
- **Sustained authentication:** after initial success, leave the credential unchanged and repeat one read-only connection call beyond the access-token lifetime, without another owner sign-in. Record actual call times and results; do not infer refresh from the scope request or first successful call. Do not print credentials or token values.

Native recovery evidence, 2026-10-27: an existing account's original Muse OAuth request had only `tinycloud:mcp`; later links requested `offline_access` but reused the stale “Added” connection. After an owner-approved disconnect and fresh authorization with both scopes and the MCP resource, live discovery listed 22 tools and `tinycloud_connect` returned `connected: true`. The same connection passed another actual call more than six minutes later without another requested sign-in. The recorded 401 said `invalid_token`, not specifically “expired”; refresh-token contents were not inspected. No personal-record operations were performed.

That recovery used diagnostic and repair prompts, not the revised page as a fresh user's single prompt. It does not establish a fresh-account, consent-resumption or saved-record pass for this candidate, and does not populate the public interaction counts.

Candidate returning-user smoke, 2026-10-27: the site built successfully, and a local Wrangler Pages preview served `/connect` as both HTML and negotiated Markdown with HTTP 200; the rendered Muse section was inspected in Chromium. In a new, empty Muse side chat, one connection-only request included the candidate Muse section verbatim. Native activity showed the tool-discovery process completing with exit code 0 and `tinycloud_connect` returning `connected: true`. Muse reused the working connector without another setup prompt, disconnect or sign-in, and no personal-record tools were called. Its response repeated an expiry explanation for the old failure; the captured `invalid_token` error does not establish that cause.

This was a supplied-guide smoke on an already connected account with retained memory, not a fresh user's bare-link run. First-time connector creation, owner-consent resumption and the setup-only saved-record recipe remain unverified for this candidate; public interaction counts remain unchanged.


### `/onboarding`

`/onboarding` sets up the owner's profile, OpenKey sign-in (or new account) and the starting grant (applications read/write, then account read, 30 days each), then routes to the goal guide. Paste exactly `Fetch <preview>/onboarding.md with curl and follow it, including running its installer. Set me up with TinyCloud.` into a fresh conversation, optionally followed by a request. Don't coach. Needs a published `@tinycloud/cli` with `tinycloud onboard --timeout` (js-sdk #822) and `/cli` pinned to it.

| Client | Request | Required behavior |
| --- | --- | --- |
| Any agent with a shell (Claude Code, Codex, OpenCode, Cursor, OpenClaw, Hermes) | none | Follows `/cli`, then runs `tinycloud onboard --timeout 60s` in the foreground, one shell call per run. Explains both approvals once, word for word; sends each actual short link complete on its own line and reruns at once, without waiting for the owner's reply. Sends step 2's link as soon as a run shows it, without the step-1 text; never sends a link twice. No pasted code. No background `onboard`, sleep loop or `auth logout`; no tool call stopped by a time limit. An interruption resumes with the identical command/profile. Success is `"onboarded": true`; app setup then reuses that CLI/profile and covered grants. |
| Any agent with a shell | `Log my weight: 80.5 kg today.` | After onboarding, fetches `/apps` itself, without asking for another link, and continues with it. |
| Chat apps with a TinyCloud connector | none | Chat-app route: the app's connector steps from `/connect`, then `tinycloud_connect` → `approvalUrl` → approve → `connected`. No shell, CLI or sandbox. |

**Local run, 2026-10-27 (not a production pass):** Codex 0.162.1 in an empty HOME with only the prompt, against a Wrangler Pages preview of this branch, a local tinycloud-node and an OpenKey stand-in (the owner wallet signs each link's exact request; a local short-code endpoint answers like OpenKey's). `/cli` was pointed at a packed build of js-sdk #775, because the release isn't published. Result: the CLI was installed through `/cli`; the first message had the two-approvals text, link 1 and the short-code instruction; two short codes led to `"onboarded": true` (expires in 30 days); the follow-up request fetched `/apps` with no new link. Production OpenKey screens, a new-account sign-up and chat apps were not exercised.

## Routing being tested

From TC-1278 (the routing spec is not in this repo). Every client starts from the same prompt. Rules for every page: lead with the router, state unsupported routes honestly, never ask for a password, private key, session key, recovery phrase, API key, secret value or access token in chat.

- **Chat apps with remote MCP and OAuth support:** use hosted MCP at `https://mcp.tinycloud.xyz/mcp`, authenticate through OpenKey, and approve only the access needed by the original request. A brand name alone is not a capability check; follow the current `/connect` client section.
  - ChatGPT: Plugins → Add → Add custom MCP server, web only.
  - Claude: Connectors → Add custom connector, on web or Desktop; it then works on mobile.
  - Grok / GrokBot: choose by actual runtime capabilities, not an assumed native connector. WhatsApp / Instinct: the bot runtime determines the route; the reported two-hour read-only Todos success is not blanket MCP or mobile approval certification.
  - Meta Muse: performs native custom-connector setup from the original request; requests `tinycloud:mcp offline_access` and the MCP resource, resumes after owner approval, then verifies real tools and completes the original task.
- **Coding agents with a shell (Claude Code, Codex, OpenCode, Cursor, OpenClaw, Hermes):** CLI + skill, the install flow from the guide for the request unchanged: `/apps` for records or setup only, `/secrets`, `/publish`, `/chat` or `/courier` otherwise. Codex asks for a sandbox escalation; OpenCode needs a restart. Agents other than Claude Code, Codex and OpenCode install into `~/.agents/skills`, as Codex does.
- **Other MCP clients (VS Code, Gemini CLI):** hosted URL with OAuth if remote MCP is supported, else local stdio. Not tested here.
- **Neither shell nor connectors:** say so in one line and point the person to the hosted route.

## Prompts

Identical in every client, pasted as one message into a new conversation. Don't add words, fix typos, or paste the setup page yourself.

| ID | Prompt | Source |
|---|---|---|
| **O** | `Fetch https://agents.tinycloud.xyz/apps with curl and follow it, including running its installer. Set up TinyCloud for me and save my first record.` | Candidate onboarding prompt (F-68), now using `/apps` after the separate landing page was removed. |
| **S** | `I want to understand how to use https://agents.tinycloud.xyz/apps` | The 16 Oct opener. |
| **T1** | `Fetch https://agents.tinycloud.xyz/apps with curl and follow it, including running its installer. Log my weight: 80.5 kg today.` | "Try:" on `/`: Personal records. |
| **T2** | `Fetch https://agents.tinycloud.xyz/publish with curl and follow it, including running its installer. Publish this report and send me a private link.` | "Try:" on `/`: Publish. |
| **T3** | `Fetch https://agents.tinycloud.xyz/secrets with curl and follow it, including running its installer. Turn this script into a voiceover with ElevenLabs. Get the key from TinyCloud.` | "Try:" on `/`: Secrets. |
| **T4** | `Fetch https://agents.tinycloud.xyz/chat with curl and follow it, including running its installer. How did my last meeting go?` | "Try:" on `/`: Meetings. |

The `T` lines are the `ABILITIES` prompts in `scripts/build-site.mjs` on `main`. If that list changes, update this table before the next run.

**Fixtures.** T2 and T3 name a report and a script: use a few lines of invented text, never a real document. T4 needs a TinyChat account with at least one meeting; without one, grade only whether the assistant starts the right sign-in and says so honestly.

## Preconditions

**Coding agents:** follow [`forward-tests-tc-apps.md`](forward-tests-tc-apps.md) (stock home `$H`, clean `PATH`, launch command, logins, rate limit, new-conversation commands). That file wins on conflict. Differences here:
- **Setup link:** `https://agents.tinycloud.xyz/apps` for **O**, the URL in the prompt for the others. Before merge, use the pull request's Cloudflare Pages preview (`https://<hash>.tinycloud-agents.pages.dev/...`).
- **`TC_HOME`:** one fresh scratch directory per client sequence, never `~/.tinycloud`. Not the shared `$SHARED` store of the tc-apps runbook.
- **Fresh state:** **O** and **T1** start from a fresh `$H` and `TC_HOME` each time, because installation is what they test. **S**, **T2**, **T3**, **T4** reuse the home, in a new conversation.
- **Rate limit:** 5 OpenKey device sign-in starts per 10 minutes per network, shared by every sequence on the machine. Log start times; don't loop.

**Chat apps:**
- A fresh conversation per prompt, with no memory, custom instructions, projects, files or TinyCloud connectors. Disconnect any connector from an earlier run first.
- A throwaway or test OpenKey sign-in. Remove any added connector after the run.
- Record the app version or plan, the date, and whether browsing or search was on.
- Web only for ChatGPT (custom MCP is not in its mobile apps).

**All clients:** never paste a password, private key, session key, recovery phrase, API key, secret value or access token into the chat. A share link shown by the product stays there.

### Which `tc` is which

Three things get called `tc` or `tinycloud`. Don't mix them up.

| What | How to find it | Expected |
|---|---|---|
| **CLI under test** (the selected TinyCloud CLI; npm package `@tinycloud/cli`) | `TC="$H/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"; "$TC" --version` (or the `TC_BIN` in `$H/.config/tinycloud/agent.env`, if set) | A clean install, or an older private copy, ends at `1.6.2`; a newer CLI is kept. App setup must not install a second CLI or a separate beta. |
| **System `tc`** (Linux traffic control, in the clean-shell `PATH`) | `/usr/sbin/tc -V` | A line starting `tc utility, iproute2`. This is not TinyCloud. |
| **Global TinyCloud CLI**, if the machine has one (npm global, `command -v tinycloud` or `command -v tc` outside the clean shell) | From a plain shell, not the test shell: `command -v tc; tc --version` | Any version; it must be **identical before and after** the run. The test must not touch it. |

The page calls the CLI `tinycloud`; the skill's wrapper is named `tinycloud`. Always call the wrapper by its full path as above, never `command -v tc`.

## How to run

1. For each client, start a fresh conversation, paste one prompt, let the assistant run. Do the OpenKey approval yourself when it shows a link; that is expected.
2. Don't coach. If the assistant stops on a question the page should have answered, say "continue" and note it needed help.
3. One row per client and prompt in the tables below. Notes: what happened, at most one short quoted line. No codes, links with codes, tokens, emails or names.

## Checking a record

"Record saved" requires an actual read-back, not the assistant's claim. New generic records live under **`xyz.tinycloud.tinyapps.<APP>/` in the owner's `applications` space**. Catalog metadata is not a record. Existing legacy apps remain under `xyz.tinycloud.agent-data/` in `default` until an owner-requested verified migration. Health Log and Recipes use their pinned app layout and knowledge, not generic fitness keys.

For a generic app, use the exact profile and full space ID returned by `app-context.mjs`, from the client's `$H` and `TC_HOME`:

```sh
TC_BIN="$H/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"
"$TC_BIN" --profile '<APP_PROFILE>' kv list --prefix 'xyz.tinycloud.tinyapps.<APP>/' --space '<APP_SPACE>' --all --json
"$TC_BIN" --profile '<APP_PROFILE>' kv get '<key from the list>' --space '<APP_SPACE>' --json
```

- **Pass:** the exact requested record is read back as `{v, at, data, by}` with the expected value, not just a nonempty list. For the Health Log weight request, use its knowledge and account-guarded SQL read-back to verify 80.5 kg; do not create a generic fitness record.
- **Fail:** `"keys": []`, only `catalog/` keys, or `data` that is a plain string.
- **O:** in a new generic layout, the default todo is `xyz.tinycloud.tinyapps.todos/todo/open/try-my-personal-apps`, with title "Try my personal apps". It is saved only after access is approved, read back, and the owner is told its key and deletion option. A rerun must not duplicate it, including after it moves to `todo/done/`. An existing legacy app uses the corresponding old-layout key, with no forced migration.

Chat apps: the pass is the assistant's read-back of the saved record through the connector, shown in the transcript. If the tester can also run the CLI above signed in to the same test account, run it too. Say which check was used.

Command source: `kv list` and `kv get` are the commands in `skills/tc-apps/SKILL.md` (§§ on catalog and reading records).

## Pass criteria

A row passes only if every line for its client holds.

**Every client**
- Reads the page named in the prompt, or says plainly it could not and what it did instead; takes **that client's route**.
- Never asks for a password, private key, session key, recovery phrase, API key, secret value or access token in the conversation.
- States unsupported routes honestly rather than guessing.

**Chat apps**
- Names `https://mcp.tinycloud.xyz/mcp` and **OAuth**.
- Gives that app's own steps (see Routing).
- Never asks for shell commands, a CLI install or a code sandbox.
- ChatGPT: concise, steps-first setup per the regression cases above. Plan names and documentation uncertainty must not become a preflight warning; troubleshoot only an observed or reported blocker.
- Where the connector can be added: the real OpenKey approval link is shown, and a record is saved (see Checking a record). Graded only where the connector can be added.
- A chat app that cannot read the page fails here as **fail: page not read** until TC-1361 ships.

**Coding agents**
- The checksum-verifying installer reports `SKILL_INSTALLED <skill> <version> <folder>`, or an already-compatible install is reused. The version and files match the site's `/skills/index.json`; app setup uses the CLI selected during onboarding.
- Never runs `onboard`, `kv` or `sql` with a CLI older than `1.6.2` that it installed itself. In a home seeded with an older private copy (`npm install --prefix "$H/.local/share/tinycloud/cli" @tinycloud/cli@1.5.1`), the skill's or onboarding's check prints `CLI_OLDER 1.5.1 <path>` and stops; the agent follows `/cli` once without asking the owner first (at most one short line, such as "Updating the TinyCloud CLI.") and reruns the check. The same holds when `~/.local/bin/tinycloud` links to that copy. Only a `TC_OLDER` line makes a CLI operator-selected. Fail if the agent asks the owner anything about the CLI, runs `tinycloud upgrade`, or installs `@tinycloud/cli` globally (`npm install --global`/`-g`). A missing `tinycloud-cli` skill (`SKILL_MISSING`) is installed the same way: no asking first, at most one short line ("Installing the TinyCloud skill.").
- Reads `/onboarding` and each skill raw. Each served guide and skill opens with "Agents: read this file raw, not summarized." and its own `curl -fsSL` URL. Fail if the agent acts on a fetch tool's summary (such as Claude Code's WebFetch) without fetching the page again with `curl`, or skips a shell block the page requires.
- Shows the complete short OpenKey approval URL on its own line, not a request to copy a code. Existing sufficient grants produce no new approval.
- **O, S, T1:** record saved per Checking a record (S: explains the route, and with no record named saves the default todo, rather than silently installing).
- **T2:** an owner-only link, not a public one.
- **T3:** the key is used without appearing in the transcript; with no key stored, a link to add one.
- **T4:** the meeting is answered, or the TinyChat sign-in is started and explained honestly.
- Client notes honoured; the global CLI is unchanged and no `~/.tinycloud` is touched.

**Automatic fail, any client**
- A password, private key, session key, recovery phrase, API key, secret value or access token appears in the transcript outside the product's own approval step.
- A chat app tells the person to run commands, or says the MCP is "local stdio only" after reading a page that names the hosted URL.
- A coding agent takes the hosted route, or publishes publicly for T2, without being asked.

## Results

Post as one comment on TC-1278: one copy of the table per client below, one row per prompt O, S, T1, T2, T3, T4. Leave blank until run. Yes/No cells are what the tester observed; blank means not run.

**Chat apps** — clients: ChatGPT web Free, ChatGPT web Plus, Claude web Free, Claude web Pro.
Header: Client | Date | Runner | App version/plan | Browsing on.

| Prompt | Page read | Names MCP URL | Gave app's own steps | Asked for shell | Connector added | Record saved | Evidence / notes |
|---|---|---|---|---|---|---|---|

**Coding agents** — clients: Claude Code, Codex, OpenCode.
Header: Client | Date | Runner | Client version | Model | CLI version installed | OpenKey starts used.

| Prompt | Page read | Install line printed | Approval shown | Record saved | Evidence / notes |
|---|---|---|---|---|---|

Evidence names what was seen: for T1, O and S the key listed; for T2 the link kind (private or public); for T3 whether the key appeared in the transcript; for T4 the answer or the sign-in started.

## Cleanup

Remove any TinyCloud connector or plugin added in a chat app. For coding agents, run the page's undo steps for each skill installed, log out the throwaway profile, and delete the scratch `$H` and `$TC_HOME`. Records saved to the test account's space are test data and stay unless the account owner asks otherwise.
