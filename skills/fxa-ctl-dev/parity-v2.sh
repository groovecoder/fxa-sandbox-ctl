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
const out = { badges: {}, tones: {}, tabs: {}, health: {}, title: "", ov: {} };
// Overview: the same ids in v1 and v2. Wait for the stats and the recent runs, at most 5 s.
location.hash = "#overview";
for (let i = 0; i < 50 && !(document.querySelector("#ov-main [data-ovmetric]") && document.querySelector("#ov-runs .ovrun, #ov-runs .emptybox")); i++) await sleep(100);
// The snapshot and the teams can come after the stats.
await sleep(1500);
const q = (s) => document.querySelector(s)?.textContent.trim() ?? "";
out.ov.atwork = (q("#ov-head").match(/(\S+) at work now/) ?? [])[1] ?? "";
out.ov.needs = q("#ov-needs h2 .big");
for (const m of ["spend", "runs", "merged", "rate", "median"]) out.ov["kpi_" + m] = q(`[data-ovmetric="${m}"] .mv`);
for (const c of ["budget", "llm", "hours"]) out.ov[c] = q(`#ov-${c} h2 .note`);
out.ov.teams = document.querySelectorAll("#ov-teams tr[data-team]").length;
out.ov.runs = document.querySelectorAll("#ov-runs .ovrun").length;
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
// Pipeline: the tiles, stop counts, phases, sub-groups, belt keys, outside list, queue heads and the Done line of each tab.
const wait = async (sel) => { for (let i = 0; i < 15 && !document.querySelector(sel); i++) await sleep(100); };
const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
const tiles = (id) => Object.fromEntries([...document.querySelectorAll(`#${id} .stat, #${id} [data-stat]`)].map((t) =>
  [t.dataset.stat ?? t.querySelector(".lbl")?.textContent.trim(), (t.querySelector(".big, .text-kpi")?.textContent ?? "").trim()]));
const all = (sel, f) => [...document.querySelectorAll(sel)].map(f).join(" | ");
out.pipe = {};
for (const [tab, id] of [["belts", "s-lanes"], ["queue", "s-review"], ["done", "s-done"]]) {
  location.hash = "#pipeline/" + tab; await sleep(400); await wait(`#${id} .stat, #${id} [data-stat], #${id} .emptybox`);
  out.pipe[tab] = { tiles: tiles(id) };
}
location.hash = "#pipeline/belts"; await sleep(400); await wait("#s-lanes .stat, #s-lanes [data-stat], #s-lanes .emptybox");
Object.assign(out.pipe.belts, {
  stops: all("#s-lanes .bstops .cols span", (e) => e.textContent.trim()),
  phases: all("#s-lanes .bgh[id^=bp-]", (e) => `${own(e)} ${e.querySelector(".cnt")?.textContent}`),
  subs: all("#s-lanes .bsub", (e) => `${e.querySelector(".who")?.textContent} ${own(e)} ${e.querySelector(".cnt")?.textContent}`),
  keys: all("#s-lanes [data-belt]", (e) => e.dataset.belt),
  outside: document.querySelector("#s-lanes details.bout > summary")?.textContent.trim() ?? "",
});
location.hash = "#pipeline/queue"; await sleep(400); await wait("#s-review [data-stat], #s-review .stat");
out.pipe.queue.heads = all("#s-review h2 .n, #s-queue h2 .n", (e) => e.textContent.trim());
location.hash = "#pipeline/done"; await sleep(400); await wait("#s-done [data-stat], #s-done .stat, #s-done .emptybox, #s-done [class*=dashed]");
out.pipe.done.line = document.querySelector("#s-done .bwhere")?.textContent.trim() ?? document.querySelector("#s-done")?.textContent.trim() ?? "";
out.pipe.done.rows = document.querySelectorAll("#s-done .dtab tbody tr").length;
out.title = document.title;
// Sessions: the list, the bar, the conversation and the details of the shown session on each tab, without white space.
// The countdowns, the start time and the thread load move with the clock, so they stay out.
const flat = (e) => (e?.textContent ?? "").replace(/\s+/g, "");
const convo = () => { const c = document.querySelector("#s-sess .convo")?.cloneNode(true); c?.querySelector("#sx-thread")?.remove(); return flat(c); };
out.sessions = {};
// v2 reads the agents feed over a stream that can come late: wait up to 3 s for the list.
location.hash = "#sessions/live";
for (let i = 0; i < 30 && !document.querySelector("#side .si"); i++) await sleep(100);
for (const t of ["live", "paused", "stopped", "answers"]) {
  location.hash = "#sessions/" + t; await sleep(500);
  const kv = {};
  document.querySelectorAll("#right .kv, #right .kvl > div").forEach((e) => {
    const k = e.firstElementChild?.textContent.trim() ?? "";
    if (!/^(Idle pause in|Sandbox ends in|Started)$/.test(k)) kv[k] = flat(e.lastElementChild);
  });
  out.sessions[t] = t === "answers"
    ? { head: flat(document.querySelector("#s-sess .sub, #s-sess .anshead")), rows: document.querySelectorAll("#s-sess table.answers > tbody > tr").length, empty: flat(document.querySelector("#s-sess .emptybox, #s-sess .border-dashed")) }
    : { side: [...document.querySelectorAll("#side .si")].map((e) => flat(e.querySelector(".t")) + "|" + flat(e.querySelector(".m"))),
        bar: [...(document.getElementById("sx-bar")?.children ?? [])].map(flat).filter(Boolean), convo: convo(), kv };
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
  # The probe visits 11 routes: Chrome's virtual time must outlast its waits.
  r="$(PAGE_BUDGET="${PAGE_BUDGET:-15000}" bash "$here/page.sh" '#overview' --fixture "$f" --probe "$PROBE")" || { c=$?; [ "$c" = 3 ] && { echo "$r"; exit 0; }; echo "FAIL $n: v1: $r"; bad=1; continue; }
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
