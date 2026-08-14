# GRID//NODE v2.0 Brand Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faithfully derive the locked GRID//NODE v2.0 asset system from the approved board, replace every shipped legacy identity surface, remove erroneous VEKTOR residue, and produce preview-ready fidelity proof without redesigning unrelated product flows.

**Architecture:** A deterministic build-only tracing pipeline extracts color masks and angular contours from the approved raster board into one normalized core geometry and one normalized wordmark geometry. Every master, icon, maskable icon, lockup, and UI derivative is generated from those masters, then the app references the new files through one token and path authority. Asset fidelity, small-size legibility, canonical naming, runtime references, and same-state screenshots are separate blocking gates.

**Tech Stack:** Python 3 with Pillow plus an isolated build-only OpenCV tracer; SVG 1.1; PNG exports; existing static HTML/CSS/JavaScript PWA; Playwright browser verification; existing Python and shell regression runners.

## Global Constraints

- The only visual source is `assets/brand/source/GRIDNODE-BRAND-SYSTEM-v2-APPROVED.png`, SHA-256 `c28b3e8c37867be291a281be94cfe5abfa50504526ef6fcef63e1495d03aab0f`.
- Canonical product name is exactly `GRID//NODE` with no spaces.
- The approved angular GN silhouette and `//` operator geometry may not be redrawn from memory, prompted through an image model, smoothed, simplified into a different silhouette, reinterpreted, or “improved.”
- Mars Red is `#EA0917`; Cyber Cyan is `#06BBE3`; Signal Yellow is `#FCEE0A` and remains a tiny accent only; Black Mars is `#050708`; Deep Navy is `#0A0F14`; Steel Gray is `#8A949E`.
- NIGHT GRID may use restrained surrounding signal treatment. DAY OPS uses the same silhouette with flat rendering and little or no glow.
- `VEKTOR` is erroneous residue only. It was never an old brand, product, module, character, codename, retired system, or migration. No compatibility, redirect, legacy, or rebrand story may be added.
- The broad protected bundle rebuild remains prohibited. Any readable-source/runtime fallback edits must be mirrored narrowly.
- Brand rollout must preserve the calibrated scanner geometry, scanner interaction ownership, audio contract, all existing health-data behavior, and unrelated product flows.
- Production deployment is prohibited. Preview deployment follows full release QA; production requires a separate explicit Founder approval.

---

### Task 1: Brand asset contract and failing gates

**Files:**
- Create: `assets/brand/source/GRIDNODE-BRAND-SYSTEM-v2-APPROVED.png`
- Create: `scripts/test-brand-assets.py`
- Create: `scripts/run-brand-asset-tests.sh`
- Create: `scripts/brand-reference-contract.json`
- Test: `scripts/test-brand-assets.py`

**Interfaces:**
- Consumes: the approved package board and the locked global constraints above.
- Produces: an executable contract for `scripts/build-brand-assets.py`, `assets/brand/brand-manifest.json`, six master SVGs, seven icon exports, five UI derivatives, and fidelity proof files.

- [ ] **Step 1: Copy and fingerprint the immutable source board**

Copy the package board byte-for-byte to `assets/brand/source/GRIDNODE-BRAND-SYSTEM-v2-APPROVED.png`. In `scripts/brand-reference-contract.json`, record the exact lowercase SHA-256, `1536x1024` dimensions, locked colors, canonical name, required output paths, and the reference crops below:

```json
{
  "source_sha256": "c28b3e8c37867be291a281be94cfe5abfa50504526ef6fcef63e1495d03aab0f",
  "source_size": [1536, 1024],
  "core_crop": [540, 60, 900, 360],
  "signature_crop": [500, 420, 705, 565],
  "wordmark_crop": [1090, 285, 1490, 355],
  "colors": ["#EA0917", "#06BBE3", "#FCEE0A", "#050708", "#0A0F14", "#8A949E", "#FFFFFF", "#000000"]
}
```

- [ ] **Step 2: Write the failing asset-contract test**

`scripts/test-brand-assets.py` must use `unittest`, `hashlib`, `json`, `xml.etree.ElementTree`, and Pillow to assert observable artifacts:

