"""Serve the v2 build through dashboard/server.py's Handler, with fake data, for Playwright.
  python3 e2e/serve.py [--port 4174] [--dist dist] [--fixture skills/fxa-ctl-dev/page-fixture-overview.json]
With no --fixture: GET /api/live replays fixtures/live/<name>.ndjson, and the other GET /api/* reads answer from
the hello and the first snapshot of the same file. The name comes from the fixture query or cookie, else the
V2_LIVE environment variable, else basic. The replay stops after a bye; a resume (since) goes on after that id.
With --fixture (a v1 page fixture, as parity-v2.sh uses): the fixture fills the server's feeds, so /api/snapshot,
/api/stats, /api/overview and /api/teams are the real Handler answers, /api/live says bye off, so the page polls,
and every other API path answers from the fixture, as page.sh does."""
import argparse, datetime, json, os, re, sys, tempfile, time
from http.cookies import SimpleCookie
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

V2 = Path(__file__).resolve().parents[1]
ROOT = V2.parent
p = argparse.ArgumentParser()
p.add_argument("--port", type=int, default=4174)
p.add_argument("--fixture", help="a v1 page fixture; without it the live fixtures answer")
p.add_argument("--dist", default=str(V2 / "dist"), help="the build to serve (parity-v2.sh builds into a temp folder)")
a = p.parse_args()

# Before the import: the server must never read the real store, sessions or errors.
tmp = tempfile.mkdtemp(prefix="v2-serve.")
os.environ.update(FXA_DB=f"{tmp}/store.db", FXA_SESSION_DIR=f"{tmp}/sessions", FXA_ERRORS_FILE=f"{tmp}/errors.jsonl",
                  FXA_DASHBOARD_HMAC_FILE=f"{tmp}/no-hmac")
sys.path.insert(0, str(ROOT / "dashboard"))
import server  # noqa: E402

server.V2_DIST = Path(a.dist)

now = time.time()


def rel(v):
    """The page.sh rule: "@iso-3600" is an ISO time an hour ago, "@epoch+600" an epoch 10 min ahead, "@day-2" a local day."""
    if isinstance(v, dict):
        return {k: rel(x) for k, x in v.items()}
    if isinstance(v, list):
        return [rel(x) for x in v]
    m = re.fullmatch(r"@(iso|epoch|day)([+-]\d+)", v) if isinstance(v, str) else None
    if not m:
        return v
    if m.group(1) == "day":
        return (datetime.date.fromtimestamp(now) + datetime.timedelta(days=int(m.group(2)))).isoformat()
    t = now + int(m.group(2))
    return int(t) if m.group(1) == "epoch" else datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


fx = rel(json.load(open(a.fixture))) if a.fixture else {}
snap = fx.get("/api/snapshot") or {}
for name, data in (("FULL", snap.get("snapshot")), ("AGENTS", snap.get("agents")), ("STATS", fx.get("/api/stats")),
                   ("TEAMS", (fx.get("/api/teams") or {}).get("teams"))):
    f = server.Feed(name.lower(), [], 60, 30)
    f.data, f.fetched_at = data, now
    setattr(server, name, f)
FEEDS = ("/api/snapshot", "/api/stats", "/api/overview", "/api/teams", "/api/live")
LIVE_DIR = V2 / "fixtures/live"
# The live fixtures have no stats copy (a snapshot sends stats null), so /api/stats answers the v1 stats fixture.
LIVE_STATS = rel(json.load(open(ROOT / "skills/fxa-ctl-dev/page-fixture-stats.json")))["/api/stats"]


def frames(name):
    return [json.loads(x) for x in (LIVE_DIR / f"{name}.ndjson").read_text().splitlines() if x.strip()]


def first(fs, event):
    return next((f["data"] for f in fs if f["event"] == event), None)


