#!/usr/bin/env bash
# Offline check for gh_red_rerun: one rerun of the failed jobs for each head sha, only when every
# failed check logs an outside fault.
#   bash lib/red-rerun.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
source "$(dirname "$0")/github.sh"
pipeline_require() { :; }
github_app_enabled() { :; }
github_app_token() { echo tok; }
worktree_branch_for() { printf '%s\n' "$1" | tr '[:upper:]' '[:lower:]'; }
PIPE_STATE_DIR="$tmp" PIPE_REPO_SLUG="mozilla-services/syncstorage-rs"
# $tmp/sha: the head; $tmp/checks: the rollup; $tmp/log.<job>: each job's failed log; $tmp/refuse: rerun fails.
gh() {
  case "$1 $2" in
    "pr list") printf '[{"number":7,"headRefOid":"%s","statusCheckRollup":[%s]}]' "$(cat "$tmp/sha")" "$(cat "$tmp/checks")" ;;
    "run view") cat "$tmp/log.$7" 2>/dev/null ;;
    "api -X") echo "$4" >> "$tmp/reruns"; [ ! -e "$tmp/refuse" ] ;;
    "pr comment") echo x >> "$tmp/comments" ;;
  esac
}
c() { printf '{"name":"%s","conclusion":"FAILURE","detailsUrl":"%s"}' "$1" "$2"; }
n() { [ -f "$tmp/$1" ] && wc -l < "$tmp/$1" | tr -d ' ' || echo 0; }
echo s1 > "$tmp/sha"
echo "$(c spanner-e2e https://github.com/x/actions/runs/41/job/1),$(c recon-e2e https://github.com/x/actions/runs/41/job/2)" > "$tmp/checks"
printf 'spanner-e2e\tUNKNOWN STEP\t2026-11-03T20:40:10.88Z E   fxa.errors.ServerError: An internal server error occurred\n' > "$tmp/log.1"
printf 'recon-e2e\tUNKNOWN STEP\t2026-11-03T20:40:11.05Z ERROR: 503 Service Unavailable\n' > "$tmp/log.2"

why="$(gh_red_rerun STOR-1)"; rc=$?
check "every red logs an outside fault: rerun" "0" "$rc"
check "one rerun call for the one run" "1|actions/runs/41/rerun-failed-jobs" "$(n reruns)|$(sed 's#^repos/[^/]*/[^/]*/##' "$tmp/reruns")"
check "one PR comment" "1" "$(n comments)"
check "why names the check and the line" "spanner-e2e: E   fxa.errors.ServerError: An internal server error occurred" "${why%%;*}"
check "same sha again: no second rerun" "1|1" "$(gh_red_rerun STOR-1 >/dev/null; echo $?)|$(n reruns)"

echo s2 > "$tmp/sha"
printf 'recon-e2e\tUNKNOWN STEP\t2026-11-03T20:40:11.05Z assert 3 == 4\n' > "$tmp/log.2"
check "a red with no outside fault: no rerun" "1|1" "$(gh_red_rerun STOR-1 >/dev/null; echo $?)|$(n reruns)"

echo s3 > "$tmp/sha"
echo "$(c "ci/circleci: Unit Test" https://app.circleci.com/pipelines/gh/x/1)" > "$tmp/checks"
check "a CircleCI check: no rerun yet" "1|1" "$(gh_red_rerun STOR-1 >/dev/null; echo $?)|$(n reruns)"

echo s4 > "$tmp/sha"
echo "$(c spanner-e2e https://github.com/x/actions/runs/42/job/1)" > "$tmp/checks"
touch "$tmp/refuse"
check "a refused rerun is a normal red, tried once" "1|s4|1" "$(gh_red_rerun STOR-1 2>/dev/null >/dev/null; echo $?)|$(head -1 "$tmp/STOR-1.reran")|$(n comments)"
rm -f "$tmp/refuse"

echo s5 > "$tmp/sha"
check "PIPE_RERUN_INFRA=0: no rerun" "1|2" "$(PIPE_RERUN_INFRA=0 gh_red_rerun STOR-1 >/dev/null; echo $?)|$(n reruns)"

[ "$fail" = 0 ] && echo "all checks pass"; exit "$fail"
