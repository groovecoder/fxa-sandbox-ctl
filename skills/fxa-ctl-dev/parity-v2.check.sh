#!/usr/bin/env bash
# parity-v2.sh's compare step: an equal probe passes, a diff the allow list names passes, any other diff fails.
#   bash skills/fxa-ctl-dev/parity-v2.check.sh
set -u
here="$(cd "$(dirname "$0")" && pwd)"; tmp="$(mktemp -d "${TMPDIR:-/tmp}/parity-v2-check.XXXXXX")"; trap 'rm -rf "$tmp"' EXIT
fail=0; ok() { echo "ok   $1"; }; no() { echo "FAIL $1"; fail=1; }
echo '{"badges": {"pipeline": "", "sessions": "1"}, "title": "(1) FxA Agent"}' > "$tmp/v1.json"
echo '{"badges": {"pipeline": "?", "sessions": "1"}, "title": "(1) FxA Agent"}' > "$tmp/v2.json"
echo '[{"key": "badges.pipeline", "v1": "", "v2": "?", "why": "a fix"}]' > "$tmp/allow.json"
echo '[{"key": "badges.pipeline", "fixture": "other", "why": "a fix in another fixture"}]' > "$tmp/other.json"
run() { PARITY_ALLOW="$tmp/$1" bash "$here/parity-v2.sh" --compare "$tmp/$2" "$tmp/$3" fx 2>&1; }
o="$(run allow.json v1.json v1.json)" && [ -z "$o" ] && ok "an equal probe passes with no output" || no "an equal probe: $o"
o="$(run allow.json v1.json v2.json)" && grep -q '^allowed fx badges.pipeline: v1="" v2="?"$' <<< "$o" && ok "a listed diff passes and says allowed" || no "a listed diff: $o"
if o="$(run other.json v1.json v2.json)"; then no "a diff listed for another fixture passed"
elif grep -q '^DIFF fx badges.pipeline' <<< "$o"; then ok "a diff listed for another fixture fails"; else no "another fixture's entry: $o"; fi
echo '{"badges": {"pipeline": "", "sessions": "2"}, "title": "(1) FxA Agent"}' > "$tmp/v3.json"
if o="$(run allow.json v1.json v3.json)"; then no "an unlisted diff passed"
elif grep -q '^DIFF fx badges.sessions: v1="1" v2="2"$' <<< "$o"; then ok "an unlisted diff fails and names the key"; else no "an unlisted diff: $o"; fi
python3 -c 'import json, sys; [e["why"] for e in json.load(open(sys.argv[1]))]' "$here/parity-allow.json" && ok "every parity-allow.json entry says why" || no "parity-allow.json: an entry has no why"
exit "$fail"
