#!/usr/bin/env bash
# Offline check for per-run MCP gateway tokens and the MCP config a runner writes.
#   bash lib/mcp-token.check.sh
set -u
fail=0
check() { # check <name> <want> <got>
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"
  else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi
}
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
FXA_MCP_GATEWAY_DIR="$tmp/gw"; FXA_LLM_PROXY_DIR="$tmp/llm"
source "$(dirname "$0")/llm-token.sh"; source "$(dirname "$0")/mcp-token.sh"
eval "$(sed -n '/^_claude_auth_line() {/,/^}/p' "$(dirname "$0")/agent.sh")"

check "no connectors: no token" "1" "$(mcp_token_for fxa-1 >/dev/null 2>&1; echo $?)"
check "a bad connector list is refused" "1" "$(mcp_token_for fxa-1 'jira;rm' >/dev/null 2>&1; echo $?)"
t1="$(mcp_token_for fxa-1 jira,github)"
check "the token has the gateway's form" "yes" "$([[ "$t1" =~ ^fxm_[A-Za-z0-9]{32}$ ]] && echo yes)"
check "it holds the connectors" '["jira","github"]' "$(jq -c .connectors "$tmp/gw/tokens/$t1.json")"
check "a later turn reuses it, asking for none or the same list" "$t1|$t1" "$(mcp_token_for fxa-1)|$(mcp_token_for fxa-1 jira,github)"
check "the token file is private" "600" "$(perl -e 'printf "%o", (stat shift)[2] & 0777' "$tmp/gw/tokens/$t1.json")"

ANTHROPIC_API_KEY=sk-real
check "no gateway: the Claude line only" "export ANTHROPIC_API_KEY=sk-real" "$(_claude_auth_line fxa-1)"
FXA_MCP_GATEWAY_URL=http://10.0.0.2:8789/
check "with a gateway: its URL and the run's token" \
  "export ANTHROPIC_API_KEY=sk-real|export FXA_MCP_URL=http://10.0.0.2:8789/mcp|export FXA_MCP_TOKEN=$t1" \
  "$(_claude_auth_line fxa-1 | paste -sd'|' -)"
check "a run with no connectors gets no MCP lines" "export ANTHROPIC_API_KEY=sk-real" "$(_claude_auth_line fxa-2)"
check "a pipeline run gets none, even with connectors in .env" "export ANTHROPIC_API_KEY=sk-real" \
  "$(FXA_MCP_CONNECTORS=jira _claude_auth_line fxa-3)"
check "a session gets its own connectors" "jira" \
  "$(_FXA_SESSION_MCP=jira _claude_auth_line agent-s1 >/dev/null; jq -r '.connectors | join(",")' "$tmp/gw/tokens/$(cat "$tmp/gw/runs/agent-s1").json")"
check "no credential still fails" "1" "$(ANTHROPIC_API_KEY= CLAUDE_CODE_OAUTH_TOKEN= _claude_auth_line fxa-1 >/dev/null; echo $?)"

# The launch snippet and flags, run as the runner would, with the config path moved into $tmp.
snippet="${_MCP_LAUNCH_SNIPPET//\/home\/agent/$tmp}"
out="$(FXA_MCP_URL=http://10.0.0.2:8789/mcp FXA_MCP_TOKEN="$t1" bash -c "$snippet
printf '%s\n' ${_MCP_CLAUDE_FLAGS}")"
check "the runner passes the config, strictly" "--mcp-config|$tmp/.fxa-mcp.json|--strict-mcp-config" "$(printf '%s' "$out" | paste -sd'|' -)"
check "the config is valid and points at the gateway" "http://10.0.0.2:8789/mcp Bearer $t1" \
  "$(jq -r '.mcpServers.fxa | "\(.url) \(.headers.Authorization)"' "$tmp/.fxa-mcp.json")"
check "the config is private" "600" "$(perl -e 'printf "%o", (stat shift)[2] & 0777' "$tmp/.fxa-mcp.json")"
check "no MCP exports: no flags" "" "$(bash -c "$snippet
printf '%s\n' ${_MCP_CLAUDE_FLAGS}")"
check "the snippet has no single quote" "no" "$(printf '%s%s' "$_MCP_LAUNCH_SNIPPET" "$_MCP_CLAUDE_FLAGS" | grep -q "'" && echo yes || echo no)"

