#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

export REPO_ROOT

python3 <<'PY'
import json
import os
import re
from pathlib import Path

repo = Path(os.environ["REPO_ROOT"])
js_root = repo / "js"

core_path = js_root / "gridnode-core.js"
modules_dir = js_root / "modules"
app_path = js_root / "gridnode-app.js"
bundle_path = js_root / "gridnode-bundle.js"
temp_path = js_root / "gridnode-bundle.js.tmp"

# Pinned concatenation order for js/modules/ (single source of truth:
# js/modules/order.json). The split is contiguous and order-preserving:
# "".join of these files == the old gridnode-modules.js.
order_path = js_root / "modules" / "order.json"
MODULE_FILES = json.loads(order_path.read_text(encoding="utf-8"))

for path in (core_path, app_path):
    if not path.is_file():
        raise SystemExit(f"ERROR: Missing source file: {path}")
for name in MODULE_FILES:
    if not (modules_dir / name).is_file():
        raise SystemExit(f"ERROR: Missing module file: {modules_dir / name}")

core = core_path.read_text(encoding="utf-8-sig")
modules_source = "".join(
    (modules_dir / name).read_text(encoding="utf-8-sig") for name in MODULE_FILES
)
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
# These ESM aliases expose core helpers through GNModules. In the classic bundle
# the core declarations already use the public names, so retaining the alias
# declarations would redeclare them in the same scope.
modules = re.sub(
    r"^export\s+const\s+getProfile(?:ForEvidence)?\s*=\s*coreGetProfile(?:ForEvidence)?;\s*",
    "",
    modules,
    flags=re.MULTILINE,
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
    "js/modules/*.js, and gridnode-app.js. "
    "Phase 1 refactor: gridnode-modules.js split into js/modules/, no functional change. */"
)

parts = [
    header,
    core.strip(),
    modules.strip(),
    f"window.GNModules=Object.freeze({{{module_map}}});",
    "const modules=window.GNModules;",
    app.strip(),
]

bundle = "\n\n".join(parts) + "\n"
temp_path.write_bytes(bundle.encode("utf-8"))
temp_path.replace(bundle_path)

print(f"Built {bundle_path}")
print(f"Size: {bundle_path.stat().st_size} bytes")
PY

node --check "$REPO_ROOT/js/gridnode-bundle.js"

printf 'SHA256: '
sha256sum "$REPO_ROOT/js/gridnode-bundle.js" | awk '{print $1}'
