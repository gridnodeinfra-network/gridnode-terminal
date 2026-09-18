#!/usr/bin/env bash
# Source nvm to get Node v22 (wrangler requires it)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
# GRID//NODE preview deploy — six gates, preview branch only.
#
# NO BASELINE FALLBACK. NO SILENT GUESSING.
# The candidate MUST be an explicit file path; there is NO default.
#
# Usage: ./deploy-gridnode.sh "what changed" <path/to/candidate.html>
#
#   Gate 1: stage dist/ via scripts/stage-deploy.sh; candidate must equal staged index.html
#   Gate 2: deploy to Cloudflare Pages (--branch=preview)
#   Gate 3: fresh deployment URL serves HTTP 200 (liveness poll)
#   Gate 4: served bytes are byte-identical to the staged candidate
#   Gate 5: live asset audit — every referenced asset (hard gate)
#   Gate 6: visual pixel-diff vs approved baseline (advisory)
#
# For production: scripts/deploy-production.sh after preview verification.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR" && pwd)"
PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT:-gridnode}"
DEPLOY_BRANCH="preview"
STAGING_DIR="$REPO_ROOT/.staging/gridnode-preview"
LOG_FILE="/tmp/gridnode-deploy-$(date +%s).log"

# ── Gate 0: explicit candidate, no silent guessing ────────────────────
CHANGELOG="${1:-}"
CANDIDATE="${2:-}"

if [[ -z "$CANDIDATE" ]]; then
  printf '%s\n' 'ERROR: No deployment candidate supplied. Refusing to deploy.' >&2
  printf '%s\n' 'Usage: ./deploy-gridnode.sh "what changed" <path/to/candidate.html>' >&2
  exit 1
fi
[[ -f "$CANDIDATE" ]] || { printf 'ERROR: candidate not found: %s\n' "$CANDIDATE" >&2; exit 1; }
[[ -s "$CANDIDATE" ]] || { printf 'ERROR: candidate is empty: %s\n' "$CANDIDATE" >&2; exit 1; }

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

# ── Gate 1: stage dist/ — the single source of truth ──────────────────
# scripts/stage-deploy.sh is the ONE staging implementation: the full
# dist/ tree (js/, css/ incl. css/native/, assets/, i18n/, sw.js,
# manifest.json, _headers) with freshness, integrity, and placeholder
# guards. Staging from dist/ — never re-assembling from root sources —
# is what keeps this regression class structurally impossible
# (2026-09-18: a flat css/*.css copy dropped css/native/* and Pages
# served index.html as CSS with HTTP 200).
echo "📦 Gate 1/6: Staging from dist/..."
if ! "$REPO_ROOT/scripts/stage-deploy.sh"; then
  printf '%s\n' 'ERROR: staging failed — aborting deploy.' >&2
  exit 1
fi
STAGED_SHA=$(sha256sum "$STAGING_DIR/index.html" | awk '{print $1}')
if [[ "$SOURCE_SHA" != "$STAGED_SHA" ]]; then
  printf '%s\n' 'ERROR: candidate is not the staged dist/index.html' >&2
  printf '%s\n' 'HINT: pass dist/index.html from the current HEAD build.' >&2
  exit 1
fi
echo "   ✅ Candidate matches staged dist/index.html ($STAGED_SHA)"
echo ""

# ── Gate 2: deploy to Cloudflare Pages (preview branch) ──────────────
echo "🚀 Gate 2/6: Deploying to Cloudflare Pages (branch=$DEPLOY_BRANCH)..."

# GIT_DIRTY is "dirty"/"clean"; the uploader takes true/false.
[[ "$GIT_DIRTY" == "dirty" ]] && UPLOAD_DIRTY=true || UPLOAD_DIRTY=false

