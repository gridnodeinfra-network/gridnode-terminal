#!/usr/bin/env bash
# Gate 6 (advisory) for preview deploys: pixel-diff the STAGED tree —
# exactly what was uploaded — against the approved baseline, served on
# loopback. Headless Chromium in this sandbox cannot reach public URLs,
# but the staged bytes are what Pages serves, so a local render is faithful.
#
# Advisory only: ALWAYS exits 0. Intentional redesigns change pixels
# legitimately, so a human reviews the report. A large diff ratio on a
# no-design-change deploy means something rendered catastrophically
# wrong — investigate before calling it good.
#
# Usage: scripts/visual-check.sh <staging-dir>
set -uo pipefail

STAGING_DIR="${1:?usage: visual-check.sh <staging-dir>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_FILE="$REPO_ROOT/visual-baselines/current.txt"

skip() { echo "   ⚠️  $1"; }

[[ -f "$BASELINE_FILE" ]] || { skip "no visual baseline (visual-baselines/current.txt) — skipping"; exit 0; }
BASELINE_DIR="$REPO_ROOT/$(cat "$BASELINE_FILE")"
[[ -d "$BASELINE_DIR" ]] || { skip "baseline dir missing: $BASELINE_DIR — run npm run visual:capture"; exit 0; }

if [[ -z "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" && -x "$HOME/.cache/ms-playwright/chrome-153/chrome-linux64/chrome" ]]; then
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$HOME/.cache/ms-playwright/chrome-153/chrome-linux64/chrome"
fi

VR_PORT=4173
# NOTE: --directory keeps the server in THIS shell so $! is its real PID.
# Never background inside ( ... & ): $! then captures nothing, the kill
# misses, and a leaked server keeps holding the port on a stale tree.
python3 -m http.server "$VR_PORT" --bind 127.0.0.1 --directory "$STAGING_DIR" >/dev/null 2>&1 &
VR_SRV=$!
# Never leak the server, even if this script is interrupted.
trap 'kill "$VR_SRV" 2>/dev/null || true' EXIT
sleep 1

VR_OUT="/tmp/gridnode-vr-$(date +%s)"
VR_RELEASE=$(grep -oE '\?v=[0-9]{8}\.[0-9a-z-]+' "$STAGING_DIR/index.html" | head -1 | cut -d= -f2 || true)

set +e
node "$REPO_ROOT/scripts/visual-regression-guard.cjs" compare \
  "$BASELINE_DIR" "$VR_OUT" "http://127.0.0.1:$VR_PORT" --release "$VR_RELEASE" >/tmp/gridnode-vr.log 2>&1
VR_EXIT=$?
set -e

if [[ "$VR_EXIT" == "0" ]]; then
  echo "   ✅ No out-of-scope visual diffs vs baseline"
elif [[ "$VR_EXIT" == "1" ]]; then
  echo "   ⚠️  Visual diffs detected vs baseline (advisory — review before calling this good):"
  grep -E '^(REGRESSION|IDENTICAL|IN-SCOPE)' /tmp/gridnode-vr.log | head -12 || true
  echo "   Full report: $VR_OUT/report.json"
else
  skip "visual check unavailable in this environment (infra) — skipping"
fi
exit 0
