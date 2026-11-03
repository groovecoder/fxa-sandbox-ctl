#!/usr/bin/env python3
"""C1, the /api/live event schema: the Python side. dashboard-v2/src/live/schema.ts is the TS side, and its
test fails when the field names there differ from what --dump prints here.

  python3 dashboard/live_schema.py --dump                  # the fields of each event and shape, as JSON
  python3 dashboard/live_schema.py --check f.ndjson ...    # each file parses as one recorded stream

A fixture line is one frame: {"id": "<epoch>-<n>", "event": <name>, "data": {...}}. Only the events that the hub
keeps in its ring have an id. hello, ping, reset and bye belong to one stream, so a resume keeps the last id.
The checks here are strict: a field that the schema does not name is a problem, except in a Session row,
which keeps every v1 field. The TS guards ignore an unknown field, so a new server field does not stop a page.

The stats module (W1-STATS) gives the hub two functions:
  stats.compute(con, files) -> dict      the whole /api/stats copy, from the store and the local files
  stats.parts(old, new) -> dict          a StatsFrame: base and etag (stats.etag of old and new), rows_add and the changed
                                         parts, or reload when a row that the old copy had changed; None when equal
"""
import json
import re
import sys
from typing import Any, Dict, List, Literal, Optional, TypedDict, Union, get_args, get_origin, get_type_hints, is_typeddict

Num = float  # a JSON number: an int counts too


class Viewer(TypedDict):
    user: Optional[str]
    admin: bool
    teams: List[str]


class Hello(TypedDict):
    v: Literal[1]
    epoch: str
    sid: str
    viewer: Viewer
    retention_s: int
    max_life_s: int


class _FeedFrame(TypedDict):
    name: str  # the server Feed name: snapshot, agents, teams, snapshot:<team>, team-test:<team>
    age_seconds: Optional[int]
    interval: int
    error: Optional[str]
    refreshing: bool
    fetched_at: Optional[Num]


class FeedFrame(_FeedFrame, total=False):
    data: Any  # left out when only the error, the age or refreshing changed


class _Session(TypedDict):
    key: str


class Session(_Session, total=False):
    # The v1 fields that /api/snapshot sends, after the SESSION_UNUSED drop. Other v1 fields can come too.
    agent: Optional[Dict[str, Any]]
    agent_alive: bool
    base: Any
    boot_backend: Any
    boot_s: Any
    boot_steps: Any
    booted_at: Any
    branch: Any
    busy_s: Any
    compute_usd: Any
    created: Num
    finish_notes: Any
    fix_actor: Any
    fix_head_sha: Any
    fix_pr: Any
    fix_run: bool
    fix_trigger: Any
    handoff: Any
    idle_s: Any
    jira: Any
    jira_drafts: Any
    last_activity: Num
    last_text: Any
    last_tool: Any
    mcp: Any
    media: List[Any]
    new: Any
    owner: Any
    owner_name: Any
    pr_url: Any
    profile: str
    pushed_branch: Any
    request: Any
    res_peak: Any
    resume_from: Any
    routine_draft: Any
    routine_name: Any
    routine_run: Any
    runner_left: Any
    runner_s: Any
    runtime: Any
    slack_url: Any
    source: Any
    stack_fails: Any
    stack_s: Any
    stack_starts: Any
    state: str
    stop_reason: Any
    stopped_at: Any
    summary: Any
    thread: Any
    turn_open: Any
    turns: Any
    untrusted: Any
    verify_fail_runs: Any
    verify_full: Any
    verify_runs: Any
    verify_s: Any
    wrap_mode: Any
    wrap_reply: Any


class Resolved(TypedDict):
    at: str
    note: Optional[str]


class Error(TypedDict):
    # One open or closed signature, as `fxa-sandbox-ctl errors --json` gives it.
    sig: str
    source: str
    kind: str
    status: str
    message: str
    where: Optional[str]
    log: Optional[str]
    count: int
    first: str
    last: str
    keys: List[str]
    resolved: Optional[Resolved]


class FlowPoint(TypedDict):
    at: int
    stops: List[int]  # 9 counts, in the LANE_ST order
    merged: int
    closed: int


class Snapshot(TypedDict):
    feeds: Dict[str, FeedFrame]
    sessions: List[Session]
    errors: List[Error]
    stats: None  # the client reads GET /api/stats?inproc=1 once, then applies the stats frames
    flow: List[FlowPoint]


