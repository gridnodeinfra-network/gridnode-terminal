# Maximum-Precision Cinematic Body Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a maximally precise, responsive, cinematic `CORE / LEGS / ARMS` injection-zone selector using the current scanner compositions, enhanced graphite/Mars Red/Signal Yellow art, zone-clipped interaction effects, and remembered opt-in sound.

**Architecture:** Keep the existing 1024x1024 image plus SVG coordinate model. Move all scanner activation through one controller in `gridnode-modules.js`, keep sound isolated behind `window.GNScannerAudio`, and preserve the existing selected-location persistence path. Build the classic runtime bundle from readable modules, then lock and verify the complete release candidate before deploying a Cloudflare preview.

**Tech Stack:** Static HTML/CSS, SVG hit geometry, classic browser JavaScript, Web Audio API, localStorage, Playwright 1.62.1, Python 3 regression checks, Bash release scripts, Cloudflare Pages.

## Global Constraints

- All project commands run in WSL2 Ubuntu Bash from `/home/thinkpadwinbash/workspaces/gridnode-terminal`.
- Preserve `CORE / LEGS / ARMS`, all 12 persisted location strings, SHOT draft behavior, cloud sync, scanner disclaimer, and medical boundary.
- Preserve each source image's 1024x1024 canvas, crop, silhouette, body position, panel seams, anatomical landmarks, perspective, and negative space.
- Empty scanner space and the CORE navel remain non-selectable.
- Hit regions never overlap and expose at least a 44 CSS pixel effective target where anatomy permits.
- One gesture produces one selection, one lock effect, one haptic sequence, and at most one contact plus one lock sound.
- Scanner sound is off by default, opt-in, remembered on the current device, and begins only after direct user interaction.
- Respect `prefers-reduced-motion`; sound and haptic failures never affect selection.
- Existing untracked `_concept/`, `competitive-intelligence/`, `index.html.bak.pre_v19`, and `js/gridnode-bundle.js.bak.pre_v19` remain untouched.
- Production deployment requires separate explicit Founder approval after preview review.

## File Map

- Modify `index.html`: scanner markup, exact SVG hit geometry, responsive scanner presentation, confirmation rail, sound toggle, and live visual states.
- Modify `js/gridnode-modules.js`: unified pointer/keyboard controller, deterministic hit testing, single feedback path, mode semantics, and sound-toggle bridge.
- Modify `js/gridnode-bundle.js`: generated output only; never hand-edit after the readable modules are reconciled.
- Create `js/gridnode-scanner-audio.js`: remembered opt-in preference and two restrained procedural scanner cues.
- Modify `i18n/en.json` and `i18n/es-419.json`: sound-control and scanner-state labels.
- Create `assets/scanner/core/core-cinematic.webp`, `assets/scanner/legs/legs-cinematic.webp`, and `assets/scanner/arms/arms-cinematic.webp`: approved enhanced images while retaining originals.
- Create `scripts/test-scanner-static.py`: scanner DOM, geometry, asset-reference, and source/runtime invariants.
- Create `scripts/test-scanner-interactions.cjs`: Playwright touch, drag, boundary, keyboard, sound-preference, persistence, viewport, and console checks.
- Create `scripts/run-scanner-tests.sh`: strict Bash server lifecycle for the browser interaction suite.
- Create `scripts/run-release-qa.sh`: strict Bash server lifecycle for the complete release matrix.
- Create `scripts/test-scanner-assets.py`: dimensions and composition-guard metadata checks.
- Modify `sw.js`: cache the audio runtime and cinematic scanner assets under the release cache.
- Modify `js/gridnode-version.js` and release query strings in `index.html`: release identity and cache invalidation.
- Create `01_SOURCE_TRUTH_LOCKED/rc-20260813.1/`: immutable candidate copy and generated `source-metadata.json`.
- Modify `scripts/verify.sh`: point to the new release lock and include scanner-specific checks.

---

### Task 1: Establish Scanner Regression Gates and Source/Bundle Parity

**Files:**
- Create: `scripts/test-scanner-static.py`
- Modify: `scripts/test-mode-switching.py`
- Modify: `js/gridnode-modules.js:486-620,1247-1266`
- Generated later: `js/gridnode-bundle.js`

**Interfaces:**
- Consumes: existing `ZONES`, `ZONE_IDS`, `setScannerMode`, `selectScannerLocation`, and `renderScanner`.
- Produces: readable-source functions `pointerToSvgPoint(svg, clientX, clientY)`, `hitTestScannerZone(svg, clientX, clientY)`, `installScannerPointerHandlers()`, and `clearScannerTransientState()` that later tasks extend.

