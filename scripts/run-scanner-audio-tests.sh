#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "${1:-}" =~ ^https?:// ]]; then
  exec node "$SCRIPT_DIR/test-scanner-audio.cjs" "$1"
fi

PORT="${GRIDNODE_SCANNER_AUDIO_TEST_PORT:-4175}"
BASE_URL="http://127.0.0.1:${PORT}"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$PROJECT_DIR" >/dev/null 2>&1 &
SERVER_PID=$!

for _ in {1..50}; do
  if python3 - "$BASE_URL" <<'PY'
import sys
import urllib.request

try:
    with urllib.request.urlopen(sys.argv[1], timeout=0.25) as response:
        raise SystemExit(0 if response.status < 500 else 1)
except Exception:
    raise SystemExit(1)
PY
  then
    exec node "$SCRIPT_DIR/test-scanner-audio.cjs" "$BASE_URL"
  fi
  sleep 0.1
done

echo "scanner audio test server did not become ready at $BASE_URL" >&2
exit 1
