#!/usr/bin/env bash
# Offline check that FXA_FAKE_JIRA=1 sends every Jira call of the controller to fake-jira/acli and never to
# the real acli or the REST API, and that a session's draft files, finds duplicates and undoes against it.
#   bash skills/fxa-ctl-dev/fake-jira.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
command -v jq >/dev/null && command -v python3 >/dev/null || { echo "skip: needs jq and python3"; exit 0; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
root="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir "$tmp/real"; printf '#!/bin/sh\necho "$*" >> %s/real.log\necho "{}"\n' "$tmp" > "$tmp/real/acli"; chmod +x "$tmp/real/acli"
export PATH="$tmp/real:$PATH" HOME="$tmp"
_retry() { "$@"; }
source "$root/lib/config.sh" >/dev/null 2>&1 || true
source "$root/lib/jira.sh"
SCRIPT_DIR="$root"
entry="$(sed -n '/^if \[ "${FXA_FAKE_JIRA:-}" = 1 \]; then/,/^fi/p' "$root/fxa-sandbox-ctl")"
eval "$entry"
check "without the switch, acli is the real one" "$tmp/real/acli" "$(type -P acli)"
FXA_FAKE_JIRA=1; eval "$entry"
check "with the switch, acli is the fake and its store is under HOME" "$root/skills/fxa-ctl-dev/fake-jira/acli|$tmp/.fxa-fake-jira" "$(type -P acli)|$FAKE_JIRA_DIR"
PIPE_JIRA_BASIC='bot@serviceaccount.atlassian.com:tok'
check "a service-account login still takes the acli path, and REST goes nowhere real" "no|http://127.0.0.1:9" \
  "$(_jira_sa && echo yes || echo no)|$(_jira_api)"

# The session's draft, file, duplicate search and undo, against the fake.
eval "$(sed -n '/^_session_jira_project() {/,/^}/p' "$root/lib/session.sh")"
eval "$(sed -n '/^_SESSION_JIRA_DRAFTS_MAX=/,/^# session_review_ack/p' "$root/lib/session.sh" | sed '$d')"
SESSION_DIR="$tmp" FXA_JIRA_DRAFTS=1 PIPE_PROFILE=fxa
session_exists() { true; }
session_get() { jq -r --arg f "$2" '.[$f] // empty' "$tmp/$1.json" 2>/dev/null; }
session_set() { [ -f "$tmp/$1.json" ] || echo '{}' > "$tmp/$1.json"; jq --arg k "$2" --arg v "$3" '.[$k] = $v' "$tmp/$1.json" > "$tmp/s" && mv "$tmp/s" "$tmp/$1.json"; }
_session_history_add() { :; }
errors_record() { :; }
good='{"type":"Bug","summary":"Sign-in times out on slow networks","description":"The auth client waits 5 s."}'
sha="$(printf '%s' "$good" | session_jira_draft agent-a1 --stdin | jq -r .sha)"
new="$(session_jira_file agent-a1 "$sha" U1 'Pat Doe' pat@example.com --fixme)"
check "a filed draft gets a fake key, with its labels and the trailer" "FXA-90001|agent-session,ai-fixme|Filed from Slack by Pat Doe." \
  "$new|$(acli jira workitem view FXA-90001 --json | jq -r '.fields.labels | join(",")')|$(acli jira workitem view FXA-90001 --json | jq -r '.fields.description' | tail -1)"
check "the next draft lists it as a likely duplicate" "FXA-90001" \
  "$(printf '%s' '{"type":"Task","summary":"Slow networks break sign-in","description":"x"}' | session_jira_draft agent-a2 --stdin | jq -r '.dups[0].key')"
check "undo closes it as Cancelled, a status FxA's Jira has, and the next search leaves it out" "0|Cancelled|0" \
  "$(session_jira_undo agent-a1 FXA-90001 Pat >/dev/null 2>&1; echo $?)|$(acli jira workitem view FXA-90001 --json | jq -r '.fields.status.name')|$(acli jira workitem search --jql 'project = FXA AND summary ~ "sign"' --json | jq length)"
check "the real acli never ran" "no" "$([ -s "$tmp/real.log" ] && echo yes || echo no)"
exit "$fail"