```python
def test_source_board_is_byte_exact(self):
    self.assertEqual(sha256(SOURCE), CONTRACT["source_sha256"])
    with Image.open(SOURCE) as image:
        self.assertEqual(image.size, tuple(CONTRACT["source_size"]))

def test_required_assets_exist_and_decode(self):
    for path in CONTRACT["required_svg"]:
        self.assertTrue(path.exists(), path)
        self.assertEqual(ET.parse(path).getroot().tag.rsplit("}", 1)[-1], "svg")
    for path, expected_size in CONTRACT["required_png"].items():
        with Image.open(path) as image:
            self.assertEqual(image.size, tuple(expected_size))
            image.verify()

def test_vectors_are_real_flat_geometry(self):
    for path in CONTRACT["required_svg"]:
        root = ET.parse(path).getroot()
        tags = {element.tag.rsplit("}", 1)[-1] for element in root.iter()}
        self.assertFalse(tags & {"image", "text", "foreignObject"}, path)
        self.assertTrue(tags & {"path", "polygon"}, path)

def test_manifest_proves_single_master_derivation(self):
    manifest = json.loads(MANIFEST.read_text())
    self.assertEqual(manifest["source_sha256"], CONTRACT["source_sha256"])
    self.assertEqual(manifest["canonical_name"], "GRID//NODE")
    self.assertEqual(len({item["core_geometry_sha256"] for item in manifest["outputs"] if item["uses_core"]}), 1)
```

- [ ] **Step 3: Add color, safe-zone, and fidelity gates**

The same test must reject unapproved fills/strokes, `<filter>` in core/small assets, an embedded raster, missing `data-gn-master-hash`, or a maskable nontransparent mark pixel outside the centered 80% safe circle. It must compare rendered proof masks against the board crops with color-class silhouette IoU floors of `0.96` for the large core, `0.94` for the wordmark, `0.90` at 32px, and `0.84` at 16px. Expectations come from `scripts/brand-reference-contract.json`, never from the implementation under test.

- [ ] **Step 4: Verify RED**

Run:

```bash
python3 scripts/test-brand-assets.py
```

Expected: FAIL because `assets/brand/brand-manifest.json`, the master vectors, exports, and fidelity proofs do not exist. The byte-exact source-board test must PASS.

- [ ] **Step 5: Commit the RED gate**

```bash
git add assets/brand/source/GRIDNODE-BRAND-SYSTEM-v2-APPROVED.png scripts/test-brand-assets.py scripts/run-brand-asset-tests.sh scripts/brand-reference-contract.json
git commit -m "test(brand): establish locked asset contract"
```

---

### Task 2: Deterministic master geometry and fidelity proof

**Files:**
- Create: `scripts/build-brand-assets.py`
- Create: `assets/brand/brand-manifest.json`
- Create: `assets/brand/master/gridnode-core-mark.svg`
- Create: `assets/brand/master/gridnode-wordmark.svg`
- Create: `assets/brand/master/gridnode-lockup-horizontal.svg`
- Create: `assets/brand/master/gridnode-lockup-stacked.svg`
- Create: `assets/brand/master/gridnode-core-mark-mono-white.svg`
- Create: `assets/brand/master/gridnode-core-mark-mono-black.svg`
- Create: `assets/brand/proof/core-reference.png`
- Create: `assets/brand/proof/core-render.png`
- Create: `assets/brand/proof/core-difference.png`
- Create: `assets/brand/proof/wordmark-reference.png`
- Create: `assets/brand/proof/wordmark-render.png`
- Create: `assets/brand/proof/wordmark-difference.png`
- Test: `scripts/test-brand-assets.py`

**Interfaces:**
- Consumes: `scripts/brand-reference-contract.json` and the immutable source board.
- Produces: normalized `core_geometry` and `wordmark_geometry` path arrays plus stable hashes recorded in `assets/brand/brand-manifest.json`; Task 3 may only compose or rasterize these arrays.

- [ ] **Step 1: Install the build-only tracer in an isolated temporary environment**

Use pinned `opencv-python-headless==4.12.0.88` only for asset generation. Install it under a temporary task directory, never import it from shipped runtime code, and record the version in the manifest. Pillow remains the decoder/export dependency.

- [ ] **Step 2: Implement deterministic color-mask extraction**

