# TinyCloud prompt handoff

This repository is the shared development and review point for agent-facing setup prompts and reusable TinyCloud workflows. It separates reusable tool prerequisites, conversational behavior, and app-owned setup without moving runtime code or deployment ownership.

## Documents

- [`quickstart/tinycloud-opencode-read.md`](quickstart/tinycloud-opencode-read.md) is the lean read entry for supported local OpenCode. [`auth-handoff`](auth-handoff/) provides single-call setup, native paste capture and complete release packaging. Downloadable delivery and matching OpenKey deployment remain prerequisites; this read-only release does not grant write/provisioning authority. The general task entry routes reads here and retains its existing CRUD workflow.
- [`quickstart/tinycloud.md`](quickstart/tinycloud.md) is the general entry for Codex, OpenCode or Claude Code: preserve the task, discover its app, read the app's conventions, obtain the needed permissions, execute the supported operation and verify it. Use its [local starter](quickstart/tinycloud-prompt.txt). It handles explicit one-off operations and routes first-use storage into [private application creation](setup/create-application.md); recurring automatic capture retains its separate delivery requirements. See [existing-app validation](docs/general-operations-validation.md) and [creation results and limits](docs/app-creation-validation.md).
- [`quickstart/retrieve-data.md`](quickstart/retrieve-data.md) is the standalone retrieval entry for ordinary Codex: retain the question, authenticate, discover registered apps live, read their guidance, and query existing data. Its [short starter](quickstart/retrieve-data-prompt.txt), [knowledge convention](references/application-knowledge.md), and [verification report](docs/retrieve-data-validation.md) are included in [PR #2](https://github.com/TinyCloudLabs/prompts/pull/2).
- [`skills/tc-conversational-data/SKILL.md`](skills/tc-conversational-data/SKILL.md) owns conversational tracking, correction, retry reconciliation and fresh-session recovery for prepared TinyCloud scopes. Its current version is `0.1.0`.
- [`quickstart/conversational-data.md`](quickstart/conversational-data.md) installs that skill into the current project and identifies the caller-provided storage context; [`quickstart/conversational-data-prompt.txt`](quickstart/conversational-data-prompt.txt) is its review starter.
- [`setup/tinycloud.md`](setup/tinycloud.md) installs and verifies the pinned TinyCloud CLI and its core skill, then returns to the calling app guide.
- [`setup/openkey.md`](setup/openkey.md) optionally installs and verifies the standalone OpenKey CLI. It is not part of TinyChat authorization.
- [`apps/tinychat/setup.md`](apps/tinychat/setup.md) owns TinyChat's skill, adapter activation, app context, permission grant, retrieval behavior and lifecycle.
- [`prompt.txt`](prompt.txt) points to this branch's TinyChat entry document for local client testing.

The owning repositories remain authoritative for their executable code and core prompts. TinyChat continues to own and package `tinychat-retrieval`; `@tinycloud/cli` continues to own `tc-cli`; and OpenKey continues to own `openkey-cli`. This repository owns `tc-conversational-data` and the generic `auth-handoff` helper. The helper packages an exact CLI and its dependencies into a separate verified release; generated archives and private local acceptance evidence are not checked into this repository.

Install workflow skills from a reviewed local checkout or a published full commit, keeping the whole skill folder and its references together. This PR updates the `0.1.0` workflow baseline with retrieval routing, conversation-export corrections and one-off task identity; historical commit `b09981215f5873a9c24e3bcb890a7074d9ebefb6` does not contain them. Use the matching checkout, or select a reviewed full commit from this PR containing the guide and skill together. Their instructions can evolve independently of CLI releases; each skill records its tested CLI/node baseline. User intentions, data and domain guidance remain in TinyCloud, outside the installed package.

## Snapshot provenance

This initial split was prepared from public TinyChat commit [`f67bf08417c8954fc0bab4379e99db13977f4d96`](https://github.com/TinyCloudLabs/tinychat/tree/f67bf08417c8954fc0bab4379e99db13977f4d96), including its [setup source](https://github.com/TinyCloudLabs/tinychat/blob/f67bf08417c8954fc0bab4379e99db13977f4d96/agent-setup/setup.md) and [release notes](https://github.com/TinyCloudLabs/tinychat/blob/f67bf08417c8954fc0bab4379e99db13977f4d96/docs/agent-skills-release.md).

The reviewed pins are:

| Component | Pin | Owner/source |
| --- | --- | --- |
| TinyCloud CLI and `tc-cli` skill | `@tinycloud/cli@0.10.0` | [npm package](https://www.npmjs.com/package/@tinycloud/cli/v/0.10.0) |
| Skills installer | `skills@1.7.0` | [npm package](https://www.npmjs.com/package/skills/v/1.7.0) |
| TinyChat retrieval pack | `0.1.1-onboarding.16` | [TinyChat source](https://github.com/TinyCloudLabs/tinychat/tree/f67bf08417c8954fc0bab4379e99db13977f4d96/agent-skills/tinychat-retrieval) |
| OpenKey CLI | `@openkey/cli@0.1.4` | [npm package](https://www.npmjs.com/package/@openkey/cli/v/0.1.4), [OpenKey source](https://github.com/TinyCloudLabs/openkey/tree/495b9d39c3484333fcf9e98af0eb7b67286b0323/packages/cli) |

## Source and deployment boundary

The TinyChat setup split originated on `docs/initial-setup-split`. General task, retrieval, app-creation and conversational workflow changes are under review in [PR #2](https://github.com/TinyCloudLabs/prompts/pull/2), stacked on [PR #1](https://github.com/TinyCloudLabs/prompts/pull/1). These review branches are not wired to TinyChat's production deployment. The production entry point at `https://tinycloud.chat/agents/setup.md` and its versioned app pack remain unchanged.

The TinyChat draft starter uses the original split branch's raw GitHub URL. Shared setup links resolve within that same branch. The general task and retrieval starters take the local entry or guide path from a matching review checkout. Repository access determines whether a client can fetch these files; this change does not alter repository visibility.

## Local OpenCode test

On your Mac, start the supported direct OpenCode TUI and paste [`prompt.txt`](prompt.txt). The draft entry sends the agent to shared TinyCloud prerequisites, then returns to TinyChat skill installation and app-scoped authorization in the same conversation. See the entry document for the pinned client and Node requirements.

This tests the new instructions against the existing published CLI and retrieval skill. It still uses your existing TinyChat account and data host. It does not deploy anything or replace the production setup prompt.

When deployment is wired later, publish the shared setup documents and the TinyChat app document together. Preserve their relative-link layout, or rewrite the links during publication and verify every resulting URL anonymously.
