#!/usr/bin/env bash
# Source nvm to get Node v22 (wrangler requires it)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
# GRID//NODE deployment script — source-verified, fail-safe
#
# NO BASELINE FALLBACK. NO SILENT GUESSING.
# If no explicit candidate is supplied, this script FAILS.
#
# Usage:
#   ./deploy-gridnode.sh "what changed" <path/to/candidate.html>
#
# The candidate MUST be an explicit file path. There is NO default.
# The 01_SOURCE_TRUTH_LOCKED baseline is rollback/reference material only.
#
# This script:
#   1. Validates the candidate exists and is non-empty
#   2. SHA-256 verifies candidate → staged copy
#   3. Stages ALL runtime assets (js/, css/, assets/, manifest.json, sw.js, _headers)
#   4. Deploys to Cloudflare Pages preview branch (--branch=preview)
#   5. Verifies the new deployment was created by Cloudflare
#   6. Verifies the deployed content matches the staged candidate
#
# For production: use scripts/deploy-production.sh after preview verification.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR" && pwd)"
PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT:-gridnode}"
DEPLOY_BRANCH="preview"
STAGING_DIR="$REPO_ROOT/.staging/gridnode-preview"
LOG_FILE="/tmp/gridnode-deploy-$(date +%s).log"

# ── Step 0: Validate arguments ──────────────────────────────────────
CHANGELOG="${1:-}"
CANDIDATE="${2:-}"

if [[ -z "$CANDIDATE" ]]; then
  printf '%s\n' 'ERROR: No deployment candidate supplied. Refusing to deploy.' >&2
  printf '%s\n' 'Usage: ./deploy-gridnode.sh "what changed" <path/to/candidate.html>' >&2
  exit 1
fi

if [[ ! -f "$CANDIDATE" ]]; then
  printf 'ERROR: Candidate file not found: %s\n' "$CANDIDATE" >&2
  exit 1
fi

if [[ ! -s "$CANDIDATE" ]]; then
  printf 'ERROR: Candidate file is empty: %s\n' "$CANDIDATE" >&2
  exit 1
fi

# ── Step 1: Record source metadata ──────────────────────────────────
SOURCE_PATH="$(cd "$(dirname "$CANDIDATE")" && pwd)/$(basename "$CANDIDATE")"
SOURCE_SHA=$(sha256sum "$CANDIDATE" | awk '{print $1}')
GIT_BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_HEAD=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_DIRTY=$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | head -1)
[[ -n "$GIT_DIRTY" ]] && GIT_DIRTY="dirty" || GIT_DIRTY="clean"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  GRID//NODE DEPLOY — SOURCE-VERIFIED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "SOURCE PATH:     $SOURCE_PATH"
echo "SOURCE SHA256:   $SOURCE_SHA"
echo "GIT BRANCH:      $GIT_BRANCH"
echo "GIT HEAD:        $GIT_HEAD"
echo "GIT TREE:        $GIT_DIRTY"
echo "DEPLOY BRANCH:   $DEPLOY_BRANCH"
echo "TIMESTAMP:       $TIMESTAMP"
echo ""

# ── Step 2: Build clean staging directory ───────────────────────────
echo "📦 Step 1/6: Building clean staging directory..."
TEMP_DIR="$REPO_ROOT/.staging/.tmp.$$"
cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT

rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR/js" "$TEMP_DIR/css" "$TEMP_DIR/i18n" "$TEMP_DIR/assets"

# Copy the exact candidate as index.html
cp "$CANDIDATE" "$TEMP_DIR/index.html"

# Verify staged index.html matches source
STAGED_SHA=$(sha256sum "$TEMP_DIR/index.html" | awk '{print $1}')
if [[ "$SOURCE_SHA" != "$STAGED_SHA" ]]; then
  printf 'ERROR: SOURCE_SHA != STAGED_SHA\n  SOURCE:  %s\n  STAGED:  %s\nABORT.\n' "$SOURCE_SHA" "$STAGED_SHA" >&2
  exit 1
fi
echo "   ✅ SHA-256 verified: $STAGED_SHA"

