#!/usr/bin/env bash
# Runs the headless test suite (tests/suite.js) against the real app in
# Chromium. Usage: tests/run-tests.sh  (BROWSER=... to pick a binary)
set -euo pipefail
cd "$(dirname "$0")/.."

BROWSER="${BROWSER:-}"
if [ -z "$BROWSER" ]; then
    for c in chromium google-chrome google-chrome-stable chromium-browser chrome; do
        if command -v "$c" >/dev/null 2>&1; then BROWSER="$c"; break; fi
    done
fi
if [ -z "$BROWSER" ]; then
    echo "ERROR: no Chromium/Chrome binary found (set BROWSER=...)" >&2
    exit 1
fi

PORT="${PORT:-8571}"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
LOG="$(mktemp)"
cleanup() {
    kill "$SERVER_PID" 2>/dev/null || true
    rm -f .test-page.html "$LOG"
}
trap cleanup EXIT
sleep 1

# Inject the suite into a copy of the real page
sed 's|<script type="module" src="src/main.js"></script>|<script type="module" src="src/main.js"></script>\n    <script type="module" src="tests/suite.js"></script>|' \
    index.html > .test-page.html

timeout -k 5 120 "$BROWSER" \
    --headless=new --no-sandbox --disable-gpu \
    --autoplay-policy=no-user-gesture-required \
    --enable-logging=stderr --v=0 \
    --virtual-time-budget=30000 \
    --dump-dom "http://127.0.0.1:$PORT/.test-page.html" >/dev/null 2>"$LOG" || true

grep -o 'TEST .*' "$LOG" | sed 's/", source.*//' || true

if ! grep -q 'TEST DONE' "$LOG"; then
    echo "ERROR: test suite did not finish" >&2
    exit 1
fi
if grep -o 'TEST .*' "$LOG" | grep -qE 'FAIL:|ERROR:|failed=[1-9]'; then
    echo "ERROR: test failures detected" >&2
    exit 1
fi
echo "All tests passed."
