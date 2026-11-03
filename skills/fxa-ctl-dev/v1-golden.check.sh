#!/usr/bin/env bash
# The committed dashboard-v2/test/golden files equal a new run of v1-golden.sh: one per page fixture, each the
# output of the v1 model code in dashboard/index.html, rendered by page.sh with a fixed clock.
#   bash skills/fxa-ctl-dev/v1-golden.check.sh
set -u
here="$(cd "$(dirname "$0")" && pwd)"; tmp="$(mktemp -d "${TMPDIR:-/tmp}/v1-golden.XXXXXX")"; trap 'rm -rf "$tmp"' EXIT
o="$(bash "$here/v1-golden.sh" "$tmp" 2>&1)" || { echo "FAIL v1-golden.sh: $(tail -2 <<< "$o" | tr '\n' ' ')"; exit 1; }
if grep -q '^skip' <<< "$o"; then echo "$o"; exit 0; fi
if d="$(diff -r "$here/../../dashboard-v2/test/golden" "$tmp" 2>&1)"; then echo "ok   the golden files equal a new run"
else echo "FAIL the golden files differ from v1: run bash skills/fxa-ctl-dev/v1-golden.sh and commit dashboard-v2/test/golden"; head -20 <<< "$d"; exit 1; fi
