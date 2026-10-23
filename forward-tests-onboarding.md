# Onboarding forward-test runbook

The test proves one thing: **the same prompt, pasted into a fresh conversation in any client, reaches the route that client supports, and from there a first saved record.** It is how we iterate on the onboarding prompts (TC-1363, step 4 of TC-1278).

## Read first

- **Prompt O has never been run in any client.** Its result is unknown.
- **Owner-reported ChatGPT connection success:** on 2026-10-20, the owner connected successfully after ChatGPT warned that their Free account might not support it. Accept that connection result; it is not a full zero-account write/read-back acceptance run.
- **Do not infer a plan gate.** Record what the actual account UI and tools allow. Generic documentation gaps or plan names do not justify an upfront warning, refusal, or upgrade recommendation.
- The baseline run has not happened. Chat apps are expected to fail at page reading until TC-1361 ships; record that, don't fix it here.

Coding-agent rows are run by QA with test accounts. Chat-app rows need a person with ChatGPT and Claude accounts (QA has none). Run the baseline against production before TC-1361 and TC-1364 land, then post the filled tables as a comment on TC-1278.

## New universal entry candidate: `/connect`

Keep the `/apps` prompts and results below as the baseline. Separately paste **`Set up TinyCloud using https://agents.tinycloud.xyz/connect`** into each fresh chat-app and coding-agent conversation, using the branch's Pages preview host before deployment. Use exactly the same prompt and URL for every client; do not supply a `.md` suffix or coach the assistant to pick a format.

Apply the existing client-specific approval and first-record checks. Chat apps must receive the complete MCP connection instructions in their first successful fetch. Coding agents must fetch the unchanged `/apps` guide from the handoff link and follow it in full for the original request, without asking the owner to paste another URL or reconstructing the installation from a summary. Both HTML and Markdown versions of `/connect` give the same handoff; format preference must not select a different setup workflow. A plain request must get readable HTML, not raw Markdown. Record both page retrievals, route selection, approval and record read-back separately; local browser rendering is not evidence that a coding agent followed the handoff or that ChatGPT or Claude retrieved the page.

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

## Routing being tested

From TC-1278 (the routing spec is not in this repo). Every client starts from the same prompt. Rules for every page: lead with the router, state unsupported routes honestly, never ask for keys, tokens, delegations or codes in chat.

- **Chat apps (ChatGPT web, Claude web, Desktop, mobile):** hosted MCP. Add `https://mcp.tinycloud.xyz/mcp` (with `/mcp`), authentication **OAuth** (OpenKey), sign in, approve the `tinycloud_connect` link and any per-resource links.
  - ChatGPT: Plugins → Add → Add custom MCP server, web only.
  - Claude: Connectors → Add custom connector, on web or Desktop; it then works on mobile.
- **Coding agents with a shell (Claude Code, Codex, OpenCode):** CLI + skill, the install flow from `/apps` unchanged. Codex asks for a sandbox escalation; OpenCode needs a restart.
- **Other MCP clients (Cursor, VS Code, Gemini CLI):** hosted URL with OAuth if remote MCP is supported, else local stdio. Not tested here.
- **Neither shell nor connectors:** say so in one line and point the person to the hosted route.

## Prompts

Identical in every client, pasted as one message into a new conversation. Don't add words, fix typos, or paste the setup page yourself.

| ID | Prompt | Source |
|---|---|---|
| **O** | `Never run npm install -g, npm i -g, sudo, or curl piped to a shell. Read https://agents.tinycloud.xyz/apps in full and follow it: fetch it with curl -fsSL https://agents.tinycloud.xyz/apps and read the whole output; do not run any other command, including npm or node checks or an install, before you have read it. Set up TinyCloud for me and save my first record. Set it up with TinyCloud, which saves a sign-in (a key and session in ~/.tinycloud). If an app of yours handles this, it asks you to approve 7-day access to just that app. Otherwise it asks for 30-day access to your records.` | Candidate onboarding prompt (F-68), now using `/apps` after the separate landing page was removed. The read-first sentence names the source and the sign-in sentence names what is saved: the owner's consent for Claude Code's auto mode (TC-1607). |
| **S** | `I want to understand how to use https://agents.tinycloud.xyz/apps` | The 16 Oct opener. |
| **T1** | `Never run npm install -g, npm i -g, sudo, or curl piped to a shell. Read https://agents.tinycloud.xyz/apps in full and follow it: fetch it with curl -fsSL https://agents.tinycloud.xyz/apps and read the whole output; do not run any other command, including npm or node checks or an install, before you have read it. Log my weight: 80.5 kg today. Set it up with TinyCloud, which saves a sign-in (a key and session in ~/.tinycloud). If an app of yours handles this, it asks you to approve 7-day access to just that app. Otherwise it asks for 30-day access to your records.` | "Try:" on `/`: Personal records. |
| **T2** | `Publish this report and send me a private link. Use TinyCloud: https://agents.tinycloud.xyz/publish` | "Try:" on `/`: Publish. |
| **T3** | `Turn this script into a voiceover with ElevenLabs. Get the key from TinyCloud: https://agents.tinycloud.xyz/secrets` | "Try:" on `/`: Secrets. |
| **T4** | `How did my last meeting go? Check TinyCloud: https://agents.tinycloud.xyz/chat` | "Try:" on `/`: Meetings. |

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

