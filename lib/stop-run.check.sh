#!/usr/bin/env bash
# Offline check of `stop-run KEY` and of the launcher kill when a label finds no VM yet.
#   bash lib/stop-run.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
tmp="$(mktemp -d)"; trap 'kill "${fake:-0}" 2>/dev/null; rm -rf "$tmp"' EXIT
here="$(dirname "$0")"
eval "$(sed -n '/^cmd_stop_run() {/,/^}/p; /^_reap_key() {/,/^}/p' "$here/../fxa-sandbox-ctl")"
eval "$(sed -n '/^agent_kill_launcher() {/,/^}/p' "$here/agent.sh")"
_key() { echo "$1"; }
jira_inflight_keys() { printf 'fxa-1\n'; }
cmd_label() { echo "$*" >> "$tmp/labels"; }

cmd_stop_run FXA-1 >/dev/null 2>&1; rc=$?
check "an inflight ticket: labelled blocked operator with the fixed reason" "0|FXA-1 blocked operator stopped from the dashboard by a team admin" "$rc|$(cat "$tmp/labels")"
rm -f "$tmp/labels"
out="$(cmd_stop_run FXA-2 2>&1)"; rc=$?
check "a ticket that is not inflight any more: exit 2 (a 409), no label" "2|none|yes" "$rc|$(cat "$tmp/labels" 2>/dev/null || echo none)|$(grep -q 'not inflight' <<<"$out" && echo yes)"

# A launcher that still boots: no VM, no PR line in its log. Its command line holds "jira FXA-7 ".
worktree_branch_for() { echo fxa-7; }; vm_is_running() { return 1; }; pipeline_launch_log() { echo "$tmp/launch.log"; }
: > "$tmp/launch.log"
# Its own process group, as a launcher of an earlier pass: kill skips the caller's group.
perl -e 'setpgrp(0, 0); exec { "sleep" } "fxa-sandbox-ctl jira FXA-7 x", "60"' & fake=$!
sleep 0.3
check "label with no VM: no-vm, and the booting launcher is killed" "fxa-7 no-vm|dead" \
  "$(_reap_key fxa-7)|$(sleep 0.3; kill -0 "$fake" 2>/dev/null && echo alive || echo dead)"
wait "$fake" 2>/dev/null

echo 'PR opened: https://github.com/mozilla/fxa/pull/41' > "$tmp/launch.log"
perl -e 'setpgrp(0, 0); exec { "sleep" } "fxa-sandbox-ctl jira FXA-7 x", "60"' & fake=$!
sleep 0.3; _reap_key fxa-7 >/dev/null
check "a launcher past its PR is a CI watcher: left alive" "alive" "$(sleep 0.3; kill -0 "$fake" 2>/dev/null && echo alive || echo dead)"
kill "$fake"; wait "$fake" 2>/dev/null
exit "$fail"
