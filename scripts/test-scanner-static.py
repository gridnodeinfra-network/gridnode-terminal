from pathlib import Path
from itertools import combinations
import re

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "index.html").read_text(encoding="utf-8")
source = (ROOT / "js/gridnode-modules.js").read_text(encoding="utf-8")
bundle = (ROOT / "js/gridnode-bundle.js").read_text(encoding="utf-8")

EXPECTED_ZONES = {
    ("core", "Left Abdomen — Upper"): (220, 450, 480, 570),
    ("core", "Left Abdomen — Lower"): (220, 590, 480, 810),
    ("core", "Right Abdomen — Upper"): (520, 450, 780, 570),
    ("core", "Right Abdomen — Lower"): (520, 590, 780, 810),
    ("lower", "Left Thigh — Upper"): (165, 365, 485, 650),
    ("lower", "Left Thigh — Lower"): (175, 670, 470, 900),
    ("lower", "Right Thigh — Upper"): (515, 365, 835, 650),
    ("lower", "Right Thigh — Lower"): (530, 670, 825, 900),
    ("upper", "Left Back Upper Arm — Upper"): (70, 325, 245, 485),
    ("upper", "Left Back Upper Arm — Lower"): (55, 500, 225, 675),
    ("upper", "Right Back Upper Arm — Upper"): (755, 325, 930, 485),
    ("upper", "Right Back Upper Arm — Lower"): (775, 500, 945, 675),
}


def attribute(tag, name):
    match = re.search(rf'\b{name}="([^"]*)"', tag)
    assert match, f"zone hit missing {name}"
    return match.group(1)


def rectangle_path(bounds):
    x1, y1, x2, y2 = bounds
    return f"M {x1},{y1} L {x2},{y1} L {x2},{y2} L {x1},{y2} Z"


path_tags = re.findall(r"<path\b[^>]*>", html, flags=re.DOTALL)
zone_hits = [
    tag
    for tag in path_tags
    if re.search(r'\bclass="[^"]*\bzone-hit\b[^"]*"', tag)
]
assert len(zone_hits) == len(EXPECTED_ZONES), "scanner must expose exactly 12 hit regions"

observed_zones = {}
for tag in zone_hits:
    key = (attribute(tag, "data-mode"), attribute(tag, "data-site"))
    assert key in EXPECTED_ZONES, f"unexpected scanner hit region: {key}"
    assert key not in observed_zones, f"duplicate scanner hit region: {key}"
    bounds = EXPECTED_ZONES[key]
    assert attribute(tag, "data-zone-bounds") == ",".join(map(str, bounds))
    assert attribute(tag, "d") == rectangle_path(bounds)
    assert attribute(tag, "pointer-events") == "all", "scanner hit paths must receive all pointer events"
    observed_zones[key] = bounds
assert observed_zones == EXPECTED_ZONES, "scanner hit regions must use the calibrated bounds"

for index, hit in enumerate(path_tags):
    if hit not in zone_hits:
        continue
    assert index + 1 < len(path_tags), "each scanner hit path needs a following visible path"
    visible = path_tags[index + 1]
    assert re.search(r'\bclass="[^\"]*\bzone-visible\b[^\"]*"', visible), "each scanner hit path must be followed by a separate visible path"
    mode = attribute(hit, "data-mode")
    site = attribute(hit, "data-site")
    assert attribute(visible, "data-mode") == mode
    assert attribute(visible, "data-site") == site
    x1, y1, x2, y2 = EXPECTED_ZONES[(mode, site)]
    assert attribute(visible, "d") == rectangle_path((x1 + 10, y1 + 10, x2 - 10, y2 - 10))

for mode in {mode for mode, _ in EXPECTED_ZONES}:
    mode_bounds = [bounds for (zone_mode, _), bounds in EXPECTED_ZONES.items() if zone_mode == mode]
    for first, second in combinations(mode_bounds, 2):
        ax1, ay1, ax2, ay2 = first
        bx1, by1, bx2, by2 = second
        overlaps = ax1 < bx2 and bx1 < ax2 and ay1 < by2 and by1 < ay2
        assert not overlaps, f"{mode} scanner hit regions must not overlap: {first}, {second}"

asset_tags = [
    tag
    for tag in re.findall(r"<img\b[^>]*>", html, flags=re.DOTALL)
    if re.search(r'\bclass="[^"]*\bbiotech-asset\b[^"]*"', tag)
]
assert sorted(attribute(tag, "src") for tag in asset_tags) == sorted((
    "assets/scanner/core/core-cinematic.webp",
    "assets/scanner/legs/legs-cinematic.webp",
    "assets/scanner/arms/arms-cinematic.webp",
)), "scanner assets must use the approved cinematic files"

