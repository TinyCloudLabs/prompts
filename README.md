# TinyCloud agent guides and skills

This repository is the source of `https://agents.tinycloud.xyz`: the setup guides an owner pastes into a coding agent, and every TinyCloud agent skill those guides install. It separates reusable tool prerequisites from app-owned setup without moving runtime code or deployment ownership.

## Public URLs

The site's URLs are short and flat. The repository layout below is only for authoring; `scripts/build-site.mjs` maps it to these URLs.

| URL | What it is | Source |
| --- | --- | --- |
| `/setup` | The entry point: every ability, what to paste, what the owner approves, how to undo it | [`setup/README.md`](setup/README.md) |
| `/apps` | Personal records (`tc-apps`): one-prompt setup | [`setup/tc-apps.md`](setup/tc-apps.md) |
| `/feed` | Creating a post in TinyCloud Home (`tinycloud-feed`) | [`skills/tinycloud-feed/creating-a-post.md`](skills/tinycloud-feed/creating-a-post.md) |
| `/connect` | One link for ChatGPT, Claude and coding agents: HTML by default, Markdown when requested | [`setup/connect.md`](setup/connect.md); coding agents follow the unchanged [`/apps` guide](setup/tc-apps.md) |
| `/chat` | TinyChat meetings (`tinychat-retrieval`): one-prompt setup | [`apps/tinychat/setup.md`](apps/tinychat/setup.md) |
| `/publish` | Publish and share (`tc-publish`): owner setup | [`setup/publish.md`](setup/publish.md) |
| `/share` | Share an artifact (`tc-publish`): choose who can open it, set an expiry, revoke | [`setup/share.md`](setup/share.md) |
| `/secrets` | TinyCloud Secrets (`tc-secrets`): owner setup | [`setup/secrets.md`](setup/secrets.md) |
| `/courier` | Agent-to-agent threads (`courier`): owner setup | [`setup/courier.md`](setup/courier.md) |
| `/cli` | Building block: the TinyCloud CLI, its `tinycloud` command and its `tc-cli` skill | [`setup/tinycloud.md`](setup/tinycloud.md) |
| `/openkey` | Building block: the standalone OpenKey CLI | [`setup/openkey.md`](setup/openkey.md) |
| `/skills/<skill>.md` | A skill's `SKILL.md` to read, for `apps`, `feed`, `chat`, `publish`, `secrets`, `courier`, `cli` and `mcp`; its relative links point into `/skills/<skill>/` | see [Skills](#skills) |
| `/skills/<skill>/<file>` | The skill's files exactly as installed, `SKILL.md` included | |
| `/skills/<skill>/SHA256SUMS` | The sha256 of each of the skill's files, in `sha256sum -c` format, the same values as `index.json`; the `/apps` setup checks its downloads against it | generated |
| `/skills/index.json` | Every skill's name, short name, version, description, source, changed files, and files with sha256 checksums | generated |
| `/skills/install.js` | The installer the guides run | [`scripts/install-skill.js`](scripts/install-skill.js) |

The earlier URLs, the repository paths such as `/setup/tc-apps.md`, `/apps/tinychat/setup.md` and `/skills/tc-apps/SKILL.md`, redirect to these, and so does each page's URL with a trailing slash (`/apps/` → `/apps`). The site also generates `/` (for people), `/llms.txt`, `/llms-full.txt`, the sitemap and `/.well-known/agent-skills/index.json`. This README isn't published; `/README.md` redirects to `/setup`.

Guides link to each other and to skill files by relative repository path; the build rewrites those links to the public URLs. The build then fails if any link in a served Markdown file, relative or to this site, doesn't reach a file the site serves.

### One-link personal-record setup

Share `Set up TinyCloud using https://agents.tinycloud.xyz/connect` in any supported client. Chat apps receive the hosted MCP URL, OAuth and client-specific connection steps. Local coding agents are told to fetch and follow `/apps` in full for the owner's original request, without asking the owner for another URL. The original `/apps` source, output and Markdown response remain unchanged.

