# DOSE//NODE // NIIMBOT LABEL SYSTEM v1 — Handoff

- **Feature:** DOSE//NODE // NIIMBOT LABEL SYSTEM v1
- **Owner:** Tracer (Mavis session 430721414881501)
- **Status:** SOFTWARE LOCKED
- **Architecture:** FROZEN
- **Automated QA:** 114/114 PASS as reported by Tracer at freeze
- **Production:** NOT DEPLOYED
- **Physical QA:** PENDING — D11-H + M2

## Label-capable calculators

- Tirzepatide
- Semaglutide
- Reconstitution

## Printers (5 profiles)

- NIIMBOT D110
- NIIMBOT D11
- NIIMBOT D11-H
- NIIMBOT M2
- NIIMBOT M2_H

## Presets (5 layouts)

- `D_VIAL` (50x15mm) — D-series, VIAL only
- `M2_VIAL_3ML` (40x20mm) — M-series, 3mL vials
- `M2_EXT_3ML` (50x20mm) — M-series, 3mL extended, official v1
- `M2_VIAL_5ML` (50x20mm) — M-series, 5mL vials
- `M2_FULL` (50x30mm) — M-series, 5mL shoulder risk

## v1 hard rules

- No combined VIAL+DOSE label
- No automatic BUD
- No automatic storage instructions
- No BLE reverse engineering / direct-print claim
- Calculator result is the authoritative source for label values
- VIAL//LABEL requires explicit medication AND concentration
- DOSE//LABEL requires explicit medication identity
- 5pt physical readable minimum enforced; exports blocked when any critical line cannot fit at min font
- PRINT//NIIMBOT button name is reserved for v2 (v1 uses EXPORT//NIIMBOT = file download + 3-step import guide)

## CURRENT IMPLEMENTATION

The continuing DOSE//NODE source of truth is:

    dose-node/index.html

(146 KB, the v1 build at freeze. Edit this file when development continues.)

A historical Mavis sandbox path (`/workspace/dose-node/index.html` in session
430721414881501) is kept for provenance but is NOT the durable source. A future
agent does not need that session to continue work.

## FROZEN SNAPSHOT (do not edit)

    docs/dose-node/niimbot-v1/dose-node-v1.0.html

This is the v1 reference archive. It is byte-identical to the v1 build at freeze.
Once `dose-node/index.html` diverges from v1, the frozen snapshot becomes the only
record of what v1 looked like at lock time.

## NIIMBOT REGRESSION TESTS

The NIIMBOT-specific reproducible test lives at:

    tests/dose-node/niimbot-v1.cjs

It is a 47-section, 114-test suite that proves the v1 label system still works.
The file uses paths resolved relative to its own location, so it works from a
fresh clone with no environment setup beyond:

    npm install playwright
    npx playwright install chromium

### Rerun the NIIMBOT tests

    node tests/dose-node/niimbot-v1.cjs

If a custom Chromium path is needed:

    CHROME=/path/to/chrome node tests/dose-node/niimbot-v1.cjs

## What lives in this directory

- `README.md` — this handoff page
- `PHYSICAL-QA.md` — the next-step physical printer QA checklist
- `FINAL-V1-SUMMARY.md` — recap of the five rounds of surgical fixes that closed v1
- `dose-node-v1.0.html` — frozen standalone reference artifact (do not edit)
- `screenshots/` — final approved visual proof (M2 + 5mL preset)

## CONTINUE FROM HERE

1. Do not redesign or reopen NIIMBOT research.
2. Do not change locked label semantics or geometry without Pipe approval.
3. Run physical D11-H + M2 QA per `PHYSICAL-QA.md`.
4. If physical QA finds a real issue, patch only that issue and rerun the
   NIIMBOT regression suite (`node tests/dose-node/niimbot-v1.cjs`).
5. No production deployment without explicit Pipe approval.
6. A future agent does not need any prior Mavis session to continue. Everything
   required is in this repo: working source in `dose-node/`, regression tests in
   `tests/dose-node/`, and the frozen archive + docs in `docs/dose-node/`.
