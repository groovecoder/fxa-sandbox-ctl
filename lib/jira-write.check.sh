#!/usr/bin/env bash
# jira_write: only a ticket key, a numeric transition id or one plain label reaches the write, and a failed write names itself.
set -uo pipefail
eval "$(sed -n '/^jira_write() {/,/^}/p' "$(dirname "$0")/jira.sh")"
fail=0; ok() { echo "ok   $1"; }; bad() { echo "FAIL $1"; fail=1; }
_jira_rest_json() { [ "$2" = /rest/api/3/issue/FXA-9 ] && return 22; echo "$1 $2 $3" >> "$tmp"; }
tmp="$(mktemp "${TMPDIR:-/tmp}/jw.XXXXXX")"; trap 'rm -f "$tmp"' EXIT
jira_write transition FXA-1 101 >/dev/null; jira_write label PAY-2 add ai-fixme >/dev/null
[ "$(cat "$tmp")" = 'POST /rest/api/3/issue/FXA-1/transitions {"transition":{"id":"101"}}
PUT /rest/api/3/issue/PAY-2 {"update":{"labels":[{"add":"ai-fixme"}]}}' ] && ok "a transition and a label send their one request" || bad "a transition and a label send their one request"
for a in "transition fxa-1 101" "transition FXA-1 1x" "label FXA-1 set x" "label FXA-1 add a\"b" "delete FXA-1" ""; do
  : > "$tmp"; jira_write $a >/dev/null 2>&1 && bad "rejects '$a'" || { [ -s "$tmp" ] && bad "rejects '$a' with no request" || ok "rejects '$a'"; }
done
err="$(jira_write label FXA-9 remove x 2>&1 >/dev/null)"; [ $? -ne 0 ] && [[ "$err" == *'Jira label on FXA-9 failed'* ]] && ok "a failed write says so" || bad "a failed write says so"
exit $fail
