#!/usr/bin/env bash
# verify.sh [--pairing]   channelserver's CI checks and FxA's pairing spec through this build. See SKILL.md.
set -uo pipefail
S=/home/agent/channelserver FXA=/home/agent/fxa LOG=/home/agent/.channelserver.log
export RUSTUP_HOME=/opt/rust/rustup PATH=/opt/rust/cargo/bin:$PATH
rows=() rc=0
row() { rows+=("$(printf '%-5s %s' "$1" "$2")"); [ "$1" = PASS ] || rc=1; }
done_() { echo; echo "== verdict"; printf '%s\n' "${rows[@]}"; exit "$rc"; }
[ -f /run/fxa-profile/ready ] || { echo "FAIL: the profile is not ready: $(cat /run/fxa-profile/failed 2>/dev/null || echo 'see /var/log/profile-boot.log')"; exit 1; }
cd "$S" || exit 2

# GCE starts FxA on demand; it pairs through :8058 (PAIRING_SERVER_BASE_URI in /etc/agent-env.sh).
if ! curl -sf -m 5 -o /dev/null localhost:3030/.well-known/fxa-client-configuration; then
  echo "== fxa-start (FxA is not running; a few minutes)"
  ( cd "$FXA" && source /etc/agent-env.sh && fxa-start ) > /tmp/channelserver-verify-fxa-start.log 2>&1 \
    && row PASS "fxa-start" || { tail -15 /tmp/channelserver-verify-fxa-start.log; row FAIL "fxa-start (log: /tmp/channelserver-verify-fxa-start.log)"; done_; }
fi
echo "== channelserver-local"
channelserver-local && row PASS "channelserver rebuilt, on :8058, and the content server pairs through it" || { row FAIL "channelserver-local"; done_; }

if [ "${1:-}" != --pairing ]; then
  echo "== cargo clippy"
  cargo clippy -q --all -- -D warnings 2>&1 | tail -30; [ "${PIPESTATUS[0]}" = 0 ] && row PASS "cargo clippy --all -- -D warnings" || row FAIL "cargo clippy --all -- -D warnings"
  echo "== cargo test"
  cargo test -q --all 2>&1 | tail -15; [ "${PIPESTATUS[0]}" = 0 ] && row PASS "cargo test --all" || row FAIL "cargo test --all"
fi

echo "== FxA pairing spec"
n0=$(wc -l < "$LOG") out=/tmp/channelserver-verify-pairing.log
( cd "$FXA/packages/functional-tests" && source /etc/agent-env.sh && CHANNEL_SERVER_URI=ws://localhost:8058 \
  timeout 600 xvfb-run -a npx playwright test --project=local --workers=1 --retries=0 --reporter=list tests/pairing/pairingFlow.spec.ts ) > "$out" 2>&1; prc=$?
grep -E '✓|✘|passed|failed|Error:' "$out" | cut -c1-240
# Exit 0, a passed count and no failed or flaky one: "1 failed, 1 passed" is not a pass.
[ "$prc" = 0 ] && grep -qE '^ *[0-9]+ passed' "$out" && ! grep -qE '^ *[0-9]+ (failed|flaky)' "$out" \
  && row PASS "FxA pairingFlow.spec.ts through ws://localhost:8058" || row FAIL "FxA pairingFlow.spec.ts (log: $out)"

# A channel that two sessions joined during the spec, and messages through the server.
new="$(tail -n +$((n0 + 1)) "$LOG")"
pairs="$(grep -o 'New connection.*channel: [A-Za-z0-9_-]*' <<< "$new" | sed 's/.*channel: //' | sort | uniq -c | awk '$1 >= 2' | wc -l | tr -d ' ')"
msgs="$(grep -c 'WEBSOCKET MESSAGE' <<< "$new" || true)"
[ "$pairs" -ge 1 ] && [ "$msgs" -ge 1 ] && row PASS "the local server paired $pairs channel(s) and relayed $msgs message(s)" \
  || row FAIL "the local server saw no paired channel ($pairs channels, $msgs messages): the spec did not use it"
done_
