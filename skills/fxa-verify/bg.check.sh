#!/usr/bin/env bash
# Offline check for verify.sh --bg and wait: wait gives the verdict and its exit code, "still running" is 75,
# and a run that died is 4.
#   bash skills/fxa-verify/bg.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
V="$(cd "$(dirname "$0")" && pwd)/verify.sh"
tmp="$(cd "$(mktemp -d)" && pwd -P)"; trap 'rm -rf "$tmp"' EXIT
export FXA_WORKSPACE="$tmp" FXA_VERIFY_POLL_S=1
cd "$tmp" && git init -q && git -c user.email=t@example.com -c user.name=t commit -q --allow-empty -m init && git update-ref refs/remotes/origin/main HEAD
check "wait with no run says how to start one" 2 "$(bash "$V" wait 1 >/dev/null 2>&1; echo $?)"
check "--bg returns at once" 1 "$(bash "$V" --bg | grep -c 'started in the background')"
out="$(bash "$V" wait 20)"; rc=$?
check "wait gives the run's output and exit code" "0|1" "$rc|$(grep -c 'No changed files' <<< "$out")"
# A run that is still going, then one that died without an exit code.
job="$tmp/.fxa-verify-job"; rm -rf "$job"; mkdir -p "$job"; sleep 30 & echo $! > "$job/pid"; date +%s > "$job/started"; echo busy > "$job/log"
check "a run still going: exit 75 and the last line" "75|1" "$(bash "$V" wait 1 > "$tmp/o"; echo $?)|$(grep -c 'still running.*busy' "$tmp/o")"
check "a second --bg while one runs is refused" 2 "$(bash "$V" --bg >/dev/null 2>&1; echo $?)"
kill $! 2>/dev/null; wait $! 2>/dev/null
check "a run that died: exit 4" 4 "$(bash "$V" wait 1 >/dev/null; echo $?)"
[ "$fail" = 0 ] && echo "all checks pass"; exit "$fail"
