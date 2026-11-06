#!/usr/bin/env bash
# Offline check of `rounds-give KEY`: one more review round for a ticket blocked at its round cap.
#   bash lib/rounds-give.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
eval "$(sed -n '/^cmd_rounds_give() {/,/^}/p' "$(dirname "$0")/../fxa-sandbox-ctl")"
PIPE_STATE_DIR="$tmp" _FXA_ROUND_CAP=2 PIPE_REVIEW_ROUNDS=3
_key() { echo "$1"; }
gh_pr_state() { echo "$1 41 ${PR_STATE:-OPEN} ok=20 fail=${PR_FAIL:-0} running=0"; }
cmd_label() { [ -z "${LABEL_FAIL:-}" ] || return 1; echo "$1 $2" >> "$tmp/labels"; rm -f "$tmp/$1.blocked-why"; }
jira_comment() { printf '%s\n' "$2" >> "$tmp/comments"; }
reset() { rm -f "$tmp"/*; printf '1\trounds\tused both rounds\n' > "$tmp/FXA-1.blocked-why"; echo 2 > "$tmp/FXA-1.feedback-rounds"; echo 'c1 c2' > "$tmp/FXA-1.feedback-noted"; }

reset
out="$(FXA_TEAM_ACTOR=admin@example.com cmd_rounds_give FXA-1 2>&1)"; rc=$?
check "a ticket blocked for rounds: exit 0, labelled done, one round back, noted ids gone" "0|FXA-1 done|1|gone" \
  "$rc|$(cat "$tmp/labels")|$(cat "$tmp/FXA-1.feedback-rounds")|$([ -e "$tmp/FXA-1.feedback-noted" ] && echo kept || echo gone)"
check "the ticket gets one ::info comment that names the admin" "1|yes" \
  "$(grep -c '^::info' "$tmp/comments")|$(grep -q 'admin@example.com gave one more review round' "$tmp/comments" && echo yes)"
check "it says how many rounds are used now, of the team's cap" "yes" "$(grep -q '1 of 3 review rounds used' <<<"$out" && echo yes)"

reset; printf '1\tattempts\t\n' > "$tmp/FXA-1.blocked-why"
cmd_rounds_give FXA-1 >/dev/null 2>&1; rc=$?
check "another blocked kind: exit 2 (a 409), no label, the counter unchanged" "2|none|2" "$rc|$(cat "$tmp/labels" 2>/dev/null || echo none)|$(cat "$tmp/FXA-1.feedback-rounds")"

reset; rm -f "$tmp/FXA-1.blocked-why"
cmd_rounds_give FXA-1 >/dev/null 2>&1; check "not blocked at all: exit 2" "2" "$?"

reset
PR_STATE=MERGED cmd_rounds_give FXA-1 >/dev/null 2>&1; rc=$?
check "a PR that is not open: exit 2, the counter unchanged" "2|2" "$rc|$(cat "$tmp/FXA-1.feedback-rounds")"

reset
out="$(PR_FAIL=3 cmd_rounds_give FXA-1 2>&1)"; rc=$?
check "red checks still give the round, with a warning about the fix attempt" "0|yes" "$rc|$(grep -q '^WARN: .*3 failed checks' <<<"$out" && echo yes)"

reset
LABEL_FAIL=1 cmd_rounds_give FXA-1 >/dev/null 2>&1; rc=$?
check "a failed relabel: non-zero exit, the counter and noted ids unchanged" "1|2|kept" \
  "$rc|$(cat "$tmp/FXA-1.feedback-rounds")|$([ -e "$tmp/FXA-1.feedback-noted" ] && echo kept || echo gone)"

reset; rm -f "$tmp/FXA-1.feedback-rounds"
cmd_rounds_give FXA-1 >/dev/null 2>&1; check "no counter file: still exit 0" "0" "$?"
exit "$fail"
