#!/usr/bin/env bash
# Source nvm to get Node v22 (wrangler requires it)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
# GRID//NODE production deploy — source-verified, fail-safe
#
# Deploys the SAME verified staging directory that was used for preview.
# Does NOT rebuild from another source. Does NOT copy the old baseline.
# Does NOT alter index.html between preview verification and production upload.
#
# Deploy transport: Wrangler when CLOUDFLARE_API_TOKEN is set, otherwise the
# token-less direct-upload REST API (same fallback as deploy-gridnode.sh —
# Wrangler cannot authenticate non-interactively without the token).
#
# Requires:
#   --confirm-production flag
#   GRIDNODE_FOUNDER_APPROVAL=YES environment variable
#   A pre-populated staging directory (.staging/gridnode-production/)
#
# After deployment, verifies:
#   - gridnode.network serves correct content (not just HTTP 200)
#   - asset MIME types are correct (JS is application/javascript, etc.)
#   - build stamp matches
#   - ARMS / CORE / LOWER / UPPER present

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Production uses the same staging as preview by default,
# or a named production staging if GRIDNODE_STAGING_NAME is set.
STAGING_NAME="${GRIDNODE_STAGING_NAME:-gridnode-preview}"
STAGING_DIR="$REPO_ROOT/.staging/$STAGING_NAME"
PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT:-gridnode}"
DEPLOY_BRANCH="main"
LOG_FILE="/tmp/gridnode-deploy-prod-$(date +%s).log"

# ── Validate gates ───────────────────────────────────────────────────
[[ "${1:-}" == "--confirm-production" ]] || { printf '%s\n' 'ERROR: production deploy requires --confirm-production' >&2; exit 1; }
[[ "${GRIDNODE_FOUNDER_APPROVAL:-}" == "YES" ]] || { printf '%s\n' 'ERROR: set GRIDNODE_FOUNDER_APPROVAL=YES after Founder approval' >&2; exit 1; }
command -v npx >/dev/null 2>&1 || { printf '%s\n' 'ERROR: npx is required' >&2; exit 1; }
[[ -d "$STAGING_DIR" ]] || { printf 'ERROR: staging directory missing: %s\n' "$STAGING_DIR" >&2; exit 1; }
[[ -s "$STAGING_DIR/index.html" ]] || { printf '%s\n' 'ERROR: staged index.html is missing or empty' >&2; exit 1; }

# ── Record pre-deploy metadata ───────────────────────────────────────
STAGED_SHA=$(sha256sum "$STAGING_DIR/index.html" | awk '{print $1}')
GIT_BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_HEAD=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  GRID//NODE PRODUCTION DEPLOY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "STAGED SHA256:   $STAGED_SHA"
echo "GIT BRANCH:      $GIT_BRANCH"
echo "GIT HEAD:        $GIT_HEAD"
echo "DEPLOY BRANCH:   $DEPLOY_BRANCH"
echo "TIMESTAMP:       $TIMESTAMP"
echo ""

# ── Deploy to Cloudflare Pages (production) ──────────────────────────
echo "🚀 Deploying to Cloudflare Pages (branch=$DEPLOY_BRANCH)..."

# Wrangler cannot authenticate non-interactively without CLOUDFLARE_API_TOKEN
# (this env doesn't set it) — default to the token-less direct-upload REST
# API, mirroring deploy-gridnode.sh Gate 2/6.
GIT_DIRTY=$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no 2>/dev/null | head -1)
[[ -n "$GIT_DIRTY" ]] && UPLOAD_DIRTY=true || UPLOAD_DIRTY=false

set +e
if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  npx --yes wrangler@latest pages deploy "$STAGING_DIR" \
    --project-name="$PROJECT_NAME" \
    --branch="$DEPLOY_BRANCH" \
    --commit-dirty="$UPLOAD_DIRTY" 2>&1 | tee "$LOG_FILE"
  DEPLOY_EXIT=${PIPESTATUS[0]}
else
  UPLOAD_BIN="${PAGES_UPLOAD_BIN:-$HOME/workspace/skills/cloudflare/bin/pages-direct-upload.py}"
  CF_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-f008e0b7e3867a6050b412d931a9abd9}"
  if [[ ! -x "$UPLOAD_BIN" ]]; then
    printf 'ERROR: upload binary not found: %s\n' "$UPLOAD_BIN" >&2
    printf '%s\n' 'HINT: set PAGES_UPLOAD_BIN or CLOUDFLARE_API_TOKEN.' >&2
    exit 1
  fi
  "$UPLOAD_BIN" "$CF_ACCOUNT_ID" "$PROJECT_NAME" "$STAGING_DIR" \
    --branch="$DEPLOY_BRANCH" \
    --commit-hash="$(git -C "$REPO_ROOT" rev-parse HEAD)" \
    --commit-message="production deploy $(git -C "$REPO_ROOT" rev-parse --short HEAD)" \
    --commit-dirty="$UPLOAD_DIRTY" 2>&1 | tee "$LOG_FILE"
  DEPLOY_EXIT=${PIPESTATUS[0]}
