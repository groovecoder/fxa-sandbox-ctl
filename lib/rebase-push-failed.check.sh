#!/usr/bin/env bash
# Offline check of a rebase round whose push failed: the resolved merge is kept as a patch, the slot is
# back at the PR head with nothing staged, and the ticket is labelled blocked rebases with the error.
#   bash lib/rebase-push-failed.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
tmp="$(cd "$(mktemp -d)" && pwd -P)"; trap 'rm -rf "$tmp"' EXIT
eval "$(sed -n '/^_jira_rebase_push_failed() {/,/^}/p' "$(dirname "$0")/../fxa-sandbox-ctl")"
PIPE_STATE_DIR="$tmp/state"; mkdir -p "$PIPE_STATE_DIR"
worktree_branch_for() { echo fxa-1; }; pipeline_launch_log() { echo "$tmp/launch.log"; }
cmd_label() { echo "$*" > "$tmp/label"; }
printf 'Squashing 2 commit(s)\nERROR: could not create the tree as the App: GitRPC::BadObjectState\n' > "$tmp/launch.log"
g() { git -c user.email=t@example.com -c user.name=t -c init.defaultBranch=main "$@"; }
g init -q --bare "$tmp/o.git"; g clone -q "$tmp/o.git" "$tmp/w" 2>/dev/null; cd "$tmp/w"
echo a > a.txt; g add a.txt; g commit -qm base; g push -q origin main
g checkout -qb fxa-1; echo b > b.txt; g add b.txt; g commit -qm pr; g push -q origin fxa-1
# The failed push left the merge staged on top of main, as finish leaves it.
g reset -q --soft main; echo c > c.txt; g add c.txt
_jira_rebase_push_failed FXA-1 "$tmp/w" 2>/dev/null
check "the resolved merge is kept as a patch" "1" "$(grep -c '^+++ b/c.txt' "$PIPE_STATE_DIR/FXA-1.rebase.patch")"
check "the slot is the PR head with nothing staged" "$(g rev-parse origin/fxa-1)|" "$(g rev-parse HEAD)|$(g status --porcelain)"
check "the ticket is labelled blocked rebases with the error" "1" "$(grep -c '^FXA-1 blocked rebases the rebase push failed (ERROR: could not create the tree as the App: GitRPC::BadObjectState); the resolved merge is in FXA-1.rebase.patch' "$tmp/label")"
[ "$fail" = 0 ] && echo "all checks pass"; exit "$fail"
