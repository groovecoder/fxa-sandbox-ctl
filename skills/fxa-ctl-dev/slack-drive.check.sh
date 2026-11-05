#!/usr/bin/env bash
# slack-drive.sh show: a reply's paragraphs and list items stay apart, with a fake Slack API (curl on PATH).
#   bash skills/fxa-ctl-dev/slack-drive.check.sh
set -u
fail=0
check() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"; fail=1; fi; }
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
printf 'SLACK_USER_TOKEN=xoxp-test\nSLACK_BOT_TOKEN=xoxb-test\nALLOWED_CHANNELS=C0TEST01\n' > "$tmp/env"
# A markdown block as Slack returns it: a paragraph, a two-item list, then a paragraph.
cat > "$tmp/replies.json" <<'JSON'
{"ok": true, "messages": [{"ts": "100.0", "user": "UBOT", "text": "I fixed it.", "blocks": [{"type": "rich_text", "elements": [
  {"type": "rich_text_section", "elements": [{"type": "text", "text": "I fixed it by hand."}, {"type": "text", "text": "\n\n"}]},
  {"type": "rich_text_list", "style": "bullet", "elements": [
    {"type": "rich_text_section", "elements": [{"type": "text", "text": "fxa:", "style": {"bold": true}}, {"type": "text", "text": " the tests pass."}]},
    {"type": "rich_text_section", "elements": [{"type": "text", "text": "ecosystem-platform:", "style": {"bold": true}}, {"type": "text", "text": " docs."}]}]},
  {"type": "rich_text_section", "elements": [{"type": "text", "text": "\n"}, {"type": "text", "text": "The comment at a.ts is old."}]}]}]}]}
JSON
mkdir -p "$tmp/bin"
cat > "$tmp/bin/curl" <<'SH'
#!/usr/bin/env bash
# The token comes on stdin (-K -).
k="$(cat)"
case "${*: -1}" in
  */auth.test) case "$k" in *xoxp*) echo '{"ok": true, "user_id": "UME"}' ;; *) echo '{"ok": true, "user_id": "UBOT"}' ;; esac ;;
  */conversations.replies) cat "$REPLIES" ;;
esac
SH
chmod +x "$tmp/bin/curl"
out="$(PATH="$tmp/bin:$PATH" REPLIES="$tmp/replies.json" FXA_DEV_ENV="$tmp/env" bash "$here/slack-drive.sh" show 100.0 | grep 'blocks:')"
check "show keeps the paragraph, each list item and the last paragraph apart" \
  "    blocks: I fixed it by hand. ⏎  ⏎ - fxa: the tests pass. ⏎ - ecosystem-platform: docs. ⏎  ⏎ The comment at a.ts is old." "$out"
[ "$fail" = 0 ] && echo "all checks pass"; exit "$fail"
