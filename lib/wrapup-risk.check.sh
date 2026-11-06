#!/usr/bin/env bash
# Offline check that the Open PR wrap-up asks for risk_notes with its 'Would not catch:' line,
# so the handoff check does not send the agent back for it.
#   bash lib/wrapup-risk.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
eval "$(sed -n '/^_session_wrapup_steps() {/,/^}/p' "$(dirname "$0")/session.sh")"
runtime_skill_ref() { echo "/$1"; }; session_get() { :; }
out="$(_session_wrapup_steps agent-x 2>/dev/null | tr '\n' ' ')"
check "the PR wrap-up names risk_notes among the keys" 1 "$(grep -c 'commit_body, risk_notes, media_paths' <<< "$out")"
check "and the line it must hold" 1 "$(grep -c "risk_notes: a line 'Would not catch:" <<< "$out")"
[ "$fail" = 0 ] && echo "all checks pass"; exit "$fail"
