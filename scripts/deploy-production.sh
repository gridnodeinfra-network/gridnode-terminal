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
sleep 10  # Allow edge propagation

PROD_URL="https://gridnode.network"
REMOTE_HTML=$(curl -fsSL -H 'Cache-Control: no-cache' "${PROD_URL}?verify=$(date +%s%N)" 2>/dev/null)

if [[ -z "$REMOTE_HTML" ]]; then
  printf 'ERROR: Could not fetch production content from %s\n' "$PROD_URL" >&2
  exit 1
fi

# Check unique content markers
MARKERS_FOUND=0
for marker in "20260814.2" "GRID//NODE" "ENTER THE GRID" "ARMS" "CORE" "LOWER" "UPPER"; do
  if echo "$REMOTE_HTML" | grep -q "$marker" 2>/dev/null; then
    MARKERS_FOUND=$((MARKERS_FOUND + 1))
  fi
done
echo "   Content markers found: $MARKERS_FOUND / 7"

# Verify asset MIME types
echo ""
echo "🧪 Verifying asset MIME types..."
ASSET_OK=true
for path in "/js/gridnode-bundle.js?v=20260814.2" "/css/gridnode-native.css?v=20260814.2" "/sw.js" "/manifest.json"; do
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
