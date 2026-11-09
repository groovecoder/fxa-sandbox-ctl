#!/usr/bin/env bash
# Offline check that the handoff watcher waits for the agent to exit, so a handoff it takes back is not shipped.
#   bash lib/finish-wait.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
eval "$(sed -n '/^finish_wait_for_done() {/,/^}/p' "$(dirname "$0")/finish.sh")"
finish_done_file_path() { echo "$1/.fxa-auto-done.json"; }
_worktree_agent_for_workspace() { echo agent-x; }
_finish_fetch_session_log() { :; }
sleep() { :; }
# The counters live in files: each call can run in a subshell.
n() { local c; c=$(( $(cat "$tmp/$1" 2>/dev/null || echo 0) + 1 )); echo "$c" > "$tmp/$1"; echo "$c"; }
# The agent is alive for its first two polls, then exits.
agent_alive() { [ "$(n alive)" -le 2 ]; }

_handoff_settled() { n settled >/dev/null; return 0; }
finish_wait_for_done "$tmp" 60 2>/dev/null; rc=$?
check "a handoff is taken only after the agent exits" "0|3" "$rc|$(cat "$tmp/alive")"

# The stop hook sends the agent back, and it moves the handoff away before it exits.
rm -f "$tmp/alive" "$tmp/settled"
_handoff_settled() { [ "$(cat "$tmp/alive" 2>/dev/null || echo 0)" -lt 2 ]; }
date() { if [ "${1:-}" = +%s ]; then n clock; else command date "$@"; fi; }
finish_wait_for_done "$tmp" 20 2>/dev/null; rc=$?
check "a handoff that the agent takes back is not taken" "1" "$rc"

[ "$fail" -eq 0 ] && echo "all checks pass"
exit "$fail"
