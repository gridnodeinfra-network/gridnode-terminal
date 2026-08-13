"""Regression test for v0.15.19 mode switching.

Ensures all 3 scanner mode buttons (CORE/LEGS/ARMS) have working onclick handlers
that call setScannerMode. If anyone strips the onclick again, this test fails.
"""
from pathlib import Path
import re
import sys

REPO = Path("/home/thinkpadwinbash/workspaces/gridnode-terminal")
HTML = REPO / "index.html"
BUNDLE = REPO / "js" / "gridnode-bundle.js"

failures = []

def assert_has(label, content, pattern, must_match=True):
    found = bool(re.search(pattern, content))
    if must_match and not found:
        failures.append(f"MISSING: {label} - pattern not found: {pattern[:60]}")
    elif not must_match and found:
        failures.append(f"FORBIDDEN: {label} - pattern should NOT be present: {pattern[:60]}")
    else:
        print(f"  [ok] {label}")

# Load files
html = HTML.read_text(encoding="utf-8")
bundle = BUNDLE.read_text(encoding="utf-8")

print("=" * 60)
print("MODE SWITCHING REGRESSION TEST")
print("=" * 60)

# 1) All 3 mode buttons must exist with correct data-mode
print("\n[buttons] data-mode attributes")
for mode in ["core", "lower", "upper"]:
    assert_has(
        f"button data-mode={mode}",
        html,
        rf'<button[^>]*data-mode="{mode}"[^>]*>',
    )

# 2) All 3 buttons must have onclick=setScannerMode
print("\n[buttons] onclick=setScannerMode handlers")
for mode in ["core", "lower", "upper"]:
    pattern = rf'<button[^>]*data-mode="{mode}"[^>]*onclick=["\']setScannerMode\(\'{mode}\',this\)["\'][^>]*>'
    assert_has(
        f"button data-mode={mode} onclick=setScannerMode('{mode}',this)",
        html,
        pattern,
    )

# 3) All 3 stages must have data-view matching the data-mode
print("\n[stages] data-view attributes")
for mode in ["core", "lower", "upper"]:
    assert_has(
        f"stage data-view={mode}",
        html,
        rf'<div[^>]*class="biotech-stage[^"]*"[^>]*data-view="{mode}"',
    )

# 4) Bundle must have setScannerMode function
print("\n[bundle] setScannerMode implementation")
assert_has(
    "setScannerMode function defined",
    bundle,
    r'function setScannerMode\(mode, button\)',
)
assert_has(
    "setScannerMode iterates .biotech-stage",
    bundle,
    r"qa\('\.biotech-stage'\)\.forEach",
)
assert_has(
    "setScannerMode toggles stage hidden",
    bundle,
    r"stage\.hidden\s*=\s*!isActive",
)

# 5) Bundle must NOT have the old 9-state asset path
print("\n[bundle] old 9-state asset logic removed")
assert_has(
    "scannerSkinTone() returns null",
    bundle,
    r"function scannerSkinTone\(\)\s*\{\s*return null;",
)
assert_has(
    "setScannerSkinTone() is no-op",
    bundle,
    r"function setScannerSkinTone\([^)]*\)\s*\{[^}]*no-op",
)

# 6) Bundle exposes setScannerMode globally (so onclick can find it)
print("\n[bundle] global exposure of setScannerMode")
assert_has(
    "setScannerMode in window.GNModules",
    bundle,
    r"setScannerMode[,\s]",
)

# 7) Mode labels are LEGS/ARMS (not LOWER/UPPER)
print("\n[ui] mode labels are LEGS/ARMS")
assert_has("LEGS button visible", html, r">LEGS<")
assert_has("ARMS button visible", html, r">ARMS<")

# 8) Data model uses stable identifiers
print("\n[data] data model stable identifiers")
for mode in ["core", "lower", "upper"]:
    assert_has(
        f"ZONES[{mode}] defined in bundle",
        bundle,
        rf"{mode}:\s*\[",
    )

# 9) Stage has SVG zones for each mode
print("\n[stages] SVG zones present")
for mode in ["core", "lower", "upper"]:
    # Each stage should have a .biotech-zones SVG with 4 zone paths
    stage_pattern = rf'<div class="biotech-stage[^"]*"[^>]*data-view="{mode}".*?</div>\s*</div>\s*</div>'
    if re.search(stage_pattern, html, re.DOTALL):
        # Now check within that stage for 4 zone-path elements
        m = re.search(stage_pattern, html, re.DOTALL)
        stage_html = m.group(0)
        zone_count = stage_html.count('class="zone-path zone-hit"')
        if zone_count == 4:
            print(f"  [ok] stage {mode} has 4 zone-hit elements")
        else:
            failures.append(f"stage {mode} has {zone_count} zone-hit elements, expected 4")
    else:
        failures.append(f"could not find stage div for {mode}")

# Summary
print("\n" + "=" * 60)
if failures:
    print(f"FAILED ({len(failures)} issues):")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
else:
    print("ALL PASSED — mode switching is intact")
    sys.exit(0)
