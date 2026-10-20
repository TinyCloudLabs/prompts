#!/bin/sh
# tc-apps: runs the TinyCloud CLI named in cli-path, next to this script. A kv or sql command that fails with
# NETWORK_ERROR (a dropped connection, "fetch failed") runs again, up to twice, after 2 s and 4 s; only the last
# attempt's error is shown. The setup at agents.tinycloud.xyz/apps copies this file to ~/.local/share/tc-apps/tc.
# Wrapper diagnostic contract 1.0.0. Optional; only an explicit tc-apps block can admit it.
CLI=$(cat "$(dirname "$0")/cli-path")
case "$1" in kv|sql) ;; *) exec "$CLI" "$@" ;; esac
case " $* " in *" --stdin "*) IN=$(cat) ;; *) IN= ;; esac
exec 3>&1
_TC_DIAG_STATE=
case "${TC_DIAGNOSTICS_CONTEXT-}" in
  *'"scope"'*) _TC_DIAG_STATE=$("$CLI" diagnostics _wrapper begin "$1" </dev/null 2>/dev/null 3>&-) || _TC_DIAG_STATE= ;;
esac
for n in 1 2 3; do
  _TC_DIAG_CHILD=
  if [ -n "$_TC_DIAG_STATE" ]; then
    _TC_DIAG_REPLY=$(TC_DIAGNOSTICS_WRAPPER_STATE="$_TC_DIAG_STATE" "$CLI" diagnostics _wrapper child "$n" </dev/null 2>/dev/null 3>&-) || _TC_DIAG_REPLY=
    case "$_TC_DIAG_REPLY" in
      *'
'*) _TC_DIAG_STATE=${_TC_DIAG_REPLY%%'
'*}; _TC_DIAG_CHILD=${_TC_DIAG_REPLY#*'
'} ;;
      *) _TC_DIAG_STATE= ;;
    esac
  fi
  if [ -n "$_TC_DIAG_CHILD" ]; then
    E=$(printf '%s\n' "$IN" | TC_DIAGNOSTICS_CONTEXT="$_TC_DIAG_CHILD" "$CLI" "$@" 2>&1 >&3 3>&-); c=$?
  else
    E=$(printf '%s\n' "$IN" | "$CLI" "$@" 2>&1 >&3 3>&-); c=$?
  fi
  _TC_DIAG_DECISION=stop
  [ $c -ne 0 ] && [ $n -lt 3 ] && case "$E" in *NETWORK_ERROR*) _TC_DIAG_DECISION=retry ;; esac
  if [ -n "$_TC_DIAG_STATE" ]; then
    _TC_DIAG_STATE=$(TC_DIAGNOSTICS_WRAPPER_STATE="$_TC_DIAG_STATE" "$CLI" diagnostics _wrapper finish "$n" "$c" "$_TC_DIAG_DECISION" </dev/null 2>/dev/null 3>&-) || _TC_DIAG_STATE=
  fi
  [ "$_TC_DIAG_DECISION" = retry ] && { sleep $((n * 2)); continue; }
  break
done
[ -z "$E" ] || printf '%s\n' "$E" >&2
exit $c