def live_get(fs, path, query):
    """A REST read from the fixture's hello and first snapshot, in the shape that server.py answers."""
    hello, snap = first(fs, "hello") or {}, first(fs, "snapshot") or {"feeds": {}, "sessions": [], "errors": []}
    feeds = snap["feeds"]
    full, ag, teams = feeds.get("snapshot") or {}, feeds.get("agents") or {}, feeds.get("teams") or {}
    if path == "/api/snapshot":
        return {"teams": {n[9:]: {"snapshot": f.get("data"), "age_seconds": f["age_seconds"], "error": f["error"], "interval": f["interval"]}
                          for n, f in feeds.items() if n.startswith("snapshot:")},
                "stats_age_seconds": 0, "stats_error": None, "stats_interval": 60,
                "snapshot": full.get("data"), "age_seconds": full.get("age_seconds"), "error": full.get("error"),
                "agents": ag.get("data"), "agents_age_seconds": ag.get("age_seconds"), "agents_error": ag.get("error"),
                "refreshing": False, "interval": full.get("interval"), "agents_interval": ag.get("interval")}
    if path == "/api/team-admin":
        return hello.get("viewer") or {"user": None, "admin": False, "teams": []}
    if path == "/api/teams":
        return {"teams": teams.get("data") or [], "issues": [], "age_seconds": teams.get("age_seconds"), "error": teams.get("error"),
                "refreshing": False, "interval": teams.get("interval")}
    if path == "/api/sessions":
        return {"rows": [] if query.get("since") else snap["sessions"], "cursor": 1}
    if path == "/api/errors":
        return snap["errors"]
    if path == "/api/overview":
        return server.overview_slice(LIVE_STATS)
    if path == "/api/tail":
        key = (query.get("key") or [""])[0]
        return {"key": key, "lines": [x for f in fs if f["event"] == "tail" and f["data"]["key"] == key for x in f["data"]["lines"]]}
    if path == "/api/routines/summary":
        return {"teams": {}}
    if path == "/api/history" or re.search("routines|errors", path):
        return []
    return {}


def replay(fs, since):
    """The frames of one stream: from the start, or after since; up to and with a bye."""
    ids = [f.get("id") for f in fs]
    out = fs
    if since in ids:
        i = ids.index(since)
        out = fs[i + 1:]
        if out and out[0]["event"] == "bye":
            out = out[1:]
        # A resume starts with a hello, as a real one does: the last hello before since.
        if not out or out[0]["event"] != "hello":
            out = [next(f for f in reversed(fs[:i]) if f["event"] == "hello")] + out
    end = next((n + 1 for n, f in enumerate(out) if f["event"] == "bye"), len(out))
    return out[:end]


class Handler(server.Handler):
    def live_name(self, query):
        cookie = SimpleCookie(self.headers.get("Cookie") or "").get("fixture")
        name = (query.get("fixture") or [""])[0] or (cookie.value if cookie else "") or os.environ.get("V2_LIVE") or "basic"
        return name if re.fullmatch(r"[a-z0-9-]+", name) and (LIVE_DIR / f"{name}.ndjson").is_file() else None

    def do_GET(self):
        u = urlparse(self.path)
        path, query = u.path, parse_qs(u.query)
        if not path.startswith("/api/") or (a.fixture and path in FEEDS):
            return super().do_GET()
        if not self._allowed(True):
            return
        if a.fixture:
            miss = {"sessions": [], "cursor": None} if "sessions" in path else [] if re.search("routines|errors", path) else {}
            return self._json(200, fx.get(path, miss))
        name = self.live_name(query)
        if not name:
            return self._json(404, {"error": "no such live fixture"})
        fs = frames(name)
        if path == "/api/live":
            return self.stream(fs, (query.get("since") or [""])[0])
        if path == "/api/stats":
            # The ETag that the fixture's first stats frame applies to, so its frames apply.
            base = first(fs, "stats")
            body = json.dumps(LIVE_STATS).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("ETag", base["base"] if base else '"v2-serve"')
            self._hardening()
            self.end_headers()
            return self.wfile.write(body)
        self._json(200, live_get(fs, path, query))

    def stream(self, fs, since):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self._hardening()
        self.end_headers()
        try:
            out = replay(fs, since)
            for f in out:
                self.wfile.write(server.sse(f))
            self.wfile.flush()
            # No bye at the end: keep the stream open, with a ping in the 45 s that the client waits.
            while not out or out[-1]["event"] != "bye":
                time.sleep(15)
                self.wfile.write(server.sse({"event": "ping", "data": {"at": int(time.time())}}))
                self.wfile.flush()
        except OSError:
            pass  # the page left

    def do_POST(self):
        if not a.fixture and urlparse(self.path).path == "/api/live/tails":
            if not self._allowed(True):
                return
            n = int(self.headers.get("Content-Length") or 0)
            return self._json(200, {"ok": True, "keys": (json.loads(self.rfile.read(n) or b"{}") or {}).get("keys", [])})
        super().do_POST()


print(f"v2 e2e server: http://localhost:{a.port}/v2/ ({a.fixture or 'live fixtures'})", flush=True)
ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()
