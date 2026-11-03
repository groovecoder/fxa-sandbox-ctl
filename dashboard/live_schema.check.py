#!/usr/bin/env python3
"""The C1 fixtures parse, keep the per-viewer redaction of server.py and hold no real data; the recorder scrubs."""
import glob
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import live_record  # noqa: E402
import live_schema  # noqa: E402
import server  # noqa: E402

FIXTURES = sorted(glob.glob(os.path.join(HERE, "..", "dashboard-v2", "fixtures", "live", "*.ndjson")))
HELLO = {"event": "hello", "data": {"v": 1, "epoch": "e1", "sid": "s", "viewer": {"user": None, "admin": False, "teams": []},
                                    "retention_s": 300, "max_life_s": 900}}
PING = {"event": "ping", "data": {"at": 1}}
TAIL = {"id": "e1-2", "event": "tail", "data": {"key": "agent-ex0001", "start": 0, "lines": []}}


def sessions(frames):
    for f in frames:
        d = f["data"]
        if f["event"] == "snapshot":
            yield from d["sessions"]
            for x in d["feeds"].values():
                if x["name"] == "agents" and isinstance(x.get("data"), dict):
                    yield from x["data"].get("sessions") or []
        if f["event"] == "delta" and d["tbl"] == "sessions":
            yield from d["rows"]


class Fixtures(unittest.TestCase):
    def test_the_named_fixtures_exist(self):
        names = {os.path.basename(f)[:-7] for f in FIXTURES}
        self.assertLessEqual({"basic", "resume", "reset", "private-team", "big-burst", "stats-parts"}, names)

    def test_each_fixture_parses_as_a_stream(self):
        for f in FIXTURES:
            self.assertEqual(live_schema.read(f)[1], [], f)

    def test_no_fixture_holds_real_data(self):
        for f in FIXTURES:
            with open(f) as fh:
                text = fh.read()
            self.assertEqual(live_record.leaks(text), [], f)
            frames = live_schema.read(f)[0]
            names = {s.get("profile") for s in sessions(frames)} - {None}
            names |= {n.split(":", 1)[1] for x in frames if x["event"] == "snapshot" for n in x["data"]["feeds"] if ":" in n}
            self.assertEqual({n for n in names if n != "fxa" and not n.startswith("example")}, set(), f)

    def test_a_viewer_who_is_not_a_team_admin_gets_redacted_rows(self):
        for f in FIXTURES:
            frames, private, admin = live_schema.read(f)[0], set(), True
            for x in frames:
                if x["event"] == "hello":
                    admin = x["data"]["viewer"]["admin"]
                if x["event"] in ("snapshot", "feed"):
                    for fd in x["data"]["feeds"].values() if x["event"] == "snapshot" else [x["data"]]:
                        if isinstance(fd.get("data"), dict) and fd["data"].get("redacted"):
                            private.add(fd["name"].split(":", 1)[1])
            for s in sessions(frames):
                self.assertFalse(set(s) & server.SESSION_UNUSED, (f, s["key"]))
                if admin:
                    continue
                if s.get("profile") in private:
                    self.assertFalse(set(s) & set(server.PRIVATE_FIELDS), (f, s["key"]))
                    self.assertFalse(set(s.get("agent") or {}) & set(server.PRIVATE_FIELDS), (f, s["key"]))
                if s.get("fix_run"):
                    self.assertFalse(set(s) & server.FIX_PRIVATE, (f, s["key"]))
            if not admin:
                self.assertTrue(private, f"{f}: a non-admin stream with no private team proves nothing")
                keys = {s["key"] for s in sessions(frames) if s.get("profile") in private}
                self.assertFalse({x["data"]["key"] for x in frames if x["event"] == "tail"} & keys, f)


