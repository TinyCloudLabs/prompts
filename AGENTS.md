# Agent instructions

## Agent clients

No Claude bias in what we build: products must not assume one AI vendor. The CLI, skills, guides and SDKs work the same in every agent client (Claude Code, Codex, Gemini CLI, Cursor and others). Install skills, configs and instructions where each client expects them, following its conventions, never only under Claude paths such as `~/.claude`. Test with more than one client.

## Writing for agents

Text in this repository that an agent reads (skills/, setup/ guides, standard/blocks.md, prompt.txt, forward-tests-*.md, this file) is written with the `writing-for-agents` skill (`.agents/skills/writing-for-agents/`). You are done when its Pruning pass finds no no-op, duplication, cache or sediment in the lines you added or changed.
