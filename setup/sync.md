# Sync another app's data into TinyCloud

Your agent copies the data you keep in another app into your own TinyCloud, so it outlasts that app and any agent can use it. It copies when you ask, one way: the other app stays the source, a later sync updates what changed, and nothing is deleted. Weigh-ins also show up in Health Log.

## For the owner

- **Paste into your agent, where it can use the other app:** `Sync my weight log into TinyCloud: https://agents.tinycloud.xyz/sync`
- **Works with:** Wabi. Other apps get their own connector as they're added.
- **You approve:** one OpenKey screen for up to 30 days only when `auth caps --diff` finds uncovered permissions; covered whole-`applications` grants are reused. Wabi table creation needs SQL schema over `applications:xyz.tinycloud.sync.wabi/`, which is connector-prefix-wide, not row-limited. Mapped weigh-ins need Health Log SQL read/write only when that grant is not already covered.
- **Undo:** see [Undo](#undo).

## For the agent

Keep the owner's request. If you can't run shell commands, tell the owner this needs an agent with a shell, and stop.

1. **Onboard.** If `tinycloud onboard` hasn't completed on this computer, follow [/onboarding](onboarding.md) and come back.
2. **Install the skill.**

   ```sh
   curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - sync --agent CLIENT
   ```

   `CLIENT` is `claude-code`, `codex` or `opencode`. It prints `SKILL_INSTALLED tc-sync <version> <folder>`; anything else means the install failed: stop and report it.
3. **Follow the skill.** Read `<folder>/SKILL.md` and follow it from §1 for the owner's request, in this conversation.

## Undo

For the owner. The approval ends on its own after 30 days; to end it sooner, revoke it at https://account.tinycloud.xyz/delegations. Synced data stays in your TinyCloud until you delete it. The skill's folder is `~/.agents/skills/tc-sync` or `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-sync`.
