#!/bin/sh
# Agent-run, owner-requested step: end Health Log access early in an interactive tool session.
# Usage: sh owner-undo.sh
# Relay each [y/N] confirmation through chat to this session, and any OpenKey link to the owner (no code comes back). PROFILE_NOT_FOUND on logout or delete is fine.
set -u
if [ -z "${TC_BIN:-}" ]; then W=$HOME/.local/share/tc-apps; TC=$W/tinycloud; [ -x "$TC" ] || TC=$W/tc; else TC=$TC_BIN; fi
STATE="${TC_APPS_STATE:-$HOME/.local/state/tc-apps}"
REVOKED=0
cancel() { if [ "$REVOKED" -eq 0 ]; then echo "Cancelled. Your agent's local access is already removed, but the grant itself was not revoked. Run this again to finish." >&2; else echo 'Cancelled; some access was already revoked. Tell your agent.' >&2; fi; exit "$1"; }
trap 'cancel 130' INT
trap 'cancel 143' TERM
trap 'cancel 129' HUP
"$TC" --profile agent-data auth logout
"$TC" --profile agent-data-sql auth logout
"$TC" profile delete agent-meal
if [ ! -e "$STATE/meal-grant.json" ]; then
  echo 'No recorded grant to revoke. Nothing was revoked.'
  exit 0
fi
if ! command -v jq > /dev/null 2>&1; then
  echo 'jq is needed to read the grant id, so nothing was revoked. Without jq, the agent can read delegationCid from meal-grant.json and run delegation revoke -- <cid> with the same client in an interactive tool session, relaying confirmations and any OpenKey link through chat.' >&2
  exit 1
fi
CIDS=$(jq -r '.delegationCid // empty' "$STATE/meal-grant.json" 2>/dev/null | grep -E '^bafkr4i[a-z2-7]{52}$' || true)
if [ -z "$CIDS" ]; then
  echo 'No valid grant id was found in meal-grant.json, so nothing was revoked. Tell your agent.' >&2
  exit 1
fi
FAIL=0
for CID in $CIDS; do
  "$TC" delegation revoke -- "$CID" < /dev/tty; RC=$?
  if [ "$RC" -eq 0 ]; then REVOKED=1; elif [ "$RC" -eq 130 ] || [ "$RC" -eq 143 ]; then cancel "$RC"; else FAIL=1; fi
done
if [ "$FAIL" -ne 0 ]; then
  echo 'A revoke failed. Tell your agent; do not retry the browser screen.' >&2
  exit 1
fi
echo 'Done: tell your agent'
