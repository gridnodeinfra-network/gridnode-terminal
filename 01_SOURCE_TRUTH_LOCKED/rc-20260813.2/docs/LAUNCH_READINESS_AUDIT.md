# LAUNCH READINESS AUDIT — vs the original 20-point brief

Status: DONE / PARTIAL / N/A. Evidence column cites the commit or QA proof.

| # | Brief item | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Mobile header overlap | DONE | navLbl/theme-toggle-host rework; topbar-btn 44px; no-overlap verified 320-430px matrix |
| 2 | Passkey prompt logic | DONE | account-state gating waits for hydrate; no-repeat after registration/refresh/sign-out; account-switch safe (product-completion pass) |
| 3 | Phase Curve overlap | DONE | reserved x-axis lane + bottom padding; both themes/langs verified |
| 4 | Red-lava accent system | DONE | lava tokens (core/edge/glow) + shared CTA classes; DAY OPS variant; plum removed |
| 5 | Readability/typography pass | DONE | typography-by-role; 16px input floor; form-label/helper sizes; line-height 1.55; ES overrides |
| 6 | DAY OPS first-class theme | DONE | semantic token review; completeness block; contrast fixes |
| 7 | Theme all pickers/dropdowns/overlays | DONE | one shared light layer (date picker, dropdowns, overlays, toasts) |
| 8 | Research Peptides redesign | DONE | hierarchy + expandable categories + 46px rows (pass-2) |
| 9 | Syringe Draw rebuild | DONE | instrument panel structure; math preserved (bundle:2498); vector tests green |
| 10 | Dose Projection rework | DONE | styled inputs/selects; flow hierarchy (pass-2) |
| 11 | Progress Signals/data cards | DONE | shared value/label contrast; DAY OPS washed-out fixed |
| 12 | Hologram upgrade (safe) | DONE | CSS-only bezel/scan/pulse; DAY OPS; reduced-motion; fallback intact |
| 13 | Spanish localization | PARTIAL | catalog parity 1121 keys; nav/scanner/profile/log/dialog/PWA wired; overlay satellite; REMAINING: bundle-injected strings (hologram labels, some toasts) - queued |
| 14 | Interactive first-run tutorial | DONE | 10-step spotlight tour; skip/resume/replay; EN/ES; both themes; QA 13/13 |
| 15 | Versioning | DONE | v0.10.0 single source js/gridnode-version.js (GN_VERSION); bump script syncs release |
| 16 | Premium What's New | DONE | categorized SYSTEM UPDATE sheet; once-per-version; dismiss persists; reopen; EN/ES; no first-visit block |
| 17 | Trust/logic preservation | DONE | P6 data-safety; no math changes; no sample data; RLS/verify_jwt intact |
| 18 | Mobile/a11y testing | DONE* | Edge headless matrix 320-430 x themes x langs: 30/30 interaction, 13/13 onboarding, 4/4 states, 0 errors; focus-visible; 44px; reduced-motion; *real Android/iOS device passes remain the known gap (founder device QA) |
| 19 | Performance | DONE | load 513ms, FCP 1.3s, 167KB resources; no oversized assets; docs/PERFORMANCE.md |
| 20 | Handling | DONE | inspect-first, identity preserved, no redesign, gate before prod |

Known limitations (honest): (1) bundle-injected Spanish strings (item 13) queued;
(2) real-device (Android Chrome/Opera, iOS Safari) visual QA remains with the
founder - harness covers Chromium-Engine at all matrix widths; (3) TBT/CLS need
device DevTools tracing.

Rollback: production = previous stable deployment (c2e4903f / release 20260802.8)
via `GRIDNODE_STAGING_NAME=gridnode-production GRIDNODE_FOUNDER_APPROVAL=YES
bash scripts/deploy-production.sh --confirm-production` from the pinned commit.