- [ ] **Step 1: Write the failing static regression test**

Create `scripts/test-scanner-static.py` with assertions that:

```python
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "index.html").read_text(encoding="utf-8")
source = (ROOT / "js/gridnode-modules.js").read_text(encoding="utf-8")

assert html.count('class="zone-path zone-hit"') == 12
assert len(re.findall(r'data-site="[^"]+"', html[html.index('id="shotsRegionScanner"'):])) >= 12
for symbol in (
    "function pointerToSvgPoint(",
    "function hitTestScannerZone(",
    "function installScannerPointerHandlers(",
    "function clearScannerTransientState(",
):
    assert symbol in source, f"readable source missing {symbol}"

assert "event.target.closest('.zone-path')" not in source, "delegated click duplicates pointer activation"
assert "item.setAttribute('aria-selected'" in source
print("SCANNER STATIC REGRESSION PASSED")
```

- [ ] **Step 2: Run the test and verify the source-parity failure**

Run:

```bash
python3 scripts/test-scanner-static.py
```

Expected: FAIL because the pointer engine currently exists only in the deployable bundle and `clearScannerTransientState` is absent from readable source.

- [ ] **Step 3: Reconcile the scanner controller into readable source**

Add the coordinate helpers from the deployed runtime to `js/gridnode-modules.js` immediately after `renderScanner`:

```js
function pointerToSvgPoint(svg, clientX, clientY) {
  const point = typeof DOMPoint === 'function'
    ? new DOMPoint(clientX, clientY)
    : { x: clientX, y: clientY, matrixTransform(matrix) { return { x: clientX * matrix.a + matrix.e, y: clientY * matrix.d + matrix.f }; } };
  const ctm = svg.getScreenCTM();
  return ctm ? point.matrixTransform(ctm.inverse()) : null;
}

function hitTestScannerZone(svg, clientX, clientY) {
  const svgPoint = pointerToSvgPoint(svg, clientX, clientY);
  if (!svgPoint) return null;
  for (const path of svg.querySelectorAll('.zone-hit')) {
    try {
      if (typeof path.isPointInFill === 'function' && path.isPointInFill(svgPoint)) return path;
    } catch (_) {}
  }
  return null;
}
```

Move the full deployed `installScannerPointerHandlers()` function from `js/gridnode-bundle.js:2278` into readable source unchanged for this parity commit; Task 4 replaces its body with the endpoint-validated version. Add:

```js
function clearScannerTransientState() {
  qa('#shotsRegionScanner .zone-path.pressed, #shotsRegionScanner .zone-path.zone-acquiring')
    .forEach(path => path.classList.remove('pressed', 'zone-acquiring'));
}
```

In `setScannerMode`, call `clearScannerTransientState()` before switching stages and set both tab attributes:

```js
item.setAttribute('aria-selected', active ? 'true' : 'false');
item.setAttribute('tabindex', active ? '0' : '-1');
```

Remove scanner activation for `.zone-overlay` and `.zone-path` from the document-level click delegate. Keep only `[data-stable-zone]` there; the pointer controller and key handler own the body map.

- [ ] **Step 4: Run static and existing mode tests**

Run:

```bash
python3 scripts/test-scanner-static.py
python3 scripts/test-mode-switching.py
node --check js/gridnode-modules.js
```

Expected: all pass.

- [ ] **Step 5: Build the bundle and reject unrelated drift**

Run:

```bash
cp js/gridnode-bundle.js /tmp/gridnode-bundle.before-scanner.js
bash scripts/build-bundle.sh
node --check js/gridnode-bundle.js
git diff --stat -- js/gridnode-bundle.js
```

Inspect the diff. It may contain the reconciled scanner controller and generated export-map movement only. If unrelated feature bodies change, restore the pre-build bundle from `/tmp/gridnode-bundle.before-scanner.js`, reconcile the readable modules before continuing, and rerun the build.

- [ ] **Step 6: Commit the regression foundation**

```bash
git add scripts/test-scanner-static.py scripts/test-mode-switching.py js/gridnode-modules.js js/gridnode-bundle.js
git commit -m "test(scanner): establish precision input regression gates"
```

---

### Task 2: Produce and Validate Cinematic Scanner Assets

**Files:**
- Create: `assets/scanner/core/core-cinematic.webp`
- Create: `assets/scanner/legs/legs-cinematic.webp`
- Create: `assets/scanner/arms/arms-cinematic.webp`
- Create: `scripts/test-scanner-assets.py`

**Interfaces:**
- Consumes: original `core.webp`, `legs.webp`, and `arms.webp` as edit targets.
- Produces: three 1024x1024 cinematic WebP assets with unchanged composition for Task 3.