In ChatGPT, a bare `/connect` link means setup, not a request for a feature menu. The initial reply is only four numbered steps, at most 120 words: direct Plugins link, connection fields and OAuth, OpenKey sign-in/install, then `@TinyCloud`. No introduction, images, speculative plan/price warnings or closing questionnaire. Troubleshoot only reported or observed blockers; a plan label or generic documentation gap is not evidence that an account cannot connect. Once tools are available, continue the original request rather than repeating installation.

The build generates `connect.html` and `connect.md` from the same entry-page text. That text carries its own setup-only record recipe for chat apps; it does not embed, reword or relink the coding-agent installation guide. `/apps` remains the sole authority for that workflow. Marked renders the HTML at build time with heading IDs, without JavaScript. The additional coding-agent fetch is intentional: preserve the tested guide rather than maintain a modified copy. This preserves instructions, not a guarantee of identical model decisions.

`functions/connect.js` returns HTML for ordinary requests, including `Accept: */*`. An explicit, nonzero `text/markdown` preference at least as high as HTML returns Markdown at the **same `/connect` URL**, with `Vary: Accept`. It respects HTML wildcard preferences and never infers the client from User-Agent. `/connect.md` is also available as a machine-readable alternate; owners do not need to choose it.

The response also appends `Cache-Control: no-transform`, preserving the existing cache lifetime. Cloudflare email obfuscation can mistake `package@version` for an email address and rewrite guide text for readers that do not run JavaScript. This opt-out affects `/connect` only; neither `/apps` nor zone-wide settings are changed. Verify the production HTML bytes, not just the `pages.dev` preview.

## Skills

Every TinyCloud agent skill is published here, so what the site serves is what the guides install:

