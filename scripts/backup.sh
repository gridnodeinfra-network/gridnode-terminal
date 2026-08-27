#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_ROOT="$REPO_ROOT/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$BACKUP_ROOT/gridnode-$STAMP.tar.gz"
TEMP_ARCHIVE="$BACKUP_ROOT/.gridnode-$STAMP.tar.gz.tmp.$$"

mkdir -p "$BACKUP_ROOT"
cleanup() { rm -f "$TEMP_ARCHIVE"; }
trap cleanup EXIT
tar -czf "$TEMP_ARCHIVE" --exclude='./.git' --exclude='./backups' -C "$REPO_ROOT" .
mv "$TEMP_ARCHIVE" "$ARCHIVE"
trap - EXIT
printf 'BACKUP: %s\n' "$ARCHIVE"
stat -c 'SIZE: %s bytes' "$ARCHIVE"
printf 'SHA256: '
sha256sum "$ARCHIVE" | awk '{print $1}'