- [ ] **Step 1: Write the failing asset test**

Create `scripts/test-scanner-assets.py`:

```python
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PAIRS = (
    ("core", ROOT / "assets/scanner/core/core.webp", ROOT / "assets/scanner/core/core-cinematic.webp"),
    ("legs", ROOT / "assets/scanner/legs/legs.webp", ROOT / "assets/scanner/legs/legs-cinematic.webp"),
    ("arms", ROOT / "assets/scanner/arms/arms.webp", ROOT / "assets/scanner/arms/arms-cinematic.webp"),
)

for mode, original, cinematic in PAIRS:
    assert original.is_file(), f"missing original {mode}"
    assert cinematic.is_file(), f"missing cinematic {mode}"
    description = subprocess.check_output(["file", "-b", str(cinematic)], text=True)
    assert re.search(r"1024\s*x\s*1024", description), description
    data = cinematic.read_bytes()
    assert data[:4] == b"RIFF" and data[8:12] == b"WEBP", f"invalid WebP {mode}"
    assert cinematic.stat().st_size >= 60_000, f"suspiciously small {mode}"

print("SCANNER ASSET REGRESSION PASSED")
```

- [ ] **Step 2: Run the test and verify missing-asset failure**

```bash
python3 scripts/test-scanner-assets.py
```

Expected: FAIL on `core-cinematic.webp` missing.

- [ ] **Step 3: Edit each original with the built-in image tool**

Use each original as an edit target, one call per mode, with this prompt and the mode-specific subject retained:

```text
Use case: lighting-weather
Asset type: GRID//NODE interactive body-scanner image
Primary request: enhance this exact synthetic graphite body scanner with instrument-grade cinematic lighting.
Lighting/mood: deepen graphite blacks and local contrast; preserve the cyan rim light; add controlled Mars Red reflections along existing armor edges and lower-depth surfaces; add sparse Signal Yellow accents only in existing hardware seams and micro-details.
Constraints: preserve the exact 1024x1024 canvas, crop, silhouette, body position, pose, panel seams, anatomical landmarks, perspective, proportions, and negative space. Change only lighting, material response, color grading, and tiny existing hardware accents. No new body parts, armor panels, seams, objects, text, logos, symbols, UI, medical equipment, skin, gore, background objects, or camera movement. Do not blur or move the selectable anatomy.
Avoid: flat neon wash, bright yellow panels, oversaturated red, bloom covering anatomy, cyberpunk clutter, anatomical drift, crop drift, pose drift, watermark.
```

Save accepted outputs under the exact cinematic filenames above; never overwrite the originals.

- [ ] **Step 4: Inspect every enhanced image against its original**

Open each original and cinematic image at original resolution. Reject any output if the silhouette, crop, major seam intersections, abdomen cross, thigh panel boundaries, shoulder joints, or arm panel boundaries move visibly. Repeat the edit with the single corrective instruction `Preserve geometry exactly; reduce the edit to color grading and edge lighting only.` if needed.

- [ ] **Step 5: Run asset validation**

```bash
python3 scripts/test-scanner-assets.py
```

Expected: PASS for all three files.

- [ ] **Step 6: Commit the cinematic assets**

```bash
git add assets/scanner/core/core-cinematic.webp assets/scanner/legs/legs-cinematic.webp assets/scanner/arms/arms-cinematic.webp scripts/test-scanner-assets.py
git commit -m "feat(scanner): add cinematic body assets"
```

---

### Task 3: Calibrate Non-Overlapping Anatomical Geometry and Responsive Framing

**Files:**
- Modify: `index.html:1186-1665,1950-2055,4414-4525`
- Modify: `scripts/test-scanner-static.py`

**Interfaces:**
- Consumes: cinematic assets from Task 2 and the SVG coordinate conversion from Task 1.
- Produces: exact `data-zone-bounds` geometry and visible contours used by the controller and interaction tests.

- [ ] **Step 1: Extend the failing static geometry test**

Add to `scripts/test-scanner-static.py`:

