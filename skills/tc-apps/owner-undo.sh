#!/bin/sh
# Owner step: end the Health Log access early. Run in your own terminal, not in an agent's shell.
# Usage: sh owner-undo.sh
# Each revoke asks [y/N] in this terminal. A logout or delete that reports PROFILE_NOT_FOUND is fine: you never signed in to it.
set -u
TC="${TC_BIN:-$HOME/.local/share/tc-apps/tc}"
STATE="${TC_APPS_STATE:-$HOME/.local/state/tc-apps}"
"$TC" --profile agent-data auth logout
"$TC" --profile agent-data-sql auth logout
"$TC" profile delete agent-meal
CIDS=$(jq -r '.delegationCid // empty' "$STATE/meal-grant.json" 2>/dev/null | grep -E '^bafkr4i[a-z2-7]{52}$' || true)
FAIL=0
for CID in $CIDS; do
  "$TC" delegation revoke -- "$CID" < /dev/tty || FAIL=1
done
if [ "$FAIL" -ne 0 ]; then
  echo 'A revoke failed. Tell your agent; do not retry the browser screen.' >&2
  exit 1
fi
echo 'Done: tell your agent'
