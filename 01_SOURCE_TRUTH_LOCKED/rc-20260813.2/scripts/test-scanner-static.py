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
#shotsRegionScanner .zone-visible { vector-effect:non-scaling-stroke; transform-box:fill-box; transform-origin:center; transition:fill 120ms ease,stroke 120ms ease,stroke-width 120ms ease,opacity 120ms ease,filter 120ms ease; }
#shotsRegionScanner .scanner-selected-panel { position:relative; overflow:hidden; scroll-margin-bottom:calc(92px + var(--safe-bottom)); }
#shotsRegionScanner .scanner-audio-switch { min-width:184px; min-height:44px; padding:9px 12px; border:1px solid rgba(6,187,227,.42); border-radius:9px; background:rgba(5,7,8,.78); color:#9ab4ba; font:700 .62rem/1 var(--font-m,monospace); letter-spacing:1px; text-align:center; }
#shotsRegionScanner .scanner-audio-switch[aria-checked="true"] { border-color:#06BBE3; background:rgba(6,187,227,.12); color:#EAFDFF; box-shadow:0 0 10px rgba(6,187,227,.16); }
#shotsRegionScanner .scanner-audio-switch:focus-visible { outline:2px solid #FCEE0A; outline-offset:2px; }
#shotsRegionScanner .zone-hit.pressed + .zone-visible { stroke:#FCEE0A; stroke-width:4; fill:rgba(234,9,23,.24); filter:drop-shadow(0 0 6px rgba(252,238,10,.42)); opacity:1; transition:none; }
#shotsRegionScanner .zone-hit.zone-acquiring + .zone-visible { stroke:#06BBE3; stroke-width:4; fill:rgba(234,9,23,.20); stroke-dasharray:18 11; animation:gn-scanner-acquire 420ms cubic-bezier(.2,.75,.25,1) both; }
#shotsRegionScanner .zone-hit.selected.selected-active + .zone-visible { stroke:#06BBE3; stroke-width:3.5; stroke-dasharray:none; fill:rgba(234,9,23,.22); filter:drop-shadow(0 0 7px rgba(6,187,227,.42)); opacity:1; }
#shotsRegionScanner .zone-hit.is-dim:not(.selected) + .zone-visible { opacity:.38; filter:none; }
#shotsRegionScanner .scanner-selected-panel.gn-zone-confirmed { border-color:#06BBE3; animation:gn-scanner-confirm 720ms cubic-bezier(.2,.75,.25,1) both; }
#shotsRegionScanner .scanner-selected-panel .gn-location-lock { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:0 0 8px; padding:9px 10px; min-height:44px; border:1px solid rgba(6,187,227,.34); border-left:3px solid #EA0917; border-radius:10px; background:rgba(5,7,8,.82); color:#06BBE3; opacity:0; transform:translateY(3px); transition:opacity 160ms ease,transform 160ms ease,border-color 160ms ease; }
#shotsRegionScanner .scanner-selected-panel .gn-location-lock.is-on { display:flex; opacity:1; transform:translateY(0); border-left-color:#06BBE3; }
#shotsRegionScanner .scanner-selected-panel.gn-zone-confirmed .gn-location-lock.is-on { animation:gn-scanner-rail-confirm 640ms cubic-bezier(.2,.75,.25,1) both; }
@media (hover:hover) and (pointer:fine) { #shotsRegionScanner .zone-hit:hover + .zone-visible { stroke:#FCEE0A; fill:rgba(234,9,23,.12); filter:drop-shadow(0 0 6px rgba(252,238,10,.38)); } }
@keyframes gn-scanner-acquire { 0% { stroke:#FCEE0A; stroke-dashoffset:58; fill:rgba(234,9,23,.30); opacity:.9; } 52% { stroke:#FCEE0A; stroke-dashoffset:21; fill:rgba(234,9,23,.24); opacity:1; } 100% { stroke:#06BBE3; stroke-dashoffset:0; fill:rgba(234,9,23,.20); opacity:1; } }
@keyframes gn-scanner-confirm { 0% { box-shadow:0 0 0 1px #EA0917,0 0 0 rgba(234,9,23,0); } 48% { box-shadow:0 0 0 1px #FCEE0A,0 0 14px rgba(234,9,23,.16); } 100% { box-shadow:0 0 0 1px rgba(6,187,227,.42),0 0 18px rgba(6,187,227,.16); } }
@keyframes gn-scanner-rail-confirm { 0% { border-left-color:#EA0917; box-shadow:inset 18px 0 24px rgba(234,9,23,.18); } 48% { border-left-color:#FCEE0A; box-shadow:inset 8px 0 18px rgba(252,238,10,.10); } 100% { border-left-color:#06BBE3; box-shadow:inset 0 0 0 rgba(6,187,227,0); } }
@media (prefers-reduced-motion:reduce) { #shotsRegionScanner .zone-hit.zone-acquiring + .zone-visible, #shotsRegionScanner .zone-hit.selected-active + .zone-visible, #shotsRegionScanner .scanner-selected-panel.gn-zone-confirmed, #shotsRegionScanner .scanner-selected-panel.gn-zone-confirmed .gn-location-lock.is-on { animation:none!important; } #shotsRegionScanner .zone-visible, #shotsRegionScanner .scanner-selected-panel .gn-location-lock { transition:none!important; } }
html[data-theme="light"] #shotsRegionScanner .zone-visible { filter:none; }
html[data-theme="light"] #shotsRegionScanner .zone-hit.selected.selected-active + .zone-visible { stroke:#06BBE3; fill:rgba(234,9,23,.16); filter:none; }
html[data-theme="light"] #shotsRegionScanner .scanner-selected-panel .gn-location-lock.is-on { color:#050708; border-color:rgba(6,187,227,.52); border-left-color:#06BBE3; background:rgba(255,255,255,.94); box-shadow:none; }
html[data-theme="light"] #shotsRegionScanner .scanner-audio-switch { background:rgba(255,255,255,.94); color:#31545b; }
html[data-theme="light"] #shotsRegionScanner .scanner-audio-switch[aria-checked="true"] { color:#003C4C; }
@media (max-width:430px) {
  #shotsRegionScanner { padding:12px; }
  #shotsRegionScanner .site-scanner { padding:9px; border-radius:16px; }
  #shotsRegionScanner .biotech-scanner { margin-top:10px; }
  #pageLog { padding-bottom:calc(104px + var(--safe-bottom)); }
}
"""
assert "#shotsRegionScanner .biotech-zones" in precision_style, "scanner SVG selector must target .biotech-zones explicitly"
assert re.sub(r"\s+", "", precision_style) == re.sub(r"\s+", "", EXPECTED_PRECISION_STYLE), "scanner precision CSS must match the approved authority exactly"
for required in (
    "#shotsRegionScanner .zone-hit.pressed + .zone-visible",
    "#shotsRegionScanner .zone-hit.zone-acquiring + .zone-visible",
    "#shotsRegionScanner .zone-hit.selected.selected-active + .zone-visible",
    ".scanner-selected-panel.gn-zone-confirmed",
    ".gn-location-lock.is-on",
    "@media (hover:hover) and (pointer:fine)",
    "@media (prefers-reduced-motion:reduce)",
    "html[data-theme=\"light\"] #shotsRegionScanner .scanner-selected-panel .gn-location-lock.is-on",
    "@keyframes gn-scanner-acquire",
    "@keyframes gn-scanner-confirm",
    "@keyframes gn-scanner-rail-confirm",
):
    assert required in precision_style, f"scanner precision CSS missing {required}"
assert "animation-iteration-count:infinite" not in precision_style.replace(" ", ""), "scanner feedback must not loop"
assert "will-change" not in precision_style, "scanner feedback must not permanently reserve will-change"
assert not re.search(r"\.biotech-asset[^\{]*\{[^\}]*(?:animation|filter)\s*:", precision_style, flags=re.DOTALL), "scanner must not animate or filter body images"
for keyframe_name in ("gn-scanner-acquire", "gn-scanner-confirm", "gn-scanner-rail-confirm"):
    keyframe = precision_style[precision_style.index(f"@keyframes {keyframe_name}"):]
    keyframe = keyframe[:keyframe.find("\n@", 1) if keyframe.find("\n@", 1) >= 0 else len(keyframe)]
    assert "filter:" not in keyframe, f"{keyframe_name} must not animate filters"

audio_switch = re.search(r'<button\b[^>]*\bid="gnScannerAudioSwitch"[^>]*>(.*?)</button>', html, flags=re.DOTALL)
assert audio_switch, "scanner must expose the local audio switch"
audio_switch_tag = audio_switch.group(0)
assert 'role="switch"' in audio_switch_tag, "scanner audio control must expose switch semantics"
assert 'aria-checked="false"' in audio_switch_tag, "scanner audio switch must default to OFF"
assert 'aria-label="Scanner audio"' in audio_switch_tag, "scanner audio switch must have a clear accessible name"
assert re.sub(r"<[^>]+>", "", audio_switch.group(1)).strip() == "SCANNER AUDIO // OFF", "scanner audio switch must use exact default copy"
assert html.index(audio_switch_tag) < html.index('class="scanner-mode-tabs"'), "scanner audio switch must remain in the scanner control area before mode tabs"
scanner_control_area = html[html.index('<section class="shots-scanner-card" id="shotsRegionScanner">'):html.index('class="scanner-mode-tabs"')]
assert re.search(r'<div class="shots-scanner-head">[\s\S]*?id="gnScannerAudioSwitch"', scanner_control_area), "scanner audio switch must occupy the scanner header right-hand slot"
assert 'scanner-audio-control' not in html, "scanner audio must not introduce a vertical control row"
assert 'class="scanner-source-tag"' not in scanner_control_area, "scanner audio switch must replace the decorative scanner-source tag"

def audio_controller_fixture(content, label):
    matches = re.findall(r"/\* GN_SCANNER_AUDIO_CONTROLLER_V1_START \*/(.*?)/\* GN_SCANNER_AUDIO_CONTROLLER_V1_END \*/", content, flags=re.DOTALL)
    assert len(matches) == 1, f"{label} must have one narrow audio-controller fixture"
    fixture = matches[0]
    for required in (
        "gn_scanner_audio_v1",
        "GN_SCANNER_AUDIO_MASTER_GAIN = 0.035",
        "GN_SCANNER_AUDIO_CONTACT_THROTTLE_MS = 45",
        "const token = Symbol('GNScannerAudioGesture')",
        "event?.isTrusted === true ? token : null",
        "accepts(candidate) { return candidate === token; }",
        "createOscillator()",
        "createGain()",
        "createBiquadFilter()",
        "playContact: gnScannerAudioPlayContact",
        "playLock: gnScannerAudioPlayLock",
    ):
        assert required in fixture, f"{label} audio controller missing {required}"
    assert "userGesture" not in fixture, f"{label} audio controller must not trust a caller-controlled gesture boolean"
    assert "GN_SOUND_ON" not in fixture and "audio removed" not in fixture, f"{label} audio fixture must not retain obsolete audio state"
    return re.sub(r"\s+", "", fixture)

assert audio_controller_fixture(source, "readable source") == audio_controller_fixture(bundle, "delivery bundle"), "audio controller fixture must be exact source/bundle parity"
for label, content in (("readable source", source), ("delivery bundle", bundle)):
    assert "GN_SOUND_ON" not in content, f"{label} must remove obsolete GN_SOUND_ON toggle"
    assert "audio removed" not in content, f"{label} must remove inaccurate audio-removed comments"

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
    assert "const { source = 'programmatic', feedback = source !== 'programmatic', gestureToken = null } = options;" in content, f"{label} selection owner must preserve feedback defaults and accept private provenance"
    assert "const endpoint = hitTestScannerZone" in content, f"{label} must re-hit-test pointer-up endpoint"
    assert "lostpointercapture" in content, f"{label} must clear state on lost pointer capture"
    assert "selectScannerLocation(site, { source: 'pointer', gestureToken: gnScannerAudioGesture.fromEvent(e) })" in content, f"{label} pointer path must carry trusted event provenance"
    assert "selectScannerLocation(site, { source: 'keyboard', gestureToken: gnScannerAudioGesture.fromEvent(e) })" in content, f"{label} keyboard path must carry trusted event provenance"
    assert "selectScannerLocation(zone.dataset.stableZone, { source: 'fallback', gestureToken: gnScannerAudioGesture.fromEvent(event) })" in content, f"{label} fallback path must carry trusted event provenance"
    selection_block = content[content.index("selectScannerLocation(label, options = {})"):content.index("function renderScanner()", content.index("selectScannerLocation(label, options = {})"))]
    assert "showToast(" not in selection_block, f"{label} scanner selection must not block rapid reselection with a toast"
    assert selection_block.count("playLock") == 1, f"{label} selection owner must play lock audio once"
    assert "playLock?.(gestureToken)" in selection_block, f"{label} selection owner must pass only private gesture provenance"
    assert "playContact" not in selection_block, f"{label} selection owner must not play contact audio"
    assert selection_block.count("navigator.vibrate(") == 1, f"{label} selection owner must own the only scanner haptic"
    assert "navigator.vibrate([4, 12, 6])" in selection_block, f"{label} selection owner must use the approved haptic pattern"
    pointer_block = content[content.index("function installScannerPointerHandlers()"):content.index("function clearScannerTransientState()", content.index("function installScannerPointerHandlers()"))]
    assert pointer_block.count("navigator.vibrate") == 0, f"{label} pointer/keyboard paths must not duplicate haptics"
    assert pointer_block.count("playContact") == 1, f"{label} pointerdown must play contact audio once"
    assert "playContact?.(gnScannerAudioGesture.fromEvent(e))" in pointer_block, f"{label} pointerdown contact must derive provenance from the trusted event"
    assert "playLock" not in pointer_block, f"{label} pointer path must not play lock audio"
    assert pointer_block.count("addEventListener(\"pointerdown\"") == 1, f"{label} must have one pointer owner per SVG"
print("SCANNER STATIC REGRESSION PASSED")
