#!/usr/bin/env bash
# eval-src.sh: the clone an eval case reads its base and fix from. Prints its folder.
#
#   eval-src.sh <case.json> [<sha or ref>]...
#
# An FxA case (repo mozilla/fxa, or none) uses FXA_CLONE, as before. Any other repo uses
# FXA_EVAL_CLONE when set (a working clone, to test a setup branch not yet pushed), else a
# mirror in $FXA_EVAL_CACHE/src/<owner>-<name>, cloned from GitHub on first use. Each sha or
# ref given that the clone lacks is fetched, so a case's base and fix are there.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
spec="${1:?usage: eval-src.sh <case.json> [<sha or ref>]...}"; shift
slug="$(jq -r '.repo // "mozilla/fxa"' "$spec")"
[[ "$slug" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "eval-src.sh: repo must be owner/name, not $slug" >&2; exit 2; }
if [ "$slug" = mozilla/fxa ]; then src="${FXA_CLONE:-$ROOT/../fxa}"
elif [ -n "${FXA_EVAL_CLONE:-}" ]; then src="$FXA_EVAL_CLONE"
else
  src="${FXA_EVAL_CACHE:-$HOME/.cache/fxa-eval}/src/${slug/\//-}"
  [ -d "$src/.git" ] || { echo "== cloning $slug (once)" >&2; git clone -q "https://github.com/$slug" "$src" >&2; }
fi
[ -d "$src/.git" ] || { echo "eval-src.sh: no clone of $slug at $src" >&2; exit 2; }
for want in "$@"; do
  git -C "$src" cat-file -e "${want}^{commit}" 2>/dev/null || git -C "$src" fetch -q origin "$want" >&2 \
    || { echo "eval-src.sh: $src has no $want, and origin could not fetch it" >&2; exit 1; }
done
echo "$src"