Table = Literal["sessions", "errors", "history", "routines", "routine_runs", "routine_tick", "team_audit"]
# The field that names a row of each delta table; delta.deleted holds these values as text.
DELTA_KEY = {"sessions": "key", "errors": "sig", "history": "key", "routines": "id", "routine_runs": "routine_id",
             "routine_tick": "env", "team_audit": "team"}


class Delta(TypedDict):
    tbl: Table
    rows: List[Dict[str, Any]]
    deleted: List[str]


class _StatsFrame(TypedDict):
    base: str  # the ETag of the copy that this frame applies to
    etag: str  # the ETag of the copy after it


# The parts of /api/stats that a stats frame sends whole when they change. rows grows by rows_add.
STATS_PARTS = ("prs", "prs_at", "llm", "load", "pipeline", "memory", "tickets", "kinds", "models", "ranges", "team_passes", "top", "weeks")


class StatsFrame(_StatsFrame, total=False):
    reload: Literal[True]  # a past row changed: fetch the whole copy again; no part comes with it
    rows_add: List[Dict[str, Any]]
    prs: List[Dict[str, Any]]
    prs_at: Num
    llm: Dict[str, Any]
    load: Dict[str, Any]
    pipeline: Dict[str, Any]
    memory: Dict[str, Any]
    tickets: Dict[str, Any]
    kinds: List[Any]
    models: List[Any]
    ranges: Dict[str, Any]
    team_passes: Dict[str, Any]
    top: List[Any]
    weeks: List[Any]


class Tail(TypedDict):
    key: str
    start: int  # the index of lines[0] in the 200-line window
    lines: List[str]


class Reset(TypedDict):
    reason: str


class Ping(TypedDict):
    at: int


class _Bye(TypedDict):
    reason: Literal["max_life", "shutdown", "full", "off"]


class Bye(_Bye, total=False):
    retry_s: int


EVENTS = {"hello": Hello, "snapshot": Snapshot, "feed": FeedFrame, "delta": Delta, "stats": StatsFrame, "tail": Tail,
          "flow": FlowPoint, "reset": Reset, "ping": Ping, "bye": Bye}
SHAPES = {"Viewer": Viewer, "Session": Session, "Error": Error, "Resolved": Resolved}
RING = frozenset(("snapshot", "feed", "delta", "stats", "tail", "flow"))
OPEN = (Session,)
EPOCH = r"[A-Za-z0-9]{1,32}"
ID = re.compile(rf"({EPOCH})-([0-9]+)")


def dump():
    """{name: {required, optional}} for each event and shape."""
    return {n: {"required": sorted(t.__required_keys__), "optional": sorted(t.__optional_keys__)}
            for n, t in {**EVENTS, **SHAPES}.items()}


def fits(v, t, path):
    """The problems of value v against type t, as text."""
    o, a = get_origin(t), get_args(t)
    bad = [f"{path}: {json.dumps(v)[:60]} is not {getattr(t, '__name__', t)}"]
    if t is Any:
        return []
    if o is Union:
        return [] if any(not fits(v, x, path) for x in a) else bad
    if o is Literal:
        return [] if any(v == x and type(v) is type(x) for x in a) else bad
    if t is type(None):
        return [] if v is None else bad
    if t is bool:
        return [] if isinstance(v, bool) else bad
    if t in (int, float, str):
        ok = isinstance(v, str) if t is str else isinstance(v, (int, float) if t is float else int) and not isinstance(v, bool)
        return [] if ok else bad
    if o is list:
        return [p for i, x in enumerate(v) for p in fits(x, a[0], f"{path}[{i}]")] if isinstance(v, list) else bad
    if o is dict:
        return [p for k, x in v.items() for p in fits(x, a[1], f"{path}.{k}")] if isinstance(v, dict) else bad
    if is_typeddict(t):
        if not isinstance(v, dict):
            return bad
        hints = get_type_hints(t)
        out = [f"{path}: no {k}" for k in sorted(t.__required_keys__ - v.keys())]
        if t not in OPEN:
            out += [f"{path}: unknown field {k}" for k in sorted(v.keys() - hints.keys())]
        return out + [p for k, x in v.items() if k in hints for p in fits(x, hints[k], f"{path}.{k}")]
    raise TypeError(f"no check for {t}")


