# Maximum-Precision Body Scanner Design

Date: 2026-08-13

Branch: `fix/weight-chart-svg-immersion`

Baseline: `21decc8` / `01_SOURCE_TRUTH_LOCKED/rc-20260812.9`

## Objective

Make the injection-zone selector as precise, responsive, immersive, and polished as the current GRID//NODE architecture allows, while preserving the accepted `CORE / LEGS / ARMS` model, scanner imagery, medical boundary, stored location values, and SHOT workflow.

The launch standard is not a general visual improvement. A user must be able to tap the intended anatomical zone confidently on a small phone, receive immediate feedback, and see an unambiguous locked result without accidental selections or duplicated events.

## Scope

This release covers all 12 existing zones:

- CORE: right/left abdomen, upper/lower.
- LEGS: right/left thigh, upper/lower.
- ARMS: right/left rear upper arm, upper/lower.

It does not add front/back switching, new anatomical zones, medical recommendations, rotation logic, or changes to persisted location names.

## Interaction Architecture

Each scanner mode keeps one 1024 by 1024 body asset and one matching SVG coordinate space. The SVG is the sole interactive anatomical layer. Visible contours and invisible hit geometry share the same normalized coordinate system so resizing cannot introduce drift.

One scanner input controller owns pointer, mouse, touch, stylus, and keyboard activation. Existing competing activation paths must be reconciled so one gesture produces exactly one selection, one haptic sequence, one lock animation, and one toast.

The interaction sequence is:

1. `pointerdown` resolves the candidate zone and paints immediate acquisition feedback.
2. Movement beyond the calibrated drag threshold cancels the candidate and allows vertical scrolling.
3. `pointerup` resolves the endpoint again.
4. Selection commits only when the endpoint remains inside the original zone or its bounded release tolerance.
5. The shared selection function persists the value, updates every control, announces the result, and renders the locked state.

Keyboard activation uses Enter and Space and calls the same shared selection function.

## Geometric Precision

Hit regions are calibrated per scanner asset, not copied between modes. They must follow the intended anatomy while remaining large enough for reliable mobile input.

Rules:

- Regions must not overlap.
- Every visible selectable contour must have one matching hit region.
- The CORE navel exclusion remains non-selectable.
- Empty scanner space must not select a zone.
- Boundary ownership must be deterministic; no unrestricted nearest-zone guessing.
- A minimum effective target of 44 CSS pixels is required where the anatomy permits it.
- The screen-to-SVG transform must use the live SVG coordinate transform, preserving accuracy under responsive scaling.
- A pointer that becomes a scroll gesture must never commit a selection.

The existing `scannerDebug=1` mode will be used to inspect hit geometry, resolved zone IDs, and boundary behavior during calibration.

## Visual and Motion Design

The current synthetic biotech assets, dark HUD language, scanlines, cyan system chrome, Signal Yellow acquisition state, and Mars Red locked state remain the visual foundation.

The scanner should feel instrument-grade:

- Ready zones use restrained cyan contours with sufficient visibility on the body art.
- Pointer-down produces an immediate Signal Yellow acquisition flash.
- A committed zone transitions to Mars Red with a short perimeter lock pulse.
- Non-selected siblings quiet down without disappearing.
- Recent and last-used states remain distinguishable from the active selection.
- Animation is brief, locally focused, and disabled or reduced when reduced-motion is requested.
- No decorative effect may delay input handling or obscure anatomical boundaries.

The scanner mode controls remain `CORE / LEGS / ARMS`, with correct tab semantics, selected state, keyboard focus, and working mode changes.

## Cinematic Asset Enhancement

The current `core.webp`, `legs.webp`, and `arms.webp` images remain the anatomical source. Enhanced versions must preserve the original 1024 by 1024 canvas, crop, silhouette, body position, panel seams, anatomical landmarks, perspective, and negative space. The originals remain recoverable and are not discarded.

The approved treatment is instrument-grade cinematic rather than a full re-render:

- Deepen graphite blacks and local contrast without crushing anatomical detail.
- Add controlled Mars Red reflections along selected armor edges and lower-depth surfaces.
- Add sparse Signal Yellow accents to existing hardware seams and micro-details.
- Preserve the existing cyan rim light as the scanner's neutral system color.
- Keep red and yellow directional and restrained; the body must not become a flat neon wash.
- Add no text, logos, symbols, anatomy, equipment, or background objects.
- Avoid gore, skin simulation, clinical imagery, or anything implying medical guidance.

Enhanced assets are accepted only after side-by-side inspection confirms that their composition and anatomical landmarks remain aligned with the zone coordinate system. If an enhancement drifts, it is rejected rather than compensated for with inaccurate hit geometry.

## Live Selection Effects

Runtime effects are tied to the exact SVG zone and never baked into hit testing:

