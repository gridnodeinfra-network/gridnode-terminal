#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGING_NAME="${GRIDNODE_STAGING_NAME:-gridnode-production}"
STAGING_DIR="$REPO_ROOT/.staging/$STAGING_NAME"
PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT:-gridnode}"

[[ "${1:-}" == "--confirm-production" ]] || { printf '%s\n' 'ERROR: production deploy requires --confirm-production' >&2; exit 1; }
[[ "${GRIDNODE_FOUNDER_APPROVAL:-}" == "YES" ]] || { printf '%s\n' 'ERROR: set GRIDNODE_FOUNDER_APPROVAL=YES after Founder approval' >&2; exit 1; }
command -v npx >/dev/null 2>&1 || { printf '%s\n' 'ERROR: npx is required for Cloudflare Pages production deploy' >&2; exit 1; }
[[ -d "$STAGING_DIR" ]] || { printf 'ERROR: production staging directory missing: %s\n' "$STAGING_DIR" >&2; exit 1; }
printf 'PRODUCTION DEPLOY: project=%s branch=main\n' "$PROJECT_NAME"
npx --yes wrangler@latest pages deploy "$STAGING_DIR" --project-name="$PROJECT_NAME" --branch=main --commit-dirty=true
