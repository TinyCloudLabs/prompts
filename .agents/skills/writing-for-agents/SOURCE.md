# Source

Vendored unchanged from Matt Pocock's skills, MIT License (see `LICENSE`, Copyright (c) 2026 Matt Pocock):

- Repository: https://github.com/mattpocock/skills
- Path: `skills/productivity/writing-for-agents/` (`SKILL.md`, `SKILL-MECHANICS.md`, `agents/openai.yaml`)
- Commit: `d65391149dbb5fe76478e76fa8d5122b2aa5a70e` (repository HEAD, 2026-11-24, package version 1.3.2); the skill's files last changed in `321658273cb1d20b76026717d027d505790106d4` (2026-08-19)
- About: https://www.aihero.dev/skills-writing-for-agents

This is an authoring skill for agents working in this repository. It is not a product skill: the site build skips `.agents/` and `.claude/`, so it is never published or installed for users. `.claude/skills/writing-for-agents` is a symlink to this folder, for Claude Code; the other clients read `.agents/skills/`.

To update it, copy the folder again from a newer upstream commit, then update the commit above.
