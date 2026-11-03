#!/usr/bin/env bash
# Write the outputs of the v1 model functions for each v1 page fixture, for the dashboard v2 ports to compare with.
#   bash skills/fxa-ctl-dev/v1-golden.sh [out dir]   default dashboard-v2/test/golden, one <fixture name>.json each
# The clock (PAGE_NOW) and the zone (UTC) are fixed, so the "@iso-3600" fixture times and every age give the same
# output on each run. A port sets its clock to the file's "now" and resolves the fixture times against it.
# A function that throws records {"error": "..."}. Run it again after a change to a fixture or to v1 model code.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:-$here/../../dashboard-v2/test/golden}"
export PAGE_NOW=1793750400 TZ=UTC LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
# Each key is a v1 function; a per-row function is a map from the row key to its result.
probe='
const rep = (k, v) => v === Infinity ? "Infinity" : v === -Infinity ? "-Infinity" : Number.isNaN(v) ? "NaN"
  : v instanceof Html ? String(v) : v instanceof Set ? [...v] : v instanceof Map ? Object.fromEntries(v) : v;
const g = { now: Date.now(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
// JSON drops undefined: a result or a row result that is undefined is the string "undefined".
const u = v => v === undefined ? "undefined" : v;
const run = (name, f) => { try { g[name] = u(f()); } catch (e) { g[name] = { error: String(e && e.message) }; } };
const SS = AGENTS?.sessions ?? [], REV = SNAP?.review ?? [], TS = TEAMS?.teams ?? [];
const byKey = (xs, f) => Object.fromEntries(xs.map(x => [x.key ?? x.profile, u(f(x))]));
run("pipeSnap", () => SNAP);
run("merged", merged);
run("boardItems", boardItems);
run("classify", () => boardItems().map(classify));
run("laneRows", laneRows);
run("beltGroups", beltGroups);
run("beltCount", () => beltCount(beltGroups()));
run("floorRows", floorRows);
run("ovFloor", ovFloor);
run("ovNeeds", ovNeeds);
run("sbRows", sbRows);
run("sbBadge", sbBadge);
run("strays", strays);
run("statsBounds", () => Object.fromEntries(["today", "yesterday", "7d", "30d", "90d", "month", "lastmonth", "all"].map(r => [r, statsBounds(r)])));
run("answerRows", answerRows);
run("sessHeads", () => sessHeads(SS).map(s => s.key));
run("chainOf", () => byKey(SS, s => chainOf(s, SS).map(x => x.key)));
run("sessStatus", () => byKey(SS, sessStatus));
run("sessUsd", () => byKey(SS, sessUsd));
run("isWaitingOnHuman", () => byKey(REV, isWaitingOnHuman));
run("verdictTag", () => byKey(REV, verdictTag));
run("queueWaits", queueWaits);
run("skipGroups", () => skipGroups(queueWaits()));
run("teamNeeds", () => byKey(TS, teamNeeds));
run("teamBadge", () => teamBadge(TS));
run("teamErrs", teamErrs);
run("costPerMerged", () => { const [lo] = statsBounds("7d"); return costPerMerged(lo, Infinity, ovStats()?.prs ?? [], ovStats()?.rows ?? []); });
run("health", () => ({ dot: document.getElementById("dot").className, word: document.getElementById("health").textContent }));
run("alerts", () => [...document.querySelectorAll("#attn .alert")].map(a => ({ tone: a.classList.contains("bad") ? "bad" : "warn", text: a.textContent })));
return JSON.stringify(g, rep);'
mkdir -p "$out"
for f in "$here"/page-fixture*.json; do
  n="$(basename "$f")"
  r="$(bash "$here/page.sh" '#overview' --fixture "$f" --probe "$probe")" || { c=$?; [ "$c" = 3 ] && { echo "$r"; exit 0; }; echo "FAIL $n: $r" >&2; exit 1; }
  printf '%s' "$r" | python3 -c 'import json, sys; json.dump(json.load(sys.stdin), sys.stdout, indent=1); print()' > "$out/$n" \
    || { echo "FAIL $n: the probe gave no JSON: $(printf '%s' "$r" | head -c 300)" >&2; exit 1; }
done
echo "wrote $(ls "$here"/page-fixture*.json | wc -l | tr -d ' ') golden files to $(cd "$out" && pwd)"
