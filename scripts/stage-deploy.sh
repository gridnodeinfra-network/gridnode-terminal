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

# ── dist/ is the single source of truth for deploys ──────────────────
# npm run build assembles index.html from html/partials/, stamps every
# ?v= tag and the JS build placeholders with BUILD_ID=<date>.<git-sha>,
# and copies the FULL tree: js/, css/ (including css/native/), assets/,
# i18n/, sw.js, manifest.json, _headers.
# Staging from dist/ — never re-assembling from root sources — is what
# keeps native CSS layers, stamped JS, and version tags from silently
# going missing or stale (2026-09-18: css/native/* never reached staging
# because of a flat css/*.css copy, and served 200-as-index.html).
DIST_DIR="$REPO_ROOT/dist"
[[ -d "$DIST_DIR" ]] || { printf 'ERROR: %s missing. Run: npm run build\n' "$DIST_DIR" >&2; exit 1; }

# Guard: dist/ must be built from the current HEAD, never a stale tree.
HEAD_SHORT="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
DIST_STAMP="$(grep -oE '\?v=[0-9]{8}\.[0-9a-z-]+' "$DIST_DIR/index.html" | head -1 | cut -d= -f2)"
[[ -n "$DIST_STAMP" ]] || { printf 'ERROR: no version stamp found in dist/index.html\n' >&2; exit 1; }
[[ "$DIST_STAMP" == *".$HEAD_SHORT" ]] || {
    printf 'ERROR: dist/ was built from %s but HEAD is %s.\nRun: npm run build (after committing), then re-stage.\n' "$DIST_STAMP" "$HEAD_SHORT" >&2
    exit 1
}

mkdir -p "$TEMP_DIR"
cp -r "$DIST_DIR/." "$TEMP_DIR/"

# Cloudflare Pages Functions live outside dist/ (compiled at deploy time).
if [ -d "$REPO_ROOT/functions" ]; then
    cp -r "$REPO_ROOT/functions" "$TEMP_DIR/functions"
fi

[[ -s "$TEMP_DIR/index.html" && -s "$TEMP_DIR/js/gridnode-bundle.js" ]] || { printf '%s\n' 'ERROR: staged runtime is empty' >&2; exit 1; }

# ── Integrity gate: every local asset index.html references must exist ──
# A missing file serves index.html as fallback (HTTP 200, text/html) and
# silently breaks styling/scripting, so this gate fails the staging.
MISSING=0
while IFS= read -r ref; do
    path="${ref%%\?*}"
    # ./x → x, /x → x — both resolve to the staging root.
    rel="${path#./}"
    rel="${rel#/}"
    if [[ ! -s "$TEMP_DIR/$rel" ]]; then
        printf 'ERROR: referenced asset missing from staging: %s\n' "$ref" >&2
        MISSING=1
    fi
done < <(grep -oE '(src|href)="(\./|/)[^"]+"' "$TEMP_DIR/index.html" | sed -E 's/^(src|href)="//; s/"$//')
[[ "$MISSING" == "0" ]] || { printf 'ERROR: staging integrity check failed\n' >&2; exit 1; }

# No unstamped placeholders may ship (the quoted key is the functional
# changelog entry; a bare mention in a code comment is harmless).
if grep -rq "'__CURRENT_BUILD__'" "$TEMP_DIR/js/"; then
    printf 'ERROR: unstamped __CURRENT_BUILD__ changelog key in staged JS. Run: npm run build\n' >&2
    exit 1
fi
rm -rf "$STAGING_DIR"
mv "$TEMP_DIR" "$STAGING_DIR"
trap - EXIT
printf 'STAGED: %s\n' "$STAGING_DIR"
du -sh "$STAGING_DIR"
find "$STAGING_DIR" -type f -printf '%P\n' | sort