class Checks(unittest.TestCase):
    def problems(self, *frames):
        out = [p for f in frames for p in live_schema.frame_problems(f)]
        return out or live_schema.stream_problems(list(frames))

    def test_a_good_stream_passes(self):
        self.assertEqual(self.problems(HELLO, dict(TAIL, id="e1-1", event="snapshot", data={"feeds": {}, "sessions": [], "errors": [], "stats": None, "flow": []}), TAIL, PING), [])

    def test_bad_frames_fail(self):
        snap = {"id": "e1-1", "event": "snapshot", "data": {"feeds": {}, "sessions": [], "errors": [], "stats": None, "flow": []}}
        self.assertTrue(self.problems(HELLO, TAIL))                                    # no snapshot after a new epoch
        self.assertTrue(self.problems(dict(PING, id="e1-1")))                          # ping has no id
        self.assertTrue(self.problems(dict(TAIL, data=dict(TAIL["data"], extra=1))))   # an unknown field
        self.assertTrue(self.problems({"event": "tail", "data": TAIL["data"]}))        # no id
        self.assertTrue(self.problems(HELLO, snap, dict(TAIL, id="e1-1")))              # an id that does not grow
        self.assertTrue(self.problems({"id": "e1-3", "event": "stats", "data": {"base": "a", "etag": "b", "reload": True, "llm": {}}}))
        self.assertTrue(self.problems({"id": "e1-3", "event": "delta", "data": {"tbl": "history", "rows": [{"key": "k", "text": "x"}], "deleted": []}}))
        self.assertTrue(self.problems({"id": "e1-3", "event": "flow", "data": {"at": 1, "stops": [1], "merged": 0, "closed": 0}}))

    def test_dump_names_every_event(self):
        self.assertLessEqual(set(live_schema.EVENTS), set(live_schema.dump()))


class Recorder(unittest.TestCase):
    def test_it_scrubs_names_emails_ids_tokens_and_teams(self):
        real = ["Jane Realname", "jane@mozilla.test", "U07REALID12", "xoxb-1234567890abcdef", "secretteam", "SECRET-42"]
        snap = {"snapshot": {"health": "ok", "team": {"name": real[0], "profile": "fxa"}}, "age_seconds": 3, "interval": 120,
                "agents": {"sessions": [{"key": "agent-ab12", "profile": real[4], "owner": real[2], "owner_name": real[0]}]},
                "agents_age_seconds": 2, "agents_interval": 30,
                "teams": {real[4]: {"snapshot": {"redacted": True, "team": {"profile": real[4]}}, "age_seconds": 5, "interval": 300, "error": None}}}
        rows = {"rows": [{"key": "agent-ab12", "profile": real[4], "state": "active", "jira": real[5], "request": f"{real[1]} {real[3]}",
                          "owner": real[2], "owner_image": "https://img", "created": 1, "agent": None, "agent_alive": False}]}
        errors = [{"sig": "abcdef1234", "source": "bot", "kind": "crash", "status": "open", "message": f"{real[0]} {real[1]}",
                   "where": "bot", "log": real[3], "count": 1, "first": "2026-11-03T00:00:00Z", "last": "2026-11-03T00:00:00Z",
                   "keys": ["agent-ab12"], "resolved": None}]
        frames = live_record.record(snap, rows, errors, now=1793750400)
        text = json.dumps(frames)
        for r in real:
            self.assertNotIn(r, text)
        self.assertEqual([p for f in frames for p in live_schema.frame_problems(f)] + live_schema.stream_problems(frames), [])
        self.assertIn("snapshot:example-1", frames[1]["data"]["feeds"])
        self.assertNotIn("owner_image", frames[1]["data"]["sessions"][0])

    def test_leaks_finds_real_values_and_passes_fake_ones(self):
        self.assertEqual(live_record.leaks("user@example.com U0EXAMPLE U-ROUTINE"), [])
        self.assertEqual(len(live_record.leaks("a@mozilla.test U07REALID12 xoxb-1234567890abcdef")), 3)


if __name__ == "__main__":
    unittest.main()
