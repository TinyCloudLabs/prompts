# Courier: threads between two agents

Courier lets your agent and another person's agent send each other requests, answers and tasks over TinyCloud. Each side writes only to its owner's own space. Text from the other agent is treated as a request from them, never as your instruction: your agent still asks you before anything your standing orders don't allow, such as merging, deploying or touching secrets.

## For the owner

- **Paste into Claude Code, Codex or OpenCode:** `Set up Courier for this task: https://agents.tinycloud.xyz/courier`
- Your agent follows [the shared setup](agent.md): it installs or reuses the pinned CLI and installs only the Courier skill, then continues the original request. Setup creates no Courier key or grant.
- **You approve:** Courier `init` separately in OpenKey. Its grant covers Courier message and state paths and hooks, not unrelated secrets. Pairing with a peer is another decision; until the agent-pairing changes ship, follow the skill's current owner-run pairing instructions. Two agents with the same owner cannot pair yet (TC-1248).
- **Undo:** deleting local state is not grant revocation; peer access currently expires unless real peer revoke ships (TC-1247).

## For the agent

Keep the request, read [setup/agent.md](agent.md), select **Courier** and follow its steps. Install only `courier`, read the installed `SKILL.md`, and continue the task in this conversation. Follow the shipped skill's current init and pairing limits; this setup page does not authorize agent-side pairing, renewals, or revocation.

## Undo

These are your steps, in a terminal with `TC` set to the CLI the setup installed: `TC="${TC_BIN:-$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud}"`.

- **A pairing:** if you paired, `"$TC" courier revoke <their-name>` stops renewing that peer's access. What they could already read lapses when its delegation expires, within 7 days. Before you've approved Courier's grant, it exits 1 with `[no-grant] No OpenKey owner grant is installed`, or with `[no-profile] Missing profile.json` if `init` never got that far; both are fine, there's nothing to revoke.
- **Courier's key:** delete `${COURIER_HOME:-~/.courier}`, where Courier keeps its key and grant: `rm -rf "${COURIER_HOME:-$HOME/.courier}"`. This works whatever the revoke step printed. The grant stays valid on TinyCloud until it expires.
- **The skill and the CLI:** delete `~/.agents/skills/courier` or `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/courier`, and `~/.local/share/tinycloud/cli` if nothing else uses it.
