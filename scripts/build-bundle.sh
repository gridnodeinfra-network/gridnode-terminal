#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

export REPO_ROOT

python3 <<'PY'
import os
import re
from pathlib import Path

repo = Path(os.environ["REPO_ROOT"])
js_root = repo / "js"

core_path = js_root / "gridnode-core.js"
modules_path = js_root / "gridnode-modules.js"
app_path = js_root / "gridnode-app.js"
bundle_path = js_root / "gridnode-bundle.js"
temp_path = js_root / "gridnode-bundle.candidate.js"

for path in (core_path, modules_path, app_path):
    if not path.is_file():
        raise SystemExit(f"ERROR: Missing source file: {path}")

core = core_path.read_text(encoding="utf-8-sig")
modules_source = modules_path.read_text(encoding="utf-8-sig")
app = app_path.read_text(encoding="utf-8-sig")

module_export_names = []
pattern = re.compile(
    r"^export\s+(?:(?:async\s+)?function|const)\s+"
    r"([A-Za-z_$][A-Za-z0-9_$]*)",
    re.MULTILINE,
)

for name in pattern.findall(modules_source):
    if name not in module_export_names:
        module_export_names.append(name)

core = re.sub(r"^export\s+", "", core, flags=re.MULTILINE)

modules = re.sub(
    r"^import\s*\{.*?\}\s*from\s*'\./gridnode-core\.js';\s*",
    "",
    modules_source,
    flags=re.MULTILINE | re.DOTALL,
)
modules = re.sub(r"^export\s+", "", modules, flags=re.MULTILINE)

app = re.sub(
    r"^import\s*\{.*?\}\s*from\s*'\./gridnode-core\.js';\s*",
    "",
    app,
    flags=re.MULTILINE | re.DOTALL,
)
app = re.sub(
    r"^import \* as modules from '\./gridnode-modules\.js';\s*",
    "",
    app,
    flags=re.MULTILINE,
)
app = re.sub(r"^export\s+", "", app, flags=re.MULTILINE)
app = re.sub(
    r"^const \$ = id => document\.getElementById\(id\);\s*",
    "",
    app,
    flags=re.MULTILINE,
)

module_map = ",".join(f"{name}:{name}" for name in module_export_names)

header = (
    "/* GRID//NODE stable classic delivery bundle. "
    "Source remains modular in gridnode-core.js, "
    "gridnode-modules.js, and gridnode-app.js. */"
)

parts = [
    header,
    core.strip(),
    modules.strip(),
    f"window.GNModules=Object.freeze({{{module_map}}});",
    "const modules=window.GNModules;",
    app.strip(),
]

bundle = "\r\n\r\n".join(parts) + "\r\n\r\n"
temp_path.write_bytes(bundle.encode("utf-8"))

print(f"Prepared candidate {temp_path}")
print(f"Size: {temp_path.stat().st_size} bytes")
PY

TEMP_BUNDLE="$REPO_ROOT/js/gridnode-bundle.candidate.js"
trap 'rm -f "$TEMP_BUNDLE"' EXIT
node --check "$TEMP_BUNDLE"

LIVE_BUNDLE="$REPO_ROOT/01_SOURCE_TRUTH_LOCKED/production-20260720.36/js/gridnode-bundle.js"
if [[ -f "$LIVE_BUNDLE" ]]; then
    live_bytes=$(stat -c '%s' "$LIVE_BUNDLE")
    built_bytes=$(stat -c '%s' "$TEMP_BUNDLE")
    if (( built_bytes + 5120 < live_bytes )); then
        printf 'ERROR: generated bundle is %d bytes smaller than protected live baseline (%d bytes).\n' "$((live_bytes - built_bytes))" "$live_bytes" >&2
        printf 'Refusing to replace the live-parity runtime until modular reconciliation is complete.\n' >&2
        exit 1
    fi
fi

mv "$TEMP_BUNDLE" "$REPO_ROOT/js/gridnode-bundle.js"
node --check "$REPO_ROOT/js/gridnode-bundle.js"

printf 'SHA256: '
sha256sum "$REPO_ROOT/js/gridnode-bundle.js" | awk '{print $1}'
