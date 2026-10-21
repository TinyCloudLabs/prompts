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
if [ ! -f "$DIR/$REQ" ]; then
  echo "No request file at $DIR/$REQ. Ask your agent to start the install, then run this again." >&2
  exit 1
fi
if ! "$TC_BIN" auth grant "$DIR/$REQ" > "$DIR/$GRANT"; then
  echo "The grant failed. Tell your agent; do not retry the browser screen." >&2
  exit 1
fi
echo 'Done: tell your agent'
