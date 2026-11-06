#!/usr/bin/env bash
# Offline check of `launch --rebase`: a rebase round has its own cap of 5, is not in the 24 h
# budget, and a refused launch writes no ledger line.
#   bash lib/launch-rebase.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
here="$(cd "$(dirname "$0")" && pwd)"
eval "$(sed -n '/^_FXA_REBASE_CAP=/p;/^pipeline_rebases() {/,/^}/p;/^pipeline_rebase_refusal() {/,/^}/p;/^pipeline_launches_24h() {/,/^}/p' "$here/pipeline.sh")"
eval "$(sed -n '/^cmd_launch() {/,/^}/p' "$here/../fxa-sandbox-ctl")"
PIPE_STATE_DIR="$tmp"; PIPE_MAX_LAUNCHES_PER_DAY=2; PIPE_MIN_FREE_GB=1; _SESSION_STAMP_PL=x; PIPE_NAME=fxa
# The launch itself, stubbed: nohup is a function here, so nothing starts.
nohup() { :; }; pipeline_require() { :; }; _launch_slot_for() { echo "$2"; }; pipeline_free_gb() { echo 99; }
pipeline_holding_new() { return 1; }; pipeline_launch_log() { echo "$tmp/$1.launch.log"; }
worktree_repo_root() { return 1; }; worktree_key_for() { :; }; telemetry_record() { :; }; pipeline_skip_clear() { :; }
lines() { wc -l < "$tmp/launches.log" | tr -d ' '; }
now="$(date +%s)"; printf '%s FXA-1 s1\n%s FXA-2 s2\n' "$now" "$now" > "$tmp/launches.log"

out="$(cmd_launch FXA-3 s3 2>&1; echo "rc=$?")"
check "a fix launch at the 24 h budget refuses" "rc=1|2" "$(tail -1 <<< "$out")|$(lines)"
cmd_launch FXA-3 s3 --rebase >/dev/null 2>&1
check "a rebase launch at the 24 h budget goes ahead, and its line says rebase" "3|rebase" "$(lines)|$(tail -1 "$tmp/launches.log" | cut -d' ' -f4)"
check "a rebase line is not in the 24 h budget" "2" "$(pipeline_launches_24h | wc -l | tr -d ' ')"
echo 5 > "$tmp/FXA-4.rebases"
out="$(cmd_launch FXA-4 s3 --rebase 2>&1; echo "rc=$?")"
check "5 rebases refuse before the ledger" "rc=1|3" "$(tail -1 <<< "$out")|$(lines)"
printf '1\toperator\twait\n' > "$tmp/FXA-5.blocked-why"
out="$(cmd_launch FXA-5 s3 --rebase 2>&1; echo "rc=$?")"
check "blocked operator refuses a rebase before the ledger" "rc=1|3|1" "$(tail -1 <<< "$out")|$(lines)|$(grep -c 'blocked (operator)' <<< "$out")"
printf '1\tattempts\tred\n' > "$tmp/FXA-6.blocked-why"
cmd_launch FXA-6 s3 --rebase >/dev/null 2>&1
check "blocked attempts may rebase" "4" "$(lines)"
[ "$fail" = 0 ] && echo "all checks pass"; exit "$fail"
