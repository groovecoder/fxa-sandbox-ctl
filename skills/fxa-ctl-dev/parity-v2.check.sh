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
# serve.py gives v2 the fixture's viewer, as page.sh gives v1: an admin fixture's snapshot keeps a fix's fix_pr.
port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
python3 "$here/../../dashboard-v2/e2e/serve.py" --port "$port" --fixture "$here/page-fixture-depfix.json" > "$tmp/serve.log" 2>&1 & pid=$!
for _ in $(seq 50); do curl -sf "http://localhost:$port/api/snapshot" -o "$tmp/snap.json" && break; python3 -c 'import time; time.sleep(0.1)'; done
kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
python3 -c 'import json, sys; assert {s["key"]: s.get("fix_pr") for s in json.load(open(sys.argv[1]))["agents"]["sessions"]}["agent-fix001"] == 90001' "$tmp/snap.json" 2>/dev/null \
  && ok "serve.py: an admin fixture's /api/snapshot keeps fix_pr" || no "serve.py: an admin fixture's /api/snapshot lost fix_pr: $(head -c 300 "$tmp/snap.json" "$tmp/serve.log" 2>&1)"
# A live fixture: serve.py --v1 gives v1 the reads of its first snapshot, before the deltas (basic's delta resolves the open error).
python3 "$here/../../dashboard-v2/e2e/serve.py" --live "$here/../../dashboard-v2/fixtures/live/basic.ndjson" --v1 > "$tmp/live-v1.json" 2>&1
python3 -c 'import json, sys; f = json.load(open(sys.argv[1])); assert f["/api/snapshot"]["snapshot"]["repo"] == "example/repo" and f["/api/team-admin"]["admin"] is True
assert [e["status"] for e in f["/api/errors"]] == ["open", "resolved"] and f["/api/stats"]["rows"]' "$tmp/live-v1.json" 2>/dev/null \
  && ok "serve.py --live --v1: the v1 page fixture of a live fixture's first snapshot" || no "serve.py --live --v1: $(head -c 300 "$tmp/live-v1.json")"
exit "$fail"