def frame_problems(f):
    """The problems of one frame, with the rules that a type cannot say."""
    if not isinstance(f, dict) or not isinstance(f.get("event"), str):
        return ["not a frame"]
    ev, d = f["event"], f.get("data")
    if ev not in EVENTS:
        return [f"unknown event {ev}"]
    out = [f"unknown frame field {k}" for k in sorted(f.keys() - {"id", "event", "data"})]
    if (ev in RING) != ("id" in f):
        out.append(f"{ev}: id {'missing' if ev in RING else 'not allowed'}")
    elif "id" in f and not (isinstance(f["id"], str) and ID.fullmatch(f["id"])):
        out.append(f"{ev}: bad id {f['id']!r}")
    out += fits(d, EVENTS[ev], ev)
    if out:
        return out
    if ev == "hello" and not re.fullmatch(EPOCH, d["epoch"]):
        out.append("hello: bad epoch")
    if ev == "flow" and len(d["stops"]) != 9:
        out.append("flow: stops needs 9 counts")
    if ev == "stats" and d.get("reload") and set(d) - {"base", "etag", "reload"}:
        out.append("stats: a reload frame has no parts")
    if ev == "delta":
        k = DELTA_KEY[d["tbl"]]
        out += [f"delta {d['tbl']}: a row has no {k}" for r in d["rows"] if k not in r]
        if d["tbl"] == "history":
            out += ["delta history: rows have the key only" for r in d["rows"] if set(r) != {"key"}]
        shape = {"sessions": Session, "errors": Error}.get(d["tbl"])
        out += [p for i, r in enumerate(d["rows"]) for p in (fits(r, shape, f"delta.rows[{i}]") if shape else [])]
    if ev == "snapshot":
        out += [f"snapshot: feed {n} has no data" for n, x in d["feeds"].items() if "data" not in x]
        out += [f"snapshot: feed {n} has the name {x['name']}" for n, x in d["feeds"].items() if x["name"] != n]
    return out


def stream_problems(frames):
    """The order rules: hello first; after a new epoch or a reset, a snapshot; ids that grow inside an epoch."""
    out, epoch, last, want = [], None, None, False
    for i, f in enumerate(frames):
        ev, at = f["event"], f"frame {i + 1} ({f['event']})"
        if i == 0 and ev != "hello":
            out.append(f"{at}: a stream starts with hello")
        if i > 0 and frames[i - 1]["event"] == "bye" and ev != "hello":
            out.append(f"{at}: after bye only a new connect (hello) can come")
        if ev == "hello":
            if f["data"]["epoch"] != epoch:
                epoch, last, want = f["data"]["epoch"], None, True
        elif ev == "reset":
            want = True
        elif "id" in f:
            ep, n = ID.fullmatch(f["id"]).groups()
            if ep != epoch:
                out.append(f"{at}: id epoch {ep} is not the hello epoch {epoch}")
            if last is not None and int(n) <= last:
                out.append(f"{at}: id {n} does not follow {last}")
            if want and ev != "snapshot":
                out.append(f"{at}: a snapshot must come first")
            last, want = int(n), want and ev != "snapshot"
    return out


def read(path):
    """(frames, problems) of one ndjson file."""
    frames, out = [], []
    with open(path) as fh:
        for i, line in enumerate(fh, 1):
            if not line.strip():
                continue
            try:
                f = json.loads(line)
            except ValueError as e:
                out.append(f"{path}:{i}: {e}")
                continue
            out += [f"{path}:{i}: {p}" for p in frame_problems(f)]
            frames.append(f)
    if not out:
        out += [f"{path}: {p}" for p in stream_problems(frames)]
    return frames, out


if __name__ == "__main__":
    if sys.argv[1:] == ["--dump"]:
        print(json.dumps(dump(), indent=1, sort_keys=True))
    elif sys.argv[1:2] == ["--check"] and sys.argv[2:]:
        bad = [p for f in sys.argv[2:] for p in read(f)[1]]
        print("\n".join(bad) or f"ok: {len(sys.argv) - 2} files")
        sys.exit(1 if bad else 0)
    else:
        sys.exit("usage: live_schema.py --dump | --check <file.ndjson>...")
