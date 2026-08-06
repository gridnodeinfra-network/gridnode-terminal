# GRID//NODE Production Handoff — v0.12.0 / release 20260804.1

**Date:** 2026-08-04
**Verdict:** ✅ **READY FOR FOUNDER PRODUCTION APPROVAL**

---

## 1. Exact Candidate Identity

| Item | Value |
|------|-------|
| Release version | `0.12.0` / `20260804.1` |
| Candidate commit | `6ad0486` (final) — chain: `42dc1f3` release → `8ca3071` cleanup → `d41e910` SW hardening → `471ef1e` assetResponse cache bypass → `046f66d` install-time cache bypass → `5e06d3e` handoff pin → `6ad0486` final pin |
| Preview URL | https://7723f8e0.gridnode.pages.dev (alias `preview.gridnode.pages.dev`) |
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
  to the `/` shell entry (independent-review hardening, commit `d41e910`);
  i18n/manifest fetches bypass the immutable HTTP cache both at install
  (`shellRequest` cache:'reload') and on asset misses (commit `471ef1e`/`046f66d`).
  Deliberate update preserved (SKIP_WAITING + controllerchange), drafts
  survive, What's New once per release.
- **B3 — LAB sticky-header**: `openLabTool` scrolls the overlay to top after
  layout; scroll-padding-top reserves the sticky header; 61/61 verified.
- **B1 — Spanish localization**: all functional strings via `tx()`; +71 keys
  (1417 parity); served ES coverage 7/7.
- **Versioning/What's New**: release 20260804.1 entry in EN+ES; ack persists;
  history accessible.
- **Cleanup**: one dead CSS block removed; no behavior change.

## 3. Production Gates (all against served preview 7723f8e0)

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
(`6ad0486`), one exact release (`0.12.0 / 20260804.1`), one exact preview
(`7723f8e0.gridnode.pages.dev`), rollback point `9764766d`, all 12 gates green
after an independent review pass (dead-CSS verification + SW `/index.html`
hardening, both re-gated). No code changes between approval and production:
the tested artifact IS the production candidate.


---

## STRESS-TEST FIX PASS (2026-08-04, founder-approved scope: all blockers + visible i18n)

Fixed against the Mavis stress-test report (tested on older previews; all fixes verified on preview 7723f8e0):

