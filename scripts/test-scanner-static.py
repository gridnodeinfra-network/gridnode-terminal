from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "index.html").read_text(encoding="utf-8")
source = (ROOT / "js/gridnode-modules.js").read_text(encoding="utf-8")
bundle = (ROOT / "js/gridnode-bundle.js").read_text(encoding="utf-8")

assert html.count('class="zone-path zone-hit"') == 12
assert len(re.findall(r'data-site="[^"]+"', html[html.index('id="shotsRegionScanner"'):])) >= 12
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
print("SCANNER STATIC REGRESSION PASSED")
