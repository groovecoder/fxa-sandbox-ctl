#!/usr/bin/env bash
# _finish_soft_keys: another ticket's key gets U+2011, so Jira does not move that ticket to In Review.
set -uo pipefail
eval "$(sed -n '/^_finish_soft_keys() {/,/^}/p' "$(dirname "$0")/finish.sh")"
fail=0; t() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: want [$3] got [$2]"; fail=1; fi; }
nb=$'‑'
t "another key is softened" "$(printf 'Not changed: the FXA-14856 preload.\n' | _finish_soft_keys FXA-14879)" "Not changed: the FXA${nb}14856 preload."
t "the own key stays" "$(printf 'FXA-14879: the fix\n' | _finish_soft_keys FXA-14879)" "FXA-14879: the fix"
t "a Closes line stays" "$(printf 'Closes: https://mozilla-hub.atlassian.net/browse/FXA-14879\nCloses FXA-2\n' | _finish_soft_keys FXA-14879)" "Closes: https://mozilla-hub.atlassian.net/browse/FXA-14879
Closes FXA-2"
t "a key in a URL stays" "$(printf 'see https://x.example/browse/FXA-9 now\n' | _finish_soft_keys FXA-1)" "see https://x.example/browse/FXA-9 now"
t "no own key softens every key" "$(printf 'FXA-1 and FXA-2\n' | _finish_soft_keys AGENT-ABC)" "FXA${nb}1 and FXA${nb}2"
t "SHA-256 and UTF-8 stay" "$(printf 'SHA-256, UTF-8, ES-2020\n' | _finish_soft_keys FXA-1)" "SHA-256, UTF-8, ES-2020"
t "the team's project counts" "$(printf 'PAY-7 and STOR-8\n' | PIPE_JIRA_PROJECT=PAY _finish_soft_keys FXA-1)" "PAY${nb}7 and STOR-8"
t "the own key's project counts" "$(printf 'STOR-8 STOR-9\n' | _finish_soft_keys STOR-9)" "STOR${nb}8 STOR-9"
t "a longer number is not cut" "$(printf 'FXA-148560\n' | _finish_soft_keys FXA-14856)" "FXA${nb}148560"
exit $fail
