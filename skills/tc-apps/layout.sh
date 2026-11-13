#!/bin/sh
# Prints which layout a generic tiny app uses on this computer, then exits 0. It only reads.
#   new          a verified move exists here (migration receipt), or the old place holds no records for the app
#   legacy       the old place (`default`, xyz.tinycloud.agent-data/) holds records for the app and no verified move exists
#   ask          the old place can't be listed because this computer's earlier sign-in for it is expired or lacks the grant, or because the entry can't be read and the old catalog holds the app. Never a question to the owner: see SKILL.md §1a
#                A computer that never signed in to the old place has nothing to read there: it prints new, not ask.
#   check-failed the listing failed for another reason (for example the network): write nothing, try again later
# Exit codes: 0 after printing one word, 2 for a bad app name, 3 when jq is missing (nothing is printed; install jq).
# Usage: sh layout.sh <app>
# The CLI is the one SKILL.md §1 selects (stable pin there). A CLI that rejects `kv list --all` (older than the pin) lists the old catalog in
# one call instead; a listing that says it is truncated is check-failed, never a guess.
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
# old_unchecked <output>: the old catalog could not be listed. No earlier sign-in for the old place on this computer (no profile, or a
# profile that never signed in) means nothing there can be read: the app starts in the new layout. Anything else goes by unchecked.
old_unchecked() {
  case "$1" in
    *PROFILE_NOT_FOUND* | *AUTH_REQUIRED*) echo new; exit 0 ;;
  esac
  unchecked "$1"
}
# old_list [--all]: one listing of the old catalog.
old_list() { "$TC_BIN" kv list --prefix "$R/catalog/" --space default "$@" --json --profile agent-data < /dev/null 2>&1; }
# 1. The receipt.
if jq -e --arg a "$slug" '.verified == true and .app == $a' "$STATE/migration/$slug.receipt.json" > /dev/null 2>&1; then
  echo new
  exit 0
fi
# 2. The discovery entry, read with the profile, host and full `applications` space that app-context.mjs selects for this
# app (SKILL.md §3). No selected profile with a host and space means the entry can't be read here (not onboarded, or no
# usable grant yet): UNREAD, and the old catalog (step 3) is the only other thing to look at.
CTX=$(node "$(dirname "$0")/app-context.mjs" "$TC_BIN" "$slug" < /dev/null 2>&1) || unchecked "$CTX"
SEL=$(printf '%s\n' "$CTX" | jq -r '[.profile, .host, .spaceId] | if all(type == "string" and . != "") then @tsv else "" end' 2> /dev/null) || unchecked "$CTX"
UNREAD=
if [ -z "$SEL" ]; then
  UNREAD=1
else
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
fi
# 3. The old catalog. A CLI without `--all` lists it in one call; a listing that says it is truncated can't decide.
OUT=$(old_list --all) || case "$OUT" in
  *"unknown option '--all'"*)
    OUT=$(old_list) || old_unchecked "$OUT"
    if printf '%s\n' "$OUT" | jq -e '.truncated == true or (.nextCursor | type == "string")' > /dev/null 2>&1; then echo check-failed; exit 0; fi ;;
  *) old_unchecked "$OUT" ;;
esac
if printf '%s\n' "$OUT" | jq -e --arg k "$R/catalog/$slug" '.keys | map(. == $k) | any' > /dev/null 2>&1; then
  # The old catalog holds the app; with no way to read the entry here, the layout can't be told.
  if [ -n "$UNREAD" ]; then echo ask; else echo legacy; fi
else echo new; fi
exit 0
