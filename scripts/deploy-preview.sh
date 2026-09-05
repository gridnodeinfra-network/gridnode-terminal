#!/usr/bin/env bash
# Source nvm to get Node v22 (wrangler requires it)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
# GRID//NODE preview deploy — source-verified, fail-safe
#
# Deploys a pre-populated staging directory to the Cloudflare Pages preview branch.
# Does NOT use --branch=main. Does NOT fall back to a baseline.
# Captures full wrangler output (no tail truncation).
#
# Requires: a pre-populated staging directory (.staging/gridnode-preview/)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGING_NAME="${GRIDNODE_STAGING_NAME:-gridnode-preview}"
STAGING_DIR="$REPO_ROOT/.staging/$STAGING_NAME"
PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT:-gridnode}"
BRANCH="${CLOUDFLARE_PAGES_BRANCH:-preview}"
LOG_FILE="/tmp/gridnode-deploy-preview-$(date +%s).log"

command -v npx >/dev/null 2>&1 || { printf '%s\n' 'ERROR: npx is required' >&2; exit 1; }
[[ -d "$STAGING_DIR" ]] || { printf 'ERROR: staging directory missing: %s\n' "$STAGING_DIR" >&2; exit 1; }
[[ -s "$STAGING_DIR/index.html" ]] || { printf '%s\n' 'ERROR: staged index.html is missing or empty' >&2; exit 1; }

# Never allow preview to deploy to main
if [[ "$BRANCH" == "main" ]]; then
  printf '%s\n' 'ERROR: preview deploy must NOT use --branch=main. Use --branch=preview.' >&2
  exit 1
fi

STAGED_SHA=$(sha256sum "$STAGING_DIR/index.html" | awk '{print $1}')
echo "PREVIEW DEPLOY: project=$PROJECT_NAME branch=$BRANCH"
echo "STAGED SHA256:  $STAGED_SHA"
echo ""

set +e
npx --yes wrangler@latest pages deploy "$STAGING_DIR" \
  --project-name="$PROJECT_NAME" \
  --branch="$BRANCH" \
  --commit-dirty=true 2>&1 | tee "$LOG_FILE"
WRANGLER_EXIT=${PIPESTATUS[0]}
set -e

if [[ $WRANGLER_EXIT -ne 0 ]]; then
  printf 'ERROR: wrangler deploy failed (exit %d). Full log: %s\n' "$WRANGLER_EXIT" "$LOG_FILE" >&2
  exit 1
fi

DEPLOY_URL=$(grep -oE 'https://[a-f0-9]+\.gridnode\.pages\.dev' "$LOG_FILE" | head -1)
if [[ -z "$DEPLOY_URL" ]]; then
  printf '%s\n' 'ERROR: Could not extract deployment URL from wrangler output' >&2
  exit 1
fi

echo ""
echo "✅ Preview deployed: $DEPLOY_URL"
echo "   Branch alias: https://preview.gridnode.pages.dev/"
echo "   Log: $LOG_FILE"
