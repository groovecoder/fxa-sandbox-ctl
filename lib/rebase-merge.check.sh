#!/usr/bin/env bash
# Offline check for _jira_rebase_merge: a clean merge leaves HEAD on the pushed branch tip,
# so the runner can fetch it from the remote by sha.
#   bash lib/rebase-merge.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
_FXA_ROUND_CAP=2; _FXA_REBASE_CAP=5; PIPE_STATE_DIR="$tmp/state"; mkdir -p "$PIPE_STATE_DIR"
eval "$(sed -n '/^_jira_rebase_merge() {/,/^}/p' "$(dirname "$0")/../fxa-sandbox-ctl")"
eval "$(sed -n '/^pipeline_attempts() {/,/^}/p;/^pipeline_rebases() {/,/^}/p;/^pipeline_rebase_refusal() {/,/^}/p' "$(dirname "$0")/pipeline.sh")"
worktree_filtered_status() { git -C "$1" status --porcelain | grep -v ' \.fxa-' || true; }
pipeline_require() { :; }
_retry() { "$@"; }
g() { git -c user.name=t -c user.email=t@example.com -c commit.gpgsign=false "$@"; }
git init -q --bare "$tmp/origin.git"
g clone -q "$tmp/origin.git" "$tmp/up" 2>/dev/null
( cd "$tmp/up" && g checkout -q -b main && echo a > a && g add a && g commit -qm base && g push -q origin main \
  && g checkout -q -b fxa-1 && echo b > b && g add b && g commit -qm branch && g push -q origin fxa-1 \
  && g checkout -q main && echo c > c && g add c && g commit -qm main2 && g push -q origin main )
g clone -q -b fxa-1 "$tmp/origin.git" "$tmp/wt" 2>/dev/null
tip="$(git -C "$tmp/wt" rev-parse HEAD)"
_jira_rebase_merge FXA-1 "$tmp/wt" main 2>/dev/null
check "clean merge: HEAD stays the pushed branch tip" "$tip" "$(git -C "$tmp/wt" rev-parse HEAD)"
check "clean merge: the merge is open, with main's file staged" "yes|c" "$(git -C "$tmp/wt" rev-parse -q --verify MERGE_HEAD >/dev/null && echo yes)|$(git -C "$tmp/wt" diff --cached --name-only)"
check "relaunch: an open merge of the same base resumes" "0|$tip" "$(_jira_rebase_merge FXA-1 "$tmp/wt" main 2>/dev/null; echo $?)|$(git -C "$tmp/wt" rev-parse HEAD)"
( cd "$tmp/up" && echo d > d && g add d && g commit -qm main3 && g push -q origin main )
git -C "$tmp/wt" fetch -q origin main
_jira_rebase_merge FXA-1 "$tmp/wt" main 2>/dev/null
check "relaunch: a newer base merges again" "$(git -C "$tmp/wt" rev-parse origin/main)|c d" "$(git -C "$tmp/wt" rev-parse MERGE_HEAD)|$(git -C "$tmp/wt" diff --cached --name-only | tr '\n' ' ' | sed 's/ $//')"
# An older round committed its merge here (before the fix): drop it, so HEAD is on GitHub again.
g clone -q -b fxa-1 "$tmp/origin.git" "$tmp/wt2" 2>/dev/null
( cd "$tmp/wt2" && g merge -q --no-edit origin/main 2>/dev/null )
_jira_rebase_merge FXA-1 "$tmp/wt2" main 2>/dev/null
check "an old host-only merge commit is dropped first" "$tip|yes" "$(git -C "$tmp/wt2" rev-parse HEAD)|$(git -C "$tmp/wt2" rev-parse -q --verify MERGE_HEAD >/dev/null && echo yes)"
# A round cut off with a conflict still open: the relaunch's branch resume must not fail on it.
for f in _worktree_resume_branch _worktree_sync_to_origin _origin_has_branch; do
  eval "$(sed -n '/^'"$f"'() {/,/^}/p' "$(dirname "$0")/worktree.sh")"