**All clients:** never paste keys, tokens, delegations or approval codes into the chat. A code or link shown by the product stays there.

### Which `tc` is which

Three things get called `tc` or `tinycloud`. Don't mix them up.

| What | How to find it | Expected |
|---|---|---|
| **CLI under test** (the TinyCloud CLI the skill installs; npm package `@tinycloud/cli`) | `"$H/.local/share/tc-apps/tc" --version` | The version in the table's "CLI version installed" cell, currently `1.3.4` (the version `/apps` installs). |
| **System `tc`** (Linux traffic control, in the clean-shell `PATH`) | `/usr/sbin/tc -V` | A line starting `tc utility, iproute2`. This is not TinyCloud. |
| **Global TinyCloud CLI**, if the machine has one (npm global, `command -v tinycloud` or `command -v tc` outside the clean shell) | From a plain shell, not the test shell: `command -v tc; tc --version` | Any version; it must be **identical before and after** the run. The test must not touch it. |

The page calls the CLI `tinycloud`; the skill's wrapper is named `tc`. Always call the wrapper by its full path as above, never `command -v tc`.

## How to run

1. For each client, start a fresh conversation, paste one prompt, let the assistant run. Do the OpenKey approval yourself when it shows a link; that is expected.
2. Don't coach. If the assistant stops on a question the page should have answered, say "continue" and note it needed help.
3. One row per client and prompt in the tables below. Notes: what happened, at most one short quoted line. No codes, links with codes, tokens, emails or names.

## Checking a record

"Record saved" is true only if the tester sees the record, not only the assistant's claim. Records land under **`xyz.tinycloud.agent-data/` in the account's `default` space**. Catalog entries (`xyz.tinycloud.agent-data/catalog/...`) are not records.

Coding agents, from the client's `$H` and `TC_HOME`:

```sh
TC_BIN="$H/.local/share/tc-apps/tc"
"$TC_BIN" kv list --prefix xyz.tinycloud.agent-data/ --space default --json --profile agent-data
"$TC_BIN" kv get '<key from the list>' --space default --json --profile agent-data
```

- **Pass:** the list prints `"keys"` with at least one key outside `catalog/`, and `"count"` of 1 or more; `kv get` prints a JSON object with `v`, `at`, `data`, `by`. For T1, the key is `xyz.tinycloud.agent-data/fitness/weight/<YYYY-MM>/<date>` and `data` holds 80.5 kg.
- **Fail:** `"keys": []`, only `catalog/` keys, or `data` that is a plain string.
- **O:** the record is the default todo: key `xyz.tinycloud.agent-data/todos/todo/open/try-my-personal-apps`, `data` holds the title "Try my personal apps". The assistant must also have read it back, saved it only after sign-in was approved, told the owner the key and how to delete it, and must not have asked what to save. A re-run in the same account must not create a second record, including after the todo is marked done (open key gone, `todos/todo/done/try-my-personal-apps` present).

Chat apps: the pass is the assistant's read-back of the saved record through the connector, shown in the transcript. If the tester can also run the CLI above signed in to the same test account, run it too. Say which check was used.

Command source: `kv list` and `kv get` are the commands in `skills/tc-apps/SKILL.md` (§§ on catalog and reading records).

## Pass criteria

A row passes only if every line for its client holds.

**Every client**
- Reads the page named in the prompt, or says plainly it could not and what it did instead; takes **that client's route**.
- Never asks for keys, tokens, delegations or codes in the conversation.
- States unsupported routes honestly rather than guessing.

**Chat apps**
- Names `https://mcp.tinycloud.xyz/mcp` and **OAuth**.
- Gives that app's own steps (see Routing).
- Never asks for shell commands, a CLI install or a code sandbox.
- ChatGPT: concise, steps-first setup per the regression cases above. Plan names and documentation uncertainty must not become a preflight warning; troubleshoot only an observed or reported blocker.
- Where the connector can be added: the real OpenKey approval link is shown, and a record is saved (see Checking a record). Graded only where the connector can be added.
- A chat app that cannot read the page fails here as **fail: page not read** until TC-1361 ships.

**Coding agents**
- **O, S, T1 (the `/apps` setup):** §2 step 4 prints `OK` for the four skill files and step 7 prints the CLI version. **T2, T3, T4:** the installer prints `SKILL_INSTALLED <skill> <version> <folder>`. In both cases the version matches the site's `/skills/index.json`.
- Shows the OpenKey link and code in its own output.
- **O, S, T1:** record saved per Checking a record (S: explains the route, and with no record named saves the default todo, rather than silently installing).
- **T2:** an owner-only link, not a public one.
- **T3:** the key is used without appearing in the transcript; with no key stored, a link to add one.
- **T4:** the meeting is answered, or the TinyChat sign-in is started and explained honestly.
- Client notes honoured; the global CLI is unchanged and no `~/.tinycloud` is touched.

**Automatic fail, any client**
- A secret, token, delegation or code appears in the transcript outside the product's own approval step.
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