```python
expected = {
    "core": {
        "Left Abdomen — Upper": (220, 450, 480, 570),
        "Left Abdomen — Lower": (220, 590, 480, 810),
        "Right Abdomen — Upper": (520, 450, 780, 570),
        "Right Abdomen — Lower": (520, 590, 780, 810),
    },
    "lower": {
        "Left Thigh — Upper": (165, 365, 485, 650),
        "Left Thigh — Lower": (175, 670, 470, 900),
        "Right Thigh — Upper": (515, 365, 835, 650),
        "Right Thigh — Lower": (530, 670, 825, 900),
    },
    "upper": {
        "Left Back Upper Arm — Upper": (70, 325, 245, 485),
        "Left Back Upper Arm — Lower": (55, 500, 225, 675),
        "Right Back Upper Arm — Upper": (755, 325, 930, 485),
        "Right Back Upper Arm — Lower": (775, 500, 945, 675),
    },
}

for mode, zones in expected.items():
    for label, bounds in zones.items():
        encoded = ",".join(map(str, bounds))
        pattern = rf'data-mode="{mode}"[^>]*data-site="{re.escape(label)}"[^>]*data-zone-bounds="{encoded}"'
        assert re.search(pattern, html), f"missing calibrated bounds {mode} {label}"

for mode, zones in expected.items():
    rectangles = list(zones.items())
    for index, (a_name, (ax1, ay1, ax2, ay2)) in enumerate(rectangles):
        for b_name, (bx1, by1, bx2, by2) in rectangles[index + 1:]:
            overlap = max(ax1, bx1) < min(ax2, bx2) and max(ay1, by1) < min(ay2, by2)
            assert not overlap, f"overlap in {mode}: {a_name} / {b_name}"
```

- [ ] **Step 2: Run the test and verify it fails on old geometry**

```bash
python3 scripts/test-scanner-static.py
```

Expected: FAIL because `data-zone-bounds` is absent.

- [ ] **Step 3: Update scanner assets and paths**

Point the three `.biotech-asset` elements to the cinematic filenames. Add `data-zone-bounds="x1,y1,x2,y2"` to each `.zone-hit` using the exact table above, and update each rectangular `d` attribute to `M x1,y1 L x2,y1 L x2,y2 L x1,y2 Z`.

Keep the visible contour as a separate following path, inset 10 SVG units from the hit bounds. Preserve the CORE excluded center circle and ensure it has `pointer-events="none"`.

- [ ] **Step 4: Consolidate scanner CSS into one final override block**

Add one final `<style id="scanner-precision-cinematic-v1">` immediately before the closing `</head>` or existing final scanner style block. Scope every rule under `#shotsRegionScanner`. Define:

```css
#shotsRegionScanner .biotech-stage {
  aspect-ratio: 1;
  touch-action: pan-y pinch-zoom;
  contain: layout paint;
}
#shotsRegionScanner .biotech-asset,
#shotsRegionScanner .biotech-zones { inset: 0; width: 100%; height: 100%; }
#shotsRegionScanner .zone-hit { pointer-events: all; }
#shotsRegionScanner .scanner-selected-panel { scroll-margin-bottom: calc(92px + var(--safe-bottom)); }
@media (max-width: 430px) {
  #shotsRegionScanner { padding: 12px; }
  #shotsRegionScanner .site-scanner { padding: 9px; border-radius: 16px; }
  #shotsRegionScanner .biotech-scanner { margin-top: 10px; }
  #pageLog { padding-bottom: calc(104px + var(--safe-bottom)); }
}
```

Do not alter older global styles outside the scanner; the final scoped block is the launch authority.

- [ ] **Step 5: Run geometry and syntax checks**

```bash
python3 scripts/test-scanner-static.py
python3 scripts/test-mode-switching.py
```

Expected: PASS.

- [ ] **Step 6: Commit geometry and framing**

```bash
git add index.html scripts/test-scanner-static.py
git commit -m "feat(scanner): calibrate anatomical zone geometry"
```

---

### Task 4: Implement the Single-Activation Precision Controller

**Files:**
- Modify: `js/gridnode-modules.js:500-620, after renderScanner, initModules`
- Create: `scripts/test-scanner-interactions.cjs`
- Create: `scripts/run-scanner-tests.sh`
- Generated: `js/gridnode-bundle.js`

**Interfaces:**
- Consumes: `data-zone-bounds`, `selectScannerLocation(label, options)`, and `window.GNScannerAudio` when available.
- Produces: deterministic pointer behavior with exactly one commit and `selectScannerLocation(label, { source, feedback })`.

- [ ] **Step 1: Write the failing Playwright interaction test**

Create `scripts/test-scanner-interactions.cjs` using the bootstrap pattern from `scripts/test-production-candidate.cjs`. For each viewport `[360,800]`, `[390,844]`, `[412,915]`, `[430,932]`, create a mobile touch context, seed a local session, open `Log`, and assert:

