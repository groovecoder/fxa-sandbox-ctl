#!/usr/bin/env python3
"""harbor_judge_inputs.py: turn a Harbor task and one of its trials into what eval.sh --judge reads.

    python3 harbor_judge_inputs.py <task dir> <trial dir> <out dir>

Harbor runs and scores the case; the judge is the one part it lacks. The task's own files say what
the judge needs: instruction.md is the prompt, and task.toml's [metadata] holds repo, base_commit,
fix_commit, fix_paths and the rubric. The trial gives the agent's patch (verifier/model.patch), its
messages and tool calls (agent/trajectory.json), and its numbers (result.json).
Writes spec.json, diff.patch, thread.txt, commands.txt and report.txt to <out dir>.
"""
import json
import sys
import tomllib
from pathlib import Path

task, trial, out = (Path(a) for a in sys.argv[1:4])
meta = tomllib.loads((task / "task.toml").read_text())["metadata"]
for key in ("repo", "base_commit", "fix_commit", "fix_paths", "rubric"):
    if key not in meta:
        sys.exit(f"harbor_judge_inputs.py: task.toml [metadata] has no {key}")
out.mkdir(parents=True, exist_ok=True)

spec = {
    "name": meta.get("instance_id", task.name),
    "repo": meta["repo"],
    "base": meta["base_commit"],
    "fix": meta["fix_commit"],
    "fix_paths": meta["fix_paths"],
    "prompt": (task / "instruction.md").read_text(),
    "rubric": meta["rubric"],
}
(out / "spec.json").write_text(json.dumps(spec, indent=1))

patch = trial / "verifier" / "model.patch"
(out / "diff.patch").write_text(patch.read_text() if patch.exists() else "")

steps = json.loads((trial / "agent" / "trajectory.json").read_text()).get("steps", [])
thread = ["me: (the task's instruction.md)"]
commands = []
for step in steps:
    msg = step.get("message")
    if step.get("source") == "agent" and isinstance(msg, str) and msg.strip():
        thread.append(f"agent: {msg}")
    for call in step.get("tool_calls") or []:
        args = call.get("arguments") or {}
        what = next((args[k] for k in ("command", "file_path", "pattern", "description") if args.get(k)), "")
        commands.append(f"{call.get('function_name')}: {' '.join(str(what).split())[:300]}")
(out / "thread.txt").write_text("\n".join(thread) + "\n")
(out / "commands.txt").write_text("\n".join(commands) + ("\n" if commands else ""))

result = json.loads((trial / "result.json").read_text())
agent = result.get("agent_info") or {}
phase = result.get("agent_execution") or {}
report = [
    f"runtime: {agent.get('name')} {agent.get('version')} via harbor ({result.get('trial_name')})",
    f"model: {(agent.get('model_info') or {}).get('name')}",
    f"base: {meta['base_commit']}",
    f"agent: {phase.get('started_at')} -> {phase.get('finished_at')}",
    f"cost_usd: {(result.get('agent_result') or {}).get('cost_usd')}",
    f"steps: {len(steps)}, tool calls: {len(commands)}",
    f"rewards: {json.dumps((result.get('verifier_result') or {}).get('rewards'))}",
]
(out / "report.txt").write_text("\n".join(report) + "\n")
print(out)