`scripts/build-brand-assets.py` must validate the source SHA before reading pixels, crop only the contract rectangles, convert pixels to HSV, classify Mars Red/Cyber Cyan/Signal Yellow/white by fixed thresholds stored as named constants, apply one fixed `3x3` close/open pass, and keep only connected components whose area and crop position match the contract. Never manually type logo path coordinates.

- [ ] **Step 3: Trace angular contours and normalize geometry**

For every retained component, call `cv2.findContours(..., cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)` and `cv2.approxPolyDP` with a fixed epsilon of `0.0015 * perimeter`. Preserve holes. Normalize the union bounding box to a `1000x1000` core coordinate system and the wordmark bounding box to a `4000x700` system. Round coordinates to three decimals, sort components by color then centroid, serialize canonical JSON, and hash it. A build repeated twice must produce byte-identical SVGs and hashes.

- [ ] **Step 4: Build flat master SVGs from traced geometry**

Each master must include `role="img"`, a `<title>`, `data-gn-source-sha256`, and `data-gn-master-hash`. Core color, mono white, and mono black masters reuse exactly the same core path `d` values. Horizontal and stacked lockups compose the same core and wordmark paths using transforms only; they may not duplicate or alter path geometry.

- [ ] **Step 5: Render and compute fidelity proof**

The build script must create reference masks from the locked board crops and renderer-ready proof HTML for Chromium. A companion Playwright capture in `scripts/run-brand-asset-tests.sh` rasterizes the SVG masters at the same pixel bounds; the Python test creates absolute difference overlays and computes per-color intersection-over-union. Comparison uses the same crop, background, scale, and state.

- [ ] **Step 6: Verify GREEN and determinism**

Run:

```bash
bash scripts/run-brand-asset-tests.sh
cp -R assets/brand /tmp/gridnode-brand-first
python3 scripts/build-brand-assets.py
diff -ru /tmp/gridnode-brand-first assets/brand
```

Expected: all asset tests PASS; the rebuild diff is empty; large core IoU is at least `0.96`; wordmark IoU is at least `0.94`.

- [ ] **Step 7: Commit the master system**

```bash
git add scripts/build-brand-assets.py scripts/run-brand-asset-tests.sh assets/brand
git commit -m "feat(brand): derive locked GRIDNODE masters"
```

---

### Task 3: Icon, maskable, and UI derivatives from one master

**Files:**
- Modify: `scripts/build-brand-assets.py`
- Modify: `scripts/test-brand-assets.py`
- Modify: `assets/brand/brand-manifest.json`
- Create: `assets/brand/icons/favicon.svg`
- Create: `assets/brand/icons/favicon-16.png`
- Create: `assets/brand/icons/favicon-32.png`
- Create: `assets/brand/icons/apple-touch-icon.png`
- Create: `assets/brand/icons/pwa-192.png`
- Create: `assets/brand/icons/pwa-512.png`
- Create: `assets/brand/icons/pwa-maskable-512.png`
- Create: `assets/brand/ui/header-lockup.svg`
- Create: `assets/brand/ui/boot-mark.svg`
- Create: `assets/brand/ui/scanner-badge.svg`
- Create: `assets/brand/ui/update-badge.svg`
- Create: `assets/brand/ui/watermark.svg`
- Create: `assets/brand/proof/small-size-contact-sheet.png`
- Create: `assets/brand/proof/maskable-safe-zone.png`
- Test: `scripts/test-brand-assets.py`

**Interfaces:**
- Consumes: Task 2 `core_geometry_sha256` and `wordmark_geometry_sha256`.
- Produces: runtime-ready icons and UI derivatives whose manifests point to those same hashes.

- [ ] **Step 1: Extend RED tests for every export size and alpha contract**

Add literal expected dimensions: favicon 16 and 32; Apple touch 180; PWA 192 and 512; maskable 512. Require transparent standard icons, Black Mars maskable background, no glow/filter below 64px, and at least one visible pixel in every required identity color after rasterization where color use is applicable.

- [ ] **Step 2: Generate derivatives without new geometry**

Extend `scripts/build-brand-assets.py` to instantiate the Task 2 paths only. Standard icons use flat color on transparent background with clear space equal to the traced central operator width. The maskable icon uses Black Mars edge-to-edge and scales the mark so every important pixel lies within the centered radius-40% safe circle. UI derivatives add only surrounding presentation elements allowed by the handoff; their embedded core/wordmark path data remains hash-identical.

