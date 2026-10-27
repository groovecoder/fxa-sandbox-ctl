#!/usr/bin/env bash
# Offline check of `ci-cause`: it finds the ticket's PR and hands only the failed checks' links to circleci_digests.
#   bash lib/ci-cause.check.sh
set -u
here="$(cd "$(dirname "$0")" && pwd)"; fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
eval "$(sed -n '/^cmd_ci_cause() {/,/^}/p' "$here/../fxa-sandbox-ctl")"
PIPE_REPO_SLUG=mozilla/fxa
_key() { echo "$1"; }; worktree_branch_for() { echo "fxa-6803"; }
gh() { case "$*" in
  "pr list --repo mozilla/fxa --state open --head fxa-6803"*) echo 21608 ;;
  "pr checks 21608"*) printf 'Lint (PR)\tpass\t0\thttps://circleci.com/gh/mozilla/fxa/1\nBuild (PR)\tfail\t0\thttps://circleci.com/gh/mozilla/fxa/2\ntest_pull_request\tfail\t2m\thttps://app.circleci.com/workflow/w\n'; return 1 ;;
  "pr checks 7"*) printf 'Lint (PR)\tpass\t0\thttps://circleci.com/gh/mozilla/fxa/1\n' ;;
  *) return 1 ;; esac; }
circleci_digests() { printf '%s' "$1" | paste -sd' ' -; }
check "a ticket's PR hands only its failed checks to the digest" "https://circleci.com/gh/mozilla/fxa/2 https://app.circleci.com/workflow/w" "$(cmd_ci_cause FXA-6803)"
check "a PR number works too, and a green PR says so" "PR #7: no failed check" "$(cmd_ci_cause 7)"
check "no open PR is an error" "1" "$(worktree_branch_for() { echo none; }; cmd_ci_cause FXA-1 2>/dev/null; echo $?)"
exit "$fail"
