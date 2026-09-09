# CALCULATOR TESTS — syringe draw, reconstitution, dose projection, phase engine

Method: the production formulas live in js/gridnode-bundle.js (updateSyr / draw
calculators / dose projection / phase engine). All passes preserved the math
(no formula edits; only presentation). Vectors below were cross-checked by
extracting each formula from the bundle and asserting known results.

## Syringe Draw (U-100): units = (target_mg / (vial_mg / water_mL)) * 100
| vial mg | water mL | target mg | expected units |
|---|---|---|---|
| 5 | 2 | 0.25 | 10.0 |
| 5 | 2 | 0.5 | 20.0 |
| 10 | 2 | 1.0 | 20.0 |
| 15 | 3 | 0.75 | 15.0 |
| 5 | 1 | 0.25 | 5.0 |

## Dose projection: schedule = target reached by step increases at interval
| current | step | interval (days) | target | steps | days |
|---|---|---|---|---|---|
| 2.5 | 2.5 | 7 | 10 | 3 | 21 |
| 5 | 2.5 | 7 | 15 | 4 | 28 |
| 2.5 | 2.5 | 14 | 10 | 3 | 42 |

## Phase engine: 7-day reference window from shot dates
| shot dates (days apart) | phase estimate |
|---|---|
| every 7d | consistent 7-day cycle |
| 3-4d gaps | accelerating (reference below 7d) |
| >7d gaps | stretched (reference above 7d) |

## Validation guards (Phase 1, still enforced)
- non-finite/<=0 dose and weight rejected at input
- impossible calendar dates rejected (2/30)
- future-dated weight records rejected
- CSV export escapes spreadsheet formula injection

Run: `node scripts/calc-tests.mjs` (asserts the four vector groups; exit 0 = green).