- [ ] **Step 3: Build small-size and safe-zone proof**

Create one contact sheet showing 16, 24, 32, 48, 64, 192, and 512px renders on Black Mars and white. Overlay the maskable safe circle on a separate proof. Tests must assert nonempty red/cyan silhouette at every size, minimum IoU `0.90` at 32px and `0.84` at 16px, and zero important pixels outside the safe circle.

- [ ] **Step 4: Verify and commit**

```bash
bash scripts/run-brand-asset-tests.sh
git diff --check
git add scripts/build-brand-assets.py scripts/test-brand-assets.py assets/brand
git commit -m "feat(brand): export icon and UI derivatives"
```

Expected: all tests PASS and independent same-size visual review approves the contact sheet and safe-zone proof.

---

### Task 4: Shipped identity rollout and VEKTOR correction

**Files:**
- Create: `scripts/test-brand-rollout.py`
- Create: `scripts/test-brand-visual.cjs`
- Create: `scripts/run-brand-visual-tests.sh`
- Modify: `index.html`
- Modify: `manifest.json`
- Modify: `sw.js`
- Modify: `css/gridnode-native.css`
- Modify: `css/daylight-nexus-pilot.css`
- Modify: `js/gridnode-app.js`
- Modify: `js/gridnode-bundle.js`
- Modify: `AGENTS.md`
- Rename: `REPORT_TO_VEKTOR.md` to `GRIDNODE_IMPLEMENTATION_REPORT.md`
- Replace after reference audit: old favicon, icon, maskable, Apple touch, insignia, and startup splash files with references to `assets/brand/` derivatives.
- Test: `scripts/test-brand-rollout.py`, `scripts/test-brand-visual.cjs`, existing scanner/PWA suites.

**Interfaces:**
- Consumes: Task 3 runtime-ready assets and locked CSS tokens.
- Produces: one canonical identity path map for landing, boot/access, auth, shell/header, dashboard, SHOTS/scanner, profile fallbacks, updates, offline/error states, manifest, service worker, and installed launch.

- [ ] **Step 1: Write rollout RED tests**

`scripts/test-brand-rollout.py` must parse HTML, manifest, service worker, CSS, and JavaScript and assert:

```python
def test_shipped_identity_has_no_vektor(self):
    for path in SHIPPED_TEXT_FILES:
        self.assertNotRegex(path.read_text(errors="ignore"), re.compile(r"vektor", re.I), path)

def test_canonical_user_facing_name(self):
    rendered_copy = collect_user_facing_copy()
    for invalid in ("GRIDNODE", "GRID // NODE", "Grid Node", "GRID / NODE"):
        self.assertNotIn(invalid, rendered_copy)

def test_manifest_and_sw_use_new_assets(self):
    manifest = json.loads(Path("manifest.json").read_text())
    self.assertEqual(manifest["name"], "GRID//NODE")
    self.assertEqual(manifest["short_name"], "GRID//NODE")
    self.assertEqual({icon["src"] for icon in manifest["icons"]}, EXPECTED_ICON_PATHS)
    self.assertTrue(EXPECTED_ICON_PATHS <= set(read_sw_precache_paths()))
```

The test must allow `GRIDNODE` only inside invisible technical filenames/identifiers listed explicitly in `scripts/brand-reference-contract.json`; no exception may appear in rendered copy, accessible names, metadata, or docs.

- [ ] **Step 2: Introduce token authority and replace visual lockups**

Add the six locked tokens once in the final identity authority. Replace `.gn-b2b-lockup`, `.gn-b2b-symbol`, and `.gn-b2b-wordmark` visible geometry with `<img>` references to the approved master/UI derivatives. Preserve responsive slots, accessible names, clear space, and DAY OPS flat treatment. Do not change unrelated layout or module icon meanings.

- [ ] **Step 3: Replace PWA/browser/startup identity paths**

Point favicon, Apple touch, manifest standard/maskable icons, profile/header fallbacks, boot mark, scanner badge, update badge, watermark, and startup splash to `assets/brand/`. Update service-worker precache paths and one coherent release/cache identifier. Keep standard and maskable purposes correct.

- [ ] **Step 4: Correct erroneous VEKTOR residue without a migration story**

