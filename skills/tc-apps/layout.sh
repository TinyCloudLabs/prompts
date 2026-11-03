#!/bin/sh
# Prints which layout a generic tiny app uses on this computer, then exits 0. It only reads. The checks run in this
# order, the same rule the hosted MCP's move uses:
#   1. a migration receipt here says "verified": true for this app                    -> new
#   2. the app's discovery entry exists in the owner's `applications` space            -> new
#   3. the old place (`default`, xyz.tinycloud.agent-data/) holds the app's catalog    -> legacy
#   4. otherwise                                                                        -> new
# When check 2 or 3 can't be made it prints, instead of guessing:
#   ask          this computer's sign-in can't read there (none, expired, or no grant): ask the owner
#   check-failed the read failed for another reason (for example the network): write nothing, try again later
# Exit codes: 0 after printing one word, 2 for a bad app name, 3 when jq is missing (nothing is printed; install jq).
# Usage: sh layout.sh <app>
# It runs no sign-in and creates no profile or grant. A receipt counts only when it says "verified": true for this app.
set -u
slug=${1:-}
case "$slug" in [a-z]*) ;; *) echo 'usage: sh layout.sh <app>' >&2; exit 2 ;; esac
case "$slug" in *[!a-z0-9-]*) echo 'usage: sh layout.sh <app>' >&2; exit 2 ;; esac
case "$slug" in catalog|index-stale|healthlog|recipes) echo "'$slug' is a reserved name and cannot be a generic app." >&2; exit 2 ;; esac
command -v jq > /dev/null 2>&1 || { echo 'jq is needed. Install it, then run this again.' >&2; exit 3; }
# The same CLI as every TinyCloud skill: process TC_BIN, then /agent's agent.env, then the shared private install, then `tinycloud` on PATH.
if [ -z "${TC_BIN:-}" ]; then
  if [ -r "$HOME/.config/tinycloud/agent-env.mjs" ]; then TC_BIN=$(node "$HOME/.config/tinycloud/agent-env.mjs" get TC_BIN) || { [ $? -eq 1 ] || exit 3; TC_BIN=; }; fi
  [ -n "${TC_BIN:-}" ] || TC_BIN="$HOME/.local/share/tinycloud/cli/node_modules/.bin/tinycloud"
  [ -x "$TC_BIN" ] || TC_BIN=$(command -v tinycloud) || exit 3
fi
STATE=${TC_APPS_STATE:-$HOME/.local/state/tc-apps}
R=xyz.tinycloud.agent-data
# unchecked <output>: a read that could not be made. No usable sign-in or grant asks the owner; anything else is a failure.
unchecked() {
  case "$1" in
    *PROFILE_NOT_FOUND* | *AUTH_REQUIRED* | *AUTH_EXPIRED* | *AUTH_UNAUTHORIZED* | *PERMISSION_DENIED* | *"SIWE is expired"*) echo ask ;;
    *) echo check-failed ;;
  esac
  exit 0
}
# 1. The receipt.
if jq -e --arg a "$slug" '.verified == true and .app == $a' "$STATE/migration/$slug.receipt.json" > /dev/null 2>&1; then
  echo new
  exit 0
fi
# 2. The discovery entry, read with the profile, host and full `applications` space that app-context.mjs selects for this
# app (SKILL.md §3). No selected profile with a host and space means no usable sign-in or grant there yet: ask.
CTX=$(node "$(dirname "$0")/app-context.mjs" "$TC_BIN" "$slug" < /dev/null 2>&1) || unchecked "$CTX"
SEL=$(printf '%s\n' "$CTX" | jq -r '[.profile, .host, .spaceId] | if all(type == "string" and . != "") then @tsv else "" end' 2> /dev/null) || unchecked "$CTX"
[ -n "$SEL" ] || { echo ask; exit 0; }
TAB=$(printf '\t')
P=${SEL%%"$TAB"*}; SPACE=${SEL##*"$TAB"}; HOST=${SEL#*"$TAB"}; HOST=${HOST%"$TAB"*}
E=xyz.tinycloud.tinyapps.catalog/$slug/entry
ERR=$("$TC_BIN" --profile "$P" --host "$HOST" kv get "$E" --space "$SPACE" --json < /dev/null 2>&1 > /dev/null); RC=$?
if [ "$RC" -eq 0 ]; then
  echo new
  exit 0
fi
# The CLI reports the node's KV_NOT_FOUND for this key, and only that, as NOT_FOUND (exit 4) with this message.
[ "$RC" -eq 4 ] && printf '%s\n' "$ERR" | jq -se --arg m "Key \"$E\" not found" 'any(.[]; try (.error.code == "NOT_FOUND" and .error.message == $m) catch false)' > /dev/null 2>&1 || unchecked "$ERR"
# 3. The old catalog.
OUT=$("$TC_BIN" kv list --prefix "$R/catalog/" --space default --all --json --profile agent-data < /dev/null 2>&1) || unchecked "$OUT"
if printf '%s\n' "$OUT" | jq -e --arg k "$R/catalog/$slug" '.keys | map(. == $k) | any' > /dev/null 2>&1; then echo legacy; else echo new; fi
exit 0