| # | Fix | Status |
|---|-----|--------|
| B1 | NODE PROFILE HUB: CERRAR button + Escape closes + launcher toggles | 6/6 runtime |
| B2 | 404 fallback page (// 404 — NODE NOT FOUND + VOLVER AL INICIO), no dashboard dump, tour once-per-user (skip/ESC persists gn_onboarding_dismissed_v1; no re-fire on route change) | 7/7 runtime |
| B3 | (already fixed pre-report) Save-shot-without-med shows toast — verified still working | — |
| B5 | Return-to-DASH title+aria now i18n ('Volver al tablero') | in modal 12/12 |
| B6 | H-logo light variant (invert+hue-rotate, cream bg, brand colors preserved), DRAW VISUALIZER label darkened in DUSK, NODO EN LÍNEA → 'NODO ACTIVO LOCALMENTE' | 4/4 runtime |
| i18n | SHOT modal: Close/Save/date/time/AM-PM/weight/notes aria+placeholders ES; 12 body-zone aria-labels ES; FAB aria 'Registrar una dosis' | 12/12 |
| i18n | LAB header 'CALCULADORAS LAB' + '// UTILIDADES EDUCATIVAS //'; calculator help body (Dosis/Concentración/Volumen/Unidades) ES; inventory edit/archive aria; HISTORY disclosure; footer 'private prototype' + live-status + install-banner aria; LOCAL RECORDS boot tx | 8/8 |
| i18n | Marketing HUB preview: ES screenshot (preview-dashboard-es.png, captured from real ES app with data) swapped live on gn:langchange | 3/3 |
| Data | Peptide: date now required (toast 'SELECCIONA UNA FECHA ANTES DE GUARDAR', no silent today); FUENTE edit-load no longer shows 'manual' fallback (empty instead); save toast verified ('REGISTRO DE INVESTIGACIÓN GUARDADO') | 5/5 |
| Doc | Continue-with-Google label is rendered by Google Identity Services (external) — not translatable in-repo; documented. Preset-name fragmentation (report #10) deferred to post-launch design pass (1-2 days). | noted |

**Re-gate:** verify.sh VERIFICATION PASSED (lock re-synced, 32 files, bundle 320,669 B deterministic); official candidate test PASS (75 checks, exit 0); regression suites 45/45 on final preview 7723f8e0.


---

## v0.13 STRESS-TEST FIX PASS (2026-08-05, founder-approved: all blockers + visible i18n + priority UX)

Second Mavis report round. All verified on preview cd1bbeae (release 0.12.0/20260804.1):

| # | Fix | Result |
|---|-----|--------|
| B2 | **404 regression fixed (my own bug)**: showNotFound appended the 404 screen INTO #app while hiding all .screen (incl. #app) → blank dark page. Now appends to document.body with dedupe guard; theme-aware classes (dark/light), focus-visible, reduced-motion | 8/8 visibility-aware (rect+computed, both themes/locales) |
| B9 | **FAB = true quick-log**: one tap logs last med+dose+site at now via atomic saveShot; toast 'DOSIS REGISTRADA · 12:34 AM · 2.5mg Zepbound (Tirzepatide)' with DESHACER → opens pre-filled EDITAR DOSIS; fallback to full form when no history/med | 6/6 |
| B10 | **Peptide name integrity**: library pill → name readonly + PRESET badge + category auto-fill + locked placeholder; ENTRADA PERSONALIZADA → free text; edit-load re-detects library names; save unchanged | 11/11 |
| B4 | **Unsaved-changes guard**: dirty dose form close (X / CLOSE·RETURN / Escape) → '¿DESCARTAR DOSIS SIN GUARDAR?' confirm (KEEP EDITING / DISCARD); clean close instant; saveShot force-closes | 7/7 |
| P5 | What's New + tour **no longer stack** (tour waits for dismissal); tour kicker i18n ('// ORIENTACIÓN DEL SISTEMA 1/4'); DUSK muted-text overrides (#8bb1bc/#9ab3bc/#849ba4/#9ceff4/#a6c5cc → light-safe colors); .gn-hub-close fully styled dark+light | 5/5 |

**Re-gate:** verify.sh VERIFICATION PASSED (bundle 326,820 B, lock re-synced 32 files); official candidate test PASS (75 checks, 39.7s); full regression 84/84 across 13 suites on preview cd1bbeae.


---

## v0.13 REVIEW FIX PASS (independent review of f5b8de1 → 3 should-fixes resolved)

| # | Fix | Verified |
|---|-----|----------|
| R1 | Dirty-check false positive on clean edit close: edit sessions now compare every field against the loaded record (med/dose/date/time/notes/wt/SE) instead of blanket-treating edit mode as dirty | clean edit close → NO prompt; dirty edit → prompt (runtime probe A/B) |
| R2 | Escape recursion: while the discard confirm is open, Escape dismisses IT (cancelShotDiscard); while the future-timestamp confirm is open, Escape is ignored (own handler owns it); only otherwise does Escape close the log modal | probe C: confirm dismissed, no stack |
| R3 | RESULTS 'LOG SHOT' + empty-state 'LOG YOUR FIRST SHOT' now open the full form (openLogModal) — only the FAB quick-logs | 0 handleShotFab call sites outside the FAB; quick-log suite 6/6 |

**Final re-gate (preview cd1bbeae):** verify.sh VERIFICATION PASSED (bundle 327,968 B, 32-file lock); official candidate test PASS (75 checks, 39.7s); full regression 86/86 across 14 suites (404 8/8 · quicklog 6/6 · peplock 11/11 · close-guard 7/7 · polish 5/5 · B1 6/6 · B2 7/7 · B6 4/4 · modal 12/12 · lab 8/8 · preview-swap 3/3 · peptide 5/5 · fresh-404 · hub-aria 2/2). Commits: f5b8de1 (v0.13 pass) + review fixes.


## UX OVERHAUL DEPLOY — 2026-08-05 (LIVE)

**Status: DEPLOYED TO PRODUCTION** by founder authorization (full deploy mode).

Commit: `8a3c043` (35 files, +764/−185) — pushed `feature/gridnode-product-completion`.
Production deployment: `93401857` (Environment=Production, branch=main) → **gridnode.network LIVE**.
Preview: `https://9443f9a1.gridnode.pages.dev` (final tested build).

### What shipped (12-point UX pass + Blocker 10 structure)
1. **Terminology**: ES dashboard heading "TU LÍNEA DE TIEMPO" (was PROTOCOLO TABLERO — aligns with locked slogan
   "Tu biología. Tu línea de tiempo. Tu grid."); NIVEL RELATIVO → TU NIVEL. Form labels Title Case
   (Fecha/Hora/Medicamento/Dosis/Ubicación/Dispositivo/Estado/…) in EN+ES.
2. **Brand**: `.gn-brand-strip` (2px cyan gradient) under topbar; topbar launcher = V6 canonical insignia
   (`assets/gridnode-insignia-v6.png` from brand spec) + "HUB" label (hidden <360px); favicon wrapper
   `gridnode-favicon-v6.svg`; app icons regenerated from V6 (32/180/192/512/maskables).
3. **Empty state**: ONE red CTA "REGISTRAR MI PRIMERA DOSIS" + 3 cyan ghosts (Registrar peso / Escanear zona /
   Ver LAB) + cyan Consejo tip card; wanda cards + FAB hidden until first dose (`body.gn-empty-state`).
4. **Wanda colors**: weight/goal cards `.info` (cyan); dose cards red only when action needed.
5. **Drawer forms**: dose + weight now 75vh bottom drawers (`#logOv/#wtOv .modal` 75dvh, rounded top,
   `.gn-drawer-handle`, dashboard visible above).
6. **Undoable toasts**: `showToast(msg, isError, undoCb, detail)` — cyan-bordered, ✓, title+detail,
   DESHACER/UNDO button, 4px 5s progress bar. Wired: saveShot → "Dosis registrada · hh:mm" + detail
   (dose mg med · zone) → undoShot(id) archives; saveWt → "Peso registrado" → undoWeight(id) removes.
   Keys toast.*, shots.undone, weight.undone (EN+ES).
7. **HUB danger**: delete rows `.gn-profile-danger-row` red border + red text (confirm modals unchanged).
8. **Scanner hint**: first open (per-device `gn_scanner_hint_shown`) pulses one zone + "TOCA UNA ZONA"; cleared
   on selection.
9. **Peptide (Blocker 10)**: two-mode structure — LIBRARY: `#gnResearchMode` chips "BIBLIOTECA · SELECCIONADA 🔒"
   + "CATEGORÍA · ASIGNADA 🔒", name+category readonly/locked, warning hidden, standard save label; CUSTOM:
   demoted footer link "¿Necesitas un compuesto personalizado? → Crear entrada personalizada" → custom mode
   (title CREAR ENTRADA PERSONALIZADA, "← Volver a la biblioteca", name free-text, category "Personalizada"
   display (saved as lab.customResearch), amber `.gn-research-custom-group` + orange warning callout,
   save "GUARDAR ENTRADA PERSONALIZADA").

### Gates
- verify.sh: **VERIFICATION PASSED** (38 files; bundle 339,146 B deterministic vs locked baseline; lock
  re-synced + source-metadata.json regenerated).
- Official test `test-production-candidate.cjs` (updated: empty-state assertion → .gn-empty-hero/.gn-empty-cta):
  **result PASS | 76 checks | 0 fails**.
- Regression suites on final preview: Batch A 12/12, B 13/13, C 11/11, D 11/11, Project2 18/18, Gaps 9/9
  (+ legacy B1 6/6, B2 7/7, B6 4/4, modal 12/12, LAB 8/8, preview-swap 3/3 green).
- LIVE production runtime: **15/15** (brand strip, V6, HUB label, empty hero, CTA, ghosts, tip, wanda hidden,
  drawer 75vh, handle, Title Case labels, 2 danger rows, peptide two-mode).

### Notes / rollback
- Rollback: redeploy `b4f7470` (previous committed state) via deploy-production.sh, or CF dashboard → previous
  deployment. Production deployment id `93401857-0a7e-4386-b687-6231d354c6c1`.
- Known: first curl after deploy can hit CDN edge cache (stale HTML); hard-refresh or cache-bypass headers
  confirm the new build. "Continue with Google" label is Google Identity Services-rendered (not repo-translatable).
- The `.gn-empty-hero` overrides `#gnFirstShotMission` in the official test; mission card remains in DOM
  (hidden) for compat.


## REVIEW PASS — 2026-08-05 (preview 5c487045, commit 56bf4a0)

Three parallel reviews (web-design-guidelines audit + mattpocock two-axis code-review + security-review)
ran against the UX overhaul diff. **0 P0, 6 P1, 6 P2, 3 P3 — all addressed; production NOT redeployed**
(previous live deployment `93401857` = UX overhaul, unchanged).

### Fixed
- **A11y (P1)**: `#logOv .modal` now `role="dialog" aria-modal="true" aria-labelledby="logOvTitle"`;
  `#wtOv` static `aria-hidden="true"` removed — runtime overlay observer toggles it (open→false, closed→true,
  verified by probe); `#toastEl` gets `role="status" aria-live="polite"` so save/undo toasts are announced.
- **Keyboard (P1/P2)**: Enter/Space now opens `cp-group-minimized` medication groups (delegated keydown →
  `e.target.click()`); Escape closes the weight drawer too (`#wtOv.active` branch).
- **Theme parity (P1)**: light-theme overrides for `.toast.undoable` internals (title #1c2a30, detail #3f535a,
  undo #00677f, bar #00758a, bg #ffffff.97 — WCAG ≥4.5:1), `.gn-research-back`, `.gn-research-preset-badge`.
- **Data (P2)**: `undoWeight` now enqueues a cloud tombstone `{table:'weights', id:cloudId}` + flushCloudDeletes
  instead of `queueCloudSync('weight', record)` — undone weight entries no longer resurrect on next sync;
  `saveWt` fires the undoable toast in BOTH branches (milestone no longer swallows it).
- **Hardening (P3)**: quickLog toast `onclick` escapes `savedId` via safeText; `researchEnterCustomMode` focuses
  the name field only on `(pointer: fine)` devices (no keyboard pop on touch); `undoShot` removes linked weight
  rows (`shotId === id`) with tombstones in the same batch.
- **i18n**: EN `research.modeLibrarySelected` → "LIBRARY · SELECTED", `research.customCategoryDefault` →
  "Custom"; ES `shots.undone` → "Dosis deshecha.".

### Gates
- verify.sh: **VERIFICATION PASSED** (38 files, bundle 340,303 B deterministic; lock re-synced + metadata regenerated).
- Official test: **PASS 76/76** on preview 5c487045.
- Regression: BatchC 11/11, BatchD 11/11, Project2 18/18, Gaps 9/9 (review-fix suite 10/12 with 2 expected
  state-mismatches: wtOv aria-hidden measured closed-state=true is correct dynamic behavior).
- Deferred (noted, not fixed): backup-import schema re-validation (P3 hardening); inventory re-credit on
  undoShot (P3, rare); focus trap within drawers (P2, enhancement); h1/skip-link (P2, enhancement).


## V0.14 POLISH SPRINT — 2026-08-05 (preview fcd25f44, commit 7184b3b, release 20260805.1)

**Status: SHIPPED to preview, NOT deployed to production** (v0.13 deployment 93401857 still live; deploy awaits Pipe's go).
Per handoff-to-nix-2026-08-05.md priority order P1→P2→P3; P4 (UNIDAD empty cards) remains BLOCKED.

- **P1 coral CTA**: wine-red → coral #ff7a66→#ff5a47 on all primary CTAs. Root-cause: the unscoped
  `:is()` lava rule (native.css ~2587, specificity 1,1,0) was beating appended overrides — patched in place.
  Ghost/cyan buttons unchanged.
- **P2 corner toggles**: landing theme (top-right) + language (top-left) → fixed 32×32px circles,
  active-opt-only icons, pill label dropped, hover cyan, light-theme variant.
- **P3 HUB relocate**: topAva → fixed 44px bottom-right circle (V6 insignia; Blocker 12 fixed); FAB shifted
  to 144px; topbar freed for LOCAL MODE pill.
- **Release marker 20260805.1** (bump-version.sh): fixes stale `?v=` cache-busting that kept old CSS served.
- Gates: verify.sh PASSED (38 files, bundle 340,303 B deterministic); official test 76/76; v0.14 suite 13/13;
  regressions BatchC 11/11, BatchD 11/11, Project2 18/18, Gaps 9/9, B1 6/6, B2 7/7.
- Next: Pipe reviews preview → production deploy via
  `GRIDNODE_FOUNDER_APPROVAL=YES GRIDNODE_STAGING_NAME=gridnode-production bash scripts/deploy-production.sh --confirm-production`.


## V0.14 PRODUCTION DEPLOY — 2026-08-05 (LIVE)

**Status: DEPLOYED TO PRODUCTION** by Pipe's explicit go ("deploy it").

- Deployment: `9a3d99ca` (Environment=Production, branch=main) → **gridnode.network LIVE**.
- Release marker: `20260805.1` (cache-busting bump via bump-version.sh).
- Live verification: v0.14 suite **13/13 on gridnode.network** (coral CTA landing+dashboard,
  32x32 corner toggles functional, HUB bottom-right 44px V6 circle opens profile, FAB no-overlap);
  served HTML carries `v=20260805.1` (13 refs, 0 stale).
- Commits: `7184b3b` (P1 coral CTA + P2 corner toggles + P3 HUB corner + marker bump) +
  `2a9717c` (What's New 20260805.1 + mobile-shell test marker). Tree clean.
- Rollback: redeploy `abef361` (pre-v0.14) or CF dashboard → previous production deployment.


---

## V0.15 — CLOUD-FIRST PIVOT + MARS RED + JACK IN REBUILD (20260805.2) — DEPLOYED

**Status: LIVE on gridnode.network** (production deployment a8bb69a3, branch=main, source 35d0f91, 2026-08-05).
Pipe/Mavis: v0.15 spec (NIX-PROMPT-v0.15.md) fully shipped. Verified live via curl + Playwright.

### What shipped
1. **Product pivot to cloud-first** (Pipe-locked 14:05 ET): Google + Passkey are now the headline CTAs on the
   JACK IN screen; "CONTINUE ON THIS DEVICE ONLY" is a demoted footer link; "Local-first. No account required."
   retired from the marketing landing (hero, phase-core CLOUD-FIRST, build copy, trust copy — EN + ES).
2. **v0.14 visual layer reverted** (commit 7184b3b reverted cleanly): coral CTA, extreme corner toggles, and
   HUB-corner all removed; v0.13 baseline restored (topbar HUB with V6 insignia, inline toggles, FAB position).
3. **Mars Red #FF3B3B** applied everywhere red appears (Pipe-locked 13:43 ET): `--red/--red-hi/--red-lo/
   --red-glow` vars; all CTA gradients (btn-primary, fab, landing-btn.primary, passkey, whatsnew-close);
   `--lava-*` vars; light-theme (DUSK) reds; wine (#ff3355/#cc0033/#ff2d4d/#ff5a6e/#8f0f28/...) and coral
   (#ff5a47/#ff7a66) fully purged — verified zero residuals in index.html, native.css, daylight CSS, bundle.
4. **B5 — JACK IN rebuilt**: wordmark title (GRID//NODE, no jargon), 1-line value prop
   ("Sign in to sync your grid across devices."), Continue with Google (full-width, Mars Red shell),
   Continue with Passkey (full-width Mars Red), "or" divider, "CONTINUE ON THIS DEVICE ONLY" footer link,
   VAULT POLICY replaced by "YOUR DATA, YOUR RULES" footer link → small modal. Full viewport use
   (100% up to 480px, centered vertically), mobile-first (>=48px tap targets, no cutoff at 360px).
5. **B6 — Passkey fixed**: email-first UX (focused error "ENTER YOUR EMAIL ADDRESS FIRST"), all error paths
   mapped to clear user states (no passkey / cancelled / unsupported device / email required);
   backend verified live (webauthn-authenticate-options returns proper JSON).
6. **B1/B2/B4 — WHAT'S NEW**: capped at 480px/80vh (desktop + mobile bottom sheet); dismissal key
   `gridnode.lastWhatsNewDismissedBuild` (+ legacy-key migration); already-open guard stops the 3x popup;
   version header binds to build (shows GRID//NODE v0.15.0 / 20260805.2).
7. **B3 — Theme toggle**: restored via revert (v0.13 handler + inline topbar position); verified working.
8. Cache-bust: `?v=20260805.2` on all CSS/JS assets; whatsnew 20260805.2 entry (EN+ES).

### Gates (all green)
- verify.sh VERIFICATION PASSED (bundle 343,196 B deterministic vs locked baseline).
- Official candidate test: **PASS 76/76** (node scripts/test-production-candidate.cjs).
- 15-item smoke test (NIX-PROMPT spec): **29/29 PASS** on preview 54f5775c.
- Regressions: BatchC 11/11, BatchD 11/11, Project2 18/18, Gaps 9/9, B1 6/6, B2 7/7, B6 4/4,
  modal-i18n 12/12, peplock 11/11, close-guard 7/7.
- Known/expected console noise on PREVIEW only: `[GSI_LOGGER] origin not allowed` — Google OAuth client
  is whitelisted for gridnode.network, not preview domains. No errors on production.

### Commits
- `35d0f91` feat(v0.15): cloud-first pivot + Mars Red + JACK IN rebuild + passkey fix (23 files, +5944/-6010).
  Pushed to feature/gridnode-product-completion. Tree clean.
- Production deployment: `a8bb69a3` (main). Rollback: CF dashboard → previous production deployment
  (9a3d99ca = v0.14/20260805.1) or redeploy a prior commit.


---

## V0.15.1 — QUICK SHOT · TUTORIAL · COMPACT TOPBAR (20260805.3) — DEPLOYED

**Status: LIVE on gridnode.network** (production deployment 3615c714, branch=main, source a36c5d8, 2026-08-05).
Per NIX-PROMPT-v0.15.md (updated 32KB version, 20-item smoke). B9 deferred to v0.16+ per Pipe.

### What shipped
1. **B7 — Quick shot safety** (Pipe decision: sheet approach): the red FAB NEVER auto-logs.
   Tap → pre-filled bottom-sheet drawer (last med/dose, today/now) via the app's own draft
   machinery (`moduleState.shotDraft` + `openLogModal({preserve:true})`); native sessionStorage
   shot draft cleared first so `restoreShotDraft()` can't wipe the pre-fill (runtime-verified:
   sDose survives). `saveShot()` fires only on explicit SAVE → existing undoable bottom toast
   with UNDO → closeLog + refreshAll → stays on current tab. No view jump, no top banner.
2. **B8 — Onboarding teaches**: 5 plain-language steps (REGISTER MY FIRST DOSE → LOG WEIGHT →
   theme → language → You're ready) with `data-onboard` spotlights on real controls; kicker
   "QUICK START" (was "SYSTEM ORIENTATION"); jargon copy removed EN+ES (STEPS + COPY in
   onboarding.js + i18n en/es-419). Existing `injectReplay()` keeps the HUB "GUIDED TOUR" replay.
3. **R2/R2.1 — Compact topbar**: 32x32 icon-only toggles with custom brand SVGs (NIGHT = tall
   LA tower with lit cyan+Mars windows; DUSK = flat city skyline; 16-20px, no emoji/glyphs per
   Pipe 18:17 "no names just icons"); language = single globe button with dropdown (EN/ES text
   pills removed from topbar AND landing); HUB 32x32 V6 mark; topbar 56-64px; wordmark 24px;
   no horizontal scroll at 390px (verified).
4. **B4 — One version number**: WHAT'S NEW header now shows a single line
   ("GRID//NODE v0.15.1 2026-08-05" + "// release 20260805.3"); cyan release-title subtitle and
   NEW/IMPROVED/FIXED badges dropped (bullets kept); `APP_VERSION`/`APP_BUILD` constants are the
   single source of truth in gridnode-version.js; profile What's New row data-bound (no v0.12.0).
5. **B10 — Inline errors**: passkey register failures render `.gn-inline-error` (Mars Red,
   role=alert, word-break — no truncation) directly under the "+ REGISTER A NEW PASSKEY" button;
   no more topbar "// SYSTEM CHECK —" banners. Success still uses the bottom toast.
6. Cache-bust `?v=20260805.3` on all assets; whatsnew 20260805.3 entry (EN+ES).

### Gates (all green)
- verify.sh VERIFICATION PASSED (bundle 343,666 B deterministic vs locked baseline).
- Official candidate test: **PASS 76/76** (JSON result, 0 fails).
- v0.15.1 smoke (16-20 + R2/B4/B7/B8/B10): **22/22 PASS** on preview af6f7cd2.
- Regressions: BatchC 11/11, BatchD 11/11, Project2 18/18, Gaps 9/9, B1 6/6, B2 7/7, B6 4/4,
  modal-i18n 12/12, peplock 11/11, close-guard 7/7.
- Live verification on gridnode.network: v=20260805.3 (13 refs), version.js release 20260805.3
  / APP_VERSION 0.15.1, inline-error CSS, topbar compact rules, theme SVGs + globe lang,
  onboarding QUICK START, bundle has draft-prefill + no auto-log.

### Deferred
- **B9 achievement badges → v0.16+ pending Pipe's explicit request** (section does not exist in
  current code — verified 0 matches for ACHIEVEMENT/BADGES/STREAK anywhere).

### Commits
- `a36c5d8` feat(v0.15.1): quick-shot confirm sheet, teaching tutorial, compact topbar, inline
  errors (25 files, +473/-213). Pushed. Tree clean.
- Production deployment: `3615c714` (main). Rollback: CF dashboard → previous production
  deployment (a8bb69a3 = v0.15/20260805.2) or redeploy a prior commit.


---

## V0.15.2 — POLISH SWEEP · BOTTOM TOASTS · LEANER SHELL (20260805.4) — DEPLOYED

**Status: LIVE on gridnode.network** (production deployment a2256311, branch=main, source 17a6491, 2026-08-05).
Full bug hunt + flow polish per founder request ("use all skills/tools, full pass, fix bugs/errors, improve flow,
deployable for live users"). Verified live via curl + Playwright.

### Bug fixes
1. **CSV mapping alert()**: replaced `window.alert('This CSV does not contain...')` with an inline
   `.gn-inline-error` (Mars Red, role=alert) inside the import panel — errors near the action (B10 rule).
   i18n `mapping.needHeaderRow` added EN+ES. Runtime-verified: bad CSV shows inline error, ZERO alert dialogs.
2. **Junk files removed**: tracked 0-byte files `[^` and `]*` deleted from repo root.
3. **Empty-catch audit**: all 24 `catch (_) {}` blocks reviewed — every one is an intentional storage guard
   (JSON.parse fallbacks, localStorage/sessionStorage prefs/drafts). None swallow user-visible failures;
   critical save/sync paths use explicit error branches. No changes needed.
4. **Bundle re-scan**: no duplicate function defs, no leftover v0.14 strings, no alerts remaining.

### Flow polish (the "not flowing correctly" wins)
5. **Toasts now at the BOTTOM** (spec B7/B10: "Bottom toast, not top banner"): the real bug was two
   bundle-injected `.toast` rules with `!important` pinning toasts to the TOP (runtime-measured top:6px!).
   Fixed the base CSS (index.html: bottom:calc(84px+safe-bottom), slideUp) AND both bundle-injected rules.
   Runtime-verified: undoable toast now renders at bottom above the nav.
6. **Onboarding adaptivity**: step 1 uses `selFn: firstShotTarget()` — spotlights
   `[data-onboard="empty-cta"]` for new users, `.fab` (LOG SHOT) for users with shot history.
   Fixed renderStep/bindStep/onViewportMove/click-capture to honor selFn (spotlight now works for
   returning users — was silently degraded). Runtime-verified: returning user → FAB spotlight + QUICK START.
7. **Scanner image lean shell**: 73KB JPEG extracted from inline base64 → `/assets/scanner-body.jpg`
   with `loading="lazy"`; removed the dead `data-back` attribute (~87KB more). index.html trimmed
   ~185KB total. Runtime-verified: served HTML 433KB, scanner base64 gone, image loads from asset.

### Gates (all green)
- verify.sh VERIFICATION PASSED (bundle 343,679 B deterministic vs locked baseline, 38 files).
- Official candidate test: **PASS 76/76**.
- polish-verify 10/10 (bottom toasts, CSV inline error, scanner lazy, version 20260805.4/0.15.2, tour adaptivity).
- Viewport matrix 28/28 (360/390/720/1440 × themes × EN/ES × all tabs — no overflow, no errors).
- Runtime walk 17/17. Regressions: BatchC 11/11, BatchD 11/11, Project2 18/18, Gaps 9/9, B1 6/6, B2 7/7,
  B6 4/4, modal-i18n 12/12, peplock 11/11, close-guard 7/7.
- Live verification: gridnode.network v=20260805.4 (13 refs), version.js 20260805.4/0.15.2, bundle has
  bottom-toast rules, onboarding selFn/hasTarget, CSV inline error, no alert, inline-error CSS.

### Commits
- `17a6491` feat(polish): bug sweep + flow polish (24 files: fixes + asset + junk deletions).
  Pushed. Tree clean.
- Production deployment: `a2256311` (main). Rollback: CF dashboard → previous production deployment
  (3615c714 = v0.15.1/20260805.3) or redeploy a prior commit.


---

## V0.15.3 — ONBOARDING REDESIGN · SPOTLIGHT TOUR (20260805.5) — DEPLOYED

**Status: LIVE on gridnode.network** (production deployment 856044d1, branch=main, source 4696c44, 2026-08-05).
Founder report: "what am I looking at? how is this an onboarding tutorial? terrible" — the tour rendered as a
floating popup with NO highlighted control. Root-caused and redesigned.

### Root cause
The dashboard renders TWO empty states: the empty-hero (with `REGISTER MY FIRST DOSE`) OR the first-shot
mission card (with `LOG YOUR FIRST SHOT`). The tour only targeted the hero CTA; when the mission-card state
was active, the target was off-DOM/above the fold → the spotlight hole + ring never rendered → plain popup.

### Fixes
1. **Always-visible targets**: mission-card CTA (`LOG YOUR FIRST SHOT`) now tagged `data-onboard="empty-cta"`
   so BOTH empty-state variants expose the tour target; `renderStep` scrolls the target into view
   (block:center) BEFORE hole placement — the spotlight is always on-screen at any viewport.
2. **Card redesign**: anchored beside the target with a rotated pointer arrow aimed at the hole; QUICK START
   kicker + `STEP 01/05` badge; gradient progress bar (replaces dots); Mars Red CONTINUE; pulsing cyan
   spotlight ring (`gnOnbPulse`, 1.6s); 200ms hole transitions; light-theme variant (cream card, dark dim).
3. **Ring specificity fix**: the red-lava `:is()` block's inset box-shadow was beating `.gn-onb-target`
   (rendering an orange glow) — upgraded to `#app .gn-onb-target` (1,1,0) + `!important` → cyan ring
   verified at runtime (`rgb(0,212,255) 3px + 30px glow`).
4. **Teaching copy** (EN+ES): concrete per-step language — e.g. "This red button starts your record. Tap it
   when you take a dose — then just fill in the date, time, and where you injected. That's everything you need."

### Gates (all green)
- Onboarding verify 13/13 across 4 states (fresh hero, mission-card, returning user→FAB, light theme):
  CTA on-screen + cyan ring + arrow + STEP badge + 20% progress + 4 non-zero hole dims in every state.
- Geometry probe: cyan ring + arrow-points-at-CTA confirmed.
- Official candidate test PASS 76/76; regressions BatchC 11/11, BatchD 11/11, Project2 18/18, Gaps 9/9,
  B1 6/6, B2 7/7, B6 4/4, modal-i18n 12/12, peplock 11/11, close-guard 7/7.
- verify.sh VERIFICATION PASSED (bundle 343,704 B deterministic).
- Live: gridnode.network v=20260805.5 (13 refs), onboarding.js has scrollIntoView + arrow, native.css has
  gnOnbPulse + `#app .gn-onb-target` + gn-onb-arrow.

### Commits
- `4696c44` feat(onboarding): spotlight tour redesign (22 files, +253/-136). Pushed. Tree clean.
- Production deployment: `856044d1` (main). Rollback: CF dashboard → previous production deployment
  (a2256311 = v0.15.2/20260805.4) or redeploy a prior commit.
