# Onboarding forward-test runbook

The test proves one thing: **the same prompt, pasted into a fresh conversation in any client, gets the person to the route that client supports, and from there to a first saved record.** It is how we iterate on the onboarding prompts with evidence (TC-1363, step 4 of TC-1278). The routing it grades against is the routing spec in TC-1278.

**Status of this runbook:** the baseline run has not happened. It is out of scope for the pull request that adds this file.
- **Coding-agent rows** (Claude Code, Codex, OpenCode): run by Clarissa (QA) with her test accounts.
- **Chat-app rows** (ChatGPT Free and Plus, Claude Free and Pro): need a person with these accounts. QA has none. Sam or Hunter runs them.

Run the baseline against production before TC-1361 (agent pages readable by chat assistants) and TC-1364 (landing page and prompts) land. Chat apps are expected to fail at page reading until TC-1361 ships; record that, don't fix it here. Post the filled tables as a comment on TC-1278.

## Prompts

Identical in every client, typed or pasted as one message into a new conversation. Don't add words, don't fix typos, don't paste the setup page yourself.

| ID | Prompt | Source |
|---|---|---|
| **O** | `Set up TinyCloud for me and save my first record: https://agents.tinycloud.xyz/start` | Candidate onboarding prompt (F-68). `/start` already routes by client: coding agents to the `/apps` guide, chat apps to the hosted MCP. |
| **S** | `I want to understand how to use https://agents.tinycloud.xyz/apps` | The 16 Oct opener. |
| **T1** | `Log my weight: 80.5 kg today. Set it up with TinyCloud: https://agents.tinycloud.xyz/apps` | "Try:" line on `/`: Personal records. |
| **T2** | `Publish this report and send me a private link. Use TinyCloud: https://agents.tinycloud.xyz/publish` | "Try:" line on `/`: Publish. |
| **T3** | `Turn this script into a voiceover with ElevenLabs. Get the key from TinyCloud: https://agents.tinycloud.xyz/secrets` | "Try:" line on `/`: Secrets. |
| **T4** | `How did my last meeting go? Check TinyCloud: https://agents.tinycloud.xyz/chat` | "Try:" line on `/`: Meetings. |

The `T` lines are the `ABILITIES` prompts in `scripts/build-site.mjs` on `main`, each followed by its page URL, exactly as `/` renders them. If that list changes, update this table before the next run; the runbook tests what `/` shows.

**Fixtures.** T2 and T3 name a report and a script. Attach or paste a synthetic one (a few lines of invented text); never a real document. T4 needs a TinyChat account with at least one meeting; without one, grade only whether the assistant starts the right sign-in and says so honestly.

## Clients

| Client | Accounts | Who runs it | Notes |
|---|---|---|---|
| ChatGPT web | Free, Plus | **Needs a person with these accounts (Sam or Hunter).** | Fresh chat each prompt. Web only: custom MCP is not available in the mobile apps. OpenAI documents custom-server writes for Business, Enterprise and Edu; Free and Plus are unverified, so record exactly what the app offers. |
| Claude web | Free, Pro | **Needs a person with these accounts (Sam or Hunter).** | Fresh chat each prompt. Connectors are added on web or Desktop and then work on mobile. |
| Claude Code | Test account | Clarissa (QA) | Coding-agent preconditions below. |
| Codex | Test account | Clarissa (QA) | Coding-agent preconditions below. |
| OpenCode | Test account | Clarissa (QA) | Coding-agent preconditions below. |

## Preconditions: chat apps

- A fresh conversation per prompt, with no memory, custom instructions, projects, files or connectors that mention TinyCloud. Disconnect any TinyCloud connector from an earlier run first.
- Use a throwaway or test OpenKey sign-in. If a connector is added, remove it after the run.
- Record the app version or plan shown in settings, the date, and whether web browsing or search was on.
- Never paste keys, tokens, delegations or approval codes into the chat. A code or link shown by the product stays in the product.

## Preconditions: coding agents

Reused from [`forward-tests-tc-apps.md`](forward-tests-tc-apps.md); that runbook is the source if the two differ.