# Copy ALL runtime assets required by the app
for required in sw.js manifest.json _headers js/gridnode-bundle.js js/gridnode-i18n.js js/gridnode-native.js; do
  if [[ ! -f "$REPO_ROOT/$required" ]]; then
    printf 'ERROR: missing required runtime file: %s\n' "$required" >&2
    exit 1
  fi
done

cp "$REPO_ROOT/sw.js" "$TEMP_DIR/sw.js"
cp "$REPO_ROOT/manifest.json" "$TEMP_DIR/manifest.json"
cp "$REPO_ROOT/_headers" "$TEMP_DIR/_headers"
cp "$REPO_ROOT"/js/gridnode-*.js "$TEMP_DIR/js/"
# Overlay build-stamped JS from dist/ when present (npm run build stamps
# BUILD_ID into gridnode-whatsnew.js / gridnode-native.js; the root copies
# still carry the __CURRENT_BUILD__ placeholder).
for stamped in gridnode-whatsnew.js gridnode-native.js; do
  if [[ -f "$REPO_ROOT/dist/js/$stamped" ]] && ! grep -q "__CURRENT_BUILD__" "$REPO_ROOT/dist/js/$stamped"; then
    cp "$REPO_ROOT/dist/js/$stamped" "$TEMP_DIR/js/$stamped"
  fi
done
# Recursive: css/native/* layers must ship (flat css/*.css dropped them on
# 2026-09-18 and the preview served index.html as CSS fallback).
cp -r "$REPO_ROOT"/css/. "$TEMP_DIR/css/"

