#!/usr/bin/env bash
# Pin Claude Code and Codex to their latest npm releases in the one pin file, then check the pins:
#   bash skills/fxa-ctl-dev/bump-cli.sh
# Then commit, ship.sh and promote: the promote starts the snapshot refresh.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"; f="$root/packer/scripts/03b-toolchain.sh"
npm="${FXA_BUMP_NPM:-npm}"
cc="$("$npm" view @anthropic-ai/claude-code version)"; cx="$("$npm" view @openai/codex version)"
# Both versions are read and checked before the file changes, so a failure leaves no half bump.
for x in "$cc" "$cx"; do [[ "$x" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "bump-cli.sh: npm gave no release version: [$x]; nothing changed" >&2; exit 1; }; done
for p in "CLAUDE_CODE_VERSION $cc" "CODEX_VERSION $cx"; do
  set -- $p; old="$(sed -n "s/^$1=//p" "$f")"
  sed -i.bak "s/^$1=.*/$1=$2/" "$f" && rm -f "$f.bak"
  echo "$1: $old -> $2"
done
bash "$root/lib/claude-pin.check.sh"
