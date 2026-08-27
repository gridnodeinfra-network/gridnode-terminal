#!/usr/bin/env bash
set -Eeuo pipefail
# NEXUS GRID//NODE worker health check — read-only, no builds or deploys
# Run: bash scripts/nexus-worker-health.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
PASS="${GREEN}PASS${NC}"
FAIL="${RED}FAIL${NC}"
ERRORS=0

check() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo -e "$PASS $label"
  else
    echo -e "$FAIL $label"
    ERRORS=$((ERRORS + 1))
  fi
}

echo "=== NEXUS GRID//NODE Worker Health ==="
echo ""

# Workspace
WORKSPACE="/home/pipe_blade/workspaces/gridnode-terminal"
check "workspace exists"          test -d "$WORKSPACE"

# Tunnel service
check "tunnel service enabled"    systemctl --user -q is-enabled gridnode-tunnel.service
check "tunnel service active"     systemctl --user -q is-active gridnode-tunnel.service

# Tools
check "node available"            command -v node
check "npx available"             command -v npx
check "gh available"              command -v gh

# GitHub auth
check "gh authenticated"          gh auth status

# Cloudflare
CF_ENV="$HOME/.config/nexus/cloudflare.env"
check "cloudflare env exists"     test -f "$CF_ENV"

# shellcheck disable=SC1090
if [[ -f "$CF_ENV" ]]; then
  source "$CF_ENV"
  check "CLOUDFLARE_API_TOKEN set"     test -n "${CLOUDFLARE_API_TOKEN:-}"
  check "CLOUDFLARE_ACCOUNT_ID set"    test -n "${CLOUDFLARE_ACCOUNT_ID:-}"
  check "wrangler lists gridnode"      npx wrangler pages project list 2>/dev/null | grep -q gridnode
  check "wrangler lists gridnode-staging" npx wrangler pages project list 2>/dev/null | grep -q gridnode-staging
else
  echo -e "$FAIL cloudflare env missing — skipping cloud checks"
  ERRORS=$((ERRORS + 4))
fi

# Git
cd "$WORKSPACE"
REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
EXPECTED="https://github.com/gridnodeinfra-network/gridnode-terminal.git"
if [[ "$REMOTE" == "$EXPECTED" ]]; then
  echo -e "$PASS git remote origin correct"
else
  echo -e "$FAIL git remote origin: got '$REMOTE', expected '$EXPECTED'"
  ERRORS=$((ERRORS + 1))
fi

echo ""
if [[ $ERRORS -eq 0 ]]; then
  echo -e "${GREEN}All checks PASSED${NC}"
else
  echo -e "${RED}$ERRORS check(s) FAILED${NC}"
fi
exit $ERRORS
