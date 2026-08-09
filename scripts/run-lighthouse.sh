#!/usr/bin/env bash
# On-demand Lighthouse audit for GRID//NODE. Uses npx (no project deps).
# Usage: scripts/run-lighthouse.sh [url] [outDir]
set -u
URL="${1:-http://127.0.0.1:8080}"
OUT="${2:-/tmp/gridnode-lighthouse}"
mkdir -p "${OUT}"
echo "Lighthouse on-demand audit → ${OUT}"
# No system Chrome on this box; use the Playwright chromium (same engine).
CHROME_PATH="${CHROME_PATH:-/home/thinkpadwinbash/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome}"
export CHROME_PATH
npx --yes lighthouse "${URL}" \
  --chrome-flags="--headless --no-sandbox --disable-gpu" \
  --output=json --output-path="${OUT}/lighthouse.json" \
  --quiet
RC=$?
echo "exit=${RC} — JSON report: ${OUT}/lighthouse.json"
exit ${RC}
