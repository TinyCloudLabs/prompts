#!/bin/sh
# Owner message for one catalog app, chosen by this computer's approval state.
# Usage: sh announce.sh healthlog | sh announce.sh recipes
# Prints a STATE line for the agent, then the owner message between the BEGIN and END markers.
# AGENT_INSTALL_ENABLED must match TINY-APPS.md §3 (the INSTALL switch).
AGENT_INSTALL_ENABLED=false
DIR=${TC_APPS_STATE:-$HOME/.local/state/tc-apps}
case "$1" in
  healthlog) NAME='Health Log'; MARK=owner-approved; ACCESS="read it, add, change and delete its entries, save notes and preference files in it, and it can create, change and delete this app's tables" ;;
  recipes) NAME=Recipes; MARK=recipes-owner-approved; ACCESS='read it, add, change and delete its entries, save notes and preference files in it' ;;
  *) echo 'usage: sh announce.sh healthlog | recipes' >&2; exit 2 ;;
esac
if [ ! -f "$DIR/$MARK" ]; then KIND=FIRST; elif [ "$AGENT_INSTALL_ENABLED" = true ]; then KIND=APPROVED-ON; else KIND=APPROVED-OFF; fi
echo "STATE: $KIND"
echo 'BEGIN OWNER MESSAGE'
case "$KIND" in
  FIRST) cat <<EOF
TinyCloud is a place you control. Setup takes two steps: first you sign in to, or create, your OpenKey so I know who you are; then you give me permission to do what you asked.
I'll send the OpenKey links one at a time. The first time on this computer there are two approvals: your own sign-in, then permission for this app. If you're already signed in, only the app approval is needed.
EOF
  ;;
  APPROVED-OFF|APPROVED-ON) echo "I'll send you an OpenKey link for this app's approval." ;;
esac
cat <<EOF
The app permission lets me work in your $NAME app for 7 days: $ACCESS.
Open each link I send, approve in OpenKey, then paste the code back to me here in chat. I'll finish each step and carry on. You don't need a separate terminal.
If your browser asks to connect to devices on your network, choose Allow. If you cancel, tell me here and I'll stop.
EOF
echo 'END OWNER MESSAGE'
