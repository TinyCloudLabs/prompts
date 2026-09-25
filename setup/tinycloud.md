# Set up TinyCloud prerequisites

This is a reusable prerequisite module. It installs and verifies only the TinyCloud CLI and the CLI's core skill. App hosts, spaces, profiles, permission manifests, authorization and app behavior belong in the calling app guide.

## Caller contract

Before starting, retain all of the following from the caller:

- the user's original task;
- the selected client: `opencode`, `codex` or `claude-code`;
- the calling app guide and its exact return heading.

After the checks below pass, return directly to that heading and continue the original task in the same conversation. Do not ask the user to paste another prompt. If a pin conflict prevents completion, return the conflict to the caller instead of silently changing an existing installation.

## Requirements

Use Node.js **22.20 or later** and npm. The `@tinycloud/cli` package supports Node 20 or later, but this handoff pins `skills@1.7.0`, so the combined prerequisite uses Node 22.20 or later.

Set `CLIENT` conceptually to the current agent client: `opencode`, `codex` or `claude-code`. Do not apply app-specific OpenCode restrictions here.

## Reuse or install

First check for an existing CLI with `command -v tc` and `tc --version`. Reuse it when it is the required `0.10.0` installation.

Also inspect an existing `tc-cli/SKILL.md` before replacing it. With the pinned installer, the usual path is `$HOME/.agents/skills/tc-cli/SKILL.md` for OpenCode and Codex or `$HOME/.claude/skills/tc-cli/SKILL.md` for Claude Code. Reuse an intact skill from `@tinycloud/cli@0.10.0`. Do not overwrite an unrelated or locally modified same-named skill; return that conflict to the calling guide.

Install only missing or mismatched prerequisites that are safe to replace. Run the applicable commands sequentially, with no background or parallel install:

```sh
npm install --global @tinycloud/cli@0.10.0
npx --yes skills@1.7.0 add https://registry.npmjs.org/@tinycloud/cli/-/cli-0.10.0.tgz --skill tc-cli --global --copy --agent CLIENT --yes
```

These commands target the named CLI package and named skill. Preserve unrelated npm packages, skills, agent configuration and model/provider settings.

## Verify and return

Verify that `tc --version` reports `0.10.0` and that the selected client's `tc-cli/SKILL.md` is readable and belongs to the pinned CLI package. Do not sign in, choose a profile, configure a host or space, or request permissions in this shared module.

Return to the exact recorded app-guide heading and continue there without another user prompt.
