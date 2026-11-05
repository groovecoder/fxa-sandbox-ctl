#!/usr/bin/env bash
# Offline check for the GitHub Actions digest a session gets for a pasted run or job link.
#   bash lib/gha-digest.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT; : > "$tmp/calls"
here="$(dirname "$0")"
eval "$(sed -n '/^gha_digests() {/,/^}/p' "$here/github.sh")"
eval "$(sed -n '/^ci_scrub() {/,/^}/p' "$here/circleci.sh")"
_with_timeout() { shift; "$@"; }
memory_profile_slugs() { printf '%s\n' mozilla-services/syncstorage-rs mozilla/fxa; }
# gh, from a fixture: one failed step with colors and timestamps.
gh() { echo "$*" >> "$tmp/calls"
  printf 'e2e\tRun tests\t2026-10-28T13:30:01.1234567Z \033[31mFAILED\033[0m tools/integration_tests/test_storage.py::test_x - AssertionError\n'
  printf 'e2e\tRun tests\t2026-10-28T13:30:02.0000000Z make: *** [Makefile:9: test] Error 2\n'
  printf 'e2e\tRun tests\t2026-10-28T13:30:03.0000000Z token ghp_%s -----BEGIN PRIVATE KEY-----\n' "$(printf 'A1%.0s' $(seq 18))"
  printf 'e2e\tRun tests\t2026-10-28T13:30:04.0000000Z MIIEfake\n-----END PRIVATE KEY----- image sha256:%s\n' "$(printf 'ab%.0s' $(seq 32))"; }
out="$(gha_digests 'see https://github.com/mozilla-services/syncstorage-rs/actions/runs/40681838378/job/122802211157 please' N1)"
check "a team repo's job link: gh reads that job's failed log" "run view 40681838378 --repo mozilla-services/syncstorage-rs --job 122802211157 --log-failed" "$(cat "$tmp/calls")"
check "the failing test is in the digest, without colors or timestamps" "1" "$(grep -c $'^e2e\tRun tests\tFAILED tools/integration_tests/test_storage.py::test_x' <<< "$out")"
check "it is fenced as untrusted with the nonce" "1|1" "$(grep -c '^<<<CI-N1>>>$' <<< "$out")|$(grep -c '^<<</CI-N1>>>$' <<< "$out")"
check "a GitHub token and a private key are scrubbed, an image digest stays" "0|0|1|1" \
  "$(grep -c 'ghp_' <<< "$out")|$(grep -c 'MIIEfake' <<< "$out")|$(grep -c 'token \[token\] \[private key\] image sha256:abab' <<< "$out")|$(grep -c "sha256:$(printf 'ab%.0s' $(seq 32))" <<< "$out")"
: > "$tmp/calls"; gha_digests 'https://github.com/mozilla/fxa/actions/runs/123' N1 > /dev/null
check "a run link reads every failed job of the run" "run view 123 --repo mozilla/fxa --log-failed" "$(cat "$tmp/calls")"
: > "$tmp/calls"; out="$(gha_digests 'https://github.com/mozilla/fxa-private/actions/runs/9/job/8' N1)"
check "another repo's link: no call, no digest" "|" "$(cat "$tmp/calls")|$out"
: > "$tmp/calls"; out="$(gha_digests 'nothing here' N1)"
check "no link: no call" "|" "$(cat "$tmp/calls")|$out"
exit "$fail"
