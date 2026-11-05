#!/usr/bin/env bash
# Offline check that manager.sh does not silently replace settings changed on the VM.
#   bash lib/manager-env-guard.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
pat='/^_env_guard() {/,/^}/p'; eval "$(sed -n "$pat" "$here/../infra/gce/manager.sh")"
# The VM's copies live in $tmp/vm; ssh_vm answers the guard's `sudo cat` from there.
mkdir -p "$tmp/vm"; ssh_vm() { cat "$tmp/vm/$(grep -oE '[a-z]+\.env\.base' <<< "$1" | head -1)" 2>/dev/null || true; }
printf 'A=1\nB=2\n' > "$tmp/bot.env.base"
check "no copy on the VM yet: ship it" "0" "$(_env_guard "$tmp" bot.env.base 2>/dev/null; echo $?)"
printf 'B=2\nA=1\n' > "$tmp/vm/bot.env.base"
check "the same lines in another order: ship it" "0" "$(_env_guard "$tmp" bot.env.base 2>/dev/null; echo $?)"
printf 'A=1\nB=3\n' > "$tmp/vm/bot.env.base"
out="$(_env_guard "$tmp" bot.env.base 2>&1)"; rc=$?
check "a change on the VM stops it, and shows the change" "1|< B=3|> B=2" "$rc|$(grep '^< ' <<< "$out")|$(grep '^> ' <<< "$out")"
check "FXA_ENV_OVERWRITE=1 replaces it on purpose" "0" "$(FXA_ENV_OVERWRITE=1 _env_guard "$tmp" bot.env.base 2>/dev/null; echo $?)"
# The gateway JSON: a ${VAR} passes, a literal CircleCI token stops the deploy.
eval "$(sed -n '/^_literal_cred() {/,/^}/p' "$here/../infra/gce/manager.sh")"
lc() { printf '%s\n' "$1" > "$tmp/gw.json"; _literal_cred "$tmp/gw.json" && echo stop || echo ship; }
check "the gateway JSON: a reference ships, a literal Circle-Token or CCIPAT_ stops" "ship|ship|stop|stop|stop" \
  "$(lc '{"headers": {"Circle-Token": "${CIRCLECI_TOKEN}"}}')|$(lc '{"headers": {"Authorization": "Bearer ${X}"}}')|$(lc '{"headers": {"Circle-Token": "abc123"}}')|$(lc '{"t": "CCIPAT_abc"}')|$(lc '{"a": "Bearer abc"}')"
exit "$fail"
