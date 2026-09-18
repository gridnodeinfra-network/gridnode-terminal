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
# This script (six gates, preview branch only):
#   1. Validates the candidate, stages the full dist/ tree (Gate 2)
#   2. Deploys to Cloudflare Pages preview branch (--branch=preview)
#   3. Verifies Cloudflare created the deployment (Gate 4a)
#   4. Verifies served index.html is byte-identical to staged (Gate 4b)
#   5. Live-audits EVERY referenced asset on the deployment (Gate 5, hard)
#   6. Visual pixel-diff vs approved baseline (advisory, warn-only)
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

# ── Step 2: Stage from dist/ — the single source of truth ─────────────
# scripts/stage-deploy.sh is the ONE staging implementation. It copies the
# full dist/ tree (js/, css/ recursively incl. css/native/, assets/,
# i18n/, sw.js, manifest.json, _headers) with hard guards:
#   - freshness: dist/ BUILD_ID stamp must match HEAD (no stale builds)
#   - integrity: every local asset index.html references must exist
#   - no __CURRENT_BUILD__ placeholder may ship in staged JS
# Never re-assemble a deploy from root sources: the flat css/*.css copy
# dropped css/native/* on 2026-09-18 and the preview served index.html as
# CSS fallback (HTTP 200, text/html). Staging from dist/ makes that class
# of regression structurally impossible.
echo "📦 Step 1/6: Staging from dist/..."
if ! "$REPO_ROOT/scripts/stage-deploy.sh"; then
  printf '%s\n' 'ERROR: staging failed — aborting deploy.' >&2
  exit 1
fi
# The candidate must be the dist/ build output that was just staged.
CANDIDATE_SHA=$(sha256sum "$CANDIDATE" | awk '{print $1}')
STAGED_SHA=$(sha256sum "$STAGING_DIR/index.html" | awk '{print $1}')
if [[ "$CANDIDATE_SHA" != "$STAGED_SHA" ]]; then
  printf 'ERROR: candidate %s is not the staged dist/index.html\n' "$CANDIDATE" >&2
  printf 'HINT: pass dist/index.html from the current HEAD build.\n' >&2
  exit 1
fi
echo "   ✅ Candidate matches staged dist/index.html ($STAGED_SHA)"
echo ""

# ── Step 3: Deploy to Cloudflare Pages (preview branch) ─────────────
echo "🚀 Step 2/6: Deploying to Cloudflare Pages (branch=$DEPLOY_BRANCH)..."

# Capture full deploy output — NO tail truncation
set +e
if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  # Wrangler path: only when an API token is present. Wrangler cannot
  # authenticate non-interactively without one (fails hard on 2026-09-18).
  npx --yes wrangler@latest pages deploy "$STAGING_DIR" \
    --project-name="$PROJECT_NAME" \
    --branch="$DEPLOY_BRANCH" \
    --commit-dirty=true 2>&1 | tee "$LOG_FILE"
  DEPLOY_EXIT=${PIPESTATUS[0]}
else
  # Direct-upload REST API path (default): token-less, uses the stored
  # custom.cloudflare credential via the cloudflare skill uploader.
  # Proven on 2026-09-18 (deploy 92bd495e) after wrangler failed here.
  UPLOAD_BIN="${PAGES_UPLOAD_BIN:-$HOME/workspace/skills/cloudflare/bin/pages-direct-upload.py}"
  CF_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-f008e0b7e3867a6050b412d931a9abd9}"
  if [[ ! -x "$UPLOAD_BIN" ]]; then
    printf 'ERROR: upload binary not found: %s\n' "$UPLOAD_BIN" >&2
    printf 'HINT: set PAGES_UPLOAD_BIN or CLOUDFLARE_API_TOKEN.\n' >&2
    exit 1
  fi
  # GIT_DIRTY is "dirty"/"clean" from Step 1; the uploader takes true/false.
  [[ "$GIT_DIRTY" == "dirty" ]] && UPLOAD_DIRTY=true || UPLOAD_DIRTY=false
  "$UPLOAD_BIN" "$CF_ACCOUNT_ID" "$PROJECT_NAME" "$STAGING_DIR" \
    --branch="$DEPLOY_BRANCH" \
    --commit-hash="$(git -C "$REPO_ROOT" rev-parse HEAD)" \
    --commit-message="$CHANGELOG" \
    --commit-dirty="$UPLOAD_DIRTY" 2>&1 | tee "$LOG_FILE"
  DEPLOY_EXIT=${PIPESTATUS[0]}
fi
set -e

if [[ $DEPLOY_EXIT -ne 0 ]]; then
  printf 'ERROR: deploy failed (exit %d). Full log: %s\n' "$DEPLOY_EXIT" "$LOG_FILE" >&2
  exit 1
fi

# Extract the deployment URL from deploy output (wrangler prints it, the
# direct uploader emits {"url": "https://<id>.gridnode.pages.dev", ...})
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

# Direct proof the deployment exists: the fresh deployment URL serves
# HTTP 200. (Wrangler's `deployment list` needs CLOUDFLARE_API_TOKEN,
# which this environment doesn't set — and a live 200 on the new URL is
# the stronger signal anyway.) Retry briefly: Pages needs a moment.
HTTP_CODE=""
for attempt in 1 2 3 4; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$DEPLOY_URL/" || true)
  [[ "$HTTP_CODE" == "200" ]] && break
  sleep 10
done
if [[ "$HTTP_CODE" != "200" ]]; then
  printf 'ERROR: deployment URL not serving after 40s (HTTP %s): %s\n' "$HTTP_CODE" "$DEPLOY_URL" >&2
  exit 1
fi
echo "   ✅ Deployment live: $DEPLOY_URL (HTTP 200)"

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
