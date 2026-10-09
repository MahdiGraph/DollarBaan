#!/usr/bin/env bash
# Android smoke test for CI, run against an already booted emulator.
# Usage: scripts/android-smoke.sh <debug.apk> <release.apk> <output dir>
#   1. the debug build is inspected over DevTools (renders, syncs prices)
#   2. the release build must install, start and keep running without a crash
set -euo pipefail

DEBUG_APK=$1
RELEASE_APK=$2
OUT=$3
PKG=io.github.mahdigraph.dollarbaan
mkdir -p "$OUT"

app_pid() {
    adb shell pidof "$PKG" 2>/dev/null | tr -d '\r' || true
}

start_app() {
    adb shell am start -W -n "$PKG/.MainActivity" >/dev/null
    for _ in $(seq 1 30); do
        [ -n "$(app_pid)" ] && return 0
        sleep 1
    done
    echo "The app did not start"
    return 1
}

echo "== Debug build: checking the WebView over DevTools"
adb install -r "$DEBUG_APK"
start_app
pid=$(app_pid)
socket=""
for _ in $(seq 1 30); do
    socket=$(adb shell cat /proc/net/unix | grep -o "webview_devtools_remote_$pid" | head -n 1 || true)
    [ -n "$socket" ] && break
    sleep 1
done
if [ -z "$socket" ]; then
    echo "No WebView DevTools socket for pid $pid"
    exit 1
fi
adb forward tcp:9222 "localabstract:$socket"
node scripts/smoke.mjs --port 9222 --shot "$OUT/android-webview.png"
adb exec-out screencap -p > "$OUT/android-debug.png"
adb forward --remove tcp:9222
adb uninstall "$PKG" >/dev/null

echo "== Release build: install and launch"
adb install "$RELEASE_APK"
adb logcat -c
start_app
sleep 20
adb exec-out screencap -p > "$OUT/android-release.png"
adb logcat -d > "$OUT/logcat.txt"
if [ -z "$(app_pid)" ]; then
    echo "The release app stopped running"
    exit 1
fi
if grep -q "FATAL EXCEPTION" "$OUT/logcat.txt"; then
    echo "The release app crashed"
    exit 1
fi
echo "Android smoke test passed"
