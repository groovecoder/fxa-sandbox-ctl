#!/usr/bin/env bash
# Offline check of the dashboard's team people route (dashboard/server.py): that team's admins only, the Slack
# user filled from the email (Slack stubbed, never called), and the record saved through profile set.
#   bash lib/teams-people.check.sh
set -u
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/ctl" <<EOF
#!/bin/bash
printf '%s\n' "\$*" >> "$tmp/args"
for a in "\$@"; do [ -f "\$a" ] && cat "\$a" > "$tmp/record"; done
case "\$2 \$3" in
  "get crew") echo '{"name":"crew","generation":"7","tested":"6","admins":[{"slack":"U1234567","email":"Crew@example.com"}],"pr":{"review_rounds":2},"people":[{"email":"old@example.com","slack":"U0OLD001","github":"old-gh"}]}' ;;
  "get rusty") echo '{"name":"rusty","generation":"3"}' ;;
  "list ") echo '[{"profile":"crew"},{"profile":"rusty"}]' ;;
  *) echo "done \$2" ;;
esac
EOF
chmod +x "$tmp/ctl"; printf 'k1' > "$tmp/hmac"
printf 'SLACK_BOT_TOKEN=xoxb-old\nSLACK_BOT_TOKEN="xoxb-fake"\n' > "$tmp/bot.env"
env -u SLACK_BOT_TOKEN FXA_BOT_ENV="$tmp/bot.env" FXA_DB="$tmp/fxa.db" FXA_TEAMS_DIR="$tmp/teams" FXA_DASHBOARD_HMAC_FILE="$tmp/hmac" TEAM_ADMINS="admin@example.com" \
  python3 - "$(dirname "$0")/../dashboard" "$tmp" <<'PY'
import io, json, os, sys
sys.path.insert(0, sys.argv[1]); import server, testkit
from testkit import sig
tmp = sys.argv[2]
server.CTL = f"{tmp}/ctl"
server.TEAMS = server.Feed("teams", ["profile", "list"], 300, 600)
server.TEAMS.claim = lambda: False
base = testkit.start(server.Handler)
fail = 0
def check(name, want, got):
    global fail
    print(("ok   " if want == got else "FAIL ") + name + ("" if want == got else f": want {want!r} got {got!r}")); fail |= want != got
def call(method, path, body=None, user=None):
    st, _, b = testkit.request(base + path, method, json.dumps(body).encode() if body is not None else None,
                               {"Content-Type": "application/json", **(sig(user, method, path) if user else {})})
    return st, b.decode()
def ran(): return [l for l in open(f"{tmp}/args").read().splitlines() if not l.startswith("profile get") and l != "profile list"] if os.path.exists(f"{tmp}/args") else []
P = "/api/teams/crew/people"

# Slack: a stub of urlopen that answers by email, and records each call.
asked = []
class Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False
real_urlopen = server.urllib.request.urlopen
def fake_urlopen(req, timeout=0):
    if not getattr(req, "full_url", "").startswith("https://slack.com/"):
        return real_urlopen(req, timeout=timeout)
    asked.append((req.full_url, req.get_header("Authorization")))
    email = req.full_url.split("email=", 1)[1]
    if email.startswith("bulk"):
        return Resp(json.dumps({"ok": True, "user": {"id": "U0BULK01"}}).encode())
    ans = {"new%40example.com": {"ok": True, "user": {"id": "U0NEW001"}}, "nouser%40example.com": {"ok": False, "error": "users_not_found"},
           "scope%40example.com": {"ok": False, "error": "missing_scope"}, "rl%40example.com": {"ok": False, "error": "ratelimited"}}.get(email)
    if ans is None:
        raise OSError("down")
    return Resp(json.dumps(ans).encode())
server.urllib.request.urlopen = fake_urlopen

check("the lookup reads the bot token from the bot .env, the last line wins, and maps Slack's errors",
      (("U0NEW001", None), (None, "no Slack user has this email"), (None, server.SLACK_WHY["missing_scope"]), (None, "Slack did not answer"), "Bearer xoxb-fake"),
      (server.slack_lookup("new@example.com"), server.slack_lookup("nouser@example.com"), server.slack_lookup("scope@example.com"),
       server.slack_lookup("down@example.com"), asked[0][1]))
os.environ["FXA_BOT_ENV"] = f"{tmp}/none"
check("no token: no call, and the reason", ((None, "the dashboard has no Slack bot token"), 4), (server.slack_lookup("new@example.com"), len(asked)))
os.environ["FXA_BOT_ENV"] = f"{tmp}/bot.env"

