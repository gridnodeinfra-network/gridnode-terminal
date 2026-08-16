# DOSE//NODE // NIIMBOT LABEL SYSTEM v1 — Handoff

- **Feature:** DOSE//NODE // NIIMBOT LABEL SYSTEM v1
- **Owner:** Tracer (Mavis session 430721414881501)
- **Status:** SOFTWARE LOCKED
- **Architecture:** FROZEN
- **Automated QA:** 303/303 PASS as reported by Tracer (314/314 final at freeze)
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

## What lives in this directory

- `dose-node-v1.0.html` — frozen standalone reference artifact (the v1 build at freeze)
- `FINAL-V1-SUMMARY.md` — recap of the five rounds of surgical fixes that closed v1
- `PHYSICAL-QA.md` — the next-step physical printer QA checklist
- `screenshots/` — final approved visual proof (M2 + 5mL preset)

## Where the live source lives

The DOSE//NODE v1 implementation is **not** in this repo. It lives in a Mavis cloud
sandbox at `/workspace/dose-node/index.html` (Tracer session 430721414881501).
The HTML file in this directory is the **frozen reference** at the v1 lock — it must
not be edited directly. Any change to the live source must be made in the sandbox
and re-archived here as a new frozen revision.

QA scripts (`qa_full.cjs`, `qa_golden.cjs`, `qa_mobile.cjs`, `qa_desktop.cjs`,
`qa_labels.cjs`) live alongside the live source in the Mavis sandbox and are not
checked into this repo. They are Mavis's own validation harness, not project source.

## CONTINUE FROM HERE

1. Do not redesign or reopen NIIMBOT research.
2. Do not change locked label semantics or geometry without Pipe approval.
3. Run physical D11-H + M2 QA per `PHYSICAL-QA.md`.
4. If physical QA finds a real issue, patch only that issue and rerun regression QA.
5. No production deployment without explicit Pipe approval.
