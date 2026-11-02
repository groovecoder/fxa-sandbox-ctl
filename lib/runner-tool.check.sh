#!/usr/bin/env bash
# Offline check of runner_tool_check: a run whose tool output shows a binary for another CPU records one error.
#   bash lib/runner-tool.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
here="$(cd "$(dirname "$0")" && pwd)"
eval "$(sed -n '/^runner_tool_check() {/,/^}/p' "$here/telemetry.sh")"
errors_record() { printf '%s|%s|%s\n' "$2" "$3" "$5" >> "$tmp/errors"; }
_telemetry_worktree_for_key() { echo "$tmp/wt"; }

# The lines as the transcript holds them, from STOR-270's run: JSON escapes the quotes.
printf '%s\n' '{"type":"user","content":"29:/opt/rust/cargo/bin/cargo-nextest: 1: Syntax error: \"(\" unexpected"}' > "$tmp/x86.jsonl"
runner_tool_check STOR-1 "$tmp/x86.jsonl"
check "an x86-64 tool that a shell read as a script records one error, with the tool's path" \
  "runner_tool|STOR-1|a runner tool is not built for the runner's CPU: /opt/rust/cargo/bin/cargo-nextest: 1: Syntax error: \"(\" unexpected" "$(cat "$tmp/errors")"
: > "$tmp/errors"
printf '%s\n' '{"content":"bash: /opt/spanner-emulator/gateway_main: cannot execute binary file: Exec format error"}' > "$tmp/exec.jsonl"
runner_tool_check STOR-2 "$tmp/exec.jsonl"
check "an exec format error records one too" "1" "$(grep -c 'gateway_main: cannot execute binary file: Exec format error' "$tmp/errors")"
: > "$tmp/errors"
printf '%s\n' '{"content":"error: syntax error near unexpected token"}' '{"content":"PASS test syncserver"}' > "$tmp/ok.jsonl"
runner_tool_check STOR-3 "$tmp/ok.jsonl"; runner_tool_check STOR-4 "$tmp/none.jsonl"
check "a clean run, and a run with no transcript, record nothing" "0" "$(wc -l < "$tmp/errors" | tr -d ' ')"
mkdir -p "$tmp/wt"; cp "$tmp/x86.jsonl" "$tmp/wt/.fxa-auto-claude.jsonl"; runner_tool_check STOR-5
check "with no file named, it reads the key's worktree transcript" "1" "$(grep -c '^runner_tool|STOR-5|' "$tmp/errors")"
exit "$fail"