# Pipeline runs, fix rounds and dependency fix runs: the CI connectors only.
check "the CI connectors of a list, in its order; none when it has none" "github-ci,circleci||" \
  "$(mcp_ci_only jira,github,github-ci,slack,circleci)|$(mcp_ci_only jira,github)|$(mcp_ci_only '')"
check "a pipeline run whose PIPE_MCP has no CI connector gets no token" "export ANTHROPIC_API_KEY=sk-real|no token" \
  "$(_FXA_SESSION_MCP="$(mcp_ci_only jira,github)" _claude_auth_line fxa-p0 | paste -sd'|' -)|$([ -e "$tmp/gw/runs/fxa-p0" ] && echo token || echo 'no token')"
_FXA_SESSION_MCP="$(mcp_ci_only jira,github,github-ci,circleci)" _claude_auth_line fxa-p1 >/dev/null
check "a pipeline run with jira,github,github-ci,circleci gets exactly github-ci,circleci" '["github-ci","circleci"]' \
  "$(jq -c .connectors "$tmp/gw/tokens/$(cat "$tmp/gw/runs/fxa-p1").json")"
_FXA_SESSION_MCP=jira,github,github-ci,circleci _claude_auth_line agent-p1 >/dev/null
check "a session with the same list keeps all four" '["jira","github","github-ci","circleci"]' \
  "$(jq -c .connectors "$tmp/gw/tokens/$(cat "$tmp/gw/runs/agent-p1").json")"
t3="$(mcp_token_for fxa-r jira,github)"; t4="$(mcp_token_for fxa-r github-ci,circleci)"
check "a token made with jira,github, then asked for with github-ci,circleci: a new token with only those, the old one expired" \
  'yes|["github-ci","circleci"]|0' "$([ "$t3" != "$t4" ] && echo yes)|$(jq -c .connectors "$tmp/gw/tokens/$t4.json")|$(jq .expires "$tmp/gw/tokens/$t3.json")"
scope() { jq -c '.scope // "none"' "$tmp/gw/tokens/$1.json"; }
check "an FxA token reads FxA's repos from its record and keeps FxA's Jira rules" '{"jira_projects":[],"repos":["mozilla/fxa","mozilla/ecosystem-platform"]}' \
  "$(PIPE_PROFILE=fxa PIPE_JIRA_PROJECT=FXA; PIPE_REPOS=("mozilla/fxa /home/agent/fxa work" "mozilla/ecosystem-platform /home/agent/ecosystem-platform work"); scope "$(_FXA_MCP_WORK_ONLY=1 mcp_token_for fxa-s1 github-ci,circleci)")"
check "FxA from its conf: the repo it names" '{"jira_projects":[],"repos":["mozilla/fxa"]}' "$(PIPE_PROFILE=fxa PIPE_REPO_SLUG=mozilla/fxa; scope "$(mcp_token_for fxa-s2 github)")"
deps() { PIPE_PROFILE=pay PIPE_JIRA_PROJECT=PAY; PIPE_REPOS=("mozilla/pay /home/agent/pay work" "mozilla/fxa-private /home/agent/fxa dep"); scope "$("$@")"; }
check "a pipeline token of a team with a dep repo reads only its work repo; a session reads both" \
  '{"jira_projects":["PAY"],"repos":["mozilla/pay"]}|{"jira_projects":["PAY"],"repos":["mozilla/pay","mozilla/fxa-private"]}' \
  "$(_FXA_MCP_WORK_ONLY=1 deps mcp_token_for pay-1 github-ci)|$(deps mcp_token_for agent-pay-1 github)"
ctl="$(dirname "$0")/../fxa-sandbox-ctl"
check "cmd_jira gives a pipeline run its CI connectors, work repos only, before the runner starts" "1" \
  "$(sed -n '/^cmd_jira() {/,/^}/p' "$ctl" | grep -B1 '  agent_run ' | grep -c 'export _FXA_SESSION_MCP="$(mcp_ci_only "${PIPE_MCP:-}")" _FXA_MCP_WORK_ONLY=1')"
check "a dependency fix run gets the CI connectors only" "1" "$(grep -c '^  \[ -z "$fix" \] || { mcp="$(mcp_ci_only "${PIPE_MCP:-}")"; mcp_set=1; }$' "$ctl")"

mcp_token_revoke fxa-1
check "revoke expires the token and keeps its count" "0 0" "$(jq -r '"\(.expires) \(.calls)"' "$tmp/gw/tokens/$t1.json")"
check "a revoked run gets no MCP lines without connectors" "" "$(mcp_auth_lines fxa-1)"
exit "$fail"
