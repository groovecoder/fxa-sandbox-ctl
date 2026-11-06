#!/usr/bin/env bash
# Offline check of the review quiet window: a fresh human comment holds every new comment until the window ends.
#   bash lib/feedback-quiet.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
command -v jq >/dev/null || { echo "skip: needs jq"; exit 0; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp" /tmp/feedback/fxa-FXA-QUIET1-bundle.md' EXIT
here="$(dirname "$0")"
source "$here/github.sh"
eval "$(sed -n '/^cmd_feedback_bundle() {/,/^}/p' "$here/../fxa-sandbox-ctl")"
pipeline_require() { :; }; worktree_branch_for() { echo fxa-quiet1; }; gh_admin_logins() { :; }
PIPE_STATE_DIR="$tmp" PIPE_REPO_SLUG="mozilla/fxa" PIPE_REPO="$tmp/repo"
ago() { jq -rn --argjson t "$(( $(date +%s) - $1 ))" '$t | todate'; }
# HUMAN_AGO and BOT_AGO: seconds since the person's and Copilot's comments; unset leaves that comment out.
gh() {
  case "$*" in
    "pr list"*) echo 7 ;;
    *graphql*) echo '[]' ;;
    *pulls/7/comments*)
      { [ -z "${BOT_AGO:-}" ] || echo "{\"id\":3,\"user\":{\"login\":\"Copilot\",\"type\":\"Bot\"},\"author_association\":\"NONE\",\"path\":\"a.ts\",\"line\":5,\"created_at\":\"$(ago "$BOT_AGO")\",\"body\":\"c\"}"
        [ -z "${HUMAN_AGO:-}" ] || echo "{\"id\":1,\"user\":{\"login\":\"member-a\",\"type\":\"User\"},\"author_association\":\"MEMBER\",\"path\":\"a.ts\",\"line\":3,\"created_at\":\"$(ago "$HUMAN_AGO")\",\"body\":\"fix\"}"
        [ -z "${OUTSIDER_AGO:-}" ] || echo "{\"id\":5,\"user\":{\"login\":\"outsider\",\"type\":\"User\"},\"author_association\":\"CONTRIBUTOR\",\"path\":\"a.ts\",\"line\":4,\"created_at\":\"$(ago "$OUTSIDER_AGO")\",\"body\":\"x\"}"
      } | jq -s '.' ;;
    *issues/7/comments*|*pulls/7/reviews*) echo '[]' ;;
    *) return 1 ;;
  esac
}
fb="$(HUMAN_AGO=60 BOT_AGO=3000 gh_feedback FXA-QUIET1)"
check "a human comment 1 min old holds all comments, the bot's too, and says who and how long" "0|member-a|true" \
  "$(jq -r '"\(.comments | length)|\(.waiting.author)|\(.waiting.seconds_ago >= 60 and .waiting.seconds_ago <= 65 and .waiting.seconds_left == 900 - .waiting.seconds_ago)"' <<<"$fb")"
check "the hold writes the window's end for the snapshot" "yes" \
  "$(awk -v n="$(date +%s)" '$1 > n + 835 && $1 <= n + 840 { print "yes" }' "$tmp/FXA-QUIET1.feedback-waiting" 2>/dev/null)"
out="$(HUMAN_AGO=60 BOT_AGO=3000 cmd_feedback_bundle FXA-QUIET1 2>/dev/null)"
check "bundle during the hold shows nothing to act on" "pr=#7 unhandled=0|unhandled comments: 0" \
  "$(tail -1 <<<"$out")|$(sed -n 2p /tmp/feedback/fxa-FXA-QUIET1-bundle.md)"
fb="$(HUMAN_AGO=1000 BOT_AGO=3000 gh_feedback FXA-QUIET1)"
check "after the window both comments come out, with no waiting, and the end file goes" "1 3|null|no" \
  "$(jq -r '[.comments[].id] | sort | join(" ")' <<<"$fb")|$(jq -c '.waiting' <<<"$fb")|$([ -f "$tmp/FXA-QUIET1.feedback-waiting" ] && echo yes || echo no)"
fb="$(BOT_AGO=10 gh_feedback FXA-QUIET1)"
check "a fresh bot comment alone never holds" "3|null" "$(jq -r '[.comments[].id] | join(" ")' <<<"$fb")|$(jq -c '.waiting' <<<"$fb")"
check "the team's window comes from PIPE_REVIEW_QUIET_S" "2|null" \
  "$(PIPE_REVIEW_QUIET_S=30 HUMAN_AGO=60 BOT_AGO=3000 gh_feedback FXA-QUIET1 | jq -r '"\(.comments | length)|\(.waiting)"')"
check "a fresh comment from an untrusted outsider does not hold" "1 3 5|null" \
  "$(OUTSIDER_AGO=10 HUMAN_AGO=1000 BOT_AGO=3000 gh_feedback FXA-QUIET1 | jq -r '"\([.comments[].id] | sort | join(" "))|\(.waiting)"')"
HUMAN_AGO=1000 BOT_AGO=3000 gh_feedback FXA-QUIET1 ack 3 >/dev/null
check "ack with ids acks only those, so a comment that came during the launch stays" "1" \
  "$(HUMAN_AGO=1000 BOT_AGO=3000 gh_feedback FXA-QUIET1 | jq -r '[.comments[].id] | join(" ")')"
: > "$tmp/FXA-QUIET1.feedback-admin-rounds"
check "an empty round counter reads 0, and a bump makes it 1" "0|1" \
  "$(gh_feedback FXA-QUIET1 admin-rounds)|$(gh_feedback FXA-QUIET1 admin-rounds bump)"
check "ack during the hold acks every comment; after it nothing holds or remains" "acked 2 comment(s) on #7|0|null" \
  "$(HUMAN_AGO=60 BOT_AGO=3000 gh_feedback FXA-QUIET1 ack)|$(HUMAN_AGO=60 BOT_AGO=3000 gh_feedback FXA-QUIET1 | jq -r '"\(.comments | length)|\(.waiting)"')"
exit "$fail"
