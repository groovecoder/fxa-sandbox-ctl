#!/usr/bin/env bash
# Offline check of POST /api/teams/<team>/pipeline/<KEY>/rounds: signed team admins only, JSON only,
# the key from the path only, the FxA team's pipeline name, a ctl refusal (exit 2) as 409, and a feed refresh.
#   bash lib/pipeline-write.check.sh
set -u
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
here="$(cd "$(dirname "$0")" && pwd)"
printf k1 > "$tmp/hmac"
FXA_DASHBOARD_HMAC_FILE="$tmp/hmac" TEAM_ADMINS="admin@example.com" python3 - "$here/../dashboard" <<'PY'
import json, sys, time
sys.path.insert(0, sys.argv[1]); import server, testkit
base = testkit.start(server.Handler)
fail = 0
def check(name, want, got):
    global fail
    print(("ok   " if want == got else "FAIL ") + name + ("" if want == got else f": want {want!r} got {got!r}")); fail |= want != got
calls, claims = [], []
class Proc:
    returncode, stdout, stderr = 0, "FXA-1: 1 of 2 review rounds used.", ""
server.ctl_run = lambda args, **kw: (calls.append((args, kw.get("env"))), Proc())[1]
class Feed:
    def __init__(self, n): self.n = n
    def claim(self): claims.append(self.n); return False
server.PIPELINE, server.FULL, server.TEAM_FEEDS = "fxa-ai-fixme", Feed("full"), {"crew": Feed("crew")}
def claimed(n):
    # The handler claims the feed after its reply, so the claim can come a moment after the answer.
    for _ in range(100):
        if len(claims) >= n: return claims[-1]
        time.sleep(0.02)
def post(path, user="admin@example.com", ctype="application/json"):
    h = {**(testkit.sig(user, "POST", path) if user else {}), **({"Content-Type": ctype} if ctype else {})}
    st, _, b = testkit.request(base + path, "POST", b"{}", h)
    return st, json.loads(b or b"null")
P = "/api/teams/fxa/pipeline/FXA-1/rounds"
check("no signed user: 401, the ctl not run", (401, 0), (post(P, user=None)[0], len(calls)))
check("a signed user who is not an admin of the team: 403", 403, post(P, user="other@example.com")[0])
check("not JSON: 415 (the cross-site guard)", 415, post(P, ctype="text/plain")[0])
check("a key that is not a Jira key never reaches rounds-give: 404", (404, False),
      (post("/api/teams/fxa/pipeline/FXA-1;x/rounds")[0], any("rounds-give" in a for a, _ in calls)))
st, b = post(P)
check("an admin: 200 with the ctl's answer", (200, "FXA-1: 1 of 2 review rounds used."), (st, b.get("out")))
check("the FxA team runs on its pipeline name, as the admin", (["--pipeline", "fxa-ai-fixme", "rounds-give", "FXA-1"], "admin@example.com"),
      (calls[-1][0], calls[-1][1]["FXA_TEAM_ACTOR"]))
check("and claims the FxA snapshot refresh", "full", claimed(1))
post("/api/teams/crew/pipeline/CR-7/rounds")
check("another team runs on its own pipeline and claims its own feed", (["--pipeline", "crew", "rounds-give", "CR-7"], "crew"), (calls[-1][0], claimed(2)))
Proc.returncode, Proc.stdout, Proc.stderr = 2, "", "ERROR: FXA-1 is not blocked at its review round cap"
st, b = post(P)
check("a ctl refusal (exit 2) is a 409 with its reason", (409, "ERROR: FXA-1 is not blocked at its review round cap"), (st, b.get("error")))
sys.exit(fail)
PY
