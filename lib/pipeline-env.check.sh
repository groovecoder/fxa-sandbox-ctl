#!/usr/bin/env bash
# Offline check of pipeline_env: every PIPE_* setting prints, arrays too, and a login never does.
#   bash lib/pipeline-env.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
here="$(cd "$(dirname "$0")" && pwd)"
eval "$(sed -n '/^pipeline_env() {/,/^}/p' "$here/pipeline.sh")"
PIPE_STACK_DIR=/home/agent/fxa PIPE_VM_BACKEND=gce PIPE_JIRA_BASIC='bot@example.com:secret-token' PIPE_X_TOKEN=t1
PIPE_REPOS=("mozilla-services/syncstorage-rs /home/agent/syncstorage work master" "mozilla/fxa /home/agent/fxa dep")
out="$(pipeline_env)"
check "a plain setting prints as name=value" "1" "$(grep -cx 'PIPE_STACK_DIR="/home/agent/fxa"' <<< "$out")"
# bash 3.2 quotes the array (='(...)'), bash 5 does not.
check "an array prints whole" "1" "$(grep -cE "^PIPE_REPOS='?\(.*syncstorage-rs.*mozilla/fxa" <<< "$out")"
check "the Jira login and a token never print" "0" "$(grep -cE 'secret-token|PIPE_JIRA_BASIC|PIPE_X_TOKEN' <<< "$out")"
exit "$fail"