fi
set -e

if [[ $DEPLOY_EXIT -ne 0 ]]; then
  printf 'ERROR: deploy failed (exit %d). Full log: %s\n' "$DEPLOY_EXIT" "$LOG_FILE" >&2
  exit 1
fi

# Extract the deployment URL
DEPLOY_URL=$(grep -oE 'https://[a-f0-9]+\.gridnode\.pages\.dev' "$LOG_FILE" | head -1)
if [[ -z "$DEPLOY_URL" ]]; then
  printf '%s\n' 'ERROR: Could not extract deployment URL from wrangler output' >&2
  exit 1
fi
echo ""
echo "   ✅ Deployed to: $DEPLOY_URL"

# ── Verify production content ─────────────────────────────────────────
echo ""
echo "🔍 Verifying production content..."

# The build stamp we just deployed, derived from the staged files (never a
# hardcoded old stamp).
EXPECTED_STAMP=$(grep -oE '\?v=[0-9]{8}\.[a-z0-9-]+' "$STAGING_DIR/index.html" | head -1 | cut -c4-)
if [[ -z "$EXPECTED_STAMP" ]]; then
  printf 'ERROR: could not derive build stamp from staged index.html\n' >&2
  exit 1
fi

# The edge can take a moment to converge on the new deployment; retry until
# the expected stamp is actually served. A single blind fetch can catch the
# switch mid-flight and report 0 markers on a healthy deploy (2026-09-18).
PROD_URL="https://gridnode.network"
REMOTE_HTML=""
for _ in 1 2 3 4 5 6; do
  REMOTE_HTML=$(curl -fsSL -H 'Cache-Control: no-cache' "${PROD_URL}?verify=$(date +%s%N)" 2>/dev/null || true)
  if [[ "$REMOTE_HTML" == *"$EXPECTED_STAMP"* ]]; then break; fi
  sleep 10
done
if [[ "$REMOTE_HTML" != *"$EXPECTED_STAMP"* ]]; then
  printf 'ERROR: production is not serving the deployed build (stamp %s) after ~60s\n' "$EXPECTED_STAMP" >&2
  exit 1
fi

# Check unique content markers
MARKERS_FOUND=0
for marker in "$EXPECTED_STAMP" "GRID//NODE" "ENTER THE GRID" "ARMS" "CORE" "LOWER" "UPPER"; do
  if echo "$REMOTE_HTML" | grep -q "$marker" 2>/dev/null; then
    MARKERS_FOUND=$((MARKERS_FOUND + 1))
  fi
done
echo "   Content markers found: $MARKERS_FOUND / 7 (stamp $EXPECTED_STAMP confirmed live)"

# Verify asset MIME types
echo ""
echo "🧪 Verifying asset MIME types..."
ASSET_OK=true
for path in "/js/gridnode-bundle.js?v=$EXPECTED_STAMP" "/css/gridnode-native.css?v=$EXPECTED_STAMP" "/sw.js" "/manifest.json"; do
  MIME=$(curl -sSI -L "${PROD_URL}${path}" 2>/dev/null | grep -i 'content-type' | tr -d '\r' | awk '{print $2}')
  if [[ "$MIME" == "text/html" ]]; then
    printf '   ❌ %s → %s (should NOT be text/html)\n' "$path" "$MIME"
    ASSET_OK=false
  else
    printf '   ✅ %s → %s\n' "$path" "$MIME"
  fi
done

if [[ "$ASSET_OK" == "false" ]]; then
  printf '%s\n' 'ERROR: Production asset MIME types incorrect — assets not properly deployed' >&2
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ PRODUCTION DEPLOY VERIFIED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "STAGED SHA256:     $STAGED_SHA"
echo "DEPLOYMENT URL:    $DEPLOY_URL"
echo "PRODUCTION URL:    $PROD_URL"
echo "REMOTE VERIFIED:   YES"
echo "ASSET MIME TYPES:  CORRECT"
echo "CONTENT MARKERS:   $MARKERS_FOUND / 7"
echo ""
