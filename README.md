# TinyCloud agent guides and skills

This repository is the source of `https://agents.tinycloud.xyz`: the setup guides an owner pastes into any AI agent, and every TinyCloud agent skill those guides install. It separates reusable tool prerequisites from app-owned setup without moving runtime code or deployment ownership.

## Public URLs

The site's URLs are short and flat. The repository layout below is only for authoring; `scripts/build-site.mjs` maps it to these URLs.

| URL | What it is | Source |
| --- | --- | --- |
| `/setup` | The entry point: every ability, what to paste, what the owner approves, how to undo it | [`setup/README.md`](setup/README.md) |
| `/apps` | Personal records (`tc-apps`): one-prompt setup | [`setup/tc-apps.md`](setup/tc-apps.md) |
| `/feed` | Creating a post in TinyCloud Home (`tinycloud-feed`) | [`skills/tinycloud-feed/creating-a-post.md`](skills/tinycloud-feed/creating-a-post.md) |
| `/connect` | One link for any agent: CLI-capable agents go to `/onboarding`, remote MCP clients (for example ChatGPT, Claude, Grok, Grok Bot, Perplexity, Gemini, Meta Muse) get connector steps and what we have tested with each. HTML by default, Markdown when requested | [`setup/connect.md`](setup/connect.md); after [`/onboarding`](setup/onboarding.md), agents follow the guide for their request: [`/apps`](setup/tc-apps.md), [`/secrets`](setup/secrets.md), [`/publish`](setup/publish.md), [`/chat`](apps/tinychat/setup.md) or [`/courier`](setup/courier.md) |
| `/connect/<client>` | Client-specific HTML/Markdown guides for `chatgpt`, `claude`, `cursor`, `gemini`, `grok`, `muse`, `perplexity`, `openclaw`, `hermes` and `cli`; each has a real `.md` alternate | [`setup/connect/`](setup/connect/) |
| `/chat` | TinyChat meetings (`tinychat-retrieval`): one-prompt setup | [`apps/tinychat/setup.md`](apps/tinychat/setup.md) |
| `/publish` | Publish and share (`tc-publish`): owner setup | [`setup/publish.md`](setup/publish.md) |
| `/share` | Share an artifact (`tc-publish`): a link anyone with it can open, made only after the owner says yes; set an expiry, revoke | [`setup/share.md`](setup/share.md) |
| `/secrets` | TinyCloud Secrets (`tc-secrets`): owner setup | [`setup/secrets.md`](setup/secrets.md) |
| `/courier` | Agent-to-agent threads (`courier`): owner setup | [`setup/courier.md`](setup/courier.md) |
| `/cli` | Building block: the TinyCloud CLI, its `tinycloud` command and its `tinycloud-cli` skill | [`setup/tinycloud.md`](setup/tinycloud.md) |
| `/openkey` | Building block: the standalone OpenKey CLI, installed into its own folder, `~/.local/share/tinycloud/openkey` | [`setup/openkey.md`](setup/openkey.md) |
| `/skills/<skill>.md` | A skill's `SKILL.md` to read, for `apps`, `feed`, `chat`, `publish`, `secrets`, `courier`, `cli` and `mcp`; its relative links point into `/skills/<skill>/` | see [Skills](#skills) |
| `/skills/<skill>/<file>` | The skill's files exactly as installed, `SKILL.md` included | |
| `/skills/<skill>/SHA256SUMS` | The sha256 of each of the skill's files, in `sha256sum -c` format, the same values as `index.json`; the `/apps` setup checks its downloads against it | generated |
| `/skills/index.json` | Every skill's name, short name, version, description, source, changed files, and files with sha256 checksums | generated |
| `/skills/install.js` | The installer the guides run | [`scripts/install-skill.js`](scripts/install-skill.js) |

The context app in `/apps` lets agents save and reuse the owner's low-sensitivity facts, preferences, decisions and handoffs.

