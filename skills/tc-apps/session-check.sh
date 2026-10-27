#!/bin/sh
# The session check: one marked line in the global instructions of the owner's coding agents on this
# computer, asking each new session to check the owner's TinyCloud context first (CONTEXT.md). It only
# ever adds, finds or removes lines that end with the marker below, and never changes another line.
#   sh session-check.sh status <client>   prints on, declined or off, then "clients: …", the agents `add` covers
#   sh session-check.sh add <client>      adds the line for <client> (the agent running it) and every other agent found here
#   sh session-check.sh remove            removes the marked line from every file that has it
#   sh session-check.sh decline           records the owner's "no" on this computer, so the setup doesn't ask again
# <client> is claude-code, codex or opencode. Each agent's file is the global instructions file its docs name:
#   Claude Code  ${CLAUDE_CONFIG_DIR:-~/.claude}/CLAUDE.md
#   Codex        ${CODEX_HOME:-~/.codex}/AGENTS.override.md if it exists, else AGENTS.md in that folder
#   OpenCode     ~/.config/opencode/AGENTS.md; if it doesn't exist but ~/.claude/CLAUDE.md does, OpenCode
#                reads that file instead, and a new AGENTS.md would stop it, so the line goes there
# An agent counts as found when its folder exists (~/.claude, ~/.codex, ~/.config/opencode, or the folders
# set by CLAUDE_CONFIG_DIR and CODEX_HOME). Exit codes: 0 done, 1 a file couldn't be changed, 2 bad usage.
set -u
MARK='<!-- tinycloud-context -->'
STATE=${TC_APPS_STATE:-$HOME/.local/state/tc-apps}
CLAUDE_DIR=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
CODEX_DIR=${CODEX_HOME:-$HOME/.codex}
OPENCODE_DIR=$HOME/.config/opencode
SELF=$(cd "$(dirname "$0")" && pwd)

usage() { echo 'usage: sh session-check.sh status|add <claude-code|codex|opencode>, or remove, or decline' >&2; exit 2; }
client_ok() { case "${1:-}" in claude-code|codex|opencode) ;; *) usage ;; esac; }

file_for() {
  case "$1" in
    claude-code) echo "$CLAUDE_DIR/CLAUDE.md" ;;
    codex) if [ -f "$CODEX_DIR/AGENTS.override.md" ]; then echo "$CODEX_DIR/AGENTS.override.md"; else echo "$CODEX_DIR/AGENTS.md"; fi ;;
    opencode) if [ ! -f "$OPENCODE_DIR/AGENTS.md" ] && [ -f "$HOME/.claude/CLAUDE.md" ]; then echo "$HOME/.claude/CLAUDE.md"; else echo "$OPENCODE_DIR/AGENTS.md"; fi ;;
  esac
}
dir_for() { case "$1" in claude-code) echo "$CLAUDE_DIR" ;; codex) echo "$CODEX_DIR" ;; opencode) echo "$OPENCODE_DIR" ;; esac; }
# The skill folder whose CONTEXT.md the line names: the agent's own install, else any install, else this script's folder.
skill_for() {
  case "$1" in claude-code) own=$CLAUDE_DIR/skills/tc-apps ;; *) own=$HOME/.agents/skills/tc-apps ;; esac
  for d in "$own" "$CLAUDE_DIR/skills/tc-apps" "$HOME/.agents/skills/tc-apps" "$SELF"; do
    if [ -f "$d/CONTEXT.md" ]; then echo "$d"; return; fi
  done
  echo "$SELF"
}
# The running agent, then every other agent whose folder exists.
clients() {
  echo "$1"
  for c in claude-code codex opencode; do
    [ "$c" = "$1" ] && continue
    [ -d "$(dir_for "$c")" ] && echo "$c"
  done
  return 0
}
has_mark() { [ -f "$1" ] && grep -qF "$MARK" "$1"; }

cmd=${1:-}
case "$cmd" in
  status)
    client_ok "${2:-}"
    if has_mark "$(file_for "$2")"; then echo on
    elif [ "$(cat "$STATE/session-check" 2>/dev/null)" = no ]; then echo declined
    else echo off; fi
    echo "clients: $(clients "$2" | tr '\n' ' ' | sed 's/ $//')"
    ;;
  add)
    client_ok "${2:-}"
    rc=0
    seen=' '
    for c in $(clients "$2"); do
      f=$(file_for "$c")
      case "$seen" in *" $f "*) continue ;; esac
      seen="$seen$f "
      if has_mark "$f"; then echo "already there: $f"; continue; fi
      line="Before your first answer in a session, check my TinyCloud context: follow $(skill_for "$c")/CONTEXT.md (tc-apps skill, context app). Save new facts I tell you there. $MARK"
      if mkdir -p "$(dirname "$f")" 2>/dev/null \
        && { [ ! -s "$f" ] || [ -z "$(tail -c 1 "$f")" ] || printf '\n' >> "$f"; } 2>/dev/null \
        && printf '%s\n' "$line" >> "$f" 2>/dev/null; then
        echo "added: $f"
      else
        echo "could not change: $f"
        rc=1
      fi
    done
    [ "$rc" -eq 0 ] && rm -f "$STATE/session-check"
    exit "$rc"
    ;;
  remove)
    rc=0
    for f in "$CLAUDE_DIR/CLAUDE.md" "$HOME/.claude/CLAUDE.md" "$CODEX_DIR/AGENTS.override.md" "$CODEX_DIR/AGENTS.md" "$OPENCODE_DIR/AGENTS.md"; do
      has_mark "$f" || continue
      # Rewrite in place, so a linked file stays linked and keeps its mode; every other byte is kept.
      if node -e 'const fs = require("fs"); const [f, m] = process.argv.slice(1); const s = fs.readFileSync(f, "utf8"); fs.writeFileSync(f, s.split(/(?<=\n)/).filter((l) => !l.includes(m)).join(""));' "$f" "$MARK"; then
        echo "removed: $f"
      else
        echo "could not change: $f"
        rc=1
      fi
    done
    exit "$rc"
    ;;
  decline)
    mkdir -p "$STATE" && printf 'no\n' > "$STATE/session-check" && echo declined
    ;;
  *) usage ;;
esac
