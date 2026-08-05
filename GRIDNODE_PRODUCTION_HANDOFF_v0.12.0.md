# GRID//NODE Production Handoff — v0.12.0 / release 20260804.1

**Date:** 2026-08-04
**Verdict:** ✅ **READY FOR FOUNDER PRODUCTION APPROVAL**

---

## 1. Exact Candidate Identity

| Item | Value |
|------|-------|
| Release version | `0.12.0` / `20260804.1` |
| Candidate commit | `471ef1e` (hardened after independent review) — chain: `42dc1f3` release → `8ca3071` cleanup → `471ef1e` SW hardening |
| Preview URL | https://6c344a39.gridnode.pages.dev (alias `preview.gridnode.pages.dev`) |
| Rollback commit | `9764766d` (pre-WIP production-safe source) |
| Production | gridnode.network — **untouched** (still v0.10.0 / 20260802.14) |
| Branch | `feature/gridnode-product-completion` (pushed) |

## 2. Changelog (what actually changed since 20260802.20)

- **B4 — SHOT/inventory atomic multi-write**: `S.multiWrite(ops)` batch storage
  (serialize-all → write-all → rollback on failure). `reconcileInventoryForShot`
  became the pure `prepareInventoryForShot`. `saveShot` writes SHOT+inventory+
  weight in ONE atomic batch; cloud sync only after local commit; storage-full
  fails closed with toast. No partial state ever reaches storage.
- **B2 — SW atomic update**: cache-first navigation from the worker's OWN
  `CACHE_NAME` (old worker never serves/caches a newer release's unversioned
  shell); **fixed a real defect** — Cloudflare 308s `/index.html`, and serving a
  redirected cache entry for navigation crashed Chromium with ERR_FAILED on
  every SW-controlled reload. Fix: drop `/index.html` from SHELL, match the
  request URL first (`ignoreSearch`), and map literal `/index.html` navigations
  to the `/` shell entry (independent-review hardening, commit `471ef1e`).
  Deliberate update preserved (SKIP_WAITING + controllerchange), drafts
  survive, What's New once per release.
- **B3 — LAB sticky-header**: `openLabTool` scrolls the overlay to top after
  layout; scroll-padding-top reserves the sticky header; 61/61 verified.
- **B1 — Spanish localization**: all functional strings via `tx()`; +71 keys
  (1417 parity); served ES coverage 7/7.
- **Versioning/What's New**: release 20260804.1 entry in EN+ES; ack persists;
  history accessible.
- **Cleanup**: one dead CSS block removed; no behavior change.

## 3. Production Gates (all against served preview b9ded1a5)