Search case-insensitively. Remove identity-facing residue. Rename `REPORT_TO_VEKTOR.md` to `GRIDNODE_IMPLEMENTATION_REPORT.md` and rewrite only the addressee/identity wording needed to describe GRID//NODE directly. Correct the tracked `AGENTS.md` line so it never instructs future work to treat VEKTOR as an identity. Do not add “formerly,” “legacy,” “renamed,” redirects, aliases, or compatibility copy.

- [ ] **Step 5: Add browser rollout tests**

At 390x844 and 1440x900, `scripts/test-brand-visual.cjs` must boot a clean session and inspect landing, boot/auth, dashboard/header, SHOTS/scanner, update, and DAY OPS. Assert correct asset sources, nonzero dimensions, no broken image, no horizontal overflow, no crop, no light-mode glow, and no console/page errors. Save equal-state screenshots for Task 5 comparison.

- [ ] **Step 6: Run full regression suite**

```bash
python3 scripts/test-brand-rollout.py
bash scripts/run-brand-visual-tests.sh
bash scripts/run-brand-asset-tests.sh
python3 scripts/test-scanner-static.py
bash scripts/run-scanner-audio-tests.sh
bash scripts/run-scanner-tests.sh
bash scripts/run-scanner-feedback.sh
python3 scripts/test-mode-switching.py
python3 scripts/test-scanner-assets.py
git diff --check
```

Expected: all tests PASS with pristine output, zero shipped VEKTOR matches, and no scanner behavior regression.

- [ ] **Step 7: Commit the rollout**

```bash
git add -A
git commit -m "feat(brand): roll out locked GRIDNODE identity"
```

---

### Task 5: Blocking visual fidelity and preview-readiness QA

**Files:**
- Create: `design-qa.md`
- Create: `.brand-proof/landing-mobile.png`
- Create: `.brand-proof/boot-auth-mobile.png`
- Create: `.brand-proof/dashboard-mobile.png`
- Create: `.brand-proof/scanner-mobile.png`
- Create: `.brand-proof/day-ops-mobile.png`
- Create: `.brand-proof/favicon-tab.png`
- Create: `.brand-proof/pwa-icons.png`
- Create: `.brand-proof/offline-update.png`
- Test: in-app Browser only, same viewport/state visual comparison.

**Interfaces:**
- Consumes: the approved board, Task 2/3 fidelity proofs, and Task 4 rendered product.
- Produces: `design-qa.md` with `final result: passed` and a preview-ready proof set; it does not deploy production.

- [ ] **Step 1: Start a fresh-origin isolated preview**

Serve the verified worktree on a clean local port and open it in the Codex in-app Browser. Clear service-worker/cache state for that origin. Do not use Chrome or an old cached preview origin.

- [ ] **Step 2: Capture matching states**

Capture the approved reference board/crops and the implementation at the exact proof sizes. Capture product surfaces at 390x844 and their desktop equivalents where required. Include NIGHT GRID and DAY OPS, boot/auth, landing/header, dashboard, scanner, update/offline, browser tab, and installed-icon presentation.

- [ ] **Step 3: Run design QA as a blocking gate**

Open each reference and implementation pair together. Judge silhouette, operator geometry, red/cyan relationship, tiny yellow accent, spacing, clear space, crop, scale, contrast, light-mode no-glow behavior, overflow, and broken assets. Record every finding in `design-qa.md` as P0/P1/P2/P3 with file/line or asset evidence.

- [ ] **Step 4: Fix all P0/P1/P2 and compare again**

Use the existing task review loop. Re-render only affected proof pairs, then update `design-qa.md`. The final line must be exactly:

```text
final result: passed
```

Do not hand off or deploy a preview while the result is blocked or any P0/P1/P2 remains.

- [ ] **Step 5: Independent whole-brand review**

Provide the full branch diff, brand plan, asset manifest, fidelity numbers, proof contact sheets, VEKTOR/canonical-name search evidence, and `design-qa.md` to a fresh reviewer. Fix one consolidated wave of Critical/Important findings, run one scoped re-review, and rerun the full release tests.

- [ ] **Step 6: Commit QA evidence**

```bash
git add design-qa.md
git commit -m "test(brand): verify rollout fidelity"
```

The `.brand-proof/` captures may remain in the ignored SDD workspace when project policy excludes generated screenshots from Git. Preview deployment is the next release task; production remains separately approval-gated.