st, b = call("GET", P, user="viewer@example.com")
check("a viewer who is not that team's admin: 403, and no email in the answer", (403, False), (st, "@" in b))
check("no signed user: 401", 401, call("GET", P)[0])
check("crew's record admin cannot read another team's people", 403, call("GET", "/api/teams/rusty/people", user="crew@example.com")[0])
st, b = call("GET", P, user="crew@example.com")
check("crew's record admin reads one list: its people, then each team admin with no person row, marked admin; it may not change admins",
      (200, {"people": [{"email": "old@example.com", "slack": "U0OLD001", "github": "old-gh"}, {"email": "crew@example.com", "slack": "U1234567", "admin": True}],
             "generation": "7", "can_admin": False}), (st, json.loads(b)))
check("a TEAM_ADMINS email reads them too, and may change admins", (200, True), (lambda r: (r[0], json.loads(r[1])["can_admin"]))(call("GET", P, user="admin@example.com")))

asked.clear()
rows = [{"email": "crew@example.com", "admin": True}, {"email": "old@example.com", "github": "old-gh"}, {"email": "New@Example.com", "github": "@new-gh", "slack": "U0FORGED"},
        {"email": "scope@example.com"}, {"email": "nouser@example.com", "github": "nu"}]
st, b = call("POST", P, {"people": rows, "generation": "7"}, "crew@example.com")
saved = json.load(open(f"{tmp}/record"))
want = [{"email": "crew@example.com", "slack": "U1234567"}, {"email": "old@example.com", "slack": "U0OLD001", "github": "old-gh"}, {"email": "new@example.com", "slack": "U0NEW001", "github": "new-gh"},
        {"email": "scope@example.com"}, {"email": "nouser@example.com", "github": "nu"}]
check("a save: a kept email keeps its Slack user with no lookup, a new email asks Slack (the client's slack is ignored), a failed lookup saves the row without slack",
      (200, want, 3, [{"email": "scope@example.com", "why": server.SLACK_WHY["missing_scope"]}, {"email": "nouser@example.com", "why": "no Slack user has this email"}]),
      (st, saved["people"], len(asked), json.loads(b).get("notes")))
check("the save runs profile set with the generation, keeps the other fields, and drops the read-only keys",
      ("set crew --generation 7", {"review_rounds": 2}, False, False),
      (" ".join(w for w in ran()[-1].split() if not w.endswith(".json"))[len("profile "):], saved.get("pr"), "generation" in saved, "tested" in saved))
n = len(ran())
check("a bad email, a duplicate, a bad GitHub username or no generation is refused before any save", ([400] * 4, n),
      ([call("POST", P, body, "crew@example.com")[0] for body in (
          {"people": [{"email": "nope"}], "generation": "7"}, {"people": [{"email": "a@example.com"}, {"email": "A@example.com"}], "generation": "7"},
          {"people": [{"email": "a@example.com", "github": "bad name"}], "generation": "7"}, {"people": []})], len(ran())))
check("a viewer cannot save people", (403, n), (call("POST", P, {"people": [], "generation": "7"}, "viewer@example.com")[0], len(ran())))
check("the team's own admin cannot add or drop a team admin", ([403, 403], n),
      ([call("POST", P, body, "crew@example.com")[0] for body in (
          {"people": [{"email": "crew@example.com", "admin": True}, {"email": "old@example.com", "admin": True}], "generation": "7"},
          {"people": [{"email": "crew@example.com"}], "generation": "7"})], len(ran())))
check("a team admin needs a Slack user", (400, n), (call("POST", P, {"people": [{"email": "nouser@example.com", "admin": True}], "generation": "7"}, "admin@example.com")[0], len(ran())))
st, b = call("POST", P, {"people": [{"email": "crew@example.com", "admin": True}, {"email": "old@example.com", "admin": True}], "generation": "7"}, "admin@example.com")
check("a dashboard admin makes a person a team admin: the record's admins list follows the marks",
      (200, [{"slack": "U1234567", "email": "crew@example.com"}, {"slack": "U0OLD001", "email": "old@example.com"}]), (st, json.load(open(f"{tmp}/record"))["admins"]))
del asked[:]
(rows, notes), _ = server.people_rows([{"email": f"bulk{i}@example.com"} for i in range(60)], [])
check("a save asks Slack at most 50 times; the rest wait for the next save", (50, 10), (len(asked), len(notes)))
del asked[:]
(rows, notes), _ = server.people_rows([{"email": "rl@example.com"}, {"email": "bulk1@example.com"}], [])
check("after Slack rate-limits, no more lookups in this save", (1, 2), (len(asked), len(notes)))
sys.exit(fail)
PY
