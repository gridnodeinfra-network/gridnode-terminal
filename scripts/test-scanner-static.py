from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "index.html").read_text(encoding="utf-8")
source = (ROOT / "js/gridnode-modules.js").read_text(encoding="utf-8")
bundle = (ROOT / "js/gridnode-bundle.js").read_text(encoding="utf-8")

EXPECTED = {
    "core": {"Upper Left", "Upper Right", "Middle Left", "Middle Right", "Lower Left", "Lower Right"},
    "lower": {"Left Thigh Upper", "Right Thigh Upper", "Left Thigh Lower", "Right Thigh Lower", "Left Thigh Outer", "Right Thigh Outer"},
    "upper": {"Left Back Upper Arm Upper", "Right Back Upper Arm Upper", "Left Back Upper Arm Lower", "Right Back Upper Arm Lower"},
}


def attr(tag, name):
    match = re.search(rf'\b{name}="([^"]*)"', tag)
    assert match, f"scanner element missing {name}"
    return match.group(1)


path_tags = re.findall(r"<path\b[^>]*>", html, flags=re.DOTALL)
hits = [tag for tag in path_tags if re.search(r'\bclass="[^"]*\bzone-hit\b', tag)]
observed = {mode: set() for mode in EXPECTED}

for index, hit in enumerate(path_tags):
    if hit not in hits:
        continue
    mode, site = attr(hit, "data-mode"), attr(hit, "data-site")
    assert mode in EXPECTED and site in EXPECTED[mode], f"unexpected scanner zone: {(mode, site)}"
    assert site not in observed[mode], f"duplicate scanner zone: {(mode, site)}"
    observed[mode].add(site)
    assert attr(hit, "d").strip(), f"blank hit geometry: {(mode, site)}"
    assert attr(hit, "pointer-events") == "all"
    assert attr(hit, "role") == "button" and attr(hit, "tabindex") == "0"
    assert attr(hit, "aria-label").strip()
    assert index + 1 < len(path_tags), "hit region must have a visible partner"
    visible = path_tags[index + 1]
    assert "zone-visible" in attr(visible, "class")
    assert attr(visible, "data-mode") == mode and attr(visible, "data-site") == site
    assert attr(visible, "d").strip(), f"blank visible geometry: {(mode, site)}"

assert observed == EXPECTED, f"scanner zone inventory changed: {observed}"

for mode in EXPECTED:
    marker = f'data-view="{mode}"'
    start = html.find(marker)
    assert start >= 0, f"{mode} scanner stage missing"
    next_stages = [position for position in (html.find('data-view="', start + len(marker)), html.find('class="scanner-selected-panel"', start)) if position >= 0]
    end = min(next_stages) if next_stages else len(html)
    stage = html[start:end]
    assert "biotech-asset" in stage and "biotech-zones" in stage, f"{mode} scanner can render blank"

assets = re.findall(r'<img\b[^>]*\bclass="[^"]*\bbiotech-asset\b[^"]*"[^>]*\bsrc="([^"]+)"', html)
assert sorted(assets) == sorted([
    "assets/scanner/core/core-cinematic-no-navel.webp",
    "assets/scanner/legs/legs-cinematic.webp",
    "assets/scanner/arms/arms-cinematic.webp",
])

audio = re.search(r'<button\b[^>]*\bid="gnScannerAudioSwitch"[^>]*>', html)
assert audio and 'role="switch"' in audio.group(0) and 'aria-checked="false"' in audio.group(0)
assert 'data-i18n-aria-label="shots.scannerAudio"' in audio.group(0)

for label, content in (("source", source), ("bundle", bundle)):
    for symbol in (
        "function hitTestScannerZone(",
        "function installScannerPointerHandlers(",
        "function clearScannerTransientState(",
        "function renderScanner()",
    ):
        assert symbol in content, f"{label} missing {symbol}"
    assert 'if (!panel) return;' in content, f"{label} must preserve the static scanner when its status panel is absent"
    assert 'lostpointercapture' in content
    assert "selectScannerLocation(site, { source: 'keyboard'" in content
    assert "selectScannerLocation(site, { source: 'pointer'" in content

print(f"SCANNER STATIC REGRESSION PASSED · {len(hits)} zones · CORE/LEGS/ARMS nonblank")
