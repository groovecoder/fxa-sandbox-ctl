#!/usr/bin/env bash
# Compare the dashboard shell of v1 and v2 on the v1 page fixtures: rail badges and their tones, tab counts,
# the health word and the tab title, and per Stats tab its KPI tiles, headings and empty texts.
# v1 renders in page.sh; v2 is a fresh build served by dashboard-v2/e2e/serve.py.
#   bash skills/fxa-ctl-dev/parity-v2.sh [fixture.json|live.ndjson ...]
#     default: every skills/fxa-ctl-dev/page-fixture*.json and parity-fixture*.json, and every dashboard-v2/fixtures/live/*.ndjson
# On a live fixture, v2 reads it over the stream up to its first snapshot, and v1 reads the same data from serve.py --v1.
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
// Teams: the side list, the All teams tiles and table cells by column name, and each team page head and tabs.
const norm = (e) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
const leaves = (e) => [...e.querySelectorAll("span")].filter((s) => !s.children.length).map(norm).filter(Boolean).join(" | ");
out.teams = { side: {}, tiles: [], rows: {}, pages: {} };
location.hash = "#teams"; await sleep(600);
document.querySelectorAll("#side button.si").forEach((b) => { out.teams.side[b.dataset.id] = norm(b.querySelector(".t")) + " | " + norm(b.querySelector(".m")); });
out.teams.groups = [...document.querySelectorAll("#side h3.sgroup")].map(norm).join(" | ");
out.teams.tiles = [...document.querySelectorAll(".tpage .rtkpis > *, .tpage .tkpis > *")].map(leaves);
const tbl = document.querySelector(".tpage table");
if (tbl) {
  const cols = [...tbl.querySelectorAll("thead th")].map(norm);
  tbl.querySelectorAll("tbody tr").forEach((tr) => {
    const td = [...tr.children], r = {};
    for (const c of ["Team", "Status", "Cost this month", "Last test", "Problems"]) r[c] = norm(td[cols.indexOf(c)]);
    out.teams.rows[r.Team] = r;
  });
}
for (const id of Object.keys(out.teams.side).filter((x) => x !== "__all").slice(0, 4)) {
  location.hash = "#teams/" + id; await sleep(600);
  out.teams.pages[id] = { head: norm(document.getElementById("team-h")), tabs: [...document.querySelectorAll(".tpage nav.ttabs a")].map(norm).join(" | ") };
}
// Stats: per tab, the KPI tiles (label and value), the card and chart headings in order, and the empty texts.
// A v2 chart that v1 does not have sits in [data-new] and is left out.
out.stats = {};
const first = (e) => ([...e.childNodes].find((n) => n.nodeType === 3)?.textContent ?? "").trim();
for (const t of ["spend", "prs", "runners", "pipeline"]) {
  location.hash = "#stats/" + t; await sleep(600);
  const m = document.getElementById("s-stats"), kp = {};
  if (!m) { out.stats[t] = { missing: true }; continue; }
  m.querySelectorAll(".kpis > *").forEach((k) => { kp[k.dataset.lbl ?? k.querySelector(".lbl")?.textContent ?? ""] = k.dataset.big ?? k.querySelector(".big")?.textContent ?? ""; });
  const heads = [...m.querySelectorAll("h2, h3, figcaption")].filter((h) => !h.closest("[data-new]")).map(first);
  out.stats[t] = { kpis: kp, heads: heads.join("|"), empty: [...m.querySelectorAll(".empty, .emptybox")].map((e) => e.textContent.trim()).join("|") };
}
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
# Teams part B: the routines list and the page of routine 1 of the team "example" (the routine fixtures).
# An age in seconds or minutes and a clock time drop their numbers: v1 and v2 start their clocks up to a minute apart.
PROBE="${PROBE%return JSON.stringify(out);}"'
const rtAll = (s) => [...document.querySelectorAll(s)].map((e) => e.textContent.replace(/\s+/g, " ").trim().replace(/\b\d+[sm] ago\b/g, "s ago").replace(/\b\d{1,2}:\d\d\s?[AP]M\b/g, "hh:mm")).join("|");
out.routines = {};
for (const r of ["teams/example/routines", "teams/example/routines/1"]) {
  location.hash = "#" + r; await sleep(800);
  out.routines[r.endsWith("/1") ? "detail" : "list"] = { head: rtAll("[data-routines] .rt-head .n"), kpis: rtAll("[data-routines] .rtkpis > *"),
    names: rtAll("[data-routines] [data-rt-sel]"), says: rtAll("[data-routines] .says"), runs: rtAll("[data-routines] .rtd .item .title"), lives: rtAll("[data-routines] [data-rt-live] .key") };
}
return JSON.stringify(out);'
PROBE="${PROBE%return JSON.stringify(out);}"'
// Errors: the head, the rows with their tag and meta, the empty and failure texts, the list and the details.
const errNorm = (t) => (t ?? "").replace(/\s+/g, " ").replace(/\b-?\d+[smhd] ago\b|\bNaNd ago\b/g, "~").trim();
const errAll = (sel) => [...document.querySelectorAll(sel)];
out.errors = {};
for (const t of ["open", "all"]) {
  location.hash = "#errors/" + t; await sleep(400);
  const s = document.getElementById("s-errors");
  out.errors[t] = {
    head: errNorm(s?.querySelector("h2")?.textContent),
    rows: errAll("#s-errors .errs .err").map((e) => e.id + " " + errNorm(e.firstElementChild?.textContent)).join(", "),
    meta: errAll("#s-errors .errs .err .meta").map((e) => errNorm(e.textContent)).join(" | "),
    empty: errNorm(s?.querySelector(".emptybox:not([role=alert])")?.textContent),
    alert: errNorm(s?.querySelector("[role=alert]")?.textContent),
    hint: errAll("#s-errors p.empty").length,
    side: errAll("#side button.si").map((b) => b.dataset.id + (b.getAttribute("aria-current") ? "*" : "") + " " + errNorm(b.querySelector(".t")?.textContent) + " / " + errNorm(b.querySelector(".m")?.textContent)).join(" | "),
    sideEmpty: errNorm(document.querySelector("#side .slist2 .empty")?.textContent),
    right: errNorm(document.querySelector("#right h2.rh")?.textContent),
  };
}
return JSON.stringify(out);'

