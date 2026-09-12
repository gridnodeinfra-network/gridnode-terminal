#!/usr/bin/env bash
# v0.15.44 regression runner: serves dist/ and runs the log-shot dose test.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "${1:-}" =~ ^https?:// ]]; then
  exec node "$SCRIPT_DIR/test-logshot-dose-regression.cjs" "$1"
fi

PORT="${GRIDNODE_LOGSHOT_TEST_PORT:-4175}"
BASE_URL="http://127.0.0.1:${PORT}"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

cd "$PROJECT_DIR/dist"
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
sleep 1

node "$SCRIPT_DIR/test-logshot-dose-regression.cjs" "$BASE_URL"
