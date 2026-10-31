#!/bin/sh
# Agent-run owner approval: keep stdin attached to the agent's interactive session for the sign-in's chat code.
# Usage: sh owner-grant.sh healthlog | sh owner-grant.sh recipes
set -eu
if [ -z "${TC_BIN:-}" ]; then W=$HOME/.local/share/tc-apps; TC_BIN=$W/tinycloud; [ -x "$TC_BIN" ] || TC_BIN=$W/tc; fi
DIR=${TC_APPS_STATE:-$HOME/.local/state/tc-apps}
case "${1:-}" in
  healthlog) REQ=meal-request.json; GRANT=meal-grant.json ;;
  recipes) REQ=recipes-request.json; GRANT=recipes-grant.json ;;
  *) echo 'usage: sh owner-grant.sh healthlog | recipes' >&2; exit 2 ;;
esac
# Remove temp files left by a killed run: only this app's mktemp names (six random characters).
rm -f -- "$DIR/$GRANT".??????
if [ ! -f "$DIR/$REQ" ]; then
  echo "No request file at $DIR/$REQ. The agent must create the request first." >&2
  exit 1
fi
# Write to a temp file first: a failed or empty grant must not replace the recorded one.
TMP=$(mktemp "$DIR/$GRANT.XXXXXX")
OWNER_PROFILE=owner
ACTIVE_PID=
printf 'OWNER_GRANT_PID=%s\n' "$$" >&2
# Preserve chat-code input before the shell gives an asynchronous command /dev/null on stdin.
exec 3<&0
cleanup() {
  if [ -n "$ACTIVE_PID" ]; then
    kill -TERM "$ACTIVE_PID" 2>/dev/null || true
    wait "$ACTIVE_PID" 2>/dev/null || true
    ACTIVE_PID=
  fi
  rm -f "$TMP"
}
cancel() { trap '' INT TERM HUP; cleanup; [ -n "${DONE-}" ] || echo 'Cancelled; nothing changed. Tell your agent.' >&2; exit "$1"; }
trap cleanup EXIT
trap 'cancel 130' INT
trap 'cancel 143' TERM
trap 'cancel 129' HUP
# Sign in as the owner first only when the dedicated owner profile does not exist.
PROBE_RC=0
PROBE=$("$TC_BIN" --profile "$OWNER_PROFILE" profile show 2>&1) || PROBE_RC=$?
if [ "$PROBE_RC" -ne 0 ]; then
  case "$PROBE" in
    *PROFILE_NOT_FOUND*)
      echo 'OpenKey sign-in: approve the link and paste the code back to your agent in chat.' >&2
      INIT_RC=0
      "$TC_BIN" init --name "$OWNER_PROFILE" --paste <&3 3<&- &
      ACTIVE_PID=$!
      wait "$ACTIVE_PID" || INIT_RC=$?
      ACTIVE_PID=
      if [ "$INIT_RC" -eq 130 ] || [ "$INIT_RC" -eq 143 ]; then cancel "$INIT_RC"; fi
      if [ "$INIT_RC" -ne 0 ]; then
        echo "Sign-in didn't finish, so nothing was granted. Tell your agent." >&2
        exit 1
      fi
      ;;
    *)
      echo "Couldn't check your TinyCloud sign-in, so nothing was granted. Tell your agent." >&2
      echo "$PROBE" >&2
      exit 1
      ;;
  esac
fi
# Bind only to the explicit signed-in owner, never to the imported grant. Keep an existing binding.
if [ ! -s "$DIR/owner-did.txt" ]; then
  OWNER_DID=$("$TC_BIN" --profile "$OWNER_PROFILE" context --json | jq -er '.ownerDid | select(test("^did:pkh:eip155:[1-9][0-9]*:0x[0-9a-fA-F]{40}$"))') || {
    echo 'Could not read the signed-in owner account; nothing was granted.' >&2
    exit 1
  }
  printf '%s\n' "$OWNER_DID" > "$DIR/owner-did.txt"
fi
RC=0
echo 'Access link: the owner approves it in OpenKey and no code comes back. This step finishes on its own after the approval.' >&2
"$TC_BIN" --profile "$OWNER_PROFILE" auth grant "$DIR/$REQ" <&3 3<&- > "$TMP" &
ACTIVE_PID=$!
wait "$ACTIVE_PID" || RC=$?
ACTIVE_PID=
if [ "$RC" -eq 130 ] || [ "$RC" -eq 143 ]; then cancel "$RC"; fi
if [ "$RC" -eq 3 ]; then
  echo 'APPROVAL_REQUEST_EXPIRED above means the access link expired before it was approved: run this step again for a new link.' >&2
  echo 'Otherwise the owner sign-in has expired. The agent must run owner auth login --method openkey --paste in an interactive session, relay the link and chat code, then run this step again.' >&2
  exit 1
fi
if [ "$RC" -ne 0 ]; then
  echo 'The grant failed, so nothing was saved. Tell your agent.' >&2
  exit 1
fi
if [ ! -s "$TMP" ]; then
  echo 'The grant printed nothing, so nothing was saved. Tell your agent.' >&2
  exit 1
fi
DONE=1
mv -f "$TMP" "$DIR/$GRANT"
# Save the agent host's local IANA zone, including UTC and Etc/*; the page takes precedence.
node -e 'const fs = require("node:fs"); let zone = Intl.DateTimeFormat().resolvedOptions().timeZone; try { if (!zone) throw new Error(); new Intl.DateTimeFormat("en", {timeZone: zone}); } catch { zone = "UTC"; } fs.writeFileSync(process.argv[1], zone + "\n");' "$DIR/owner-timezone.txt"
echo 'Done: approval saved for the agent.'
