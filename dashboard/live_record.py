#!/usr/bin/env python3
"""Record a C1 fixture (hello, then snapshot) from vm.sh api data, scrubbed. vm.sh api is not signed, so the
data is what a viewer who is not a team admin gets, and the hello says so.

  H=skills/fxa-manager/vm.sh
  $H api snapshot > s.json; $H api 'sessions?since=0' > ss.json; $H api errors > e.json
  python3 dashboard/live_record.py s.json ss.json e.json > dashboard-v2/fixtures/live/<name>.ndjson

The scrub keeps a text only when its field is in SAFE_KEYS or the text has a SAFE_TEXT form, and it writes a
placeholder for every other text: names, messages, requests and URLs. Teams other than fxa become example-<n>,
Jira keys of other projects become EX-<n>. It stops with no output when leaks() still finds something.
"""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_schema  # noqa: E402
from server import EMAIL, MASK, SESSION_UNUSED  # noqa: E402

# Fields whose values are short words from a fixed set (states, kinds, models), not free text.
SAFE_KEYS = frozenset("""state kind source status src model backend boot_backend mode runtime stop_reason wrap_mode
    health tbl profile key sig env trigger""".split())
WORD = re.compile(r"[a-z][a-z0-9_.-]{0,40}")
SAFE_TEXT = re.compile(r"\d{4}-\d\d-\d\d(T[\d:.]+Z?)?|(agent|ask)-[a-z0-9]{4,12}|[0-9a-f]{7,40}|\d+(\.\d+)?|EX-\d+|FXA-\d+")
JIRA = re.compile(r"[A-Z][A-Z0-9]{1,9}-\d{1,7}")
SLACK_ID = re.compile(r"\b[UWCDG][A-Z0-9]{8,11}\b")
FAKE_ID = re.compile(r"[UWCDG]0*(EXAMPLE|SAMPLE|ROUTINE)?0*")


def leaks(text):
    """What in a fixture text looks real: an email that is not at example.com, a Slack id, a token."""
    out = [m for m in EMAIL.findall(text) if not m.endswith("@example.com")]
    out += [m for m in SLACK_ID.findall(text) if not FAKE_ID.fullmatch(m)]
    return out + [m.group(0) for m in MASK.finditer(text)]


class Scrub:
    def __init__(self, teams):
        self.teams = {t: t if t == "fxa" else f"example-{i}" for i, t in enumerate(sorted(teams), 1)}
        self.jira = {}

    def ticket(self, k):
        if k.startswith("FXA-"):
            return k
        return self.jira.setdefault(k, f"EX-{len(self.jira) + 1}")

    def text(self, v, key):
        if v in self.teams:
            return self.teams[v]
        if v.startswith("snapshot:") and v[9:] in self.teams:
            return "snapshot:" + self.teams[v[9:]]
        if JIRA.fullmatch(v):
            return self.ticket(v)
        if SAFE_TEXT.fullmatch(v) or (key in SAFE_KEYS and WORD.fullmatch(v)):
            return v
        return "https://example.com/" if v.startswith(("http://", "https://")) else "example text"

    def __call__(self, v, key=""):
        if isinstance(v, dict):
            return {self.text(k, "key"): self(x, k) for k, x in v.items()}
        if isinstance(v, list):
            return [self(x, key) for x in v]
        return self.text(v, key) if isinstance(v, str) else v


def record(snap, sessions, errors, now=None):
    """The frames of one recorded connect, scrubbed."""
    now = int(now or time.time())
    teams = set(snap.get("teams") or {}) | {s.get("profile") for s in (snap.get("agents") or {}).get("sessions") or [] if isinstance(s.get("profile"), str)}
    teams |= {s.get("profile") for s in sessions.get("rows") or [] if isinstance(s.get("profile"), str)}
    scrub = Scrub(teams - {None})
    at = lambda age: None if age is None else now - age
    frame = lambda name, data, age, interval, err: {"name": name, "age_seconds": age, "interval": interval, "error": err,
                                                     "refreshing": bool(snap.get("refreshing")), "fetched_at": at(age), "data": data}
    feeds = {"snapshot": frame("snapshot", snap.get("snapshot"), snap.get("age_seconds"), snap.get("interval") or 120, snap.get("error")),
             "agents": frame("agents", snap.get("agents"), snap.get("agents_age_seconds"), snap.get("agents_interval") or 30, snap.get("agents_error"))}
    for t, x in (snap.get("teams") or {}).items():
        feeds[f"snapshot:{t}"] = frame(f"snapshot:{t}", x.get("snapshot"), x.get("age_seconds"), x.get("interval") or 300, x.get("error"))
    rows = [{k: v for k, v in r.items() if k not in SESSION_UNUSED} for r in sessions.get("rows") or [] if not r.get("deleted")]
    # A feed name goes through the team map as a key does, not to the placeholder.
    feeds = {scrub.text(n, "key"): dict(scrub(f), name=scrub.text(n, "key")) for n, f in feeds.items()}
    return [
        {"event": "hello", "data": {"v": 1, "epoch": "e0rec0rd", "sid": "s0record", "viewer": {"user": None, "admin": False, "teams": []},
                                    "retention_s": 300, "max_life_s": 900}},
        {"id": "e0rec0rd-1", "event": "snapshot",
         "data": {"feeds": feeds, "sessions": scrub(rows), "errors": scrub(errors), "stats": None, "flow": []}},
    ]


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("usage: live_record.py <snapshot.json> <sessions.json> <errors.json>")
    snap, sessions, errors = (json.load(open(p)) for p in sys.argv[1:])
    frames = record(snap, sessions, errors)
    text = "".join(json.dumps(f, separators=(",", ":")) + "\n" for f in frames)
    bad = leaks(text) + [p for f in frames for p in live_schema.frame_problems(f)]
    if bad:
        sys.exit("live_record.py: not written: " + "; ".join(sorted(set(map(str, bad)))[:10]))
    sys.stdout.write(text)