The earlier URLs, the repository paths such as `/setup/tc-apps.md`, `/apps/tinychat/setup.md` and `/skills/tc-apps/SKILL.md`, redirect to these, and so does each page's URL with a trailing slash (`/apps/` → `/apps`) and each Markdown guide's URL with `.md` added (`/apps.md` → `/apps`), which agents often try first. The site also generates `/` (for people), `/llms.txt`, `/llms-full.txt`, the sitemap and `/.well-known/agent-skills/index.json`. This README isn't published; `/README.md` redirects to `/setup`.

Guides link to each other and to skill files by relative repository path; the build rewrites those links to the public URLs. The build then fails if any link in a served Markdown file, relative or to this site, doesn't reach a file the site serves.

### One-link personal-record setup

Share `Fetch https://agents.tinycloud.xyz/connect.md with curl and follow it, including running its installer. Set up TinyCloud.` in any agent. Agents that support remote MCP but can't run the CLI receive the hosted MCP URL, OAuth and client-specific connection steps: ChatGPT, Claude, Grok, Grok Bot, Perplexity, Gemini and Meta Muse each have a section, based on that vendor's own instructions, and a dated table says what we have actually seen work with each; update it whenever a live run adds evidence, and never mark an app tested from vendor documentation alone. Agents that can install and run the CLI (for example Claude Code, Codex, OpenCode, Cursor, OpenClaw or Hermes) are sent to `/onboarding`, which signs the owner in once and routes to the guide for the original request: personal records → `/apps`, API keys → `/secrets`, publishing or sharing → `/publish`, TinyChat meetings → `/chat`, Courier → `/courier`, anything else → `/setup`. An agent that isn't Claude Code, Codex or OpenCode takes Codex's choice where a guide has one per client, so its skills go in `~/.agents/skills`. The original `/apps` source, output and Markdown response remain unchanged.

In ChatGPT, a bare `/connect` link means setup, not a request for a feature menu. The initial reply is only four numbered steps, at most 120 words: direct Plugins link, connection fields and OAuth, OpenKey sign-in/install, then `@TinyCloud`. No introduction, images, speculative plan/price warnings or closing questionnaire. Troubleshoot only reported or observed blockers; a plan label or generic documentation gap is not evidence that an account cannot connect. Once tools are available, continue the original request rather than repeating installation.

Muse is instructed to execute native custom-connector setup from the original request, without a second “create a connector” prompt. The first OAuth sign-in requests `tinycloud:mcp offline_access` and resource `https://mcp.tinycloud.xyz/mcp`; both remain in the saved configuration. The owner still signs in and approves access. Muse resumes the same task, verifies live `tools/list` and `tinycloud_connect` results, and continues through the hosted personal-record tools. It reuses working connections; resetting a stale connection requires an observed authentication failure and owner approval, not deleting files or records. One setup request does not mean zero consent interactions or proof of token refresh. Native verification evidence and untested paths are recorded in `forward-tests-onboarding.md`.

The build generates `connect.html` and `connect.md` from the same entry-page text. That text carries its own setup-only record recipe for chat apps; it does not embed, reword or relink the coding-agent installation guides. Each guide it routes to remains the sole authority for its workflow. Marked renders the HTML at build time with heading IDs, without JavaScript. The additional coding-agent fetch is intentional: preserve the tested guide rather than maintain a modified copy. This preserves instructions, not a guarantee of identical model decisions.

`functions/connect.js` returns HTML for ordinary requests, including `Accept: */*`. An explicit, nonzero `text/markdown` preference at least as high as HTML returns Markdown at the **same `/connect` URL**, with `Vary: Accept`. It respects HTML wildcard preferences and never infers the client from User-Agent. `/connect.md` is also available as a machine-readable alternate; owners do not need to choose it.

`functions/connect/<client>.js` applies the same negotiation to each of the ten client guides. Their source pages expand `connect-hosted` or `connect-cli` and `connect-feedback` from `standard/blocks.md`: hosted tools and runtime limits, task-specific skill discovery, and consent-first sanitized feedback. The root setup-only recipe follows the connected tools' live rules and schemas; CLI layout detection and migration are not hosted-tool instructions. They distinguish custom configuration from an official listing or a prompt link. No authenticated client success is inferred from source documentation, generated routes or a preview.