# Unlock Wrangler (pre-Sept-12 setup): when no API token is exported, use
# the connected Cloudflare credential's surrogate. It is not the raw
# secret; Sentinel swaps it for the real token on api.cloudflare.com.
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  CF_SURROGATE=$(python3 -c "
import sys
sys.path.insert(0, '/opt/hatch/skills/skill-creator/bin')
from dynamic_credentials import dynamic_credential_entry
print(dynamic_credential_entry('custom.cloudflare')['surrogate'])
" 2>/dev/null || true)
  if [[ "$CF_SURROGATE" == hsurr:* ]]; then export CLOUDFLARE_API_TOKEN="$CF_SURROGATE"; fi
fi

# Capture full deploy output — NO tail truncation
set +e
if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  # Wrangler path: preferred when a token (or the credential surrogate)
  # is available.
  npx --yes wrangler@latest pages deploy "$STAGING_DIR" \
    --project-name="$PROJECT_NAME" \
    --branch="$DEPLOY_BRANCH" \
    --commit-dirty="$UPLOAD_DIRTY" 2>&1 | tee "$LOG_FILE"
  DEPLOY_EXIT=${PIPESTATUS[0]}
else
  # Direct-upload REST API (default): token-less, via the stored
  # custom.cloudflare credential and the cloudflare skill uploader.
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
    --commit-message="$CHANGELOG" \
    --commit-dirty="$UPLOAD_DIRTY" 2>&1 | tee "$LOG_FILE"
  DEPLOY_EXIT=${PIPESTATUS[0]}
fi
set -e

if [[ "$DEPLOY_EXIT" -ne 0 ]]; then
  printf 'ERROR: deploy failed (exit %d). Full log: %s\n' "$DEPLOY_EXIT" "$LOG_FILE" >&2
  exit 1
fi

# Wrangler prints the URL; the direct uploader emits {"url": "https://<id>.gridnode.pages.dev", ...}
DEPLOY_URL=$(grep -oE 'https://[a-f0-9]+\.gridnode\.pages\.dev' "$LOG_FILE" | head -1)
if [[ -z "$DEPLOY_URL" ]]; then
  printf 'ERROR: could not extract deployment URL. Full log: %s\n' "$LOG_FILE" >&2
  exit 1
fi
echo ""
echo "   ✅ Deployed to: $DEPLOY_URL"

# ── Gate 3: the fresh deployment URL serves HTTP 200 ──────────────────
# Direct proof the deployment exists and is live. A live 200 on the new
# URL is the stronger signal anyway.
echo ""
echo "🔍 Gate 3/6: Verifying Cloudflare deployment..."
HTTP_CODE=""
for _ in 1 2 3 4; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$DEPLOY_URL/" || true)
  [[ "$HTTP_CODE" == "200" ]] && break
  sleep 10
done
if [[ "$HTTP_CODE" != "200" ]]; then
  printf 'ERROR: deployment URL not serving after 40s (HTTP %s): %s\n' "$HTTP_CODE" "$DEPLOY_URL" >&2
  exit 1
fi
echo "   ✅ Deployment live: $DEPLOY_URL (HTTP 200)"

# ── Gate 4: served bytes are byte-identical to the staged candidate ───
# HTTP 200 alone proves nothing — Pages serves index.html as the fallback
# for missing assets. Download to a file and hash the bytes (no
# command-substitution newline mangling).
echo ""
echo "🔬 Gate 4/6: Content verification (not just HTTP 200)..."
REMOTE_FILE="/tmp/gridnode-remote-$(date +%s).html"
if ! curl -fsSL -H 'Cache-Control: no-cache' "${DEPLOY_URL}?verify=$(date +%s%N)" -o "$REMOTE_FILE"; then
  printf 'ERROR: could not fetch deployed content from %s\n' "$DEPLOY_URL" >&2
  exit 1
fi
REMOTE_SHA=$(sha256sum "$REMOTE_FILE" | awk '{print $1}')
rm -f "$REMOTE_FILE"
echo "   Remote SHA256: $REMOTE_SHA"
echo "   Source SHA256: $SOURCE_SHA"
# .pages.dev serves bytes exactly (no transform); anything else means the
# wrong tree got uploaded.
if [[ "$REMOTE_SHA" != "$SOURCE_SHA" ]]; then
  printf 'ERROR: served content != staged candidate\n  remote: %s\n  source: %s\n' "$REMOTE_SHA" "$SOURCE_SHA" >&2
  exit 1
fi
echo "   ✅ Content verified (byte-identical)"
echo ""

# ── Gate 5: live asset audit — EVERY referenced asset (hard gate) ─────
# Fetches the LIVE deployment and fails unless every asset the served
# index.html references returns 200 with the right Content-Type,
# non-fallback bytes, byte-identical to staged. This is the gate that
# would have caught 2026-09-18 (five stylesheets served as HTML).
echo ""
echo "🧪 Gate 5/6: Live asset audit (hard gate)..."
if ! node "$REPO_ROOT/scripts/audit-deployed-assets.mjs" "$DEPLOY_URL" \
  --dist "$STAGING_DIR" \
  --expect-stamp-from "$STAGING_DIR/index.html"; then
  printf '%s\n' 'ERROR: deployed-asset audit FAILED — deployment is broken. Do not ship.' >&2
  exit 1
fi
echo "   ✅ Live asset audit passed"
echo ""

# ── Gate 6: visual pixel-diff vs approved baseline (advisory) ─────────
echo "🖼️  Gate 6/6: Visual check (advisory)..."
"$REPO_ROOT/scripts/visual-check.sh" "$STAGING_DIR"
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
