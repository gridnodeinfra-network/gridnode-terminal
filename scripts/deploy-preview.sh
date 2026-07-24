#!/usr/bin/env bash
set -Eeuo pipefail

NEXUS_CF_ENV="${HOME}/.config/nexus/cloudflare.env"
if [[ -f "$NEXUS_CF_ENV" ]]; then
  # shellcheck disable=SC1090
  source "$NEXUS_CF_ENV"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGING_NAME="${GRIDNODE_STAGING_NAME:-gridnode-preview}"
STAGING_DIR="$REPO_ROOT/.staging/$STAGING_NAME"
PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT:-gridnode-staging}"
BRANCH="${CLOUDFLARE_PAGES_BRANCH:-preview}"

command -v npx >/dev/null 2>&1 || { printf '%s\n' 'ERROR: npx is required for Cloudflare Pages preview deploy' >&2; exit 1; }
[[ -d "$STAGING_DIR" ]] || { printf 'ERROR: staging directory missing: %s\n' "$STAGING_DIR" >&2; exit 1; }
printf 'PREVIEW DEPLOY: project=%s branch=%s\n' "$PROJECT_NAME" "$BRANCH"
npx --yes wrangler@latest pages deploy "$STAGING_DIR" --project-name="$PROJECT_NAME" --branch="$BRANCH" --commit-dirty=true