### Staged connector cutover wording (not served)

This README is excluded from the generated site. The following approved wording is staged for the future connector update only; do not include it in setup pages until that update is deployed through its separately authorized release. The current connector still supports older-layout personal apps and the dedicated legacy-record move. Version changes and API removals belong in the connector's own release notes, not in current setup guidance.

**Future owner warning:**

After the next update to the hosted TinyCloud connector, its personal-app tools stop showing or changing apps saved in the older layout (in your `default` space under `xyz.tinycloud.agent-data/`). Those records aren't moved or deleted. If you create an app with the same name, it's a new, separate app, and the CLI uses the new one from then on. To keep using the older records, follow the CLI Apps guide before you create a replacement; the connector can't move them.

**Future agent-facing storage-settings note:**

Setup checks the account's storage settings. If the account has only an older (version 1) storage record, setup stops with `unsupported-format`: report that error; don't reconnect, switch servers or ask for broader access. An account with no storage settings uses normal new-account setup on the default or configured server. Published storage settings decide which server each space uses.

The response also appends `Cache-Control: no-transform`, preserving the existing cache lifetime. Cloudflare email obfuscation can mistake `package@version` for an email address and rewrite guide text for readers that do not run JavaScript. This applies to negotiated HTML guides, including `/connect/<client>`; neither `/apps` nor zone-wide settings are changed. Verify production HTML bytes after publication, not just the `pages.dev` preview.

## Skills

Every TinyCloud agent skill is published here, so what the site serves is what the guides install:

| Skill | Short name | Source of truth |
| --- | --- | --- |
| `tc-apps` | `apps` | [`skills/tc-apps`](skills/tc-apps), in this repository |
| `tinycloud-feed` | `feed` | [`skills/tinycloud-feed`](skills/tinycloud-feed), in this repository |
| `tc-publish` | `publish` | [`skills/tc-publish`](skills/tc-publish), in this repository |
| `tc-secrets` | `secrets` | [`skills/tc-secrets`](skills/tc-secrets), in this repository |
| `tinycloud-cli` | `cli` | `skills/tinycloud-cli` in the pinned npm package [`@tinycloud/cli@1.6.2`](https://www.npmjs.com/package/@tinycloud/cli/v/1.6.2) (js-sdk), with the overlays below |
| `courier` | `courier` | `skills/courier` in [`@tinycloud/courier@0.5.2`](https://www.npmjs.com/package/@tinycloud/courier/v/0.5.2) (js-sdk), with changes (below) |
| `tinychat-retrieval` | `chat` | TinyChat's released pack [`0.1.1-onboarding.25`](https://tinycloud.chat/agents/tinychat-retrieval/0.1.1-onboarding.25/tinychat-retrieval-0.1.1-onboarding.25.tgz), unchanged |
| `tinycloud-delegated-secrets` | `mcp` | `skills/tinycloud-delegated-secrets` in [`@tinycloud/mcp@0.9.0`](https://www.npmjs.com/package/@tinycloud/mcp/v/0.9.0) (js-sdk), with the onboarding-profile overlay below |

Skills written for these guides live in `skills/`. Skills owned by another repository stay authored there: the build downloads the exact release tarball named in `SKILLS` in `scripts/build-site.mjs` and refuses it unless its sha512 matches the pinned `integrity`, so every build, locally or on Cloudflare Pages, serves the same files. Nothing floats on a branch.

The owner-facing pages call the CLI `tinycloud`: on Linux, `/usr/sbin/tc` is the system's traffic-control tool. [`/cli`](setup/tinycloud.md) uses the shared [`/install-cli.mjs`](scripts/install-cli.mjs) installer. The pin is the only CLI floor: it installs the pin into its private prefix once, upgrades an older private copy there, and otherwise reuses a CLI at or above the pin (never downgrading); it selects the private `tinycloud` executable, creates launchers without replacing another command, and can repair the Windows **user** PATH without copying the machine PATH into it. An operator `TC_BIN` older than the pin is kept with a `TC_OLDER` notice (a process or saved `TC_BIN` inside the private prefix is the agent's own copy and is upgraded), and each guide says whether it then stops; an explicit missing or broken `TC_BIN` stops setup instead of being replaced. Where /agent's data-only helper is installed, the installer saves its own selection in `~/.config/tinycloud/agent.env`, the one saved CLI location.

The installer resolves its entry point through filesystem links, including macOS temporary-directory aliases and Windows junctions; launching a downloaded script through such a path must execute it, not silently return success.

Skills use the selected `TC_BIN`, then `agent.env`, then the shared private install, not an app-specific npm install or a second saved path. `tc-apps` uses official `status` and `context` metadata plus an actual storage read to reuse existing permissions. Expired grants, other owners/hosts and incomplete reads cannot satisfy access. A known app's two-hour read-only delegation needs no catalog-wide grant and cannot become write access. `npm test` covers grant selection, first-record handling, migration, safe launchers and PATH preservation. Native Windows CI additionally installs the pinned released CLI in a path containing spaces, executes both launchers in PowerShell and cmd, checks offline reuse and user-PATH preservation, and verifies that machine PATH is unchanged. This does not replace physical-device WhatsApp approval QA.

Each block that selects the CLI and prints its version (`tc-apps`, `tc-secrets` and `tc-publish` §1, the feed check, and `/onboarding`'s step 2) compares it with the pin in POSIX `awk` before any other CLI call. A CLI the agent installed that is older than the pin prints `CLI_OLDER <version> <path>` and stops, so the agent follows `/cli` once and reruns the block; an operator `TC_BIN` (a process or saved path that doesn't resolve, through links, into the private install) prints `TC_OLDER`, and `tc-apps`, the feed and onboarding stop while secrets and publishing continue to their feature probes. Markdown is served unchanged, so each block spells out the pin; the build fails unless it matches `CLI_VERSION` in `scripts/install-cli.mjs`. `node --test scripts/cli-pin.test.mjs` runs each block against stand-in CLIs, including A2's home (a private 1.5.1 linked from `~/.local/bin`). Each surface's bold **CLI rule** tells the agent to run that block first, that only a `TC_OLDER` line means an operator chose the CLI, that upgrading the CLI is part of the owner's request (don't ask first; at most one short line, "Updating the TinyCloud CLI."), and never to run `tinycloud upgrade` or a global npm install of the TinyCloud CLI; `/cli` says the same.

Every owner prompt on the site (each guide's "Paste into…" line, `/onboarding`'s and `/connect`'s quoted prompt, the front-page cards and `llms.txt`, generated by `ownerPrompt()` in the build, and `prompt.txt`) reads `Fetch <guide URL> with curl and follow it, including running its installer.` followed by the task. Claude Code's auto mode ran our downloaded installer every time the owner's own prompt asked for it, and sometimes refused it when the agent decided to run it on its own. If a client still blocks it, `/cli` has the agent send one line naming the package, its version and the folder. On the owner's "Go ahead: install the TinyCloud CLI", the agent downloads the installer again and runs `node install-cli.mjs --needs-install`, which applies the installer's own rules without changing anything (`keptCli()`): exit 1 means a CLI it keeps is already there (a private copy at the pin or newer, or an operator's), so nothing is installed and nothing is downgraded; exit 2 (`TC_INSTALL_FAILED`) means the private folder holds an unrelated command or package, so it stops. Only on exit 0 does the agent run `npm install --prefix ~/.local/share/tinycloud/cli --save-exact @tinycloud/cli@<pin>` (the installer's own install: same prefix and `package.json`, exact version, never global). Then it reruns the downloaded installer so `TC_SELECTED` and the `agent.env` save stay its job. That line and its commands write `{{CLI_VERSION}}`, which the build fills in from `CLI_VERSION`; any `@tinycloud/cli 1.2.3` or `@tinycloud/cli@1.2.3` spelled out in a guide or skill must match it too. `node --test scripts/preview-build.test.mjs` checks each served prompt, the blocked line, a stale pin failing the build, and the fallback commands with a stand-in npm in temporary homes: a fresh one, one with a newer private copy and one whose private folder holds another package.

The front page's first card, "Set up TinyCloud", and `llms.txt`'s first ability and `/onboarding` entry carry `/onboarding`'s own prompt, which fetches `/onboarding.md`: `Fetch https://agents.tinycloud.xyz/onboarding.md with curl and follow it, including running its installer. Set me up with TinyCloud.` An entry in `ABILITIES` names the URL to fetch in `fetch` when its Markdown lives elsewhere than its page.

`/owner` redirects (301) to `/onboarding`; its undo section is `/onboarding#undo`.

Fetch tools such as Claude Code's WebFetch can hand the agent a summary that keeps a page's first lines and drops its shell blocks. So every served Markdown guide and skill opens with one line, above its title (a skill: right after its front matter): "Agents: read this file raw, not summarized", with `curl -fsSL` and the page's own Markdown URL (`/onboarding.md` and `/connect.md` for the html pages, `/skills/<short>.md` for a skill). The guides and this repository's skills spell it out; released skills get it at build time; previews point it at the preview; the build fails without it. The rendered HTML of `/onboarding` and `/connect`, which owners see, leaves it out.

The six hosted-client guides (`chatgpt`, `claude`, `gemini`, `grok`, `perplexity`, `muse`) instead open with "Agents: read this page in full, not summarized" and a raw-page URL: those runtimes need no shell. Their page entries set `browserFetch`; the build validates that banner and removes it from owner-facing HTML. The four CLI-route guides retain the curl banner.

Exit codes and owner lines are written once in `standard/blocks.md`, in the `<!-- std:errors -->` block. Guides and skills use `{{std:errors}}` on its own line; the build expands it with the other standard blocks and lists changed skill files in `/skills/index.json`. The block has one CLI approval-error table, three standard owner lines plus the approved decline question, and command-specific exceptions (including legacy `--paste` sign-ins, data commands, `secrets wait`, Courier, TinyChat and helper scripts). `node --test scripts/standard-c.test.mjs` checks the built surfaces, exit rules, code lifetime, Courier `[no-space]` cases and owner wording.

The app resolver sends a computer with no profile that has an owner or a session to `/onboarding` first (`onboard-first`, still carrying the app-scoped sign-in details for an agent that cannot onboard), normalizes EVM address casing, and derives an imported delegate's owner from official full-space metadata when no owner key is present. It verifies access with the selected profile; a two-hour app-only reader does not need global discovery or owner credentials.

Every skill whose `SKILLS` entry has `checkCli` must use its approved CLI resolver. The build rejects unsafe CLI lookups and bare system `tc` invocations in checked skills. The skills written here (`tc-publish`, `tc-secrets`) resolve `TC_BIN` in each block's preamble, preferring the `tinycloud` executable.

Released-skill overlays are listed as `changes` in `SKILLS` and `changed` in `/skills/index.json`. The `tinycloud-cli` overlay resolves the selected executable in shell examples and uses short, automatically retrieved approvals for missing grants; explicit `--paste` remains manual. Catalog installation additionally needs `tinycloud.sql/schema`, which onboarding's ordinary SQL read/write grant does not include: request only that missing installation access, not duplicate basic grants. Courier's `SKILL.md` and `start.md` carry the Courier guide's two-choice invitation flow, its invitation viewer and its setup section, and its Markdown files use the shared CLI resolver. The MCP skill reuses onboarding's profile; publishing keeps its own `publisher` profile because shares live in `default`. `tinychat-retrieval` remains unchanged: its released scripts resolve `TC_BIN`, the shared private install, then `tinycloud` on PATH, never the system `tc`; with none of them they fail with `CLI_UNAVAILABLE`.

A skill's version is its `SKILL.md`'s `metadata.version`, or, for a package skill without one, the package version. Only the current version of each skill is published.

To install a skill without a guide:

```sh
mkdir -p "$HOME/.local/share/tinycloud" && curl -fsSL -o "$HOME/.local/share/tinycloud/install.js" https://agents.tinycloud.xyz/skills/install.js
node "$HOME/.local/share/tinycloud/install.js" <short name> --agent <claude-code|codex|opencode>
```

The installer checks every file against `/skills/index.json` before writing anything, then swaps in the skill's folder: `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/<name>` for Claude Code, `~/.agents/skills/<name>` for Codex and OpenCode. It refuses a skill name that isn't one plain folder name, any file path that could leave the folder, and any redirect, so every byte comes from the site it was served from. Installs of one skill take turns through a lock folder, `.<name>.lock`, broken only when its process has exited or it is older than any install takes. The old folder stays until the new one is in place and goes back if that fails; a later install restores it if the earlier one exited in between. Its tests: `node --test scripts/install-skill.test.mjs`.

**Updating a package skill:** change its `tarball`, `integrity` (npm: `npm view <package>@<version> dist.integrity`; otherwise `sha512-` and the base64 SHA-512 of the file) and `version` in `SKILLS`, and update the guides that name that version. **Updating a skill in `skills/`:** bump its `metadata.version`.

## Pins

| Component | Pin | Owner/source |
| --- | --- | --- |
| TinyCloud CLI and `tinycloud-cli` skill | `@tinycloud/cli@1.6.2` | [npm package](https://www.npmjs.com/package/@tinycloud/cli/v/1.6.2) |
| `courier` skill | `@tinycloud/courier@0.5.2` | [npm package](https://www.npmjs.com/package/@tinycloud/courier/v/0.5.2) |
| `mcp` skill | `@tinycloud/mcp@0.9.0` | [npm package](https://www.npmjs.com/package/@tinycloud/mcp/v/0.9.0) |
| TinyChat retrieval pack | `0.1.1-onboarding.25` | [TinyChat release](https://tinycloud.chat/agents/tinychat-retrieval/0.1.1-onboarding.25/tinychat-retrieval-0.1.1-onboarding.25.tgz) |
| OpenKey CLI | `@openkey/cli@0.1.5` | [npm package](https://www.npmjs.com/package/@openkey/cli/v/0.1.5), [OpenKey source](https://github.com/TinyCloudLabs/openkey/tree/54e3bfc5b7626e1a288e2cf54eed9a06ae3c0140/packages/cli) |

## Release checklist

- Update the matrix: re-run each flow, then record the new counts, the date and the versions in [`matrix/interactions.json`](matrix/interactions.json). It is not published on the site; `scripts/matrix.mjs` renders it for private use. A value is `null` until a real QA run measured it, and every number needs `measured_on` and `run_ref`.

## Other files

- [`prompt.txt`](prompt.txt) is the TinyChat test prompt. It points at `https://agents.tinycloud.xyz/chat`.
- [`standard/blocks.md`](standard/blocks.md) holds the text every guide and skill must carry identically, one block per `<!-- std:NAME -->` line (today `read-raw`: the read-the-page-raw and send-links-exactly rules; `relay`: send each link then stop and wait for the owner, and do every `Next:` line, carried by `/onboarding` and `/courier`). A guide or a skill in `skills/` carries `{{std:NAME}}` alone on a line; the build expands it first, before link rewriting, `{{CLI_VERSION}}` and the preview host, so production and preview builds expand alike, and lists an expanded skill file as `changed` in `skills/index.json`. It fails on an unknown marker, a marker that isn't alone on its line or is unclosed, a block nothing uses, a block with a relative link, or a guide or skill that pastes a block's text instead of the marker (`setup/share.md` is exempt until prompts#147 lands). `standard/` is never published or listed. Change a block there, not in a guide; `node --test scripts/standard-blocks.test.mjs` covers it. Blocks for the CLI rule, owner lines and the exit table move in next.
- [`skills/tc-apps/SQL.md`](skills/tc-apps/SQL.md) is `tc-apps`'s optional SQL index; each skill's `QUICKSTART.md` covers the owner's setup, what they see, and why it works the way it does.
- [`forward-tests.md`](https://github.com/TinyCloudLabs/prompts/blob/main/forward-tests.md) (`tc-publish`), [`forward-tests-tc-secrets.md`](https://github.com/TinyCloudLabs/prompts/blob/main/forward-tests-tc-secrets.md) and [`forward-tests-tc-apps.md`](https://github.com/TinyCloudLabs/prompts/blob/main/forward-tests-tc-apps.md) are the coordinator runbooks: fresh-agent prompts, expected commands, and how to verify each outcome. They stay in this repository and are not published on the site.

The owning repositories remain authoritative for executable code and their skills: TinyChat owns `tinychat-retrieval`, `@tinycloud/cli` owns `tinycloud-cli`, `@tinycloud/courier` owns `courier`, `@tinycloud/mcp` owns `tinycloud-delegated-secrets`, and OpenKey owns `openkey-cli`, which is not published here.

## Source and deployment boundary

The site is deployed from `main` through Cloudflare Pages (project `tinycloud-agents`) and serves `_site/`. Its build command is set in the Cloudflare Pages project settings, not this repository; set it to `npm ci --ignore-scripts --no-audit --no-fund && node scripts/build-site.mjs` with output directory `_site`. `functions/` holds the Pages Functions. Other branches get preview builds, where every `https://agents.tinycloud.xyz` URL in the guides, in every served skill's text files (`/skills/<short>.md`, `/skills/<short>/…`, with `/skills/index.json` checksums taken after the rewrite and the files listed as `changed`), and the installer's own site, point at the preview, so a branch's guides install that branch's skills and its skills send agents back to that branch's guides. Production builds are unaffected. TinyChat's own production entry point at `https://tinycloud.chat/agents/setup.md` and its versioned app pack are separate and unchanged.

Run `npm ci --ignore-scripts --no-audit --no-fund`, then `npm run build` locally. The lockfile pins the build-time Markdown renderer and heading-link extension. CI installs those dependencies before its existing checks. Configure the Pages project build command above to perform the same install before running the site builder. Neither the package manifests nor `node_modules` are published.

Preview the actual Pages Functions with `wrangler pages dev _site --compatibility-date 2026-08-18`. Check `/connect` in a browser and with `curl -H 'Accept: text/markdown'`; both must contain the MCP connection steps and the coding-agent handoff to `/apps` and the other guides. Follow that link and check that `/apps` is still raw Markdown and byte-identical to the baseline. A local page/HTTP check does not prove an agent followed the handoff or completed authorization; those require the client checks in [`forward-tests-onboarding.md`](forward-tests-onboarding.md).


## Snapshot provenance

The TinyChat guide was first split out of public TinyChat commit [`f67bf08417c8954fc0bab4379e99db13977f4d96`](https://github.com/TinyCloudLabs/tinychat/tree/f67bf08417c8954fc0bab4379e99db13977f4d96), including its [setup source](https://github.com/TinyCloudLabs/tinychat/blob/f67bf08417c8954fc0bab4379e99db13977f4d96/agent-setup/setup.md) and [release notes](https://github.com/TinyCloudLabs/tinychat/blob/f67bf08417c8954fc0bab4379e99db13977f4d96/docs/agent-skills-release.md).

## Local OpenCode test

On your Mac, start the supported direct OpenCode TUI and paste [`prompt.txt`](prompt.txt). The entry sends the agent to the shared CLI setup, then returns to TinyChat skill installation and app-scoped authorization in the same conversation. See the entry document for the pinned client and Node requirements. It uses your existing TinyChat account and data host, and doesn't deploy anything.