head_match = re.search(r"<head\b[^>]*>(.*?)</head>", html, flags=re.DOTALL | re.IGNORECASE)
assert head_match, "document must contain a head"
head = head_match.group(1)
precision_styles = list(re.finditer(
    r'<style\b[^>]*\bid="scanner-precision-cinematic-v1"[^>]*>(.*?)</style>',
    head,
    flags=re.DOTALL | re.IGNORECASE,
))
assert len(precision_styles) == 1, "scanner precision CSS must have exactly one final style block"
precision_style = precision_styles[0].group(1)
assert "<style" not in head[precision_styles[0].end():].lower(), "scanner precision CSS must be the final head style block"
EXPECTED_PRECISION_STYLE = """
#shotsRegionScanner .biotech-stage { aspect-ratio:1; touch-action:pan-y pinch-zoom; contain:layout paint; }
#shotsRegionScanner .biotech-asset,
#shotsRegionScanner .biotech-zones { position:absolute; inset:0; width:100%; height:100%; }
#shotsRegionScanner .zone-hit { pointer-events:all; }
#shotsRegionScanner .scanner-selected-panel { scroll-margin-bottom:calc(92px + var(--safe-bottom)); }
@media (max-width:430px) {
  #shotsRegionScanner { padding:12px; }
  #shotsRegionScanner .site-scanner { padding:9px; border-radius:16px; }
  #shotsRegionScanner .biotech-scanner { margin-top:10px; }
  #pageLog { padding-bottom:calc(104px + var(--safe-bottom)); }
}
"""
assert "#shotsRegionScanner .biotech-zones" in precision_style, "scanner SVG selector must target .biotech-zones explicitly"
assert re.sub(r"\s+", "", precision_style) == re.sub(r"\s+", "", EXPECTED_PRECISION_STYLE), "scanner precision CSS must match the approved authority exactly"

core_center = re.search(r"<circle\b[^>]*\bclass=\"[^\"]*\bzone-excluded\b[^\"]*\"[^>]*>", html, flags=re.DOTALL)
assert core_center, "CORE excluded center must remain explicit"
assert attribute(core_center.group(0), "pointer-events") == "none", "CORE excluded center must not be selectable"

for label, content in (("readable source", source), ("delivery bundle", bundle)):
    for symbol in (
        "function pointerToSvgPoint(",
        "function hitTestScannerZone(",
        "function installScannerPointerHandlers(",
        "function clearScannerTransientState(",
    ):
        assert symbol in content, f"{label} missing {symbol}"
    assert "event.target.closest('.zone-path')" not in content, f"{label} delegated click duplicates pointer activation"
    assert "item.setAttribute('aria-selected'" in content, f"{label} missing aria-selected mode semantics"
    assert content.count("const scannerPointerStates = new WeakMap();") == 1, f"{label} must keep one WeakMap pointer registry"
    assert "selectScannerLocation(label, options = {})" in content, f"{label} selection owner must accept options"
    assert "const { source = 'programmatic', feedback = source !== 'programmatic' } = options;" in content, f"{label} selection owner must preserve approved feedback defaults"
    assert "const endpoint = hitTestScannerZone" in content, f"{label} must re-hit-test pointer-up endpoint"
    assert "lostpointercapture" in content, f"{label} must clear state on lost pointer capture"
    assert "selectScannerLocation(site, { source: 'pointer' })" in content, f"{label} pointer path must declare its source"
    assert "selectScannerLocation(site, { source: 'keyboard' })" in content, f"{label} keyboard path must declare its source"
    assert "selectScannerLocation(zone.dataset.stableZone, { source: 'fallback' })" in content, f"{label} fallback path must declare its source"
    selection_block = content[content.index("selectScannerLocation(label, options = {})"):content.index("function renderScanner()", content.index("selectScannerLocation(label, options = {})"))]
    assert "showToast(" not in selection_block, f"{label} scanner selection must not block rapid reselection with a toast"
    assert selection_block.count("playLock") == 1, f"{label} selection owner must play lock audio once"
    assert "playContact" not in selection_block, f"{label} selection owner must not play contact audio"
    assert selection_block.count("navigator.vibrate(") == 1, f"{label} selection owner must own the only scanner haptic"
    assert "navigator.vibrate([4, 12, 6])" in selection_block, f"{label} selection owner must use the approved haptic pattern"
    pointer_block = content[content.index("function installScannerPointerHandlers()"):content.index("function clearScannerTransientState()", content.index("function installScannerPointerHandlers()"))]
    assert pointer_block.count("navigator.vibrate") == 0, f"{label} pointer/keyboard paths must not duplicate haptics"
    assert pointer_block.count("playContact") == 1, f"{label} pointerdown must play contact audio once"
    assert "playLock" not in pointer_block, f"{label} pointer path must not play lock audio"
    assert pointer_block.count("addEventListener(\"pointerdown\"") == 1, f"{label} must have one pointer owner per SVG"
print("SCANNER STATIC REGRESSION PASSED")
