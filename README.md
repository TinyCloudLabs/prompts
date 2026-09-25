# TinyCloud prompt handoff

This repository is the shared development and review point for agent-facing setup prompts. It separates reusable tool prerequisites from app-owned setup without moving runtime code or deployment ownership.

## Documents

- [`setup/tinycloud.md`](setup/tinycloud.md) installs and verifies the pinned TinyCloud CLI and its core skill, then returns to the calling app guide.
- [`setup/openkey.md`](setup/openkey.md) optionally installs and verifies the standalone OpenKey CLI. It is not part of TinyChat authorization.
- [`apps/tinychat/setup.md`](apps/tinychat/setup.md) owns TinyChat's skill, adapter activation, app context, permission grant, retrieval behavior and lifecycle.
- [`prompt.txt`](prompt.txt) points to this branch's TinyChat entry document for local client testing.

The owning repositories remain authoritative for executable code and core prompts. TinyChat continues to own and package `tinychat-retrieval`; `@tinycloud/cli` continues to own `tc-cli`; and OpenKey continues to own `openkey-cli`. This repository intentionally contains no helpers, generated release archives, sync framework or evaluation runtime.

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

These files are an initial handoff on `docs/initial-setup-split` for local client testing. The draft is not wired to TinyChat's production deployment. The production entry point at `https://tinycloud.chat/agents/setup.md` and its versioned app pack remain unchanged.

The draft starter uses the branch's raw GitHub URL. Shared setup links resolve within that same branch. Repository access determines whether a client can fetch these files; this change does not alter repository visibility.

## Local OpenCode test

On your Mac, start the supported direct OpenCode TUI and paste [`prompt.txt`](prompt.txt). The draft entry sends the agent to shared TinyCloud prerequisites, then returns to TinyChat skill installation and app-scoped authorization in the same conversation. See the entry document for the pinned client and Node requirements.

This tests the new instructions against the existing published CLI and retrieval skill. It still uses your existing TinyChat account and data host. It does not deploy anything or replace the production setup prompt.

When deployment is wired later, publish the shared setup documents and the TinyChat app document together. Preserve their relative-link layout, or rewrite the links during publication and verify every resulting URL anonymously.
