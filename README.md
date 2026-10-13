# TinyCloud agent guides and skills

This repository is the source of `https://agents.tinycloud.xyz`: the setup guides an owner pastes into a coding agent, and every TinyCloud agent skill those guides install. It separates reusable tool prerequisites from app-owned setup without moving runtime code or deployment ownership.

## Public URLs

The site's URLs are short and flat. The repository layout below is only for authoring; `scripts/build-site.mjs` maps it to these URLs.

| URL | What it is | Source |
| --- | --- | --- |
| `/setup` | The entry point: every ability, what to paste, what the owner approves, how to undo it | [`setup/README.md`](setup/README.md) |
| `/apps` | Personal records (`tc-apps`): one-prompt setup | [`setup/tc-apps.md`](setup/tc-apps.md) |
| `/chat` | TinyChat meetings (`tinychat-retrieval`): one-prompt setup | [`apps/tinychat/setup.md`](apps/tinychat/setup.md) |
| `/publish` | Publish and share (`tc-publish`): owner setup; `/share` redirects here | [`setup/publish.md`](setup/publish.md) |
| `/secrets` | TinyCloud Secrets (`tc-secrets`): owner setup | [`setup/secrets.md`](setup/secrets.md) |
| `/courier` | Agent-to-agent threads (`courier`): owner setup | [`setup/courier.md`](setup/courier.md) |
| `/cli` | Building block: the TinyCloud CLI and its `tc-cli` skill | [`setup/tinycloud.md`](setup/tinycloud.md) |
| `/openkey` | Building block: the standalone OpenKey CLI | [`setup/openkey.md`](setup/openkey.md) |
| `/skills/<skill>.md` | A skill's `SKILL.md` to read, for `apps`, `chat`, `publish`, `secrets`, `courier`, `cli` and `mcp`; its relative links point into `/skills/<skill>/` | see [Skills](#skills) |
| `/skills/<skill>/<file>` | The skill's files exactly as installed, `SKILL.md` included | |
| `/skills/index.json` | Every skill's name, short name, version, description, source, changed files, and files with sha256 checksums | generated |
| `/skills/install.js` | The installer the guides run | [`scripts/install-skill.js`](scripts/install-skill.js) |

The earlier URLs, the repository paths such as `/setup/tc-apps.md`, `/apps/tinychat/setup.md` and `/skills/tc-apps/SKILL.md`, redirect to these, and so does each page's URL with a trailing slash (`/apps/` → `/apps`). The site also generates `/` (for people), `/llms.txt`, `/llms-full.txt`, the sitemap and `/.well-known/agent-skills/index.json`. This README isn't published; `/README.md` redirects to `/setup`.

Guides link to each other and to skill files by relative repository path; the build rewrites those links to the public URLs. The build then fails if any link in a served Markdown file, relative or to this site, doesn't reach a file the site serves.

## Skills

Every TinyCloud agent skill is published here, so what the site serves is what the guides install:

