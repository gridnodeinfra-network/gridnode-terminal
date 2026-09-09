#!/usr/bin/env bash
# GRID//NODE theme sweep: run the contrast/visual audit across BOTH themes
# (NIGHT GRID = dark, DAY OPS = light) and fail if either theme fails.
#
# Usage: scripts/audit-themes.sh [baseURL] [lang] [release]
#   baseURL  default http://127.0.0.1:4173
#   lang     en (default) or es
#   release  expected release string (default 20260804.1)
set -u

BASE="${1:-http://127.0.0.1:4173}"
LANG_ARG="${2:-en}"
RELEASE="${3:-20260804.1}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FAILED=0

for THEME in light dark; do
  OUT="/tmp/gridnode-${THEME}-proof"
  echo "=== AUDIT ${THEME} (${LANG_ARG}) → ${OUT} ==="
  node "${SCRIPT_DIR}/audit-served-day-ops.cjs" "${BASE}" "${OUT}" "${LANG_ARG}" "${RELEASE}" "${THEME}"
  RC=$?
  if [ ${RC} -ne 0 ]; then
    echo "FAIL theme=${THEME} exit=${RC}"
    FAILED=1
  else
    echo "PASS theme=${THEME}"
  fi
done

if [ ${FAILED} -ne 0 ]; then
  echo "THEME SWEEP: FAIL (one or both themes reported issues)"
  exit 2
fi
echo "THEME SWEEP: PASS (NIGHT GRID + DAY OPS)"
exit 0
