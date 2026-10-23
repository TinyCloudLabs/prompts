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
# Sign in first only when this computer has no default profile. Any other result stops here.
PROBE_RC=0
PROBE=$("$TC_BIN" profile show default 2>&1) || PROBE_RC=$?
if [ "$PROBE_RC" -ne 0 ]; then
  case "$PROBE" in
    *PROFILE_NOT_FOUND*)
      echo "Signing you in first: \"$TC_BIN\" init --name default --paste"
      INIT_RC=0
      "$TC_BIN" init --name default --paste || INIT_RC=$?
      if [ "$INIT_RC" -eq 130 ] || [ "$INIT_RC" -eq 143 ]; then cancel "$INIT_RC"; fi
      if [ "$INIT_RC" -ne 0 ]; then
        echo 'The grant failed. Tell your agent; do not retry the browser screen.' >&2
        exit 1
      fi
      ;;
    *)
      echo 'The grant failed. Tell your agent; do not retry the browser screen.' >&2
      exit 1
      ;;
  esac
fi
RC=0
"$TC_BIN" auth grant "$DIR/$REQ" > "$TMP" || RC=$?
if [ "$RC" -eq 130 ] || [ "$RC" -eq 143 ]; then cancel "$RC"; fi
if [ "$RC" -ne 0 ]; then
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
