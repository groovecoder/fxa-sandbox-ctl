#!/bin/bash
# 15-firefox.sh — Firefox desktop source at ~/firefox as an artifact build (prebuilt C++, local
# front end), so a session can change JS, CSS or .ftl and hand back a diff. Run as agent: the GCE
# image build runs it, and infra/firecracker/refresh.sh runs it in the snapshot guest, where it
# rebuilds only when Firefox main moved. The Android image has its own ~/firefox (13-android.sh).
[ "${FXA_ANDROID:-}" = true ] && { echo "==> Android image: ~/firefox is the Fenix tree (13-android.sh)"; exit 0; }
set -euo pipefail
cd /home/agent
# Depth 200: CI builds artifacts an hour or more after a push, so mach looks back
# for the nearest commit that has them; a depth-1 clone has none to look at.
[ -d firefox ] || git clone -q --depth 200 https://github.com/mozilla-firefox/firefox firefox
cd firefox
printf '%s\n' 'ac_add_options --enable-artifact-builds' 'mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/obj-artifact' 'mk_add_options AUTOCLOBBER=1' > mozconfig
old="$(git rev-parse HEAD)"
git fetch -q --depth 200 origin main && git checkout -q FETCH_HEAD
if [ ! -x obj-artifact/dist/bin/firefox ] || [ "$old" != "$(git rev-parse HEAD)" ]; then
  # --no-agentic-tools: sessions do not use mach's agent CLIs, and their install failed on arm64.
  # A failed bootstrap leaves a partial ~/.mozbuild, so remove it or the next run skips the bootstrap.
  [ -d ~/.mozbuild ] || ./mach --no-interactive bootstrap --no-system-changes --no-agentic-tools \
    --application-choice "Firefox for Desktop Artifact Mode" > /tmp/refresh-firefox.log 2>&1 \
    || { rm -rf ~/.mozbuild; tail -30 /tmp/refresh-firefox.log; exit 1; }
  # A stale objdir can fail where a clean one builds (a generated file whose rule missed a changed input):
  # build once more from a clean objdir, about 30 s, and keep the old one if that fails too.
  ./mach build >> /tmp/refresh-firefox.log 2>&1 || { rm -rf obj-old && mv obj-artifact obj-old && ./mach build >> /tmp/refresh-firefox.log 2>&1 && rm -rf obj-old; } \
    || { rm -rf obj-artifact; mv obj-old obj-artifact 2>/dev/null || true; git checkout -q "$old"; tail -30 /tmp/refresh-firefox.log; exit 1; }
fi
# fxa-dev-launcher sets the Nightly prefs only when FIREFOX_BIN has "Nightly" in it.
ln -sfn /home/agent/firefox/obj-artifact/dist/bin /home/agent/Nightly
echo "firefox at $(git rev-parse --short HEAD)"
