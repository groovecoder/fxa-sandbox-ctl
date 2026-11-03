"""Serve a v1 page fixture through dashboard/server.py's Handler, and the v2 build at /v2, for Playwright.
  python3 e2e/serve.py [--port 4174] [--fixture skills/fxa-ctl-dev/page-fixture-overview.json]
The fixture's snapshot, stats and teams fill the server's feeds, so /api/snapshot, /api/stats, /api/overview and
/api/teams are the real Handler answers. Every other API path answers from the fixture, as page.sh does, because
it would run the controller or read the store. The /v2 handler here is temporary until server.py has its route."""
import argparse, datetime, json, os, re, sys, tempfile, time
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

V2 = Path(__file__).resolve().parents[1]
ROOT = V2.parent
p = argparse.ArgumentParser()
p.add_argument("--port", type=int, default=4174)
p.add_argument("--fixture", default=str(ROOT / "skills/fxa-ctl-dev/page-fixture-overview.json"))
a = p.parse_args()

# Before the import: the server must never read the real store, sessions or errors.
tmp = tempfile.mkdtemp(prefix="v2-serve.")
os.environ.update(FXA_DB=f"{tmp}/store.db", FXA_SESSION_DIR=f"{tmp}/sessions", FXA_ERRORS_FILE=f"{tmp}/errors.jsonl",
                  FXA_DASHBOARD_HMAC_FILE=f"{tmp}/no-hmac")
sys.path.insert(0, str(ROOT / "dashboard"))
import server  # noqa: E402

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


fx = rel(json.load(open(a.fixture)))
snap = fx.get("/api/snapshot") or {}
for name, data in (("FULL", snap.get("snapshot")), ("AGENTS", snap.get("agents")), ("STATS", fx.get("/api/stats")),
                   ("TEAMS", (fx.get("/api/teams") or {}).get("teams"))):
    f = server.Feed(name.lower(), [], 60, 30)
    f.data, f.fetched_at = data, now
    setattr(server, name, f)
FEEDS = ("/api/snapshot", "/api/stats", "/api/overview", "/api/teams")
ASSET = re.compile(r"[A-Za-z0-9._-]+\.(js|css|svg|woff2|png)")
TYPES = {"js": "text/javascript", "css": "text/css", "svg": "image/svg+xml", "woff2": "font/woff2", "png": "image/png"}


def csp(page):
    hashes = " ".join(f"'sha256-{h}'" for h in (server.base64.b64encode(server.hashlib.sha256(s.encode()).digest()).decode()
                                               for s in re.findall(r"<script>([\s\S]*?)</script>", page)))
    return (f"default-src 'none'; script-src 'self' {hashes}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
            "media-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


class Handler(server.Handler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/v2" or path.startswith("/v2/"):
            if not self._allowed(False):
                return
            if path in ("/v2", "/v2/", "/v2/index.html"):
                page = (V2 / "dist/index.html").read_text()
                return self._send(200, page, "text/html; charset=utf-8", csp=csp(page))
            name = path[len("/v2/assets/"):] if path.startswith("/v2/assets/") else ""
            m = ASSET.fullmatch(name)
            if not m or not (V2 / "dist/assets" / name).is_file():
                return self._send(404, "not found", "text/plain")
            return self._send(200, (V2 / "dist/assets" / name).read_bytes(), TYPES[m.group(1)])
        if path.startswith("/api/") and path not in FEEDS:
            if not self._allowed(True):
                return
            miss = {"sessions": [], "cursor": None} if "sessions" in path else [] if re.search("routines|errors", path) else {}
            return self._json(200, fx.get(path, miss))
        super().do_GET()


print(f"v2 e2e server: http://localhost:{a.port}/v2/ (fixture {a.fixture})", flush=True)
ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()
