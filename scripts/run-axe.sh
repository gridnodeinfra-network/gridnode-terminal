#!/usr/bin/env bash
# On-demand axe-core accessibility scan for GRID//NODE. Uses npx (no project
# deps). Complements the custom WCAG contrast audit (audit-served-day-ops.cjs)
# with a full axe rule sweep.
# Usage: scripts/run-axe.sh [url] [outDir]
set -u
URL="${1:-http://127.0.0.1:8080}"
OUT="${2:-/tmp/gridnode-axe}"
mkdir -p "${OUT}"
echo "axe-core on-demand scan → ${OUT}"
# No system Chrome on this box; use the Playwright chromium (same engine).
CHROME_PATH="${CHROME_PATH:-/home/thinkpadwinbash/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome}"
npx --yes @axe-core/cli "${URL}" \
  --chrome-options="--no-sandbox --headless" \
  --chrome-path="${CHROME_PATH}" \
  --dir "${OUT}" \
  --exit
RC=$?
report=$(find "${OUT}" -maxdepth 1 -name "axe-results-*.json" 2>/dev/null | tail -1)
echo "exit=${RC} — report: ${report}"
exit ${RC}
