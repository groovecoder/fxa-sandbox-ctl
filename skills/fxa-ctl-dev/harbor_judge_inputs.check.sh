#!/usr/bin/env bash
# harbor_judge_inputs.check.sh: a fake Harbor task and trial become the files eval.sh --judge reads.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
python3 -c 'import tomllib' 2>/dev/null || { echo "skip: needs Python 3.11 (tomllib)"; exit 0; }
t="$(mktemp -d "${TMPDIR:-/tmp}/harbor-judge-check.XXXXXX")"; trap 'rm -rf "$t"' EXIT
mkdir -p "$t/task" "$t/trial/verifier" "$t/trial/agent"
cat > "$t/task/task.toml" <<'EOF'
schema_version = "1.4"
[metadata]
instance_id = "owner__app-1"
repo = "owner/app"
base_commit = "1111111111111111111111111111111111111111"
fix_commit = "2222222222222222222222222222222222222222"
fix_paths = ["app.py"]

[[metadata.rubric]]
id = "fixed"
max = 3
text = "Fixes it."
EOF
echo "Fix the bug." > "$t/task/instruction.md"
printf 'diff --git a/app.py b/app.py\n' > "$t/trial/verifier/model.patch"
cat > "$t/trial/agent/trajectory.json" <<'EOF'
{"steps": [{"source": "user", "message": "Fix the bug."},
           {"source": "agent", "message": "Looking.", "tool_calls": [{"function_name": "Bash", "arguments": {"command": "pytest\n -q"}}]},
           {"source": "agent", "message": "Done."}]}
EOF
echo '{"trial_name": "t1", "agent_info": {"name": "claude-code", "model_info": {"name": "m"}}, "agent_result": {"cost_usd": 1.5}}' > "$t/trial/result.json"

python3 -I skills/fxa-ctl-dev/harbor_judge_inputs.py "$t/task" "$t/trial" "$t/out" >/dev/null; rc=$?
check "it runs" 0 "$rc"
check "the spec names the case, its commits and its rubric" "owner__app-1 owner/app 2222222222222222222222222222222222222222 fixed:3" \
  "$(jq -r '"\(.name) \(.repo) \(.fix) \(.rubric[0].id):\(.rubric[0].max)"' "$t/out/spec.json")"
check "the prompt is instruction.md" "Fix the bug." "$(jq -r '.prompt | rtrimstr("\n")' "$t/out/spec.json")"
check "the diff is the agent's patch" "diff --git a/app.py b/app.py" "$(cat "$t/out/diff.patch")"
check "the thread holds only the agent's messages" "agent: Looking.|agent: Done." "$(grep '^agent:' "$t/out/thread.txt" | paste -sd'|' -)"
check "each tool call is one line" "Bash: pytest -q" "$(cat "$t/out/commands.txt")"
check "the report has the cost" yes "$(grep -q '^cost_usd: 1.5$' "$t/out/report.txt" && echo yes || echo no)"
sed -i.bak '/^fix_commit/d' "$t/task/task.toml"
err="$(python3 -I skills/fxa-ctl-dev/harbor_judge_inputs.py "$t/task" "$t/trial" "$t/out2" 2>&1)"; rc=$?
check "a task with no fix_commit is refused by name" "1 yes" "$rc $(grep -q 'no fix_commit' <<< "$err" && echo yes || echo no)"
exit $fail