# i18n catalogs
if [[ -d "$REPO_ROOT/i18n" ]]; then
  cp "$REPO_ROOT"/i18n/*.json "$TEMP_DIR/i18n/" 2>/dev/null || true
fi

# All assets (icons, scanner, backgrounds, splash)
if [[ -d "$REPO_ROOT/assets" ]]; then
  cp -a "$REPO_ROOT/assets/." "$TEMP_DIR/assets/"
fi

# Cloudflare Pages Functions
if [[ -d "$REPO_ROOT/functions" ]]; then
  cp -a "$REPO_ROOT/functions" "$TEMP_DIR/functions"
fi

# Verify staged runtime is non-empty
[[ -s "$TEMP_DIR/index.html" && -s "$TEMP_DIR/js/gridnode-bundle.js" ]] || {
  printf '%s\n' 'ERROR: staged runtime is empty' >&2
  exit 1
}

# Swap into final staging location
rm -rf "$STAGING_DIR"
mv "$TEMP_DIR" "$STAGING_DIR"
trap - EXIT

echo "   STAGED: $STAGING_DIR"
du -sh "$STAGING_DIR"
echo ""

# ── Step 3: Deploy to Cloudflare Pages (preview branch) ─────────────
echo "🚀 Step 2/6: Deploying to Cloudflare Pages (branch=$DEPLOY_BRANCH)..."

# Capture full wrangler output — NO tail truncation
set +e
npx --yes wrangler@latest pages deploy "$STAGING_DIR" \
  --project-name="$PROJECT_NAME" \
  --branch="$DEPLOY_BRANCH" \
  --commit-dirty=true 2>&1 | tee "$LOG_FILE"
WRANGLER_EXIT=${PIPESTATUS[0]}
set -e

if [[ $WRANGLER_EXIT -ne 0 ]]; then
  printf 'ERROR: wrangler deploy failed (exit %d). Full log: %s\n' "$WRANGLER_EXIT" "$LOG_FILE" >&2
  exit 1
fi

# Extract the deployment URL from wrangler output
DEPLOY_URL=$(grep -oE 'https://[a-f0-9]+\.gridnode\.pages\.dev' "$LOG_FILE" | head -1)
if [[ -z "$DEPLOY_URL" ]]; then
  printf '%s\n' 'ERROR: Could not extract deployment URL from wrangler output' >&2
  printf 'Full log: %s\n' "$LOG_FILE" >&2
  exit 1
fi
echo ""
echo "   ✅ Deployed to: $DEPLOY_URL"

# ── Step 4: Verify Cloudflare created a new deployment ──────────────
echo ""
echo "🔍 Step 3/6: Verifying Cloudflare deployment..."
sleep 5

DEPLOYMENT_JSON=$(npx --yes wrangler@latest pages deployment list \
  --project-name="$PROJECT_NAME" \
  --environment=preview \
  --json 2>/dev/null)

if [[ -z "$DEPLOYMENT_JSON" ]]; then
  printf '%s\n' 'WARNING: Could not fetch deployment list from Cloudflare' >&2
else
  echo "   Cloudflare deployment list retrieved"
  # Check that our deployment URL appears in the list
  if echo "$DEPLOYMENT_JSON" | grep -q "$DEPLOY_URL" 2>/dev/null; then
    echo "   ✅ Deployment confirmed in Cloudflare listing"
  else
    echo "   ⚠️  Deployment URL not found in listing (may need more propagation time)"
  fi
fi

# ── Step 5: Verify deployed content matches staged candidate ────────
echo ""
echo "🔬 Step 4/6: Content verification (not just HTTP 200)..."

REMOTE_HTML=$(curl -fsSL -H 'Cache-Control: no-cache' "${DEPLOY_URL}?verify=$(date +%s%N)" 2>/dev/null)
REMOTE_SHA=$(echo "$REMOTE_HTML" | sha256sum | awk '{print $1}')

if [[ -z "$REMOTE_HTML" ]]; then
  printf '%s\n' 'ERROR: Could not fetch deployed content' >&2
  exit 1
fi

# Check for unique markers from the current candidate
MARKER_COUNT=$(echo "$REMOTE_HTML" | grep -oE '20260814.2|GRID//NODE|ENTER THE GRID|ARMS|CORE|LOWER|UPPER' | sort -u | wc -l)
echo "   Remote content markers found: $MARKER_COUNT"
echo "   Remote SHA256: $REMOTE_SHA"
echo "   Source SHA256: $SOURCE_SHA"

if [[ "$REMOTE_SHA" != "$SOURCE_SHA" ]]; then
  echo "   ⚠️  Remote SHA differs from source (may be Cloudflare email-obfuscation transform)"
  # Check if the difference is only the email-protection rewrite
  if echo "$REMOTE_HTML" | grep -q 'cdn-cgi/email-protection' 2>/dev/null; then
    echo "   ℹ️  Cloudflare email-obfuscation detected (expected on custom domains, not .pages.dev)"
  fi
  # On .pages.dev, should be byte-exact
  if echo "$DEPLOY_URL" | grep -q '\.pages\.dev' 2>/dev/null; then
    if [[ "$REMOTE_SHA" != "$SOURCE_SHA" ]]; then
      printf 'ERROR: Remote content does not match staged candidate on .pages.dev (no transform expected)\n  REMOTE: %s\n  SOURCE: %s\nABORT.\n' "$REMOTE_SHA" "$SOURCE_SHA" >&2
      exit 1
    fi
  fi
fi

echo "   ✅ Content verified"
echo ""

# ── Step 6: Live asset audit — EVERY referenced asset, not a sample ───
# The old 4-path MIME spot-check missed css/native/01..04 on 2026-09-18 and
# the preview shipped five stylesheets as index.html fallback. This gate
# fetches the LIVE deployment and fails the deploy unless every asset the
# served index.html references returns 200 with the right Content-Type,
# non-fallback bytes, and byte-identical content to what was staged.
echo ""
echo "🧪 Step 5/6: Live asset audit (hard gate)..."
if ! node "$REPO_ROOT/scripts/audit-deployed-assets.mjs" "$DEPLOY_URL" \
  --dist "$STAGING_DIR" \
  --expect-stamp-from "$STAGING_DIR/index.html"; then
  printf '%s\n' 'ERROR: deployed-asset audit FAILED — deployment is broken. Do not ship.' >&2
  exit 1
fi
echo "   ✅ Live asset audit passed"
echo ""

# ── Step 7: Visual advisory (warn-only) ──────────────────────────────
# Pixel-diffs the STAGED tree (exactly what was uploaded) against the
# approved baseline, served locally: headless Chromium in this sandbox
# cannot reach public URLs, but the staged bytes are what Pages serves,
# so a local render is a faithful visual check.
# Advisory only: intentional redesigns change pixels legitimately, so a
# human reviews the report. A large diff ratio on a no-design-change
# deploy means something rendered catastrophically wrong — investigate.
echo "🖼️  Step 6/6: Visual check (advisory)..."
BASELINE_FILE="$REPO_ROOT/visual-baselines/current.txt"
if [[ -f "$BASELINE_FILE" ]]; then
  BASELINE_DIR="$REPO_ROOT/$(cat "$BASELINE_FILE")"
  if [[ -d "$BASELINE_DIR" ]]; then
    if [[ -z "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" && -x "$HOME/.cache/ms-playwright/chrome-153/chrome-linux64/chrome" ]]; then
      export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$HOME/.cache/ms-playwright/chrome-153/chrome-linux64/chrome"
    fi
    VR_PORT=4173
    # Clear any stale visual-check server (the old subshell form leaked its
    # http.server, which would otherwise keep holding this port).
    # [h]ttp trick: keeps pkill from matching its own command line.
    pkill -f "[h]ttp.server $VR_PORT" 2>/dev/null || true
    sleep 0.5
    # NOTE: --directory keeps the server in THIS shell so $! captures its
    # real PID. Do NOT wrap this in ( ... & ): backgrounding inside a
    # subshell orphans the server, $! captures nothing, kill targets the
    # wrong PID, and the leaked server keeps serving a stale staging dir.
    python3 -m http.server "$VR_PORT" --bind 127.0.0.1 --directory "$STAGING_DIR" >/dev/null 2>&1 &
    VR_SRV=$!
    sleep 1
    VR_OUT="/tmp/gridnode-vr-$(date +%s)"
    VR_RELEASE=$(grep -oE '\?v=[0-9]{8}\.[0-9a-z-]+' "$STAGING_DIR/index.html" | head -1 | cut -d= -f2)
    set +e
    node "$REPO_ROOT/scripts/visual-regression-guard.cjs" compare \
      "$BASELINE_DIR" "$VR_OUT" "http://127.0.0.1:$VR_PORT" --release "$VR_RELEASE" >/tmp/gridnode-vr.log 2>&1
    VR_EXIT=$?
    set -e
    kill "$VR_SRV" 2>/dev/null || true
    if [[ "$VR_EXIT" == "0" ]]; then
      echo "   ✅ No out-of-scope visual diffs vs baseline"
    elif [[ "$VR_EXIT" == "1" ]]; then
      echo "   ⚠️  Visual diffs detected vs baseline (advisory — review before calling this good):"
      grep -E '^(REGRESSION|IDENTICAL|IN-SCOPE)' /tmp/gridnode-vr.log | head -12 || true
      echo "   Full report: $VR_OUT/report.json"
    else
      echo "   ⚠️  Visual check unavailable in this environment (infra) — skipping"
    fi
  else
    echo "   ⚠️  Baseline dir missing: $BASELINE_DIR — run npm run visual:capture to refresh"
  fi
else
  echo "   ⚠️  No visual baseline configured (visual-baselines/current.txt) — skipping"
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ PREVIEW DEPLOY VERIFIED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "SOURCE PATH:       $SOURCE_PATH"
echo "SOURCE SHA256:     $SOURCE_SHA"
echo "STAGED SHA256:     $STAGED_SHA"
echo "GIT BRANCH:        $GIT_BRANCH"
echo "GIT HEAD:          $GIT_HEAD"
echo "DEPLOY BRANCH:     $DEPLOY_BRANCH"
echo "DEPLOYMENT URL:    $DEPLOY_URL"
echo "PREVIEW ALIAS:     https://preview.gridnode.pages.dev/"
echo "REMOTE VERIFIED:   YES"
echo ""
echo "To deploy to production, run:"
echo "  GRIDNODE_FOUNDER_APPROVAL=YES bash scripts/deploy-production.sh --confirm-production"
echo ""
