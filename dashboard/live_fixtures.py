"""Makes the C1 fixtures in dashboard-v2/fixtures/live from the v1 page fixtures (fake data), at the golden clock.
  python3 dashboard/live_fixtures.py "$PWD"
"""
import copy, datetime, json, os, re, sys

ROOT = sys.argv[1]
OUT = os.path.join(ROOT, "dashboard-v2/fixtures/live")
NOW = 1793750400
FX = os.path.join(ROOT, "skills/fxa-ctl-dev")


def rel(v):
    if isinstance(v, dict): return {k: rel(x) for k, x in v.items()}
    if isinstance(v, list): return [rel(x) for x in v]
    m = re.fullmatch(r"@(iso|epoch|day)([+-]\d+)", v) if isinstance(v, str) else None
    if not m: return v
    if m.group(1) == "day": return (datetime.datetime.fromtimestamp(NOW, datetime.timezone.utc).date() + datetime.timedelta(days=int(m.group(2)))).isoformat()
    t = NOW + int(m.group(2))
    return int(t) if m.group(1) == "epoch" else datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load(n):
    return rel(json.load(open(os.path.join(FX, n))))


sb = load("page-fixture-sandboxes.json")["/api/snapshot"]
teams = load("page-fixture-teams.json")["/api/teams"]["teams"]
stats = load("page-fixture-stats.json")["/api/stats"]
SNAP, AG = sb["snapshot"], sb["agents"]
SESSIONS = AG["sessions"]
ETAG = lambda n: '"%020x"' % (0xa11ce000 + n)


class S:
    def __init__(self, epoch, n=0):
        self.epoch, self.n, self.lines = epoch, n, []

    def ev(self, event, data, ring=True):
        f = {"event": event, "data": data}
        if ring:
            self.n += 1
            f = {"id": f"{self.epoch}-{self.n}", **f}
        self.lines.append(f)

    def hello(self, sid, viewer, epoch=None):
        if epoch:
            self.epoch, self.n = epoch, 0
        self.ev("hello", {"v": 1, "epoch": self.epoch, "sid": sid, "viewer": viewer, "retention_s": 300, "max_life_s": 900}, ring=False)

    def write(self, name):
        with open(os.path.join(OUT, name + ".ndjson"), "w") as f:
            for x in self.lines:
                f.write(json.dumps(x, separators=(",", ":"), sort_keys=False) + "\n")


def feed(name, data, age, interval, error=None, with_data=True):
    f = {"name": name, "age_seconds": age, "interval": interval, "error": error, "refreshing": False,
         "fetched_at": None if age is None else NOW - age}
    if with_data:
        f["data"] = data
    return f


ADMIN = {"user": "user@example.com", "admin": True, "teams": ["example"]}
USER = {"user": "user@example.com", "admin": False, "teams": []}
ERRORS = [
    {"sig": "a1b2c3d4e5", "source": "ctl", "kind": "boot_failed", "status": "open", "message": "the sample runner did not boot",
     "where": "session", "log": None, "count": 2, "first": rel("@iso-7200"), "last": rel("@iso-600"), "keys": ["agent-ex0003"], "resolved": None},
    {"sig": "f6e5d4c3b2", "source": "bot", "kind": "slack_post", "status": "resolved", "message": "a sample post failed",
     "where": "bot", "log": "sample log line", "count": 1, "first": rel("@iso-86400"), "last": rel("@iso-86400"), "keys": [],
     "resolved": {"at": rel("@iso-3600"), "note": "the sample post works again"}},
]
FLOW = [{"at": NOW - 120 + 60 * i, "stops": [3, 1, 2, 0, 1, 1, 0, 2, 4 + i], "merged": 4 + i, "closed": 1} for i in range(3)]


def snapshot(sessions=SESSIONS, errors=ERRORS, extra=None, ag=AG):
    feeds = {"snapshot": feed("snapshot", SNAP, sb["age_seconds"], sb["interval"]),
             "agents": feed("agents", ag, sb["agents_age_seconds"], sb["agents_interval"]),
             "teams": feed("teams", teams, 100, 300)}
    feeds.update(extra or {})
    return {"feeds": feeds, "sessions": sessions, "errors": errors, "stats": None, "flow": FLOW}


def sess(key, **kw):
    s = copy.deepcopy(next(x for x in SESSIONS if x["key"] == key))
    s.update(kw)
    return s


