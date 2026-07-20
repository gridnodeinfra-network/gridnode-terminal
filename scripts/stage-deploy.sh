#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGING_ROOT="$REPO_ROOT/.staging"
STAGING_NAME="${GRIDNODE_STAGING_NAME:-gridnode-preview}"
STAGING_DIR="$STAGING_ROOT/$STAGING_NAME"
TEMP_DIR="$STAGING_ROOT/.${STAGING_NAME}.tmp.$$"

cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT

mkdir -p "$STAGING_ROOT"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR/js" "$TEMP_DIR/assets"

for required in index.html sw.js manifest.json _headers; do
    [[ -f "$REPO_ROOT/$required" ]] || { printf 'ERROR: missing deploy file: %s\n' "$required" >&2; exit 1; }
done
cp "$REPO_ROOT/index.html" "$TEMP_DIR/index.html"
cp "$REPO_ROOT/sw.js" "$TEMP_DIR/sw.js"
cp "$REPO_ROOT/manifest.json" "$TEMP_DIR/manifest.json"
cp "$REPO_ROOT/_headers" "$TEMP_DIR/_headers"
cp "$REPO_ROOT/js/gridnode-bundle.js" "$TEMP_DIR/js/gridnode-bundle.js"
cp "$REPO_ROOT/js/gridnode-phase-sphere.js" "$TEMP_DIR/js/gridnode-phase-sphere.js"
cp "$REPO_ROOT/js/gridnode-product-completion.js" "$TEMP_DIR/js/gridnode-product-completion.js"
cp -a "$REPO_ROOT/assets/." "$TEMP_DIR/assets/"

[[ -s "$TEMP_DIR/index.html" && -s "$TEMP_DIR/js/gridnode-bundle.js" ]] || { printf '%s\n' 'ERROR: staged runtime is empty' >&2; exit 1; }
rm -rf "$STAGING_DIR"
mv "$TEMP_DIR" "$STAGING_DIR"
trap - EXIT
printf 'STAGED: %s\n' "$STAGING_DIR"
du -sh "$STAGING_DIR"
find "$STAGING_DIR" -type f -printf '%P\n' | sort
