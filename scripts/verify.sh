#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCKED_ROOT="$REPO_ROOT/01_SOURCE_TRUTH_LOCKED/production-20260720.36"

require_command() { command -v "$1" >/dev/null 2>&1 || { printf 'ERROR: missing command: %s\n' "$1" >&2; exit 1; }; }
for command_name in cmp find grep node shellcheck sha256sum stat; do require_command "$command_name"; done

required_files=(index.html js/gridnode-bundle.js js/gridnode-phase-sphere.js js/gridnode-product-completion.js sw.js manifest.json _headers)
for relative_path in "${required_files[@]}"; do
    [[ -f "$REPO_ROOT/$relative_path" ]] || { printf 'ERROR: missing required file: %s\n' "$relative_path" >&2; exit 1; }
done

printf '%s\n' '== Bash syntax and ShellCheck =='
mapfile -t bash_files < <(find "$REPO_ROOT/scripts" -maxdepth 1 -type f -name '*.sh' -print | sort)
(( ${#bash_files[@]} > 0 )) || { printf '%s\n' 'ERROR: no Bash scripts found' >&2; exit 1; }
shellcheck "${bash_files[@]}"

printf '%s\n' '== JavaScript syntax =='
node --check "$REPO_ROOT/js/gridnode-bundle.js"
node --check "$REPO_ROOT/js/gridnode-phase-sphere.js"
node --check "$REPO_ROOT/js/gridnode-product-completion.js"
node --check "$REPO_ROOT/sw.js"

printf '%s\n' '== Runtime references =='
grep -q 'js/gridnode-bundle.js' "$REPO_ROOT/index.html"
grep -q 'js/gridnode-phase-sphere.js' "$REPO_ROOT/index.html"
grep -q 'js/gridnode-product-completion.js' "$REPO_ROOT/index.html"
grep -q 'manifest.json' "$REPO_ROOT/index.html"
grep -q '/sw.js' "$REPO_ROOT/js/gridnode-bundle.js"
node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync(process.argv[1])); if(!Array.isArray(m.icons)||m.icons.length<3) process.exit(1);" "$REPO_ROOT/manifest.json"
while IFS= read -r asset; do
    [[ -f "$REPO_ROOT/${asset#/}" ]] || { printf 'ERROR: missing HTML asset: %s\n' "$asset" >&2; exit 1; }
done < <(grep -oE '/assets/[A-Za-z0-9._/-]+' "$REPO_ROOT/index.html" | sort -u)
while IFS= read -r asset; do
    [[ -f "$REPO_ROOT/${asset#/}" ]] || { printf 'ERROR: missing service-worker asset: %s\n' "$asset" >&2; exit 1; }
done < <(grep -oE '/assets/[A-Za-z0-9._/?=-]+' "$REPO_ROOT/sw.js" | sed 's/?[^ ]*//' | sort -u)

printf '%s\n' '== Locked artifact hashes =='
node - "$LOCKED_ROOT/source-metadata.json" "$LOCKED_ROOT" <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const metadataPath = process.argv[2];
const root = process.argv[3];
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
for (const [relative, expected] of Object.entries(metadata.files)) {
  const file = path.join(root, relative);
  const data = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  if (data.length !== expected.bytes || hash !== expected.sha256) throw new Error(`hash mismatch: ${relative}`);
  console.log(`PASS ${relative} ${data.length} bytes ${hash}`);
}
NODE

printf '%s\n' '== Deterministic bundle and growth gate =='
cmp "$REPO_ROOT/js/gridnode-bundle.js" "$LOCKED_ROOT/js/gridnode-bundle.js"
bundle_bytes=$(stat -c '%s' "$REPO_ROOT/js/gridnode-bundle.js")
locked_bytes=$(stat -c '%s' "$LOCKED_ROOT/js/gridnode-bundle.js")
if (( bundle_bytes > locked_bytes + 5120 )); then
    printf 'ERROR: unexplained bundle growth: %d bytes\n' "$((bundle_bytes - locked_bytes))" >&2
    exit 1
fi
printf 'Bundle: %s bytes; deterministic against locked .36 baseline\n' "$bundle_bytes"
printf '%s\n' 'VERIFICATION PASSED'
