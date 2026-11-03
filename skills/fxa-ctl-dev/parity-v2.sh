#!/usr/bin/env bash
# Compare the dashboard shell of v1 and v2 on the v1 page fixtures: rail badges and their tones, tab counts,
# the health word and the tab title. v1 renders in page.sh; v2 is a fresh build served by dashboard-v2/e2e/serve.py.
#   bash skills/fxa-ctl-dev/parity-v2.sh [fixture.json ...]   default: every skills/fxa-ctl-dev/page-fixture*.json
#   bash skills/fxa-ctl-dev/parity-v2.sh --compare v1.json v2.json [name]   only the compare step, on probe outputs
# A diff that parity-allow.json lists (a known v1 bug that v2 fixes) passes; any other diff fails.
# The views add their probes to PROBE in wave 2.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; v2="$here/../../dashboard-v2"
allow="${PARITY_ALLOW:-$here/parity-allow.json}"

# compare <v1.json> <v2.json> <name>: one line per diff; exit 1 on a diff that the allow list does not name.
compare() {
  python3 - "$1" "$2" "$3" "$allow" <<'PY'
import json, sys
a, b, name, allow = sys.argv[1:]
def flat(d, p=""):
    out = {}
    for k, v in d.items():
        out.update(flat(v, f"{p}{k}.") if isinstance(v, dict) else {f"{p}{k}": v})
    return out
v1, v2 = flat(json.load(open(a))), flat(json.load(open(b)))
ok = json.load(open(allow))
def allowed(k, x, y):
    return any(e["key"] == k and e.get("fixture", "*") in ("*", name) and e.get("v1", x) == x and e.get("v2", y) == y for e in ok)
bad = 0
for k in sorted(set(v1) | set(v2)):
    x, y = v1.get(k), v2.get(k)
    if x == y: continue
    tag = "allowed" if allowed(k, x, y) else "DIFF"
    bad += tag == "DIFF"
    print(f"{tag} {name} {k}: v1={json.dumps(x, ensure_ascii=False)} v2={json.dumps(y, ensure_ascii=False)}")
sys.exit(1 if bad else 0)
PY
}

if [ "${1:-}" = --compare ]; then compare "$2" "$3" "${4:-fixture}"; exit; fi

# The shell probe: the same ids in v1 and v2 (#n-<view>, #vtabs, #health), on each route in turn.
PROBE='
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (e) => (e?.firstChild?.textContent ?? "").trim();
const out = { badges: {}, tones: {}, tabs: {}, health: {}, title: "" };
for (const r of ["overview", "pipeline/belts", "sessions/live", "stats/spend", "errors/open", "runners/all", "teams"]) {
  location.hash = "#" + r; await sleep(400);
  document.querySelectorAll("#vtabs a").forEach((a) => { out.tabs[r.split("/")[0] + "/" + a.getAttribute("href").split("/")[1]] = text(a.querySelector(".n")); });
  out.health[r.split("/")[0]] = document.getElementById("health")?.textContent.trim() ?? "";
}
for (const v of ["overview", "pipeline", "sessions", "errors", "runners", "teams"]) {
  const b = document.getElementById("n-" + v);
  out.badges[v] = b?.textContent.trim() ?? "";
  out.tones[v] = (b?.className ?? "").replace(/\bn\b/, "").trim();
}
out.title = document.title;
return JSON.stringify(out);'
# The Sandboxes probe: per tab the list rows, the fix heading, the commands and the free line; the cards on All;
# Recently completed (keys, results, or its text); and the panel of the first row. Text is compared without spaces.
# The "Agents read" line is left out: serve.py's feeds have their own age and interval.
PROBE="${PROBE%return JSON.stringify(out);}"'
const sq = (e) => (e?.textContent ?? "").replace(/\s+/g, "");
out.sb = {};
for (const t of ["all", "pipeline", "slack", "routines"]) {
  location.hash = "#runners/" + t; await sleep(700);
  const L = document.getElementById("sb-list"), q = (s) => [...(L?.querySelectorAll(s) ?? [])];
  const rows = q("[data-sbsel]"), D = document.getElementById("sb-done"), done = [...(D?.querySelectorAll("[data-sbdone]") ?? [])];
  out.sb[t] = { rows: rows.map((b) => b.textContent.trim()).join(","), cells: q("tbody tr").map((tr) => [...tr.children].map(sq).join("|")).join(";"),
    heads: q("h3.sbh").map(sq).join("|"), codes: q("code").map((c) => c.textContent).join(";"), free: sq(L?.querySelector(".sbfree")),
    stale: !!L?.querySelector(".sbstale"), text: rows.length ? "" : sq(L).replace(/Agentsread.*$/, ""),
    done: done.length ? done.map((r) => `${r.dataset.sbdone}:${sq(r.lastElementChild)}`).join(",") : sq(D) };
  if (t === "all") {
    out.sb.cards = sq(document.getElementById("sb-cards"));
    rows[0]?.click(); await sleep(400);
    const R = document.getElementById("right");
    out.sb.panel = rows[0] ? { head: sq(R?.querySelector("h2")), body: sq(R?.querySelector(".sb-panel")), links: [...(R?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href")).join(" ") } : null;
  }
}
return JSON.stringify(out);'
[ $# -gt 0 ] || set -- "$here"/page-fixture*.json
tmp="$(mktemp -d "${TMPDIR:-/tmp}/parity-v2.XXXXXX")"; pid=""
trap '[ -z "$pid" ] || kill "$pid" 2>/dev/null || true; rm -rf "$tmp"' EXIT
printf '%s' "$PROBE" > "$tmp/probe.js"
# A fresh build in a temp folder: the committed dist stays as it is.
( cd "$v2" && npx vite build --outDir "$tmp/dist" --emptyOutDir --logLevel error ) || { echo "FAIL the v2 build"; exit 1; }
port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
bad=0
for f in "$@"; do
  n="$(basename "$f" .json)"
  r="$(PAGE_BUDGET=20000 bash "$here/page.sh" '#overview' --fixture "$f" --probe "$PROBE")" || { c=$?; [ "$c" = 3 ] && { echo "$r"; exit 0; }; echo "FAIL $n: v1: $r"; bad=1; continue; }
  printf '%s' "$r" > "$tmp/$n.v1.json"
  python3 "$v2/e2e/serve.py" --port "$port" --fixture "$f" --dist "$tmp/dist" > "$tmp/serve.log" 2>&1 & pid=$!
  for _ in $(seq 50); do curl -sf -o /dev/null "http://127.0.0.1:$port/v2/" && break; sleep 0.1; done
  ( cd "$v2" && node e2e/parity-probe.ts "http://127.0.0.1:$port/v2/#overview" "$tmp/probe.js" ) > "$tmp/$n.v2.json" 2> "$tmp/probe.err" \
    || { echo "FAIL $n: v2: $(tail -2 "$tmp/probe.err" | tr '\n' ' ')"; bad=1; }
  kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; pid=""
  [ -s "$tmp/$n.v2.json" ] || continue
  compare "$tmp/$n.v1.json" "$tmp/$n.v2.json" "$n" || bad=1
done
[ "$bad" = 0 ] && echo "ok   the v2 shell equals v1 on $# fixtures, apart from the listed fixes" || exit 1