# parity-fixture-*.json are v1 page fixtures for a view's probes only, so v1-golden.sh does not read them.
[ $# -gt 0 ] || set -- "$here"/page-fixture*.json "$here"/parity-fixture*.json "$v2"/fixtures/live/*.ndjson
tmp="$(mktemp -d "${TMPDIR:-/tmp}/parity-v2.XXXXXX")"
trap 'kill $(jobs -p) 2>/dev/null || true; wait 2>/dev/null; rm -rf "$tmp"' EXIT
printf '%s' "$PROBE" > "$tmp/probe.js"
# A fresh build in a temp folder: the committed dist stays as it is.
( cd "$v2" && npx vite build --outDir "$tmp/dist" --emptyOutDir --logLevel error ) || { echo "FAIL the v2 build"; exit 1; }
# one <fixture>   Both pages and the compare for one fixture, on its own port; exit 1 on a diff or a failure.
one() {
  local f="$1" n="" fx="" src=() now="" r="" c=0 port=""
  # Not local: the subshell's EXIT trap reads it after this function returns.
  pid=""
  n="$(basename "${f%.*}")" fx="$f" src=(--fixture "$f")
  if [ "${f%.ndjson}" != "$f" ]; then
    # A live fixture has fixed times, so both pages get the same clock: an age then reads the same.
    fx="$tmp/$n.fx.json" src=(--live "$f") now="$(date +%s)"
    python3 "$v2/e2e/serve.py" --live "$f" --v1 > "$fx" || { echo "FAIL $n: serve.py --v1"; return 1; }
  fi
  # The view probes visit many routes: the virtual time must cover every sleep.
  r="$(PAGE_NOW="$now" PAGE_BUDGET="${PAGE_BUDGET:-45000}" bash "$here/page.sh" '#overview' --fixture "$fx" --probe "$PROBE")" || { c=$?; [ "$c" = 3 ] && { printf '%s\n' "$r" > "$tmp/skip"; return 0; }; echo "FAIL $n: v1: $r"; return 1; }
  printf '%s' "$r" > "$tmp/$n.v1.json"
  # Port 0: serve.py binds a free port and prints it once it listens, so the parallel fixtures never share one.
  python3 "$v2/e2e/serve.py" --port 0 "${src[@]}" --dist "$tmp/dist" > "$tmp/$n.serve.log" 2>&1 & pid=$!
  trap 'kill "${pid:-}" 2>/dev/null || true' EXIT
  # The log can be missing for a moment: the background shell opens it after this loop starts.
  for _ in $(seq 100); do port="$(sed -n 's/.*localhost:\([0-9]*\)\/.*/\1/p' "$tmp/$n.serve.log" 2>/dev/null | head -1 || true)"; [ -n "$port" ] && break; sleep 0.1; done
  [ -n "$port" ] || { echo "FAIL $n: serve.py did not start: $(tail -2 "$tmp/$n.serve.log" | tr '\n' ' ')"; return 1; }
  ( cd "$v2" && PARITY_NOW="$now" node e2e/parity-probe.ts "http://127.0.0.1:$port/v2/#overview" "$tmp/probe.js" ) > "$tmp/$n.v2.json" 2> "$tmp/$n.probe.err" \
    || { echo "FAIL $n: v2: $(tail -2 "$tmp/$n.probe.err" | tr '\n' ' ')"; return 1; }
  [ -s "$tmp/$n.v2.json" ] || return 0
  compare "$tmp/$n.v1.json" "$tmp/$n.v2.json" "$n"
}
# PARITY_JOBS fixtures at a time: most of a fixture's time is the probes' fixed sleeps, not CPU.
bad=0 k=0 jobs="${PARITY_JOBS:-4}"
for f in "$@"; do
  n="$(basename "${f%.*}")"
  # The exit code goes to a file whatever one does: a set -e exit in the subshell would leave no code.
  ( rc=0; one "$f" > "$tmp/$n.out" 2>&1 || rc=$?; echo "$rc" > "$tmp/$n.rc" ) &
  k=$(( k + 1 )); [ $(( k % jobs )) -ne 0 ] || wait
done
wait
[ ! -f "$tmp/skip" ] || { cat "$tmp/skip"; exit 0; }
for f in "$@"; do
  n="$(basename "${f%.*}")" rc="$(cat "$tmp/$n.rc" 2>/dev/null || echo none)"; cat "$tmp/$n.out"
  [ "$rc" = 0 ] && continue
  bad=1; grep -q "^FAIL $n" "$tmp/$n.out" || echo "FAIL $n: the fixture's job exited with $rc"
done
[ "$bad" = 0 ] && echo "ok   the v2 shell equals v1 on $# fixtures, apart from the listed fixes" || exit 1
