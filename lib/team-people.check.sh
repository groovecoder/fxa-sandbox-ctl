#!/usr/bin/env bash
# Offline check of the readers of a team's people (lib/github.sh, lib/jira.sh): the record's people
# map an email to a GitHub login first, and reporters.tsv is the fallback.
#   bash lib/team-people.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
command -v jq >/dev/null || { echo "skip: needs jq"; exit 0; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
source "$(dirname "$0")/github.sh"
source "$(dirname "$0")/jira.sh"
pipeline_require() { :; }
gh() { return 1; }
FXA_TEAMS_DIR="$tmp/teams" PIPE_PROFILE=fxa PIPE_STATE_DIR="$tmp" PIPE_REPO_SLUG=""
mkdir -p "$tmp/teams"
echo '{"admins":[{"slack":"U1","email":"Ada@example.com"},{"slack":"U2","email":"bo@example.com"},{"slack":"U3","email":"cy@example.com"}],
  "people":[{"email":"ada@EXAMPLE.com","github":"ada-own"},{"email":"cy@example.com","slack":"U3"}]}' > "$tmp/teams/fxa.json"
printf '# name\tlogin\temail\nAda Row\tada-tsv\tada@example.com\nBo Row\tbo-tsv\tbo@example.com\nCy Row\tcy-tsv\tcy@example.com\n' > "$tmp/reporters.tsv"

check "admins: a person's login wins over reporters.tsv; one with no github falls back to reporters.tsv" "ada-own bo-tsv cy-tsv" \
  "$(gh_admin_logins | paste -sd' ' -)"
check "login to email: people first, then reporters.tsv, unknown is empty" "ada@EXAMPLE.com|bo@example.com|" \
  "$(jira_login_email ada-own)|$(jira_login_email bo-tsv)|$(jira_login_email nobody)"

reporter='{"emailAddress":"ADA@example.com","displayName":"Ada Row"}'
acli() { echo "[{\"fields\":{\"reporter\":${reporter}}}]"; }
check "reporter: the email from Jira through people, before the name in reporters.tsv" "ada-own" "$(jira_reporter_login FXA-1)"
reporter='{"displayName":"Bo Row"}'
check "reporter: no email from Jira falls back to the name in reporters.tsv" "bo-tsv" "$(jira_reporter_login FXA-1)"
rm -f "$tmp/reporters.tsv"
reporter='{"emailAddress":"ada@example.com","displayName":"Ada Row"}'
check "with no reporters.tsv, people alone map the reporter and the admins" "ada-own|ada-own" \
  "$(jira_reporter_login FXA-1)|$(gh_admin_logins | paste -sd' ' -)"
exit "$fail"
