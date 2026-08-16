# Physical NIIMBOT QA — Next-Step Checklist

**Goal:** verify the v1 software produces physical labels that survive handling, refrigeration, and time on real 3mL and 5mL vials.

**Hardware needed (Pipe-owned):**

- 1x NIIMBOT D11-H (D-series, 50x15mm label stock, VIAL only)
- 1x NIIMBOT M2 (M-series, 40x20mm and 50x20mm and 50x30mm stock, VIAL + DOSE)
- ~10x 3mL vials
- ~10x 5mL vials
- Label rolls: 15x50mm D-series; 40x20mm + 50x20mm + 50x30mm M-series
- 1x M2 black ribbon (thermal transfer)

**Procedure:**

1. Pick a Reconstitution calculator result.
2. Generate VIAL//LABEL via EXPORT//NIIMBOT.
3. Import the PNG into the NIIMBOT app.
4. Print on the correct stock for the chosen preset.
5. Apply to a 3mL and a 5mL vial.
6. Photograph the applied label in normal light (close + full vial).
7. Refrigerate.
8. Inspect again after approximately 48 hours for:
   - scale (does the print measure out to the listed 50x15mm / 50x20mm physical size)
   - readability (can the med name, conc, BUD, dose, draw be read at arm's length)
   - edge lift (peeling at corners, especially over the vial seam)
   - wrinkles (any buckling in the wrap)
   - condensation (does the print smear when wet, then dried)
   - smearing (any finger-transfer of ink during handling)
   - curvature (does the wrap follow the vial without pulling)

**Capture and file:**

- Save final approved photographs under `screenshots/`.
- Note any failures, edge cases, or surprises in this file (append, do not overwrite).
- If anything fails, open a regression entry: what was expected vs what was observed, with photo evidence.

**What to NOT do during QA:**

- Do not change the locked geometry or label semantics.
- Do not push a software patch to fix an issue without first reporting it to Pipe.
- Do not deploy anything to production as a result of QA.

**Reporter:** whoever runs the physical test (Pipe). Tracer stands by in the Mavis sandbox for any regression that surfaces.