```js
const modes = [
  ['core', 'CORE'],
  ['lower', 'LEGS'],
  ['upper', 'ARMS'],
];

for (const [mode, label] of modes) {
  await page.locator(`.scanner-mode-btn[data-mode="${mode}"]`).click();
  await page.locator(`.biotech-stage[data-view="${mode}"]`).waitFor({ state: 'visible' });
  const zones = page.locator(`.biotech-stage[data-view="${mode}"] .zone-hit`);
  if (await zones.count() !== 4) throw new Error(`${label} must expose four zones`);
  for (let index = 0; index < 4; index += 1) {
    const zone = zones.nth(index);
    const expected = await zone.getAttribute('data-site');
    const box = await zone.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const raw = await page.evaluate(() => window.GNModules.moduleState?.selectedLocation || '');
    if (raw !== expected) throw new Error(`center tap resolved ${raw}, expected ${expected}`);
  }
}
```

Instrument `selectScannerLocation` in-page to count calls, then verify one center tap increments the count by exactly one. Add a vertical drag of 48 CSS pixels beginning in a zone and assert the count does not change. Tap the CORE navel and stage corners and assert no change. Dispatch Enter and Space to focused zone paths and assert one selection each.

- [ ] **Step 2: Run the test and verify duplicate/drag failures**

Create `scripts/run-scanner-tests.sh`:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${GRIDNODE_SCANNER_TEST_PORT:-4173}"
LOG_PATH="/tmp/gridnode-scanner-server-${PORT}.log"

command -v python3 >/dev/null 2>&1 || { printf 'ERROR: python3 is required\n' >&2; exit 1; }
command -v node >/dev/null 2>&1 || { printf 'ERROR: node is required\n' >&2; exit 1; }

