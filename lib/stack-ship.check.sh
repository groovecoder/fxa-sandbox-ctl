#!/usr/bin/env bash
# Offline check: a team stack ships several repos in one Open PR (finish --repo a --repo b), and
# its PRs link each other ("Related PRs:"), with a fake gh.
#   bash lib/stack-ship.check.sh
source "$(dirname "$0")/session-check-head.sh"
here="$(cd "$(dirname "$0")" && pwd)"
unset -f trees_on
source "$here/trees.sh"
pipeline_host_clone() { echo "$tmp/clones/$1"; }; _session_history_add() { :; }; _session_handoff_busy() { return 1; }; _checkout_gate_on() { return 1; }
k=agent-ss01
rec() { jq -nc --arg k "$k" '{key: $k, state: "active", turn_open: "0", trees: [
  {name: "fxa", slug: "mozilla/fxa", path: "/home/agent/fxa", out: "pr", branch: $k},
  {name: "ecosystem-platform", slug: "mozilla/ecosystem-platform", path: "/home/agent/ecosystem-platform", out: "pr", branch: $k},
  {name: "rusty", slug: "example/rusty", path: "/home/agent/rusty", out: "diff", branch: $k}]}' > "$SESSION_DIR/$k.json"; }
# The changed-file count of each tree, by name; the job's arguments instead of a nohup.
_tree_changes() { case "$FXA_TREE_NAME" in fxa) echo "${C_FXA:-2}" ;; *) echo "${C_EP:-1}" ;; esac; }
nohup() { shift 3; echo "$*" > "$tmp/job"; }
fin() { rec; : > "$tmp/job"; _finish_session "$k" "$@" >/dev/null 2>"$tmp/err"; wait; grep -o '^ERROR.*' "$tmp/err" | head -1; cat "$tmp/job"; }
check "two --repo: one job ships both trees, in the order named" "session-finish $k - 0,1|wrapping" \
  "$(fin --repo mozilla/fxa --repo mozilla/Ecosystem-Platform)|$(session_get "$k" state)"
check "a named repo with no change is left out; the other ships" "session-finish $k - 1" "$(C_FXA=0 fin --repo mozilla/fxa --repo mozilla/ecosystem-platform)"
check "no named repo has a change: nothing to push" "ERROR: nothing to push: no files changed in $k (mozilla/fxa mozilla/ecosystem-platform)" \
  "$(C_FXA=0 C_EP=0 fin --repo mozilla/fxa --repo mozilla/ecosystem-platform)"
check "a repo that ships as a diff stops the whole ship" "ERROR: example/rusty ships as a diff: the GitHub App cannot push to it. Use Diff." \
  "$(fin --repo mozilla/fxa --repo example/rusty)"
check "a stack with no --repo still names the repos" "1" "$(fin | grep -c 'name the repo to ship with --repo')"

# The job: each tree's finish in turn, the session back to wrapping between them; one failure does not stop the next.
_session_finish_one() { echo "$FXA_TREE_NAME:$(session_get "$k" state)" >> "$tmp/order"; session_set "$k" state active; [ "$FXA_TREE_NAME" != "${FAIL_TREE:-}" ]; }
: > "$tmp/order"; rec; session_set "$k" state wrapping
check "the job ships each tree in turn, each one while the session is wrapping" "0|fxa:wrapping ecosystem-platform:wrapping" \
  "$(_cmd_session_finish "$k" - 0,1; echo $?)|$(paste -sd' ' "$tmp/order")"
: > "$tmp/order"; rec
check "a failed tree fails the job, and the next tree still ships" "1|fxa:active ecosystem-platform:wrapping" \
  "$(FAIL_TREE=fxa _cmd_session_finish "$k" - 0,1; echo $?)|$(paste -sd' ' "$tmp/order")"

# Related PRs: a fake gh on PATH (the PATCH goes through `command gh`). Bodies live in files by PR number.
mkdir -p "$tmp/bin" "$tmp/pr"
cat > "$tmp/bin/gh" <<'EOF'
#!/usr/bin/env bash
n="${2##*/}"; echo "$*" >> "$GH_LOG"
if [ "$1 $2" = "api -X" ]; then n="${4##*/}"; [ -n "${PATCH_FAILS:-}" ] && exit 1; cat > "$GH_DIR/$n"; exit 0; fi
[ -n "${READ_FAILS:-}" ] && exit 1
cat "$GH_DIR/$n" 2>/dev/null; exit 0
EOF
chmod +x "$tmp/bin/gh"
export PATH="$tmp/bin:$PATH" GH_LOG="$tmp/gh.log" GH_DIR="$tmp/pr"
unset -f gh; github_app_enabled() { return 1; }
P1=https://github.com/mozilla/fxa/pull/11 P2=https://github.com/mozilla/ecosystem-platform/pull/22
link() { : > "$GH_LOG"; trees_link_prs "$k" 2>"$tmp/link.err"; }
rec; ( _tree_enter "$k" 0 && session_set "$k" pr_url "$P1" )
printf 'Fix the text.\n' > "$tmp/pr/11"
link
check "one PR in the stack: nothing to link, no gh call" "0" "$(wc -l < "$GH_LOG" | tr -d ' ')"
( _tree_enter "$k" 1 && session_set "$k" pr_url "$P2" ); printf 'Docs.\n' > "$tmp/pr/22"
link
check "two PRs: each body links the other" "Related PRs: $P2|Related PRs: $P1|Fix the text." \
  "$(tail -1 "$tmp/pr/11")|$(tail -1 "$tmp/pr/22")|$(head -1 "$tmp/pr/11")"
link
check "a body that has the link already is not written again" "0" "$(grep -c -- '-X PATCH' "$GH_LOG")"
cp "$tmp/pr/11" "$tmp/pr/11.before"; printf 'Fix the text.\n' > "$tmp/pr/11"
PATCH_FAILS=1 link
check "a failed write is read back once, warned, never retried, and the link never fails" "1|1|0" \
  "$(grep -c -- '-X PATCH' "$GH_LOG")|$(grep -c 'did not take its Related PRs line' "$tmp/link.err")|$(trees_link_prs "$k" 2>/dev/null; echo $?)"
READ_FAILS=1 link
check "a PR it cannot read gets no write" "0|2" "$(grep -c -- '-X PATCH' "$GH_LOG")|$(grep -c 'could not read' "$tmp/link.err")"
check "the finish links the stack's PRs after a PR is up, and a failure there cannot fail it" "1" \
  "$(grep -c '( trees_link_prs "$key" ) || true' "$here/../fxa-sandbox-ctl")"

[ "$fail" = 0 ] && echo "all checks pass"; exit "$fail"