- **Setup link:** `https://agents.tinycloud.xyz/start` for **O**, and the URL inside each prompt for the others. The site deploys from `main`. Before merge, use the pull request's Cloudflare Pages preview instead (`https://<hash>.tinycloud-agents.pages.dev/...`).
- **A stock home per client, `$H`.** A new folder holding a copy of `/etc/skel`, or a logged-in stock home from an earlier test. Give it a new, empty project folder with `git init`, so no project-level skill from an earlier test is in reach. The skill folder in the home (`~/.claude/skills` or `~/.agents/skills`) must not hold a TinyCloud skill yet. The coordinator's own `~/.tinycloud` is never touched.
- **`TC_HOME`:** one fresh scratch directory per client sequence, exported, never `~/.tinycloud`. Create `$TC_HOME/.tinycloud` with mode 700 before the first launch. Don't set `TC_BIN`, `TC_APPS_STATE` or any other operator variable: the point is the stock path.
- **`PATH`:** the system folders plus a folder of links to the three clients. The only `tc` on it is Linux's `/usr/sbin/tc`. The page calls the CLI `tinycloud`.
- **Logins:** log each client in once in the new home before the test. Codex: `codex login --device-auth`. Claude Code: its first-run screens, with `DISABLE_AUTOUPDATER=1`. OpenCode's free `opencode/big-pickle` model needs no login.
- **New conversations:** Claude Code `/clear`, Codex `/new`, OpenCode `/new`, or restart the client. OpenCode loads skills at start, so restart it after the install, as the page tells the agent to say.
- **Global `tc`:** run `tc --version` from a plain shell before and after; it must not change.
- **Rate limit:** OpenKey allows 5 device sign-in starts per 10 minutes per network, shared by every sequence on the machine. Log start times and don't loop. A run through prompt **O** or **T1** needs one start per fresh `TC_HOME`.
- **Test account:** the tester approves each OpenKey request on a throwaway account the tester controls, never a personal one. Records go to that account's `default` space under `xyz.tinycloud.agent-data/`.
- **Launch** each client in tmux from its project folder through a clean shell:

  ```sh
  env -i HOME="$H" USER="$USER" LOGNAME="$USER" SHELL=/bin/bash LANG=C.UTF-8 TERM=xterm-256color PATH="$STOCK_PATH" TC_HOME="$TC_HOME" bash -i
  ```

  Then run the client's command from the table in `forward-tests-tc-apps.md` (Claude Code `claude`; Codex with `workspace-write`, network access and the `--add-dir` entries; OpenCode `opencode -m opencode/big-pickle`, never `--yolo`).

## How to run

1. For each client row, start a fresh conversation, paste one prompt, and let the assistant run. Do the OpenKey approval yourself when it shows a link; that is expected.
2. Don't coach. If the assistant stops and asks a question the page should have answered, answer minimally ("continue") and note that it needed help.
3. Next prompt: new conversation. Coding agents: new conversation in the same home for **S**, **T2**, **T3** and **T4** (the skill is already installed); **O** and **T1** start from a fresh `$H` and `TC_HOME` each time, because installation is what they test.
4. Fill one row per client and prompt in the tables below. Keep notes to what happened, quoting at most one short line of assistant text. No codes, links with codes, tokens, emails or names.

## Pass criteria

From TC-1363 and the routing spec in TC-1278. A row passes only if every line for its client holds.

**Every client**
- The assistant reads the page named in the prompt (or says plainly that it could not, and what it did instead) and takes **that client's route** from the routing spec.
- It never asks for keys, tokens, delegations or codes in the conversation.
- It states unsupported routes honestly rather than guessing.

**Chat apps (ChatGPT, Claude)** — route: hosted MCP
- Names `https://mcp.tinycloud.xyz/mcp` (with `/mcp`) and **OAuth** (sign in with OpenKey).
- Gives that app's own steps: ChatGPT, Plugins → Add custom MCP server, on web; Claude, Connectors → Add custom connector.
- For ChatGPT Free and Plus, says plainly that custom-server access depends on plan and is unverified, instead of promising it.
- **Never asks the person to run shell commands**, install a CLI, or use a code sandbox.
- If TinyCloud is already connected (a later step, after the person adds it), the first saved record exists and the assistant shows the real OpenKey approval link for the connect step. That second half is graded only where the connector can be added.
- Until TC-1361 ships, a chat app that cannot read the page fails the first line; record that as **fail: page not read**.

**Coding agents (Claude Code, Codex, OpenCode)** — route: CLI + skill
- Completes the install from the page: `SKILL_INSTALLED <skill> <version> <folder>` where `<version>` matches the site's `/skills/index.json`.
- Shows the OpenKey link and code for the person to approve, in its own output.
- Completes the request itself:
  - **O, S, T1:** a record (weight 80.5 kg for T1, a first record for O) is saved and read back. For **S**, the assistant explains the route and offers to log a first record, rather than silently installing.
  - **T2:** a private (owner-only) link is delivered, not a public one.
  - **T3:** the voiceover is made with the key used without it appearing in the conversation; or, with no key stored, the assistant sends a link to add it.
  - **T4:** the meeting is answered, or the TinyChat sign-in is started and explained honestly.