# basic: one connect, one of each delta table and each event, then the server ends the stream at max life.
b = S("e5a17c0d", 40)
b.hello("s1basic", ADMIN)
b.ev("snapshot", snapshot())
b.ev("delta", {"tbl": "sessions", "rows": [sess("agent-ex0002", last_activity=NOW + 5, turns=3)], "deleted": []})
b.ev("tail", {"key": "agent-ex0001", "start": 0, "lines": ["Reading the sample page.", "Running the sample tests."]})
b.ev("feed", feed("agents", None, 2, 30, with_data=False))
b.ev("delta", {"tbl": "history", "rows": [{"key": "agent-ex0001"}], "deleted": []})
b.ev("delta", {"tbl": "errors", "rows": [dict(ERRORS[0], status="resolved", resolved={"at": rel("@iso+10"), "note": "fixed in the sample"})], "deleted": []})
b.ev("delta", {"tbl": "routines", "rows": [{"id": 1, "team": "example", "name": "Sample routine", "paused": False, "version": 2}], "deleted": ["7"]})
b.ev("delta", {"tbl": "routine_runs", "rows": [{"routine_id": 1, "id": 11, "period": "2026-11-03", "state": "running", "trigger": "schedule",
                                                 "session": "agent-ex0002", "started_at": NOW - 60, "ended_at": None, "cost_usd": None}], "deleted": []})
b.ev("delta", {"tbl": "routine_tick", "rows": [{"env": "live", "at": NOW + 15}], "deleted": []})
b.ev("delta", {"tbl": "team_audit", "rows": [{"team": "example", "at": NOW + 20, "actor": "user@example.com", "action": "update",
                                               "old_gen": "3", "new_gen": "4", "changed": "budget"}], "deleted": []})
b.ev("ping", {"at": NOW + 15}, ring=False)
b.ev("flow", {"at": NOW + 60, "stops": [3, 1, 2, 0, 1, 1, 0, 2, 7], "merged": 7, "closed": 1})
b.ev("delta", {"tbl": "sessions", "rows": [], "deleted": ["agent-ex0004"]})
b.ev("tail", {"key": "agent-ex0001", "start": 2, "lines": ["All sample tests pass."]})
b.ev("bye", {"reason": "max_life"}, ring=False)
b.write("basic")

# resume: a plain close, a resume on the same epoch (replay from n + 1, no snapshot), then a restart (new epoch: snapshot).
r = S("e5a17c0d", 100)
r.hello("s1resume", ADMIN)
r.ev("snapshot", snapshot())
r.ev("delta", {"tbl": "sessions", "rows": [sess("agent-ex0001", last_activity=NOW + 2, turns=5)], "deleted": []})
r.ev("tail", {"key": "agent-ex0001", "start": 0, "lines": ["Reading the sample page."]})
r.hello("s2resume", ADMIN)
r.ev("delta", {"tbl": "sessions", "rows": [sess("agent-ex0001", last_activity=NOW + 9, turns=6)], "deleted": []})
r.ev("tail", {"key": "agent-ex0001", "start": 1, "lines": ["Running the sample tests."]})
r.ev("feed", feed("snapshot", None, 1, 120, error="RuntimeError: sample Jira timeout", with_data=False))
r.ev("bye", {"reason": "shutdown"}, ring=False)
r.hello("s3resume", ADMIN, epoch="e7b29d41")
r.ev("snapshot", snapshot(sessions=[sess("agent-ex0001", last_activity=NOW + 30, turns=7)] + SESSIONS[1:]))
r.ev("delta", {"tbl": "sessions", "rows": [sess("agent-ex0002", state="stopped", stopped_at=NOW + 40)], "deleted": []})
r.write("resume")

# reset: the stream queue overflowed, so the hub drops it and sends a full snapshot.
x = S("e5a17c0d", 200)
x.hello("s1reset", ADMIN)
x.ev("snapshot", snapshot())
for i in range(3):
    x.ev("delta", {"tbl": "sessions", "rows": [sess("agent-ex0001", last_activity=NOW + i, turns=5 + i)], "deleted": []})
