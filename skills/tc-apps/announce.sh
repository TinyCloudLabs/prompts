#!/bin/sh
# Owner message for one catalog app, chosen by this computer's approval state.
# Usage: sh announce.sh healthlog | sh announce.sh recipes
# Prints a STATE line for the agent, then the owner message as one fenced block between the BEGIN and END markers.
# AGENT_INSTALL_ENABLED must match TINY-APPS.md §3 (the INSTALL switch).
AGENT_INSTALL_ENABLED=false
TC_BIN=${TC_BIN:-$HOME/.local/share/tc-apps/tc}
DIR=${TC_APPS_STATE:-$HOME/.local/state/tc-apps}
case "$1" in
  healthlog) NAME='Health Log'; MARK=owner-approved; REQ=meal-request.json; GRANT=meal-grant.json ;;
  recipes) NAME=Recipes; MARK=recipes-owner-approved; REQ=recipes-request.json; GRANT=recipes-grant.json ;;
  *) echo 'usage: sh announce.sh healthlog | recipes' >&2; exit 2 ;;
esac
if [ ! -f "$DIR/$MARK" ]; then KIND=FIRST; elif [ "$AGENT_INSTALL_ENABLED" = true ]; then KIND=APPROVED-ON; else KIND=APPROVED-OFF; fi
GRANT_CMD="\"$TC_BIN\" auth grant \"$DIR/$REQ\" > \"$DIR/$GRANT\""
ALLOW='If your browser asks to connect to devices on your network, choose Allow.'
CANCEL="If you cancel a screen, or the terminal doesn't return, press Ctrl-C in that terminal and tell me. If the page shows a code instead, don't send it to me: I'll give you a command to run in your own terminal, and you paste the code there. If the terminal prints an error, tell me the word in it."
echo "STATE: $KIND"
echo 'BEGIN OWNER MESSAGE'
echo '```text'
case "$KIND" in
  FIRST) cat <<EOF
Run this command in your own terminal:

$GRANT_CMD

You may see one or two browser approval screens, one at a time. Approve each one that opens. Together they let me log this in your $NAME app, for 7 days, and nothing else. $ALLOW $CANCEL
EOF
  ;;
  APPROVED-OFF) cat <<EOF
Run this command in your own terminal:

$GRANT_CMD

A browser approval screen will open. Approve it to let me log this in your $NAME app, for 7 days, and nothing else. $ALLOW $CANCEL
EOF
  ;;
  APPROVED-ON) cat <<EOF
Run this command in your own terminal:

$GRANT_CMD

A browser approval screen will open: it installs this app's notes and tables in your TinyCloud, adds entries, and lets me log this in your $NAME app, for 7 days. Approve it. $ALLOW $CANCEL
EOF
  ;;
esac
echo '```'
echo 'END OWNER MESSAGE'
