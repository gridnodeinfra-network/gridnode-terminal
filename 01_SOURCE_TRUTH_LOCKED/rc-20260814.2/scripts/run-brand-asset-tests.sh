#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_python="${GRIDNODE_BRAND_BUILD_PYTHON:-/tmp/gridnode-brand-opencv-4.12.0.88/bin/python}"

cd "$repo_root"
test -x "$build_python"
"$build_python" scripts/build-brand-assets.py
python3 scripts/test-brand-assets.py