done
( cd "$tmp/up" && g checkout -q fxa-1 && echo x > d && g add d && g commit -qm conflict && g push -q origin fxa-1 )
g clone -q -b fxa-1 "$tmp/origin.git" "$tmp/wt3" 2>/dev/null
_jira_rebase_merge FXA-1 "$tmp/wt3" main >/dev/null 2>&1
check "a relaunch resumes the branch with its conflicted merge open" "0|0|U" "$(_worktree_resume_branch "$tmp/wt3" fxa-1 2>/dev/null; echo $?)|$(_jira_rebase_merge FXA-1 "$tmp/wt3" main 2>/dev/null; echo $?)|$(git -C "$tmp/wt3" diff --name-only --diff-filter=U | sed 's/^d$/U/')"
check "a conflicted merge counts one rebase, a resume and clean merges none, and attempts never" "1|none" \
  "$(cat "$PIPE_STATE_DIR/FXA-1.rebases")|$(cat "$PIPE_STATE_DIR/FXA-1.attempts" 2>/dev/null || echo none)"
echo 2 > "$PIPE_STATE_DIR/FXA-9.attempts"
g clone -q -b fxa-1 "$tmp/origin.git" "$tmp/wt4" 2>/dev/null
check "2 CI-fix attempts do not stop a rebase" "0|1" "$(_jira_rebase_merge FXA-9 "$tmp/wt4" main >/dev/null 2>&1; echo $?)|$(cat "$PIPE_STATE_DIR/FXA-9.rebases")"
echo 5 > "$PIPE_STATE_DIR/FXA-9.rebases"
out="$(_jira_rebase_merge FXA-9 "$tmp/wt4" main 2>&1; echo "rc=$?")"
check "5 rebases refuse, and name the blocked kind" "rc=1|1" "$(tail -1 <<< "$out")|$(grep -c 'blocked rebases' <<< "$out")"
printf '1\trounds\tx\n' > "$PIPE_STATE_DIR/FXA-10.blocked-why"; printf '1\tstalled\tx\n' > "$PIPE_STATE_DIR/FXA-11.blocked-why"
check "blocked rounds may rebase, blocked stalled may not" "0|1" "$(pipeline_rebase_refusal FXA-10 2>/dev/null; echo $?)|$(pipeline_rebase_refusal FXA-11 2>/dev/null; echo $?)"
eval "$(sed -n '/^_worktree_drop_foreign_merge() {/,/^}/p' "$(dirname "$0")/worktree.sh")"
_worktree_pool_list() { printf '%s\n' "$tmp/wt3" "$tmp/wt5"; }
worktree_key_for() { echo "$1" | tr a-z A-Z; }
_worktree_drop_foreign_merge "$tmp/wt3" fxa-1 2>/dev/null
check "the same ticket keeps its open merge" "yes" "$(git -C "$tmp/wt3" rev-parse -q --verify MERGE_HEAD >/dev/null && echo yes)"
_worktree_drop_foreign_merge "$tmp/wt3" fxa-2 2>/dev/null
check "another ticket's open merge is aborted, so its checkout works" "no|0" "$(git -C "$tmp/wt3" rev-parse -q --verify MERGE_HEAD >/dev/null && echo yes || echo no)|$(git -C "$tmp/wt3" checkout -q -b fxa-2 origin/main 2>/dev/null; echo $?)"
# A detached slot with staged leftovers and an untracked file in the way: saved to a patch, then reset.
g clone -q -b fxa-1 "$tmp/origin.git" "$tmp/wt5" 2>/dev/null
( cd "$tmp/wt5" && g checkout -q --detach && echo y > c && echo z > new && g add c && echo w > stray )
_worktree_drop_foreign_merge "$tmp/wt5" fxa-2 2>/dev/null
p="$(ls "$PIPE_STATE_DIR"/wt5.leftover-*.patch 2>/dev/null | head -1)"
check "a detached dirty pool slot is saved, then reset" "|3" "$(git -C "$tmp/wt5" status --porcelain | grep -v ' \.fxa-')|$(grep -c '^diff --git' "$p" 2>/dev/null)"
cp -R "$tmp/wt5" "$tmp/wt6"; echo y > "$tmp/wt6/c"
_worktree_drop_foreign_merge "$tmp/wt6" fxa-2 2>/dev/null
check "a worktree outside the pool keeps its changes" "?? c" "$(git -C "$tmp/wt6" status --porcelain)"
[ "$fail" = 0 ] && echo "all checks pass"; exit "$fail"