1. Contact: immediate Signal Yellow edge trace and a small local light bloom on `pointerdown`.
2. Acquisition: a short scanline refraction passes only through the candidate zone.
3. Lock: the zone perimeter resolves to Mars Red with a brief inward pulse.
4. Settled: the selected zone keeps a restrained red contour and low-energy glow while sibling zones dim slightly.

Effects remain clipped to the selected region, complete quickly, and do not block input. They use transform and opacity where possible, avoid continuous high-cost filters, and respect `prefers-reduced-motion`. Reduced-motion mode preserves the color and locked-state hierarchy without sweeps or pulses.

## Premium Sound and Haptics

Scanner sound is opt-in and remembered on the current device. It is off by default. The existing sound control exposes the preference, writes it to local storage, restores it at startup, and communicates the current state accessibly.

The scanner uses two short original cues:

- Contact: a very quiet, dry mechanical micro-click at acquisition.
- Lock: a short, low, clean synthetic transient when the location commits.

The sound design must contain no melody, voice, arcade chirp, bright oscillator beep, repeating ambience, or long tail. Levels must remain subtle relative to ordinary device media. Playback begins only after direct user interaction and complies with browser audio restrictions.

Haptics remain optional and supporting-device only. One short contact pulse and one restrained confirmation pattern may accompany the audio, but one gesture must never trigger duplicate vibration. Sound or haptic failure cannot affect selection.

## Responsive Layout

The active anatomy must remain usable at 360x800, 390x844, 412x915, and 430x932, as well as desktop widths.

On mobile:

- The scanner stage scales within the available width without coordinate drift.
- The active anatomical zones are not hidden beneath the fixed bottom navigation.
- A compact selected-location rail sits after the scanner and remains visually associated with the tap result.
- Bottom safe-area and navigation clearance are reserved in layout rather than patched with excessive card margins.
- The page remains vertically scrollable when a gesture is not a tap.
- There is no horizontal overflow.

The existing stable zone buttons remain available as a precise accessible fallback. Their state mirrors the body selection and they use the same location-selection function.

## Selection Confirmation

The confirmation rail has three states:

- Ready: no location selected; instruct the user to tap a highlighted zone.
- Acquiring: transient local feedback occurs on the body only.
- Locked: displays `LOCATION//LOCKED` and the exact selected zone label.

The locked rail is an `aria-live="polite"` status region. It must not duplicate announcements. The SHOT modal continues to read the same persisted selected-location value.

## Data and Safety

Existing location strings and synchronization behavior remain unchanged. Selection continues to persist through the existing workspace state and cloud-sync path. Draft SHOT preservation remains intact.

The scanner remains user-entered location tracking only. Existing scanner and medical disclaimers must be preserved exactly in meaning and prominence. The interface must not imply that GRID//NODE recommends an injection location.

## Failure Handling

- If SVG coordinate conversion is unavailable, direct event targeting may resolve a zone only when the event target is an existing zone hit path.
- If a pointer leaves the active region, is canceled, or becomes a scroll, pressed styling is cleared and no selection is committed.
- Switching modes clears transient acquisition state but preserves the stored selected location.
- Unsupported vibration fails silently and does not affect selection.
- Re-rendering must not install duplicate event listeners.

## Verification

Automated checks must cover:

- All three mode controls and all 12 zone paths.
- One gesture produces one selection event.
- Taps at each zone center resolve to the expected stored location.
- Boundary and empty-space taps do not resolve to the wrong zone.
- Drag and vertical-scroll gestures do not select.
- Keyboard activation works for every zone.
- Selected, last, recent, and ready states render correctly.
- The stable fallback buttons and body paths remain synchronized.
- The selected value reaches the SHOT modal and survives refresh.
- No console errors, horizontal overflow, or zero-size scanner visuals.
- NIGHT GRID and DAY OPS at 360x800, 390x844, 412x915, and 430x932, plus desktop.
- Reduced-motion behavior.
- Enhanced asset dimensions, composition, and landmark alignment against the originals.
- Sound defaults off, persists after opt-in, produces one contact and one lock cue, and remains silent when disabled.
- Visual effects remain clipped to the selected zone and do not delay or duplicate selection.
- Scanner interaction and animation remain responsive on representative mobile hardware.
- Existing mode-switching regression test, bundle build, and repository verification gates.

Visual QA must compare the implementation against the current preview at matching viewports and confirm improved anatomical alignment, visible tap feedback, confirmation placement, and bottom-navigation clearance.

## Release Boundary

Implementation will update the readable source, generated runtime bundle, focused scanner tests, and the active release lock as required by the repository verification workflow. Existing untracked files are out of scope and must remain untouched.

A Cloudflare preview may be deployed after local verification. Production deployment requires a separate explicit Founder approval after the preview is reviewed.