- Client notes honoured: Codex asks for a sandbox escalation for the install; OpenCode says to restart.
- The global `tc` is unchanged, and no `~/.tinycloud` is touched.

**Automatic fail, any client**
- A secret, token, delegation, or code appears anywhere in the transcript outside the product's own approval step.
- A chat app tells the person to run commands, or says the MCP is "local stdio only" after reading a page that names the hosted URL.
- A coding agent runs the hosted route, or a public publish for T2, without being asked.

## Results

Fill in, then post as one comment on TC-1278. One table per client; one row per prompt. Result is `Pass`, `Fail` or `Not run`; Route is what the assistant actually took (`hosted MCP`, `CLI + skill`, `none`, `other: ...`).

Header for every table: date, runner, app or client version, model or plan. Leave blank until run.

### ChatGPT web, Free

Date: | Runner: | Version/plan: | Browsing on: |

| Prompt | Page read | Route | Names MCP URL and OAuth | App steps right | Ran shell commands | Result | Notes |
|---|---|---|---|---|---|---|---|
| O | | | | | | | |
| S | | | | | | | |
| T1 | | | | | | | |
| T2 | | | | | | | |
| T3 | | | | | | | |
| T4 | | | | | | | |

### ChatGPT web, Plus

Date: | Runner: | Version/plan: | Browsing on: |

| Prompt | Page read | Route | Names MCP URL and OAuth | App steps right | Ran shell commands | Result | Notes |
|---|---|---|---|---|---|---|---|
| O | | | | | | | |
| S | | | | | | | |
| T1 | | | | | | | |
| T2 | | | | | | | |
| T3 | | | | | | | |
| T4 | | | | | | | |

### Claude web, Free

Date: | Runner: | Version/plan: | Web search on: |

| Prompt | Page read | Route | Names MCP URL and OAuth | App steps right | Ran shell commands | Result | Notes |
|---|---|---|---|---|---|---|---|
| O | | | | | | | |
| S | | | | | | | |
| T1 | | | | | | | |
| T2 | | | | | | | |
| T3 | | | | | | | |
| T4 | | | | | | | |

### Claude web, Pro

Date: | Runner: | Version/plan: | Web search on: |

| Prompt | Page read | Route | Names MCP URL and OAuth | App steps right | Ran shell commands | Result | Notes |
|---|---|---|---|---|---|---|---|
| O | | | | | | | |
| S | | | | | | | |
| T1 | | | | | | | |
| T2 | | | | | | | |
| T3 | | | | | | | |
| T4 | | | | | | | |

### Claude Code

Date: | Runner: | Client version: | Model: | CLI version installed: | OpenKey starts used:

| Prompt | Page read | Route | Install line printed | Approval shown | Request completed | Result | Notes |
|---|---|---|---|---|---|---|---|
| O | | | | | | | |
| S | | | | | | | |
| T1 | | | | | | | |
| T2 | | | | | | | |
| T3 | | | | | | | |
| T4 | | | | | | | |

### Codex

Date: | Runner: | Client version: | Model: | CLI version installed: | OpenKey starts used:

| Prompt | Page read | Route | Install line printed | Approval shown | Request completed | Result | Notes |
|---|---|---|---|---|---|---|---|
| O | | | | | | | |
| S | | | | | | | |
| T1 | | | | | | | |
| T2 | | | | | | | |
| T3 | | | | | | | |
| T4 | | | | | | | |

### OpenCode

Date: | Runner: | Client version: | Model: | CLI version installed: | OpenKey starts used:

| Prompt | Page read | Route | Install line printed | Approval shown | Request completed | Result | Notes |
|---|---|---|---|---|---|---|---|
| O | | | | | | | |
| S | | | | | | | |
| T1 | | | | | | | |
| T2 | | | | | | | |
| T3 | | | | | | | |
| T4 | | | | | | | |

## Cleanup

Remove any TinyCloud connector or plugin added in a chat app. For coding agents, run the undo steps on the page for each skill installed, log out the throwaway profile, and delete the scratch `$H` and `$TC_HOME`. The records saved to the test account's space are test data and stay unless the account owner asks otherwise.
