#!/usr/bin/env bash
# Offline check of which PR comments reach a feedback round: trust by repo permission,
# review summaries, and outdated comments until their thread is resolved.
#   bash lib/feedback-trust.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
command -v jq >/dev/null || { echo "skip: needs jq"; exit 0; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
source "$(dirname "$0")/github.sh"
pipeline_require() { :; }
worktree_branch_for() { echo fxa-1; }
PIPE_STATE_DIR="$tmp" PIPE_REPO_SLUG="mozilla/fxa"
# A private org member reads as CONTRIBUTOR; an outsider is CONTRIBUTOR too.
gh() {
  case "$*" in
    "pr list"*) echo 7 ;;
    *pulls/7/comments*) echo '[{"id":1,"position":3,"user":{"login":"member-a","type":"User"},"author_association":"CONTRIBUTOR","path":"a.ts","line":3,"body":"fix"},
      {"id":2,"position":4,"user":{"login":"outsider","type":"User"},"author_association":"CONTRIBUTOR","path":"a.ts","line":4,"body":"x"},
      {"id":3,"position":5,"user":{"login":"Copilot","type":"Bot"},"author_association":"CONTRIBUTOR","path":"a.ts","line":5,"body":"c"},
      {"id":4,"position":6,"user":{"login":"member-a","type":"User"},"author_association":"CONTRIBUTOR","path":"a.ts","line":6,"body":"done"},
      {"id":5,"position":null,"user":{"login":"member-a","type":"User"},"author_association":"CONTRIBUTOR","path":"a.ts","line":null,"original_line":8,"body":"moved"},
      {"id":6,"position":7,"user":{"login":"coderabbitai[bot]","type":"Bot"},"author_association":"NONE","path":"a.ts","line":7,"body":"r"}]' ;;
    *graphql*) [ -n "${NO_GRAPHQL:-}" ] && return 1; echo '["4"]' ;;
    *pulls/7/reviews*) echo '[{"id":20,"user":{"login":"member-a","type":"User"},"author_association":"CONTRIBUTOR","state":"CHANGES_REQUESTED","body":"Needs a test"},
      {"id":21,"user":{"login":"copilot-pull-request-reviewer[bot]","type":"Bot"},"author_association":"CONTRIBUTOR","state":"COMMENTED","body":"overview"},
      {"id":22,"user":{"login":"member-a","type":"User"},"author_association":"CONTRIBUTOR","state":"APPROVED","body":""}]' ;;
    *issues/7/comments*) echo '[{"id":9,"user":{"login":"member-a","type":"User"},"author_association":"CONTRIBUTOR","body":"please"}]' ;;
    *collaborators/member-a/permission*) echo admin ;;
    *collaborators/outsider/permission*) echo read ;;
    *"collaborators?permission=admin"*) echo "$*" >> "$tmp/admin-reads"; [ -n "${REPO_ADMINS:-}" ] || return 1; printf '%s\n' $REPO_ADMINS ;;
    *) return 1 ;;
  esac
}
got="$(gh_feedback FXA-1 | jq -r '[.comments[] | "\(.id)=\(.trusted)"] | join(" ")')"
check "a member with write access is trusted, inline and in the conversation" "yes" "$(grep -q '1=true' <<<"$got" && grep -q 'i9=true' <<<"$got" && echo yes)"
check "a reader is not trusted" "yes" "$(grep -q '2=false' <<<"$got" && echo yes)"
check "Copilot stays trusted" "yes" "$(grep -q '3=true' <<<"$got" && echo yes)"
check "CodeRabbit is trusted like Copilot" "yes" "$(grep -q '6=true' <<<"$got" && echo yes)"
check "a resolved thread is left out" "no" "$(grep -q '4=' <<<"$got" && echo yes || echo no)"
fb="$(gh_feedback FXA-1)"
check "an outdated open thread counts, marked outdated, at its original line" "true 8" "$(jq -r '.comments[] | select(.id == "5") | "\(.outdated) \(.line)"' <<<"$fb")"
check "a human review summary counts, with its state" "CHANGES_REQUESTED true" "$(jq -r '.comments[] | select(.id == "r20") | "\(.state) \(.trusted)"' <<<"$fb")"
check "Copilot's overview and an empty approval are left out" "no" "$(jq -e '.comments[] | select(.id == "r21" or .id == "r22")' <<<"$fb" >/dev/null && echo yes || echo no)"
# Team admins: the record's emails, through reporters.tsv, give GitHub logins; nothing else is an admin.
FXA_TEAMS_DIR="$tmp/teams" PIPE_PROFILE=fxa; mkdir -p "$tmp/teams"
echo '{"admins":[{"slack":"U1","email":"Admin.A@example.com"},{"slack":"U2","email":"nologin@example.com"}]}' > "$tmp/teams/fxa.json"
printf '# name\tlogin\temail\nAdmin A\tmember-a\tadmin.a@example.com\nOutsider\toutsider\tout@example.com\nBad\tx;y\tnologin@example.com\n' > "$tmp/reporters.tsv"
check "an admin's email maps to a login, case aside; an unmapped admin and a bad login give none" "member-a" "$(gh_admin_logins | paste -sd' ' -)"
fb="$(gh_feedback FXA-1)"
check "an admin's comments are marked admin; a stranger's, Copilot's and CodeRabbit's are not" "1 5 i9 r20|2 3 6" \
  "$(jq -r '[.comments[] | select(.admin) | .id] | join(" ")' <<<"$fb")|$(jq -r '[.comments[] | select(.admin | not) | .id] | join(" ")' <<<"$fb")"
rm -f "$tmp/reporters.tsv"
check "with no reporters.tsv nobody is an admin" "0" "$(gh_feedback FXA-1 | jq '[.comments[] | select(.admin)] | length')"
# Repo admins: read once a day into a cache; a failed read keeps the last list.
_mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1"; }
echo outsider > "$tmp/repo-admins.txt"; rm -f "$tmp/admin-reads"
check "a fresh cache of repo admins counts without a GitHub read" "outsider|0" \
  "$(gh_admin_logins | paste -sd' ' -)|$(grep -c . "$tmp/admin-reads" 2>/dev/null || echo 0)"
check "a repo admin's comment is marked admin and trusted" "true true" "$(gh_feedback FXA-1 | jq -r '.comments[] | select(.id == "2") | "\(.admin) \(.trusted)"')"
touch -t 202001010000 "$tmp/repo-admins.txt"
check "a stale cache with a failed read keeps the last list" "outsider|outsider|1" \
  "$(gh_admin_logins | paste -sd' ' -)|$(cat "$tmp/repo-admins.txt")|$(grep -c . "$tmp/admin-reads")"
touch -t 202001010000 "$tmp/repo-admins.txt"
check "a stale cache with a good read takes the new list; a bad login is dropped" "member-a|member-a x;y" \
  "$(REPO_ADMINS='member-a x;y' gh_admin_logins | paste -sd' ' -)|$(paste -sd' ' "$tmp/repo-admins.txt")"
rm -f "$tmp/repo-admins.txt"
check "without the thread list it stops, so precheck sees no changed comment set" "1|" \
  "$(out="$(NO_GRAPHQL=1 gh_feedback FXA-1 2>/dev/null)"; echo "$?|$out")"
exit "$fail"
