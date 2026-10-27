#!/bin/sh
# Prints whether the owner's onboarded profile already covers what an app needs, so no per-app approval is asked. It only reads.
#   ONBOARDED <profile> <applications space id>   the profile has a live session and every capability given covers: no new approval
#   NOT_ONBOARDED <reason>    no profile, no live session, or a capability is not covered: use the per-app approval
# Usage: sh onboarded.sh '<cap>' ['<cap>' ...]   each <cap> is tinycloud.<service>:<space>:<path>:<actions-csv>, as `auth caps --diff` reads it
# The profile is TC_ONBOARD_PROFILE if set, else the one `tinycloud onboard` itself uses: TC_PROFILE, else the CLI's default profile.
# The CLI is TC_BETA_BIN, else the setup's cli-beta copy (1.5.0-beta.20 or newer). Exit codes: 0 after printing one line, 2 for no capability.
# It runs no sign-in and creates no profile, grant or file. Needs jq.
set -u
[ "$#" -gt 0 ] || { echo "usage: sh onboarded.sh '<cap>' ['<cap>' ...]" >&2; exit 2; }
command -v jq > /dev/null 2>&1 || { echo 'NOT_ONBOARDED jq is missing'; exit 0; }
B=${TC_BETA_BIN:-}
[ -n "$B" ] || B=$HOME/.local/share/tc-apps/cli-beta/node_modules/.bin/tinycloud
[ -x "$B" ] || { echo 'NOT_ONBOARDED the CLI is missing'; exit 0; }
P=${TC_ONBOARD_PROFILE:-}
run() { if [ -n "$P" ]; then "$B" --profile "$P" "$@"; else "$B" "$@"; fi; }
STATUS=$(run auth status --json < /dev/null 2>&1) || { echo 'NOT_ONBOARDED no signed-in profile'; exit 0; }
printf '%s' "$STATUS" | jq -e '.session.state == "present" and (.ownerDid // "") != ""' > /dev/null 2>&1 || { echo 'NOT_ONBOARDED the profile has no live session'; exit 0; }
NAME=$(printf '%s' "$STATUS" | jq -r '.profile // empty')
case "$NAME" in '' | *[!A-Za-z0-9_-]*) echo 'NOT_ONBOARDED the profile name is not a plain name'; exit 0 ;; esac
SPACE=$(printf '%s' "$STATUS" | jq -r '.ownerDid | sub("^did:"; "tinycloud:") + ":applications"')
for CAP in "$@"; do
  OUT=$(run auth caps --diff "$CAP" < /dev/null 2>&1) || { echo 'NOT_ONBOARDED the grant could not be checked'; exit 0; }
  printf '%s' "$OUT" | jq -e '.covered == true' > /dev/null 2>&1 || { echo "NOT_ONBOARDED the grant does not cover $CAP"; exit 0; }
done
echo "ONBOARDED $NAME $SPACE"
