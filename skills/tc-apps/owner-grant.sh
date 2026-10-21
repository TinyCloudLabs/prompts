#!/bin/sh
# Owner step: finish the approval for one catalog app. Run in your own terminal.
# Usage: sh owner-grant.sh healthlog | sh owner-grant.sh recipes
set -eu
TC_BIN=${TC_BIN:-$HOME/.local/share/tc-apps/tc}
DIR=${TC_APPS_STATE:-$HOME/.local/state/tc-apps}
case "${1:-}" in
  healthlog) REQ=meal-request.json; GRANT=meal-grant.json ;;
  recipes) REQ=recipes-request.json; GRANT=recipes-grant.json ;;
  *) echo 'usage: sh owner-grant.sh healthlog | recipes' >&2; exit 2 ;;
esac
# Remove temp files left by a killed run: only this app's mktemp names (six random characters).
rm -f -- "$DIR/$GRANT".??????
if [ ! -f "$DIR/$REQ" ]; then
  echo "No request file at $DIR/$REQ. Ask your agent to start the install, then run this again." >&2
  exit 1
fi
# Write to a temp file first: a failed or empty grant must not replace the recorded one.
TMP=$(mktemp "$DIR/$GRANT.XXXXXX")
cleanup() { rm -f "$TMP"; }
cancel() { cleanup; [ -n "${DONE-}" ] || echo 'Cancelled; nothing changed. Tell your agent.' >&2; exit "$1"; }
trap cleanup EXIT
trap 'cancel 130' INT
trap 'cancel 143' TERM
trap 'cancel 129' HUP
if ! "$TC_BIN" auth grant "$DIR/$REQ" > "$TMP"; then
  echo 'The grant failed. Tell your agent; do not retry the browser screen.' >&2
  exit 1
fi
if [ ! -s "$TMP" ]; then
  echo 'The grant printed nothing. Tell your agent; do not retry the browser screen.' >&2
  exit 1
fi
DONE=1
mv -f "$TMP" "$DIR/$GRANT"
echo 'Done: tell your agent'
