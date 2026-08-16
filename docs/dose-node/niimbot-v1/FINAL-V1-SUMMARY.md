# DOSE//NODE v1.0 — Final Lock Summary

**Date:** 2026-08-16
**Status:** SOFTWARE LOCKED. Awaiting physical NIIMBOT hardware QA.
**Scope:** Standalone dose calculator, 8 calculators, full NIIMBOT label system v1.

---

## Five Surgical Fixes (this pass)

| # | Fix | Where | Result |
|---|-----|-------|--------|
| 1 | Canvas font floor = PDF floor (5pt physical = 1.764mm) | LabelEngine render() | Both exports now share the same readable minimum |
| 2 | Block all exports when critical line can't fit at min font | exportPNG/exportPDF/exportNiimbot + warning UI | Exports guarded at function level + button level (pointer-events:none) |
| 3 | PRINT CALCULATION scoped to .calculator-container | printCalc() + @media print CSS | Prints the calculator region, not the whole view |
| 4 | Deleted stale legacy comments/guards | print action guard, [data-action] list | Cleaned up |
| 5 | M2_EXT_3ML is OFFICIAL v1 (not opt-in/experimental) | GEOMETRY table + label UI | Marked as official, suffix changed to "· 3mL extended" |

## Test Results

- **292/292 tests passing** (61 + 71 + 50 + 18 + 92)
- 15 new tests added for the 5 fixes (qa_labels.cjs §33–§37)
- Zero console errors across all suites

## Deliverables

- **Main file:** `/workspace/dose-node/index.html` (143 KB, 2027 lines)
- **Build artifact:** `/workspace/dose-node/docs/dose-node-v1.0.html`
- **Final screenshot:** `/workspace/dose-node/docs/shot-final-m2-5ml.png`

## Locked v1 Scope

- **8 calculators:** Tirzepatide, Semaglutide, Reconstitution, Reverse, Split, Zepbound Reverse, Retatrutide, Vial Transition
- **NIIMBOT label system:**
  - VIAL//LABEL (vial facts: med, conc, vial_strength, BUD, BAC, mixed date, storage)
  - DOSE//LABEL (current calc: med, current dose, draw U-100, calc date)
  - 5 printer profiles: D110, D11, D11-H (D-series, VIAL only), M2, M2_H (M-series, VIAL+DOSE)
  - 5 label presets: D_VIAL (50×15), M2_VIAL_3ML (40×20), M2_VIAL_5ML (50×20), M2_EXT_3ML (50×20 for 3mL, official v1), M2_FULL (50×30, 5mL only)
  - PNG export at native DPI per printer, PDF export at exact mm via jsPDF
  - EXPORT//NIIMBOT button + 3-step import guide
- **Safety guardrails:** 5pt readable minimum, critical-line overflow detection, exports blocked when unfit, no auto-BUD, no auto-storage, VIAL requires both med+conc, DOSE requires med

## Out of Scope (v2)

- BLE reverse engineering / direct print (v1 = file download + 3-step import)
- PRINT//NIIMBOT button (reserved, v1 uses EXPORT//NIIMBOT)
- Combined VIAL+DOSE label (removed; doses change, vials don't)
- Other NIIMBOT printer models

## Awaiting

- 1× NIIMBOT D11-H (compact reference, D-series)
- 1× NIIMBOT M2 (best value, M-series)
- ~10× 3mL vials + ~10× 5mL vials
- Label rolls: 15×50mm D-series, 40×20mm + 50×20mm + 50×30mm M-series
- 1× M2 black ribbon (thermal transfer)
