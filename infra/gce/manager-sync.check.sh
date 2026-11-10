#!/usr/bin/env bash
# Offline check for the root part of manager.sh sync: an older LLM proxy unit moves to llm-proxy.env once it exists.
#   bash infra/gce/manager-sync.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
here="$(cd "$(dirname "$0")" && pwd)"; t="$(mktemp -d)"; trap 'rm -rf "$t"' EXIT
step="$(sed -n '/# The LLM proxy reads only llm-proxy.env/,/^  fi$/p' "$here/manager.sh" | sed "s#/etc/systemd/system#$t#g; s#/home/fxa/.config/fxa#$t#g")"
# The step runs on the Ubuntu manager (GNU sed -i); on macOS the stub gives BSD sed its empty suffix.
run() { ( sudo() { case "$1" in systemctl) echo "$*" >> "$t/calls" ;;
    sed) shift 2; if sed --version >/dev/null 2>&1; then command sed -i "$@"; else command sed -i '' "$@"; fi ;;
    *) "$@" ;; esac; }; eval "$step" ); }
old='EnvironmentFile=-/home/fxa/Desktop/working2/fxa-sandbox-ctl/.env'
printf '[Service]\n%s\nExecStart=x\n' "$old" > "$t/fxa-llm-proxy.service"; : > "$t/calls"
run >/dev/null
check "no llm-proxy.env yet: the unit stays on the ctl .env" "$old|0" "$(sed -n 2p "$t/fxa-llm-proxy.service")|$(grep -c daemon-reload "$t/calls")"
echo 'ANTHROPIC_API_KEY=k' > "$t/llm-proxy.env"; out="$(run)"
check "with llm-proxy.env: the unit reads it, daemon-reload runs, and the restart is left to the operator" "EnvironmentFile=-$t/llm-proxy.env|1|yes|0" \
  "$(sed -n 2p "$t/fxa-llm-proxy.service")|$(grep -c daemon-reload "$t/calls")|$(grep -q 'restart fxa-llm-proxy' <<< "$out" && echo yes)|$(grep -c 'restart fxa-llm-proxy' "$t/calls")"
run >/dev/null
check "a unit already moved is left alone" "1" "$(grep -c daemon-reload "$t/calls")"
# The gateway: the fxa part marks a changed gateway.py, and the root part restarts once for it.
mark="$(grep 'fxa-gateway-changed$' "$here/manager.sh" | sed "s#~/Desktop/working2/fxa-sandbox-ctl#$t/r#; s#~/#$t/#")"
gw="$(sed -n '/# The MCP gateway restarts only/,/^  fi$/p' "$here/manager.sh" | sed "s#/home/fxa/#$t/#g")"
g() { git -C "$t/r" -c user.email=user@example.com -c user.name=t "$@"; }
git init -q "$t/r"; mkdir -p "$t/r/infra/mcp-gateway"; echo a > "$t/r/infra/mcp-gateway/gateway.py"; echo a > "$t/r/x"; g add -A; g commit -qm one
old="$(g rev-parse HEAD)"; echo b > "$t/r/x"; g commit -qam two; eval "$mark"
check "another file changed: no mark" "no" "$([ -e "$t/.fxa-gateway-changed" ] && echo yes || echo no)"
echo b > "$t/r/infra/mcp-gateway/gateway.py"; g commit -qam three; eval "$mark"
: > "$t/calls"; gwrun() { ( sudo() { case "$1" in systemctl) echo "$*" >> "$t/calls" ;; *) "$@" ;; esac; }; eval "$gw" ); }
gwrun >/dev/null; gwrun >/dev/null
check "gateway.py changed: one restart, and the mark is gone" "1|no" "$(grep -c 'restart fxa-mcp-gateway' "$t/calls")|$([ -e "$t/.fxa-gateway-changed" ] && echo yes || echo no)"
[ "$fail" = 0 ] && echo "all checks pass"
exit "$fail"
