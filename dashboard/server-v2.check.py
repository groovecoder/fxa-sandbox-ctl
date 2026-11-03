#!/usr/bin/env python3
"""The /v2 static route of server.py: no-store and the v2 CSP for the page, immutable assets, 404 for any other
path, 503 with no build; the CSP hashes the theme script of the built page; v1 stays as it was; the deploy_check probes.
  python3 dashboard/server-v2.check.py
"""
import base64
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TMP = tempfile.mkdtemp(prefix="v2-check.")
os.environ.update(FXA_DB=f"{TMP}/fxa.db", FXA_SESSION_DIR=f"{TMP}/sessions", FXA_ERRORS_FILE=f"{TMP}/errors.jsonl",
                  FXA_DASHBOARD_HMAC_FILE=f"{TMP}/hmac", FXA_TEAMS_DIR=f"{TMP}/teams")
sys.path.insert(0, HERE)
import server  # noqa: E402
import live  # noqa: E402
import testkit  # noqa: E402

DIST = server.V2_DIST
BASE = testkit.start(server.Handler)
get = lambda path, **kw: testkit.request(BASE + path, **kw)


def theme_hash(path):
    """The CSP source of the one bare inline script of a v2 page."""
    with open(path) as f:
        scripts = re.findall(r"<script>([\s\S]*?)</script>", f.read())
    assert len(scripts) == 1, path
    return f"'sha256-{base64.b64encode(hashlib.sha256(scripts[0].encode()).digest()).decode()}'"


class Page(unittest.TestCase):
    def test_the_page_is_no_store_with_the_v2_csp(self):
        for path in ("/v2", "/v2/", "/v2/index.html"):
            code, h, body = get(path)
            self.assertEqual((code, h["Cache-Control"], h["Content-Type"]), (200, "no-store", "text/html; charset=utf-8"), path)
            self.assertIn(b'<script type="module"', body)
            csp = h["Content-Security-Policy"]
            self.assertTrue(csp.startswith("default-src 'none'; script-src 'self' 'sha256-"), csp)
            for part in ("connect-src 'self'", "font-src 'self'", "frame-ancestors 'none'", "base-uri 'none'", "style-src 'self' 'unsafe-inline';"):
                self.assertIn(part, csp)

    def test_the_csp_allows_the_theme_script_of_the_build_and_of_the_source(self):
        csp = get("/v2/")[1]["Content-Security-Policy"]
        built = theme_hash(DIST / "index.html")
        self.assertIn(f"script-src 'self' {built};", csp)
        # The build keeps the source's theme script as it is, so the hash of one is the hash of the other.
        self.assertEqual(theme_hash(ROOT + "/dashboard-v2/index.html"), built)

    def test_no_build_is_a_503(self):
        keep, server.V2_DIST = server.V2_DIST, server.V2_DIST.parent / "no-dist-here"
        try:
            code, h, body = get("/v2/")
            self.assertEqual((code, h["Content-Type"]), (503, "text/plain; charset=utf-8"))
            self.assertIn(b"npm run build", body)
            self.assertEqual(get("/v2/assets/x.js")[0], 404)
        finally:
            server.V2_DIST = keep

    def test_v1_keeps_its_page_and_policy(self):
        code, h, body = get("/")
        self.assertEqual((code, h["Content-Security-Policy"]), (200, server.csp_for(body.decode())))
        self.assertNotIn("'self' 'sha256", h["Content-Security-Policy"])


class Assets(unittest.TestCase):
    def test_each_built_asset_is_immutable_with_its_type(self):
        names = os.listdir(DIST / "assets")
        self.assertTrue(any(n.endswith(".js") for n in names))
        types = {"js": "text/javascript", "css": "text/css", "svg": "image/svg+xml", "woff2": "font/woff2", "png": "image/png"}
        for n in names:
            code, h, body = get(f"/v2/assets/{n}")
            self.assertEqual((code, h["Cache-Control"], h["Content-Type"]), (200, "public, max-age=31536000, immutable", types[n.rsplit(".", 1)[1]]), n)
            with open(DIST / "assets" / n, "rb") as f:
                self.assertEqual(body, f.read())

    def test_any_other_path_is_a_404(self):
        js = next(n for n in os.listdir(DIST / "assets") if n.endswith(".js"))
        for path in ("/v2/assets/../index.html", "/v2/assets/..%2findex.html", "/v2/assets/%2e%2e/index.html", "/v2/assets/a%2Fb.js",
                     "/v2/assets/", "/v2/assets/missing-x1.js", f"/v2/assets/{js}.map", "/v2/assets/x.html", "/v2/assets/x.json",
                     "/v2/index.htm", "/v2/other", "/v2/assets/sub/x.js", f"/v2//assets/{js}", "/v2/dist/index.html"):
            code, h, _ = get(path)
            self.assertEqual((code, h.get("Cache-Control")), (404, "no-store"), path)

    def test_a_foreign_host_is_refused(self):
        self.assertEqual(get("/v2/", headers={"Host": "evil.example.com"})[0], 421)


@unittest.skipUnless(shutil.which("curl"), "needs curl")
class Probes(unittest.TestCase):
    def test_the_deploy_check_probes_pass_against_this_server(self):
        with open(os.path.join(ROOT, "skills", "fxa-manager", "vm.sh")) as f:
            body = re.search(r"\ndeploy_check\(\) \{\n[\s\S]*?\n# v2 probes[^\n]*\n([\s\S]*?)\nEOF\n", f.read()).group(1)
        lines = [x.replace("\\$", "$") for x in body.splitlines()]
        self.assertEqual(len(lines), 4, lines)
        port = BASE.rsplit(":", 1)[1]
        script = "\n".join(lines).replace("localhost:8787", f"127.0.0.1:{port}")
        server.HUB = live.LiveHub(server)
        for n in ("FULL", "AGENTS", "TEAMS"):
            f = server.Feed(n.lower(), [], 60, 30)
            setattr(server, n, f)
        try:
            out = subprocess.run(["bash", "-c", script], capture_output=True, text=True, timeout=30).stdout
        finally:
            server.HUB.shutdown()
            server.HUB = None
        self.assertEqual(out.splitlines(), ["  v2 page ok", "  v2 asset immutable", "  live stream hello"])


if __name__ == "__main__":
    try:
        unittest.main()
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
