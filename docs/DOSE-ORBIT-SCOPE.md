# Dose Orbit + Live Phase Strip — Prototype Scope

## Vision
Turn the Phase Engine ring into the master instrument: a tappable, scrubbable orbital timeline of the dose cycle, connected to a horizontal phase strip showing past → now → future. The visual IS the interface.

## What exists today
- SVG phase ring (`#phaseArc`, `#ringWrap`) showing 7-day reference cycle position
- Marker positioned by angle from `cyclePosition` (elapsed / 7 days)
- Phase name, number, time-since, cycle %, days remaining as text
- `renderPhase(lastShot, shots)` in `js/modules/02-dashboard.js`

## Prototype scope (v1)

### 1. Tappable ring (Dose Orbit)
- Tap anywhere on the ring → inspect that point in the cycle
- Shows: estimated phase at that point, time offset from last shot, modeled activity level
- Info appears in a small overlay/panel near the ring, not a page jump
- Existing marker stays as NOW position; tapped point gets a temporary inspect marker

### 2. Draggable scrub
- Drag around the ring → scrub forward/backward through the modeled cycle
- Ring rotation, phase name, readouts update live during scrub
- Release → snap back to NOW (or hold the inspected position with a "back to now" affordance)

### 3. Live Phase Strip
- Horizontal strip below the ring: past (faded) → NOW (bright cursor) → future (projected)
- Shot markers on the strip at their logged positions
- Phase transitions as color zones
- Swipe/drag the strip → moves the NOW cursor, updates ring + readouts in sync

### 4. Bidirectional sync
- Scrub ring → strip cursor moves
- Scrub strip → ring rotates, readouts update
- Both always reflect the same inspected time point

## Design direction (Pipe, 2026-10-08): high visual density, low verbal density
Visuals lead, text supports. Lean visual, cut text noise — but this is a
direction, not a hard rule. No mechanical paragraph-killing; use judgment.
Text stays where it genuinely informs (labels, values, short context).

## Trust grammar (non-negotiable)
- Scrubbed/inspected positions are ESTIMATES, same as current: approximate language (~65%, nearest 5)
- Visual distinction between recorded events (crisp markers) and modeled zones (translucent)
- No medical claims: "estimated," "modeled," never "will" or "should"

## Out of scope for v1
- Dose Stack (overlapping decay waves)
- Shot Constellation Timeline (HISTORY rebuild)
- Injection Site Map interaction
- Before/After Compare
- Protocol Fingerprint
- Backend changes: all computation stays client-side from existing shot records

## Success criteria
- User can tap the ring and learn something about a future/past cycle point in under 2 seconds
- Scrubbing feels responsive (no lag on drag)
- Works on 360px mobile width, both DAY OPS and NIGHT GRID themes
- Zero-shot state still shows the CTA, not a broken instrument

## Open questions for ChatGPT
- Snap-back vs hold on release: which feels better?
- Should the strip show one cycle or multiple?
- How to encode model uncertainty on the ring itself (dashed future arc? fading?)