| Gate | Result | Evidence |
|------|--------|----------|
| 1 Medication identity | ✅ | Official candidate test: Zepbound/Ozempic/Semaglutide Compound canonical IDs distinct, invalid fail closed. Dedicated matrix **161/161** (8 meds × 2 themes × 2 langs: select→detour→save→history→edit). B4 storage-failure **6/6** (rollback, zero partial state). |
| 2 First SHOT | ✅ | Official test: clean-state first SHOT, draft survives location detour, side effects/date/time/med/location persist, save→history→edit→archive, downstream activation. First-five **11/11**. |
| 3 Readability | ✅ | 0 horizontal overflow at 320–1440px; DAY OPS dropdown dark-on-light (rgb(23,39,46) on white); visual pass 13/14 (1 intentional EN-lang case). |
| 4 Localization | ✅ | ES coverage **7/7**; Spanish body zones from canonical IDs; dates localized; VAULT/LAB localized; no English fallbacks. |
| 5 Mobile native-like | ✅ | 7 viewport widths incl. mobile + tablet + desktop; touch targets ≥44px; touch close on all LAB tools; safe-area/fixed controls verified in official test. |
| 6 Navigation | ✅ | Browser Back exits focused LAB tools; nested dropdown keeps tool open; lab-back matrix 192/224 (all 32 fails = known harness `hasTouch` artifact); every Back/VOLVER control works. |
| 7 Themes | ✅ | DAY OPS + NIGHT GRID complete; dropdowns/calendars/modals themed; no leakage; selection states clear. |
| 8 Versioning/Changelog | ✅ | Served markers 13× `20260804.1`; served bundle SHA == committed bundle SHA; What's New exactly once + ack persists; EN+ES notes. |
| 9 SW/cache | ✅ | Transition test **8/8** (old worker isolates new server → SKIP_WAITING → new release, draft intact, What's New once) + real-app reload probe PASS after 308 fix; **literal /index.html navigation PASS** after hardening; no loop, no stale bundle (served SHA == HEAD SHA). |
| 10 Performance | ✅ | Startup DCL 157ms; no long main-thread tasks ≥500ms in new-user flow; 75-check run 38s; reduced motion respected. |
| 11 Accessibility | ✅ | 44px touch targets, programmatic labels, Enter/Space activation, visible focus, reduced motion, no overflow at 320px. |
| 12 Data safety | ✅ | Records/profile/lang/theme/onboarding survive reload (official test); drafts intentional; no destructive migration; B4 rollback proven. |

**Official gate script:** `scripts/test-production-candidate.cjs` → **RESULT: PASS, 75 checks, exit 0** (38.4s).

## 4. Deployment Commands (after Founder approval)

```bash
# From WSL repo root
GRIDNODE_FOUNDER_APPROVAL=YES GRIDNODE_STAGING_NAME=gridnode-production \
  bash scripts/stage-deploy.sh
bash scripts/deploy-production.sh          # promotes exact staged artifact
# Verify served:
curl -s https://gridnode.network/ | grep -c "20260804.1"   # expect 13
curl -s https://gridnode.network/js/gridnode-bundle.js?v=20260804.1 | sha256sum
```

## 5. Rollback Commands

```bash
git checkout 9764766d -- .          # restore pre-candidate source
GRIDNODE_STAGING_NAME=gridnode-production bash scripts/stage-deploy.sh
bash scripts/deploy-production.sh
```

## 6. Known Remaining Limitations (honest)

- **Google OAuth on preview domains**: 403/GSI warning on `*.pages.dev` (OAuth
  client allows gridnode.network only). Works on production; local mode unaffected.
- **Real-device touch/gesture testing** beyond emulated viewports (Android/iOS
  hardware) remains the founder's final device pass — Playwright covers
  viewports, taps, keyboard, SW; physical-device gestures (pinch, keyboard
  occlusion, PWA install UX) need one founder-side check.
- **3 harness artifacts** (documented, not app defects): lab-back "touch" cases
  (missing `hasTouch` flag), one visual EN-lang scanner case, med-matrix
  onboarding-active flow (written for the old 12-step tour; superseded by
  qa-med-v2 161/161 on the identical code path).

## 7. Screenshots

`qa-shots/` in the QA workspace: welcome tour, first-run card, DAY OPS
dropdown, scanner ES/EN, loading screen both themes, syringe calculator,
results — captured during visual pass 13/14.

## 8. Verification Artifacts

- `scripts/verify.sh` → **VERIFICATION PASSED** (31 locked files, deterministic bundle 317,247 B)
- `scripts/calc-tests.cjs` → **ALL GREEN**
- `scripts/verify-release-system.mjs` → **OK** (v0.12.0 · 20260804.1 · 4 history entries · EN/ES · safe activation)
- QA harnesses: qa-med-v2 161/161 · qa-012-b4 6/6 · qa-012-sw 8/8 · qa-012-es 7/7 · qa-first5-final 11/11 · qa-visual 13/14 · qa-lab-back2 192/224 · official candidate 75/75 PASS

---

**VERDICT: READY FOR FOUNDER PRODUCTION APPROVAL** — one exact commit
(`471ef1e`), one exact release (`0.12.0 / 20260804.1`), one exact preview
(`6c344a39.gridnode.pages.dev`), rollback point `9764766d`, all 12 gates green
after an independent review pass (dead-CSS verification + SW `/index.html`
hardening, both re-gated). No code changes between approval and production:
the tested artifact IS the production candidate.
