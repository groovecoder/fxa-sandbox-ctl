#!/usr/bin/env bash
# Offline check that a launch moves the last run's output files out of its slot, so none speaks for the new run.
#   bash lib/worktree-archive.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
LOG_DIR="$tmp/logs"
eval "$(sed -n '/^worktree_archive_run_files() {/,/^}/p' "$(dirname "$0")/worktree.sh")"
s="$tmp/slot-1"; mkdir -p "$s" "$tmp/elsewhere"
echo "STOR-1: blocked at step 3" > "$s/.fxa-auto-blocked.txt"
echo '{"num_turns":0}' > "$s/.fxa-auto-claude.jsonl"
echo "PASS build" > "$s/.fxa-verify-verdict.txt"
echo "keep" > "$s/.fxa-jira-context.md"; echo "code" > "$s/main.rs"
echo secret > "$tmp/elsewhere/target"; ln -s "$tmp/elsewhere/target" "$s/.fxa-auto-done.json.held"
worktree_archive_run_files "$s" 2>/dev/null
d="$(ls -d "$LOG_DIR/scratch/"*/ | head -1)"
check "the run's files leave the slot, and its other files stay" "0|1|1" \
  "$(ls -A "$s" | grep -c 'blocked\|claude.jsonl\|verdict\|held')|$([ -f "$s/.fxa-jira-context.md" ] && echo 1)|$([ -f "$s/main.rs" ] && echo 1)"
check "the files are kept in the scratch folder, and a link moves as a link" "STOR-1: blocked at step 3|1|secret" \
  "$(cat "$d/.fxa-auto-blocked.txt")|$([ -L "$d/.fxa-auto-done.json.held" ] && echo 1)|$(cat "$tmp/elsewhere/target")"
n0="$(ls "$LOG_DIR/scratch" | wc -l | tr -d ' ')"
worktree_archive_run_files "$s" 2>/dev/null
check "a slot with no run files makes no folder" "$n0" "$(ls "$LOG_DIR/scratch" | wc -l | tr -d ' ')"
for i in $(seq 1 35); do mkdir -p "$LOG_DIR/scratch/old-$i"; done
echo x > "$s/.fxa-auto-blocked.txt"; worktree_archive_run_files "$s" 2>/dev/null
check "the scratch folder keeps the newest 30 runs" "30" "$(ls "$LOG_DIR/scratch" | wc -l | tr -d ' ')"
[ "$fail" -eq 0 ] && echo "all checks pass"
exit "$fail"