| Skill | Short name | Source of truth |
| --- | --- | --- |
| `tc-apps` | `apps` | [`skills/tc-apps`](skills/tc-apps), in this repository |
| `tinycloud-feed` | `feed` | [`skills/tinycloud-feed`](skills/tinycloud-feed), in this repository |
| `tc-publish` | `publish` | [`skills/tc-publish`](skills/tc-publish), in this repository |
| `tc-secrets` | `secrets` | [`skills/tc-secrets`](skills/tc-secrets), in this repository |
| `tc-cli` | `cli` | `skills/tc-cli` in the npm package [`@tinycloud/cli@1.3.5`](https://www.npmjs.com/package/@tinycloud/cli/v/1.3.5) (js-sdk), unchanged |
| `courier` | `courier` | `skills/courier` in [`@tinycloud/courier@0.1.3`](https://www.npmjs.com/package/@tinycloud/courier/v/0.1.3) (js-sdk), unchanged |
| `tinychat-retrieval` | `chat` | TinyChat's released pack [`0.1.1-onboarding.16`](https://tinycloud.chat/agents/tinychat-retrieval/0.1.1-onboarding.16/tinychat-retrieval-0.1.1-onboarding.16.tgz), with the changes below |
| `tinycloud-delegated-secrets` | `mcp` | `skills/tinycloud-delegated-secrets` in [`@tinycloud/mcp@0.5.3`](https://www.npmjs.com/package/@tinycloud/mcp/v/0.5.3) (js-sdk), unchanged |

Skills written for these guides live in `skills/`. Skills owned by another repository stay authored there: the build downloads the exact release tarball named in `SKILLS` in `scripts/build-site.mjs` and refuses it unless its sha512 matches the pinned `integrity`, so every build, locally or on Cloudflare Pages, serves the same files. Nothing floats on a branch.

The owner-facing pages call the CLI `tinycloud`, the name `@tinycloud/cli` 1.2.3 added next to `tc`: on Linux, `/usr/sbin/tc` is the system's traffic-control tool, and `tinycloud` doesn't clash with anything. [`/cli`](setup/tinycloud.md) links `tinycloud` onto the owner's `PATH`, and `tc` too where nothing else has that name. The skills themselves don't need either name on the `PATH`: they run the CLI as `TC_BIN` if set, else from `~/.local/share/tinycloud/cli`.

Every skill whose `SKILLS` entry has `checkCli` must run the CLI that way. For tc-cli, courier and tinychat-retrieval, the build fails if a served file looks up the CLI other than through the three-line resolver that tc-cli and courier ship (`TC_BIN` if set, else `~/.local/share/tinycloud/cli`, else a global npm install; the released lines end in `tc` up to tc-cli 1.2.3 and courier 0.1.3, and in `tinycloud` from tc-cli 1.2.4), has a bare `tc` command in a shell block, or has a script that runs `tc` (as a default executable, a spawned program or a returned value). tc-cli 1.3.0 and courier 0.1.3 pass as released ([TinyCloudLabs/js-sdk#522](https://github.com/TinyCloudLabs/js-sdk/pull/522)). The skills written here (`tc-publish`, `tc-secrets`) resolve `TC_BIN` in each block's preamble the same way, preferring the `tinycloud` executable.

One released skill is served with changes, listed as `changes` in `SKILLS` and as `changed` in `/skills/index.json`: `tinychat-retrieval`'s scripts run `TC_BIN` if set, else the `tinycloud` in `~/.local/share/tinycloud/cli`, else `tinycloud` on the `PATH`, never `tc`; with none of them they fail with `CLI_UNAVAILABLE` ("TinyCloud CLI not found: run https://agents.tinycloud.xyz/cli or set TC_BIN"). That's `defaultTc()` in `lib/retrieval.mjs`, used by `lib/setup.mjs` and `lib/login.mjs`; `scripts/retrieve.mjs --help` and `references/meetings.md` say so. TinyChat's pack needs the same change upstream (TC-1077); once a pinned release has it, drop the changes here.

A skill's version is its `SKILL.md`'s `metadata.version`, or, for a package skill without one, the package version. Only the current version of each skill is published.

To install a skill without a guide:

```sh
curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - <short name> --agent <claude-code|codex|opencode>
```

The installer checks every file against `/skills/index.json` before writing anything, then swaps in the skill's folder: `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/<name>` for Claude Code, `~/.agents/skills/<name>` for Codex and OpenCode. It refuses a skill name that isn't one plain folder name, any file path that could leave the folder, and any redirect, so every byte comes from the site it was served from. Installs of one skill take turns through a lock folder, `.<name>.lock`, broken only when its process has exited or it is older than any install takes. The old folder stays until the new one is in place and goes back if that fails; a later install restores it if the earlier one exited in between. Its tests: `node --test scripts/install-skill.test.mjs`.

**Updating a package skill:** change its `tarball`, `integrity` (npm: `npm view <package>@<version> dist.integrity`; otherwise `sha512-` and the base64 SHA-512 of the file) and `version` in `SKILLS`, and update the guides that name that version. **Updating a skill in `skills/`:** bump its `metadata.version`.

## Pins

| Component | Pin | Owner/source |
| --- | --- | --- |
| TinyCloud CLI and `tc-cli` skill | `@tinycloud/cli@1.3.5` | [npm package](https://www.npmjs.com/package/@tinycloud/cli/v/1.3.5) |
| TinyChat retrieval pack | `0.1.1-onboarding.16` | [TinyChat release](https://tinycloud.chat/agents/tinychat-retrieval/0.1.1-onboarding.16/tinychat-retrieval-0.1.1-onboarding.16.tgz) |
| OpenKey CLI | `@openkey/cli@0.1.4` | [npm package](https://www.npmjs.com/package/@openkey/cli/v/0.1.4), [OpenKey source](https://github.com/TinyCloudLabs/openkey/tree/495b9d39c3484333fcf9e98af0eb7b67286b0323/packages/cli) |

## Release checklist

- Update the matrix: re-run each flow, then record the new counts, the date and the versions in [`matrix/interactions.json`](matrix/interactions.json). It is served at `/matrix`; a value is `null` until a real QA run measured it, and every number needs `measured_on` and `run_ref`.

## Other files

- [`prompt.txt`](prompt.txt) is the TinyChat test prompt. It points at `https://agents.tinycloud.xyz/chat`.
- [`skills/tc-apps/SQL.md`](skills/tc-apps/SQL.md) is `tc-apps`'s optional SQL index; each skill's `QUICKSTART.md` covers the owner's setup, what they see, and why it works the way it does.
- [`forward-tests.md`](https://github.com/TinyCloudLabs/prompts/blob/main/forward-tests.md) (`tc-publish`), [`forward-tests-tc-secrets.md`](https://github.com/TinyCloudLabs/prompts/blob/main/forward-tests-tc-secrets.md) and [`forward-tests-tc-apps.md`](https://github.com/TinyCloudLabs/prompts/blob/main/forward-tests-tc-apps.md) are the coordinator runbooks: fresh-agent prompts, expected commands, and how to verify each outcome. They stay in this repository and are not published on the site.

The owning repositories remain authoritative for executable code and their skills: TinyChat owns `tinychat-retrieval`, `@tinycloud/cli` owns `tc-cli`, `@tinycloud/courier` owns `courier`, `@tinycloud/mcp` owns `tinycloud-delegated-secrets`, and OpenKey owns `openkey-cli`, which is not published here.

## Source and deployment boundary

The site is deployed from `main` through Cloudflare Pages (project `tinycloud-agents`) and serves `_site/`. Its build command is set in the Cloudflare Pages project settings, not this repository; set it to `npm ci --ignore-scripts --no-audit --no-fund && node scripts/build-site.mjs` with output directory `_site`. `functions/` holds the Pages Functions. Other branches get preview builds, where every `https://agents.tinycloud.xyz` URL in the guides, and the installer's own site, point at the preview, so a branch's guides install that branch's skills. TinyChat's own production entry point at `https://tinycloud.chat/agents/setup.md` and its versioned app pack are separate and unchanged.

Run `npm ci --ignore-scripts --no-audit --no-fund`, then `npm run build` locally. The lockfile pins the build-time Markdown renderer and heading-link extension. CI installs those dependencies before its existing checks. Configure the Pages project build command above to perform the same install before running the site builder. Neither the package manifests nor `node_modules` are published.

Preview the actual Pages Functions with `wrangler pages dev _site --compatibility-date 2026-08-18`. Check `/connect` in a browser and with `curl -H 'Accept: text/markdown'`; both must contain the MCP connection steps and the coding-agent handoff to `/apps`. Follow that link and check that `/apps` is still raw Markdown and byte-identical to the baseline. A local page/HTTP check does not prove an agent followed the handoff or completed authorization; those require the client checks in [`forward-tests-onboarding.md`](forward-tests-onboarding.md).


## Snapshot provenance

The TinyChat guide was first split out of public TinyChat commit [`f67bf08417c8954fc0bab4379e99db13977f4d96`](https://github.com/TinyCloudLabs/tinychat/tree/f67bf08417c8954fc0bab4379e99db13977f4d96), including its [setup source](https://github.com/TinyCloudLabs/tinychat/blob/f67bf08417c8954fc0bab4379e99db13977f4d96/agent-setup/setup.md) and [release notes](https://github.com/TinyCloudLabs/tinychat/blob/f67bf08417c8954fc0bab4379e99db13977f4d96/docs/agent-skills-release.md).

## Local OpenCode test

On your Mac, start the supported direct OpenCode TUI and paste [`prompt.txt`](prompt.txt). The entry sends the agent to the shared CLI setup, then returns to TinyChat skill installation and app-scoped authorization in the same conversation. See the entry document for the pinned client and Node requirements. It uses your existing TinyChat account and data host, and doesn't deploy anything.
