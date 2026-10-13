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
app = app_path.read_text(encoding="utf-8-sig")

export_pattern = re.compile(
    r"^export\s+(?:(?:async\s+)?function|const)\s+"
    r"([A-Za-z_$][A-Za-z0-9_$]*)",
    re.MULTILINE,
)

def transform_module(source):
    """Apply the classic-bundle transforms to one module source file.
    Per-file application is equivalent to the historical whole-concatenation
    application: every pattern is anchored to a single import/export block
    that never spans a file boundary."""
    out = re.sub(
        r"^import\s*\{.*?\}\s*from\s*'\./gridnode-core\.js';\s*",
        "",
        source,
        flags=re.MULTILINE | re.DOTALL,
    )
    # These ESM aliases expose core helpers through GNModules. In the classic
    # bundle the core declarations already use the public names, so retaining
    # the alias declarations would redeclare them in the same scope.
    out = re.sub(
        r"^export\s+const\s+getProfile(?:ForEvidence)?\s*=\s*coreGetProfile(?:ForEvidence)?;\s*",
        "",
        out,
        flags=re.MULTILINE,
    )
    out = re.sub(r"^export\s+", "", out, flags=re.MULTILINE)
    return out

# Read + transform each module file once; core bundle and chunks are all
# assembled from these same transformed segments (order-preserving).
segments = {}
exports_by_file = {}
for name in MODULE_FILES:
    source = (modules_dir / name).read_text(encoding="utf-8-sig")
    segments[name] = transform_module(source)
    exports_by_file[name] = export_pattern.findall(source)

def exports_for(files):
    names = []
    for f in files:
        for n in exports_by_file[f]:
            if n not in names:
                names.append(n)
    return names

# Code-split layout (2026-10-12, codesplit-analysis-A): the core bundle keeps
# boot/TODAY/navigation only; every other module ships as a lazy chunk loaded
# by js/gridnode-chunk-loader.js and registered via window.GNRegisterChunk.
CORE_MODULE_FILES = [
    "00-shared.js",
    "01-shell.js",
    "02-dashboard.js",
    "07-pickers.js",
    "11-misc.js",
    "13-haptics.js",
]
CHUNKS = {
    "history": ["03-shots-history.js", "04-scanner.js"],
    "logshot": ["05-log-shot.js"],
    "progress": ["06-results.js"],
    "lab": ["08-lab.js"],
    "vault": ["09-vault.js"],
    "import": ["10-importer.js"],
    "ambience": ["12-soundtrack.js"],
}
chunked_files = [f for files in CHUNKS.values() for f in files]
if sorted(CORE_MODULE_FILES + chunked_files) != sorted(MODULE_FILES):
    raise SystemExit("ERROR: core+chunk module partition does not cover order.json exactly")

core = re.sub(r"^export\s+", "", core, flags=re.MULTILINE)

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

core_export_names = exports_for(CORE_MODULE_FILES)
module_map = ",".join(f"{name}:{name}" for name in core_export_names)

header = (
    "/* GRID//NODE stable classic delivery bundle. "
    "Source remains modular in gridnode-core.js, "
    "js/modules/*.js, and gridnode-app.js. "
    "Phase 1 refactor: gridnode-modules.js split into js/modules/, no functional change. */"
)

# GNModules is a LIVE registry (no freeze): lazy chunks merge their exports
# into this same object via GNRegisterChunk, and `modules` below aliases it,
# so chunk registrations are visible to app code that captured `modules`.
parts = [
    header,
    core.strip(),
    "".join(segments[name] for name in CORE_MODULE_FILES).strip(),
    f"window.GNModules={{{module_map}}};",
    "const modules=window.GNModules;",
    app.strip(),
]

bundle = "\n\n".join(parts) + "\n"
temp_path.write_bytes(bundle.encode("utf-8"))
temp_path.replace(bundle_path)

print(f"Built {bundle_path}")
print(f"Size: {bundle_path.stat().st_size} bytes")

# Lazy chunks: same transforms, plus a registration trailer. The trailer is
# byte-deterministic (export names in source order, no timestamps).
for key, files in CHUNKS.items():
    names = exports_for(files)
    chunk_map = ",".join(f"{name}:{name}" for name in names)
    trailer = (
        "\n;(function(){var m={" + chunk_map + "};"
        "if(window.GNRegisterChunk){window.GNRegisterChunk('" + key + "',m);}"
        "else if(window.GNModules){Object.assign(window.GNModules,m);}})();\n"
    )
    chunk = "".join(segments[name] for name in files).strip() + trailer
    chunk_path = js_root / f"gridnode-chunk-{key}.js"
    chunk_temp = js_root / f"gridnode-chunk-{key}.js.tmp"
    chunk_temp.write_bytes(chunk.encode("utf-8"))
    chunk_temp.replace(chunk_path)
    print(f"Built {chunk_path}")
    print(f"Size: {chunk_path.stat().st_size} bytes")
PY

node --check "$REPO_ROOT/js/gridnode-bundle.js"
for chunk in "$REPO_ROOT"/js/gridnode-chunk-*.js; do
  node --check "$chunk"
done

printf 'SHA256: '
sha256sum "$REPO_ROOT/js/gridnode-bundle.js" | awk '{print $1}'
