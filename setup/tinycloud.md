# Set up the TinyCloud CLI

This module installs the published TinyCloud CLI and its core `tc-cli` skill. The user-facing command is `tinycloud`. Use the exact published version pinned below; do not use `@latest`.

## For the owner

- **Install:** run `npm install --global @tinycloud/cli@1.5.0-beta.20`.
- **Verify:** run `tinycloud --version`; it should print `1.5.0-beta.20`.
- **Paste into Claude Code, Codex or OpenCode:** `Set up the TinyCloud CLI: https://agents.tinycloud.xyz/cli`.
- **You approve:** nothing. This setup does not sign in or request access.
- **Undo:** remove the installed `tc-cli` skill folder if you no longer need it. If no other installed skill uses the TinyCloud CLI, uninstall it with `npm uninstall --global @tinycloud/cli`.

## Caller contract

Before starting, retain the user's original task, the selected client (`opencode`, `codex` or `claude-code`), and the calling guide's exact return heading. After setup succeeds, return to that heading and continue the original task in this conversation. Do not ask the owner to paste another prompt. If the owner sent this page directly, report the result when setup is complete.

## Requirements

Use Node.js 22.20 or later and npm. Set `CLIENT` to the current agent client: `opencode`, `codex` or `claude-code`.

## Install

Run the pinned install and version check:

```sh
npm install --global @tinycloud/cli@1.5.0-beta.20
tinycloud --version
```

If `tinycloud --version` does not print `1.5.0-beta.20`, stop and report the result. Do not change install methods or use `sudo`.

Install the matching core skill:

```sh
curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - cli --agent CLIENT
```

The installer verifies every downloaded skill file against the site's pinned skill index. It prints `SKILL_INSTALLED cli 1.5.0-beta.20 <folder>` when it succeeds. Check that the selected client's `tc-cli/SKILL.md` is readable, then return to the caller's recorded heading.

The CLI install leaves unrelated npm packages, skills and agent settings alone. Never configure profiles or request permissions in this shared setup.
