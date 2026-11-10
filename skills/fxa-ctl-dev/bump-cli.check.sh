#!/usr/bin/env bash
# Offline check for bump-cli.sh: it writes both latest versions, and a bad npm answer changes nothing.
#   bash skills/fxa-ctl-dev/bump-cli.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
here="$(cd "$(dirname "$0")" && pwd)"; tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/skills/fxa-ctl-dev" "$tmp/packer/scripts" "$tmp/lib" "$tmp/infra"
cp "$here/bump-cli.sh" "$tmp/skills/fxa-ctl-dev/"; cp "$here/../../lib/claude-pin.check.sh" "$tmp/lib/"
printf 'x=1\nCLAUDE_CODE_VERSION=2.1.1\nCODEX_VERSION=0.1.0\n' > "$tmp/packer/scripts/03b-toolchain.sh"
printf '#!/bin/bash\ncase "$2" in @anthropic-ai/*) echo "${CC:-2.1.9}" ;; *) echo 0.2.0 ;; esac\n' > "$tmp/npm"; chmod +x "$tmp/npm"
run() { FXA_BUMP_NPM="$tmp/npm" bash "$tmp/skills/fxa-ctl-dev/bump-cli.sh" > "$tmp/out" 2>&1; echo $?; }
check "bumps both pins and the pin check passes" "0|CLAUDE_CODE_VERSION=2.1.9,CODEX_VERSION=0.2.0" \
  "$(run)|$(grep -E '^C' "$tmp/packer/scripts/03b-toolchain.sh" | paste -sd, -)"
check "it prints old -> new" "CLAUDE_CODE_VERSION: 2.1.1 -> 2.1.9" "$(head -1 "$tmp/out")"
before="$(cat "$tmp/packer/scripts/03b-toolchain.sh")"
check "a bad npm answer: refused, file unchanged" "1|same" "$(CC='npm ERR!' run)|$([ "$before" = "$(cat "$tmp/packer/scripts/03b-toolchain.sh")" ] && echo same)"
exit "$fail"