x.ev("reset", {"reason": "queue_full"}, ring=False)
x.n += 509  # the events this stream did not get
x.ev("snapshot", snapshot(sessions=[sess("agent-ex0001", last_activity=NOW + 50, turns=20)] + SESSIONS[1:3]))
x.ev("delta", {"tbl": "sessions", "rows": [sess("agent-ex0002", last_activity=NOW + 51)], "deleted": []})
x.write("reset")

# private-team: a viewer who is not a team admin. The private team "example" comes as counts only, the secret team
# "example-secret" does not come, its sessions lose PRIVATE_FIELDS (also in agent), a fix session loses FIX_PRIVATE.
PRIV = ("request", "media", "last_text", "last_tool")
FIXP = ("fix_pr", "fix_trigger", "fix_actor", "fix_head_sha", "pr_url", "review_pr", "branch", "pushed_branch", "trees")
def private(s):
    s = {k: v for k, v in s.items() if k not in PRIV}
    if isinstance(s.get("agent"), dict):
        s["agent"] = {k: v for k, v in s["agent"].items() if k not in PRIV}
    return s
def unfix(s):
    return dict({k: v for k, v in private(s).items() if k not in FIXP}, fix_run=True)
ps = [SESSIONS[0], private(sess("agent-ex0002", profile="example")), unfix(sess("agent-ex0003", fix_pr="mozilla/fxa#123", pr_url="https://github.com/mozilla/fxa/pull/123", fix_trigger="pr-label", fix_actor="user@example.com"))]
pag = dict(AG, sessions=ps)
counts = {"ready": 2, "skipped": 1, "inflight": 1, "review": 0, "blocked": 0, "open_prs": 1, "merged_prs": 3}
p = S("e5a17c0d", 300)
p.hello("s1private", USER)
p.ev("snapshot", snapshot(sessions=ps, ag=pag, extra={"snapshot:example": feed("snapshot:example", {"team": {"profile": "example", "name": "Example"}, "redacted": True, "counts": counts}, 50, 300)}))
p.ev("delta", {"tbl": "sessions", "rows": [private(sess("agent-ex0002", profile="example", last_activity=NOW + 4, turns=8))], "deleted": []})
p.ev("feed", feed("snapshot:example", {"team": {"profile": "example", "name": "Example"}, "redacted": True, "counts": dict(counts, ready=3)}, 0, 300))
p.ev("tail", {"key": "agent-ex0001", "start": 0, "lines": ["Reading the sample page."]})
p.write("private-team")

# big-burst: many session deltas of 50 rows and tail batches, as after a restart of many runners.
g = S("e5a17c0d", 1000)
g.hello("s1burst", ADMIN)
g.ev("snapshot", snapshot())
keys = [f"agent-bb{i:04d}" for i in range(50)]
for t in range(12):
    g.ev("delta", {"tbl": "sessions", "rows": [dict(key=k, profile="fxa", agent=None, agent_alive=False, created=NOW - 600, last_activity=NOW + t, turns=t,
                                                    state="active" if t < 11 else "stopped") for k in keys], "deleted": []})
    g.ev("tail", {"key": "agent-ex0001", "start": t * 5, "lines": [f"sample line {t * 5 + j}" for j in range(5)]})
g.ev("delta", {"tbl": "sessions", "rows": [], "deleted": keys[:10]})
g.write("big-burst")

# stats-parts: the snapshot has stats null; frames add rows and send changed parts whole; a base that is not the
# client's ETag means a whole read; reload means a past row changed.
st = S("e5a17c0d", 500)
st.hello("s1stats", ADMIN)
st.ev("snapshot", snapshot())
row = dict(stats["rows"][0], at=rel("@iso+30"), key="EX-900", usd=2)
st.ev("stats", {"base": ETAG(1), "etag": ETAG(2), "rows_add": [row, dict(row, key="EX-901", usd=3)], "prs": stats["prs"][:2], "prs_at": NOW + 30})
st.ev("stats", {"base": ETAG(2), "etag": ETAG(3), "llm": stats["llm"], "load": stats["load"]})
st.ev("stats", {"base": ETAG(3), "etag": ETAG(4), "pipeline": stats["pipeline"], "memory": stats["memory"]})
st.ev("stats", {"base": ETAG(9), "etag": ETAG(10), "rows_add": [dict(row, key="EX-902")]})
st.ev("stats", {"base": ETAG(10), "etag": ETAG(11), "reload": True})
st.write("stats-parts")
