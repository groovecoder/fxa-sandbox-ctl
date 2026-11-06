#!/usr/bin/env bash
# Offline check of the rebase marker: a live <KEY>.rebasing owns the runner (the label stays done
# or blocked), an old one does not, and the end of a round or any label drops it.
#   bash lib/rebase-marker.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
here="$(cd "$(dirname "$0")" && pwd)"
eval "$(sed -n '/^pipeline_rebasing() {/,/^}/p;/^pipeline_rebasing_keys() {/,/^}/p;/^pipeline_rebase_end() {/,/^}/p;/^_PIPE_BLOCKED_KINDS=/p;/^_pipeline_one_line() {/,/^}/p;/^pipeline_blocked_why() {/,/^}/p' "$here/pipeline.sh")"
eval "$(sed -n '/^jira_owning_keys() {/,/^}/p' "$here/jira.sh")"
eval "$(sed -n '/^cmd_label() {/,/^}/p' "$here/../fxa-sandbox-ctl")"
PIPE_STATE_DIR="$tmp"; PIPE_LABEL_PREFIX=ai-fixme
jira_inflight_keys() { [ -z "${JIRA_DOWN:-}" ] || return 1; echo fxa-1; }
worktree_branch_for() { printf '%s\n' "$1" | tr '[:upper:]' '[:lower:]'; }
worktree_release_branch() { echo "$1" >> "$tmp/released"; }
jira_label_set() { :; }; jira_normalize_key() { printf '%s\n' "$1" | tr '[:lower:]' '[:upper:]'; }
_reap_key() { :; }; pipeline_launch_log() { echo /nonexistent; }; runner_tool_check() { :; }; gh_feedback_has_acted() { return 1; }

date +%s > "$tmp/FXA-2.rebasing"; echo $(( $(date +%s) - 7300 )) > "$tmp/FXA-3.rebasing"
check "a live marker owns its runner beside the inflight keys; an old one does not" "FXA-1 FXA-2" "$(jira_owning_keys | tr '\n' ' ' | sed 's/ $//')"
check "a failed inflight read stays UNKNOWN" "UNKNOWN" "$(JIRA_DOWN=1 jira_owning_keys)"
check "a longer TTL keeps the old marker live" "FXA-2 FXA-3" "$(FXA_REBASE_TTL_S=9000 pipeline_rebasing_keys | tr '\n' ' ' | sed 's/ $//')"
pipeline_rebase_end FXA-2
check "the end of a round drops the marker and frees the branch" "no|fxa-2" "$([ -e "$tmp/FXA-2.rebasing" ] && echo yes || echo no)|$(cat "$tmp/released")"
date +%s > "$tmp/FXA-4.rebasing"
cmd_label FXA-4 public >/dev/null 2>&1
check "any label drops the marker" "no" "$([ -e "$tmp/FXA-4.rebasing" ] && echo yes || echo no)"
[ "$fail" = 0 ] && echo "all checks pass"; exit "$fail"
