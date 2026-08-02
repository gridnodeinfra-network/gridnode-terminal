#!/usr/bin/env bash
set -Eeuo pipefail
# Release marker bump: keep cache-busting in sync across the app.
# Usage: bash scripts/bump-version.sh 20260802.3
# After bumping, edit the release files, run verify.sh, stage, deploy.
NEXT="${1:?usage: bump-version.sh <marker> e.g. 20260802.3}"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

CUR="$(grep -oE 'v=20[0-9]{6}\.[0-9]+' index.html | head -1 | sed 's/^v=//')"
[[ -n "$CUR" ]] || { echo "ERROR: could not detect current marker" >&2; exit 1; }
[[ "$NEXT" != "$CUR" ]] || { echo "ERROR: marker already at $NEXT" >&2; exit 1; }

NEW_CACHE="gridnode-shell-${NEXT//./-}"

echo "bumping marker $CUR -> $NEXT (sw cache: $NEW_CACHE)"

# index.html: all script/css ?v= references
sed -i "s/$CUR/$NEXT/g" index.html
# sw.js: cache name + SHELL entries
sed -i "s/const CACHE_NAME = 'gridnode-shell-[^']*'/const CACHE_NAME = '$NEW_CACHE'/" sw.js
sed -i "s/$CUR/$NEXT/g" sw.js
# bundle + source mirror: SW registration URL
sed -i "0,/v=$CUR/s//v=$NEXT/" js/gridnode-bundle.js
sed -i "0,/v=$CUR/s//v=$NEXT/" js/gridnode-app.js

echo "done. next: edit release files -> bash scripts/verify.sh -> stage + deploy"