| Skill | Short name | Source of truth |
| --- | --- | --- |
| `tc-apps` | `apps` | [`skills/tc-apps`](skills/tc-apps), in this repository |
| `tc-publish` | `publish` | [`skills/tc-publish`](skills/tc-publish), in this repository |
| `tc-secrets` | `secrets` | [`skills/tc-secrets`](skills/tc-secrets), in this repository |
| `tc-cli` | `cli` | `skills/tc-cli` in the npm package [`@tinycloud/cli@1.2.2`](https://www.npmjs.com/package/@tinycloud/cli/v/1.2.2) (js-sdk) |
| `courier` | `courier` | `skills/courier` in [`@tinycloud/courier@0.1.2`](https://www.npmjs.com/package/@tinycloud/courier/v/0.1.2) (js-sdk); `@tinycloud/cli@1.2.2` ships the same files |
| `tinychat-retrieval` | `chat` | TinyChat's released pack [`0.1.1-onboarding.16`](https://tinycloud.chat/agents/tinychat-retrieval/0.1.1-onboarding.16/tinychat-retrieval-0.1.1-onboarding.16.tgz) |
| `tinycloud-delegated-secrets` | `mcp` | `skills/tinycloud-delegated-secrets` in [`@tinycloud/mcp@0.5.2`](https://www.npmjs.com/package/@tinycloud/mcp/v/0.5.2) (js-sdk) |

Skills written for these guides live in `skills/`. Skills owned by another repository stay authored there: the build downloads the exact release tarball named in `SKILLS` in `scripts/build-site.mjs` and refuses it unless its sha512 matches the pinned `integrity`, so every build, locally or on Cloudflare Pages, serves the same files. Nothing floats on a branch.

Three released skills are served with small changes, set by `privateCli` and `changes` in `SKILLS` and listed as `changed` in `/skills/index.json`, because they run the CLI from a global npm install or from `tc` on the `PATH`, while `/cli` installs it into `~/.local/share/tinycloud/cli` and on Linux `tc` on the `PATH` is often the traffic-control tool:

- `tc-cli` and `courier`: each CLI lookup (`TC="$(npm prefix --global)/bin/tc"` or `TC_BIN=…`) becomes a three-line resolver: `TC_BIN` if set (and nothing else), else `~/.local/share/tinycloud/cli`, else a global npm install, else it stops with `TC_NOT_FOUND`. Every command in their shell code blocks runs as `"$TC"`, never a bare `tc`. Today that touches tc-cli's `SKILL.md`, `AUTH.md` and `REFERENCE.md`, and courier's `SKILL.md`.
- `tc-cli`: `INSTALL.md` is replaced by [`overrides/tc-cli/INSTALL.md`](overrides/tc-cli/INSTALL.md), which installs from this site instead of the npm tarball or the `beta` tag.
- `tinychat-retrieval`: its scripts run `TC_BIN` if set, else the CLI in `~/.local/share/tinycloud/cli`, else `tc` from the `PATH` as before (`defaultTc()` in `lib/retrieval.mjs`, used by `lib/setup.mjs` and `lib/login.mjs`); `scripts/retrieve.mjs --help` and `references/meetings.md` say so.

The build fails if a served file of these skills looks up the CLI any other way, has a bare `tc` command in a shell block, or has a script that defaults to `tc`.

The tc-cli and courier text is what js-sdk adopts upstream in [TinyCloudLabs/js-sdk#522](https://github.com/TinyCloudLabs/js-sdk/pull/522), byte for byte, except where #522 also documents features CLI 1.2.2 doesn't have (the `tinycloud` executable name, `kv list --all`). TinyChat's pack needs the same change upstream. Once pinned releases have them, drop the changes here.

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
| TinyCloud CLI and `tc-cli` skill | `@tinycloud/cli@1.2.2` | [npm package](https://www.npmjs.com/package/@tinycloud/cli/v/1.2.2) |
| TinyChat retrieval pack | `0.1.1-onboarding.16` | [TinyChat release](https://tinycloud.chat/agents/tinychat-retrieval/0.1.1-onboarding.16/tinychat-retrieval-0.1.1-onboarding.16.tgz) |
| OpenKey CLI | `@openkey/cli@0.1.4` | [npm package](https://www.npmjs.com/package/@openkey/cli/v/0.1.4), [OpenKey source](https://github.com/TinyCloudLabs/openkey/tree/495b9d39c3484333fcf9e98af0eb7b67286b0323/packages/cli) |

## Other files

- [`prompt.txt`](prompt.txt) is the TinyChat test prompt. It points at `https://agents.tinycloud.xyz/chat`.
- [`skills/tc-apps/SQL.md`](skills/tc-apps/SQL.md) is `tc-apps`'s optional SQL index; each skill's `QUICKSTART.md` covers the owner's setup, what they see, and why it works the way it does.
- [`forward-tests.md`](https://github.com/TinyCloudLabs/prompts/blob/main/forward-tests.md) (`tc-publish`), [`forward-tests-tc-secrets.md`](https://github.com/TinyCloudLabs/prompts/blob/main/forward-tests-tc-secrets.md) and [`forward-tests-tc-apps.md`](https://github.com/TinyCloudLabs/prompts/blob/main/forward-tests-tc-apps.md) are the coordinator runbooks: fresh-agent prompts, expected commands, and how to verify each outcome. They stay in this repository and are not published on the site.

The owning repositories remain authoritative for executable code and their skills: TinyChat owns `tinychat-retrieval`, `@tinycloud/cli` owns `tc-cli`, `@tinycloud/courier` owns `courier`, `@tinycloud/mcp` owns `tinycloud-delegated-secrets`, and OpenKey owns `openkey-cli`, which is not published here.

## Source and deployment boundary

The site is deployed from `main` through Cloudflare Pages (project `tinycloud-agents`), which runs `node scripts/build-site.mjs` and serves `_site/`. `functions/` holds the Pages Functions. Other branches get preview builds, where every `https://agents.tinycloud.xyz` URL in the guides, and the installer's own site, point at the preview, so a branch's guides install that branch's skills. TinyChat's own production entry point at `https://tinycloud.chat/agents/setup.md` and its versioned app pack are separate and unchanged.

## Snapshot provenance

The TinyChat guide was first split out of public TinyChat commit [`f67bf08417c8954fc0bab4379e99db13977f4d96`](https://github.com/TinyCloudLabs/tinychat/tree/f67bf08417c8954fc0bab4379e99db13977f4d96), including its [setup source](https://github.com/TinyCloudLabs/tinychat/blob/f67bf08417c8954fc0bab4379e99db13977f4d96/agent-setup/setup.md) and [release notes](https://github.com/TinyCloudLabs/tinychat/blob/f67bf08417c8954fc0bab4379e99db13977f4d96/docs/agent-skills-release.md).

## Local OpenCode test

On your Mac, start the supported direct OpenCode TUI and paste [`prompt.txt`](prompt.txt). The entry sends the agent to the shared CLI setup, then returns to TinyChat skill installation and app-scoped authorization in the same conversation. See the entry document for the pinned client and Node requirements. It uses your existing TinyChat account and data host, and doesn't deploy anything.
