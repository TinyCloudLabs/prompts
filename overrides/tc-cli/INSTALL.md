# Install, update and remove the core skills

This copy of the `tc-cli` skill comes from agents.tinycloud.xyz, which serves every TinyCloud skill and pins the CLI version they're tested with. Install, update and remove them as below, not from the npm package or its `beta` tag.

## Install

Follow https://agents.tinycloud.xyz/cli. It installs TinyCloud CLI 1.2.2 into `~/.local/share/tinycloud/cli`, makes `tc` run it when nothing else on `PATH` is called `tc`, and installs this skill. The skill's first block finds the CLI there; set `TC_BIN` to use another one.

To install this skill, or `courier` for `tc courier`, without the guide:

```bash
curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - cli --agent claude-code
curl -fsSL https://agents.tinycloud.xyz/skills/install.js | node - courier --agent claude-code
```

Use `--agent codex` or `--agent opencode` for those clients. Skills go into `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/<name>` for Claude Code and `~/.agents/skills/<name>` for Codex and OpenCode, which share that folder. The installer checks every file against https://agents.tinycloud.xyz/skills/index.json before it writes anything, and prints `SKILL_INSTALLED <name> <version> <folder>`. Start a new session for the client to discover the skill.

## Check

```bash
"$TC" --version
```

The installed `tc-cli/release.json` names the CLI range the skill describes. Check it against the version before relying on newer commands. App skills publish their own CLI compatibility.

## Update

Run the install again. It installs the versions agents.tinycloud.xyz serves, which change only when the site's pins change; it never follows `latest` or `beta`.

## Remove

Delete the skill folders: `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/tc-cli` and `courier` for Claude Code, `~/.agents/skills/tc-cli` and `courier` for Codex and OpenCode. To remove the CLI, delete the `tc` link the setup made, if it points into `~/.local/share/tinycloud/cli`, then that folder. Removing the skill or CLI doesn't delete TinyCloud profiles or revoke data access.