cd "$REPO_ROOT"
python3 -m http.server "$PORT" --bind 127.0.0.1 >"$LOG_PATH" 2>&1 &
SCANNER_SERVER_PID=$!
cleanup() { kill "$SCANNER_SERVER_PID" 2>/dev/null || true; wait "$SCANNER_SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

node scripts/test-scanner-interactions.cjs "http://127.0.0.1:${PORT}"
printf 'SCANNER INTERACTION REGRESSION PASSED\n'
```

Run:

```bash
bash scripts/run-scanner-tests.sh
```

Expected: FAIL on duplicate selection or missing source-level controller behavior before implementation.

- [ ] **Step 3: Replace the controller with endpoint-validated activation**

Use one state object per active SVG:

```js
const scannerPointerState = new WeakMap();
const SCANNER_DRAG_THRESHOLD_PX = 10;

function sameScannerZoneAt(svg, zone, clientX, clientY) {
  return Boolean(zone && hitTestScannerZone(svg, clientX, clientY) === zone);
}
```

On `pointerdown`, resolve the candidate, record `pointerId/startX/startY/zone`, add `.pressed`, call `window.GNScannerAudio?.playContact()` once, and capture the pointer only when a zone exists. On `pointermove`, cancel after 10 CSS pixels and clear `.pressed`. On `pointerup`, resolve the endpoint again and commit only when it remains in the original zone. On `pointercancel` and `lostpointercapture`, clear state without committing.

Do not call `preventDefault` on vertical movement; keep listeners passive so page scrolling remains native. Do not use nearest-zone fallback.

- [ ] **Step 4: Centralize commit feedback**

Change the signature to:

```js
export function selectScannerLocation(label, options = {}) {
  const { source = 'programmatic', feedback = source !== 'programmatic' } = options;
  // existing persistence and render logic
  if (feedback) {
    window.GNScannerAudio?.playLock();
    if (navigator.vibrate) {
      try { navigator.vibrate([4, 12, 6]); } catch (_) {}
    }
  }
}
```

Pointer, keyboard, and stable buttons pass `{ source: 'body' }`, `{ source: 'keyboard' }`, and `{ source: 'fallback' }` respectively. Remove all other scanner vibration calls.

- [ ] **Step 5: Build and run interaction tests**

```bash
bash scripts/build-bundle.sh
node --check js/gridnode-bundle.js
python3 scripts/test-scanner-static.py
bash scripts/run-scanner-tests.sh
```

Expected: all center, empty-space, drag, boundary, keyboard, and single-commit assertions pass.

- [ ] **Step 6: Commit the precision controller**

```bash
git add js/gridnode-modules.js js/gridnode-bundle.js scripts/test-scanner-interactions.cjs scripts/run-scanner-tests.sh
git commit -m "feat(scanner): unify precision zone activation"
```

---

### Task 5: Add Zone-Clipped Cinematic Effects and the Confirmation Rail

**Files:**
- Modify: `index.html:scanner CSS and scanner-selected-panel markup`
- Modify: `js/gridnode-modules.js:selectScannerLocation,renderScanner`
- Modify: `scripts/test-scanner-interactions.cjs`

**Interfaces:**
- Consumes: `.pressed`, `.zone-acquiring`, `.selected`, `.last`, `.recent`, and `.is-dim` states.
- Produces: visual state contract `ready -> pressed -> acquiring -> selected` and one persistent `LOCATION//LOCKED` rail.

- [ ] **Step 1: Add failing visual-state assertions**

Extend the Playwright test:

```js
await page.locator('.biotech-stage:not([hidden]) .zone-hit').first().dispatchEvent('pointerdown', {
  pointerId: 91, pointerType: 'touch', isPrimary: true, clientX: centerX, clientY: centerY
});
if (!await page.locator('.biotech-stage:not([hidden]) .zone-hit').first().evaluate(node => node.classList.contains('pressed'))) {
  throw new Error('zone must paint pressed state in the pointerdown frame');
}
```

After commit, assert one selected path, three dim siblings, `.gn-location-lock.is-on`, correct locked label, and no second live region inside the panel.

- [ ] **Step 2: Run the test and verify the state-contract failure**

```bash
bash scripts/run-scanner-tests.sh
```

Expected: FAIL on the new immediate-state or unique-live-region assertion.

- [ ] **Step 3: Implement the visual state system**

In the final scoped scanner CSS, tune:

```css
#shotsRegionScanner .zone-hit + .zone-visible {
  fill: rgba(0, 212, 255, .035);
  stroke: rgba(88, 232, 248, .62);
  stroke-width: 2.2;
  vector-effect: non-scaling-stroke;
  transition: fill 120ms cubic-bezier(.2,.8,.2,1), stroke 120ms ease, opacity 160ms ease, filter 160ms ease;
}
#shotsRegionScanner .zone-hit.pressed + .zone-visible {
  fill: rgba(252, 238, 10, .16);
  stroke: #fcee0a;
  stroke-width: 3.4;
  filter: drop-shadow(0 0 8px rgba(252,238,10,.58));
}
#shotsRegionScanner .zone-hit.zone-acquiring + .zone-visible {
  stroke-dasharray: 18 8;
  animation: gnScannerTrace 260ms cubic-bezier(.2,.8,.2,1) 1;
}
#shotsRegionScanner .zone-hit.selected + .zone-visible {
  fill: rgba(234, 9, 23, .20);
  stroke: #ea0917;
  stroke-width: 3.2;
  filter: drop-shadow(0 0 10px rgba(234,9,23,.52));
}
#shotsRegionScanner .zone-hit.is-dim + .zone-visible { opacity: .3; filter: none; }
@keyframes gnScannerTrace {
  from { stroke-dashoffset: 52; }
  to { stroke-dashoffset: 0; }
}
@media (prefers-reduced-motion: reduce) {
  #shotsRegionScanner .zone-visible { animation: none !important; transition: none !important; }
}
```

Use the existing stage scanline only on mode change. Do not add continuous ambient animation.

- [ ] **Step 4: Make the selected panel the single confirmation rail**

Give `.scanner-selected-panel` `role="status" aria-live="polite" aria-atomic="true"`. Keep one `.gn-location-lock`, place it first, and remove live-region attributes from dynamically nested elements. Ready state shows `TAP A HIGHLIGHTED ZONE`; locked state shows `LOCATION//LOCKED` and the exact location. Keep the stable fallback zone buttons below the rail.

- [ ] **Step 5: Run visual-state and reduced-motion tests**

```bash
bash scripts/build-bundle.sh
bash scripts/run-scanner-tests.sh
```

Expected: PASS in normal and reduced-motion contexts.

- [ ] **Step 6: Commit effects and confirmation**

```bash
git add index.html js/gridnode-modules.js js/gridnode-bundle.js scripts/test-scanner-interactions.cjs
git commit -m "feat(scanner): add cinematic lock feedback"
```

---

### Task 6: Implement Remembered Opt-In Scanner Sound

**Files:**
- Create: `js/gridnode-scanner-audio.js`
- Modify: `index.html:scanner header and script list`
- Modify: `js/gridnode-modules.js:toggleSound and feedback calls`
- Modify: `i18n/en.json`
- Modify: `i18n/es-419.json`
- Modify: `scripts/test-scanner-interactions.cjs`

**Interfaces:**
- Produces global `window.GNScannerAudio` with `isEnabled(): boolean`, `setEnabled(value: boolean): boolean`, `toggle(): boolean`, `playContact(): void`, `playLock(): void`, and `syncControl(): void`.
- Consumes direct scanner gestures and `#scannerSoundToggle`.

- [ ] **Step 1: Write failing sound-preference tests**

Extend the Playwright test to assert:

```js
await page.evaluate(() => localStorage.removeItem('gn_scanner_sound_v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
if (await page.evaluate(() => window.GNScannerAudio.isEnabled())) throw new Error('scanner sound must default off');

await page.locator('#scannerSoundToggle').click();
if (!await page.evaluate(() => localStorage.getItem('gn_scanner_sound_v1') === '1')) throw new Error('opt-in must persist');
await page.reload({ waitUntil: 'domcontentloaded' });
if (!await page.evaluate(() => window.GNScannerAudio.isEnabled())) throw new Error('sound preference must restore');

await page.locator('#scannerSoundToggle').click();
if (await page.evaluate(() => localStorage.getItem('gn_scanner_sound_v1') !== '0')) throw new Error('opt-out must persist');
```

Stub `playContact` and `playLock` counters, perform one body tap, and assert exactly one call to each while enabled and zero while disabled.

- [ ] **Step 2: Run and verify the missing-audio-module failure**

```bash
bash scripts/run-scanner-tests.sh
```

Expected: FAIL because `window.GNScannerAudio` and the toggle do not exist.

- [ ] **Step 3: Implement the isolated audio module**

Create `js/gridnode-scanner-audio.js` as an IIFE. Use storage key `gn_scanner_sound_v1`. Create the `AudioContext` lazily inside `playContact`, `playLock`, or a toggle click. Generate short mono buffers once per sample rate:

```js
function contactSample(time, noise) {
  return noise * Math.exp(-time * 180) * 0.045;
}

function lockSample(time, noise) {
  const frequency = 96 - (24 * Math.min(1, time / 0.12));
  const body = Math.sin(2 * Math.PI * frequency * time) * Math.exp(-time * 28) * 0.032;
  const texture = noise * Math.exp(-time * 75) * 0.008;
  return body + texture;
}
```

Contact duration is 28ms. Lock duration is 120ms. Route contact through a 2200Hz band-pass filter and lock through a 320Hz low-pass filter. Apply a master gain of `0.45` to the already-low sample levels. Do not create looping sources or autoplay.

- [ ] **Step 4: Add and localize the scanner sound toggle**

Add a compact button in `.shots-scanner-head`:

```html
<button class="scanner-sound-toggle" id="scannerSoundToggle" type="button" aria-pressed="false" onclick="toggleSound()">
  <span data-i18n="shots.scannerAudio">SCANNER AUDIO</span>
  <b data-scanner-sound-state>OFF</b>
</button>
```

Add translation keys:

```json
"shots.scannerAudio": "SCANNER AUDIO",
"shots.soundOn": "ON",
"shots.soundOff": "OFF"
```

and Spanish equivalents `AUDIO DEL ESCÁNER`, `ACTIVO`, and `APAGADO`.

Change `toggleSound` to return `window.GNScannerAudio?.toggle() ?? false`, and call `syncControl()` after translations initialize and after every toggle.

- [ ] **Step 5: Load the audio module before the bundle and run tests**

Add `<script src="./js/gridnode-scanner-audio.js?v=20260813.1" defer></script>` before `gridnode-bundle.js`. Run:

```bash
node --check js/gridnode-scanner-audio.js
bash scripts/build-bundle.sh
bash scripts/run-scanner-tests.sh
```

Expected: sound defaults off, persists both choices, and fires once per enabled scanner gesture.

- [ ] **Step 6: Commit sound and preference behavior**

```bash
git add js/gridnode-scanner-audio.js index.html js/gridnode-modules.js js/gridnode-bundle.js i18n/en.json i18n/es-419.json scripts/test-scanner-interactions.cjs
git commit -m "feat(scanner): add remembered opt-in sound"
```

---

### Task 7: Release Identity, Offline Cache, Full QA, and Preview Deployment

**Files:**
- Modify: `js/gridnode-version.js`
- Modify: `index.html` release query strings
- Modify: `sw.js`
- Modify: `scripts/verify.sh`
- Create: `scripts/run-release-qa.sh`
- Create: `01_SOURCE_TRUTH_LOCKED/rc-20260813.1/**`
- Modify: `01_SOURCE_TRUTH_LOCKED/rc-20260813.1/source-metadata.json`

**Interfaces:**
- Consumes: all scanner implementation and tests.
- Produces: verified `0.15.20 / 20260813.1` candidate and Cloudflare preview URL.

- [ ] **Step 1: Bump the candidate release**

Set semver `0.15.20`, release `20260813.1`, cache name `gridnode-shell-20260813.1`, and every scanner-relevant script query string to `v=20260813.1`. Add these entries to `sw.js` `SHELL`:

```js
'/js/gridnode-scanner-audio.js' + V,
'/assets/scanner/core/core-cinematic.webp',
'/assets/scanner/legs/legs-cinematic.webp',
'/assets/scanner/arms/arms-cinematic.webp'
```

Remove obsolete skin-tone scanner assets from `SHELL` only after confirming they are not referenced by `index.html` or runtime code.

- [ ] **Step 2: Run focused scanner verification**

```bash
python3 scripts/test-scanner-assets.py
python3 scripts/test-scanner-static.py
python3 scripts/test-mode-switching.py
node --check js/gridnode-scanner-audio.js
node --check js/gridnode-bundle.js
bash scripts/run-scanner-tests.sh
```

Expected: all pass with no page errors.

- [ ] **Step 3: Run the full mobile and theme matrix**

Create `scripts/run-release-qa.sh`:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${GRIDNODE_RELEASE_QA_PORT:-4173}"
LOG_PATH="/tmp/gridnode-release-qa-${PORT}.log"

for command_name in node npm python3; do
  command -v "$command_name" >/dev/null 2>&1 || { printf 'ERROR: missing command: %s\n' "$command_name" >&2; exit 1; }
done

cd "$REPO_ROOT"
python3 -m http.server "$PORT" --bind 127.0.0.1 >"$LOG_PATH" 2>&1 &
RELEASE_QA_SERVER_PID=$!
cleanup() { kill "$RELEASE_QA_SERVER_PID" 2>/dev/null || true; wait "$RELEASE_QA_SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

BASE_URL="http://127.0.0.1:${PORT}"
node scripts/test-scanner-interactions.cjs "$BASE_URL"
npm run test:mobile -- "$BASE_URL"
npm run audit:themes -- "$BASE_URL"
node scripts/test-production-candidate.cjs "$BASE_URL" 20260813.1 0.15.20
printf 'FULL RELEASE QA PASSED\n'
```

Run:

```bash
bash scripts/run-release-qa.sh
```

Expected: all existing product checks pass; no horizontal overflow, blank scanner, 0x0 visual, or console error.

- [ ] **Step 4: Perform matched visual QA in the in-app browser**

Capture NIGHT GRID and DAY OPS scanner screenshots at 360x800, 390x844, 412x915, 430x932, and 1280x720 for ready and locked states. Compare against the current preview at the same viewport and state. Confirm:

- Cinematic images retain exact framing and landmarks.
- Every visible contour aligns with its anatomy.
- Press feedback appears immediately.
- Locked state remains readable without obscuring anatomy.
- Confirmation rail and all zones clear the bottom navigation.
- No cropped body, overflow, misaligned border, or unreadable light-theme state.

- [ ] **Step 5: Create the immutable source lock**

Copy the release file set into `01_SOURCE_TRUTH_LOCKED/rc-20260813.1` without modifying older locks. Generate `source-metadata.json` with exact byte counts and SHA-256 hashes for every locked file. Update `scripts/verify.sh` to use:

```bash
LOCKED_ROOT="$REPO_ROOT/01_SOURCE_TRUTH_LOCKED/rc-20260813.1"
```

Add calls to the three scanner tests before the locked-artifact checks.

- [ ] **Step 6: Run deterministic build and repository verification**

```bash
bash scripts/build-bundle.sh
bash scripts/verify.sh
git diff --check
git status --short
```

Expected: `VERIFICATION PASSED`; the only untracked files are the four pre-existing user-owned paths listed in Global Constraints.

- [ ] **Step 7: Commit the release candidate**

```bash
git add index.html sw.js js/gridnode-version.js scripts/verify.sh scripts/run-release-qa.sh 01_SOURCE_TRUTH_LOCKED/rc-20260813.1
git commit -m "release(rc): 0.15.20 precision cinematic scanner"
```

- [ ] **Step 8: Stage and deploy a Cloudflare preview**

```bash
bash scripts/stage-deploy.sh
bash scripts/deploy-preview.sh
```

Open the returned preview URL and rerun the scanner interaction smoke test plus console inspection against HTTPS. Do not deploy production in this task.

- [ ] **Step 9: Report the preview gate**

Report the Bash commands run, files changed, test outputs, preview URL, screenshots captured, unresolved blockers, and the exact production command that remains gated. Request explicit Founder approval before running:

```bash
GRIDNODE_STAGING_NAME=gridnode-production bash scripts/stage-deploy.sh
GRIDNODE_FOUNDER_APPROVAL=YES bash scripts/deploy-production.sh --confirm-production
```
