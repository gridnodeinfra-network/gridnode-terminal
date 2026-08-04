# GRID//NODE Production-Readiness Handoff — 2026-08-04

## Resume from here

- Workspace: `/home/thinkpadwinbash/workspaces/gridnode-terminal`
- Branch: `feature/gridnode-product-completion`
- Current local server: `http://127.0.0.1:4173`
- Intended candidate version: `0.12.0`
- Intended release marker: `20260804.1`
- Intended release title: `PRODUCTION READINESS + MEDICATION INTEGRITY`
- Exact rollback commit: `9764766d60ec5a9c6761ca0bc5a4667bde567f64`
- Production status: **untouched**
- Candidate commit: **not created**
- Final preview deployment: **not performed**
- Current verdict: **BLOCKED — four P1 findings remain unresolved**

This file is the authoritative resume point. Do not deploy or commit the current tree as a production candidate until every blocker and freeze step below is complete.

## What is already implemented and verified

### Medication identity and record integrity

- Stable canonical medication IDs are implemented.
- `zepbound_tirzepatide`, `ozempic_semaglutide`, and `semaglutide_compound` remain distinct.
- Invalid new medication values fail closed.
- The SHOT draft retains medication, dose, date, time, side effects, and location through the scanner detour.
- Zepbound persists correctly through save, History, Edit, Archive, RESULTS, and Phase Engine surfaces.
- Ten canonical side-effect IDs persist and render in English and Spanish.
- Height summary, language, theme, records, and profile metrics persist after reload.

### Product and interface work

- Onboarding is exactly four stages.
- Forced-action stages have no Next button and advance through the real target.
- First-run dashboard prioritizes `LOG YOUR FIRST SHOT TO ACTIVATE YOUR GRID`.
- The landing page uses a real GRID//NODE product preview; the rejected hologram is not present.
- DAY OPS has a final semantic readability layer with functional phone text floors, readable dropdowns, and explicit state colors.
- NIGHT GRID retains its identity and passes the same rendered contrast classifier.
- LAB tools open as focused destinations with Back-to-LAB behavior.
- Loading terminal is themed rather than a white block.
- Mobile shell includes dynamic viewport handling, safe-area padding, persistent bottom navigation, draft retention, app-history ordering, offline shell states, and deliberate update UI.
- Release/version/What’s New history is synchronized at `0.12.0 / 20260804.1` in the working tree.

### Accessibility fix completed immediately before handoff

`#wtOv` was visibly open while still carrying `aria-hidden="true"`. This was fixed at the shared layer observer in `js/gridnode-native.js`: tracked overlays now synchronize `aria-hidden` on open, close, and browser Back. Deterministic assertions were added to `scripts/test-production-candidate.cjs`.

Verified result:

```json
{"open":"false","closed":"true"}
```

### Latest passing local gates

- `node scripts/verify-release-system.mjs`
  - PASS: `v0.12.0 · 20260804.1 · 4 history entries · EN/ES · safe activation`
- `node scripts/test-production-candidate.cjs http://127.0.0.1:4173 20260804.1 0.12.0`
  - PASS after the overlay accessibility fix.
  - DOMContentLoaded: approximately 635 ms.
  - Longest observed main-thread task: 55 ms.
  - Includes medication identity, SHOT integrity, onboarding, localization, LAB Back, 320–1440 overflow, 44px targets, form labels, keyboard activation, focus, reduced motion, manifest, What’s New, service worker, and offline shell.
- `node scripts/test-mobile-shell.cjs http://127.0.0.1:4173 20260804.1 0.12.0`
  - PASS after the overlay accessibility fix.
- English DAY OPS audit:
  - `/tmp/gridnode-012-final-en-light`
  - Zero reported contrast/readability failures before the overlay accessibility fix.
- Spanish DAY OPS audit:
  - `/tmp/gridnode-012-final-es-light`
  - Zero reported contrast/readability failures before the overlay accessibility fix.
- NIGHT GRID audit:
  - `/tmp/gridnode-012-final-en-dark`
  - Zero reported contrast/readability failures before the overlay accessibility fix.
- `bash scripts/verify.sh`
  - Passed before the final overlay accessibility edit. It must be rerun after the locked mirror and metadata are finalized again.

## Unresolved P1 blockers

### 1. Spanish localization is incomplete in unexercised functional states

The broad served audit only rejects a short list of known mixed-language phrases and does not exercise every error/import/auth/inventory state. The independent review found loaded functional English strings that bypass `tx(...)`.

Required edits:

- `js/gridnode-product-completion.js`
  - Generic CSV mapping validation near line 256: `Map RECORD TYPE and DATE before previewing.`
  - Map summary/count/commit strings in the same flow.
- `js/gridnode-bundle.js`
  - Profile save success/storage-full feedback near line 1442.
  - Permanent-delete failure/success/cloud-queued feedback near lines 1955–1958.
  - Linked-weight storage-full feedback near line 2008.
  - Inventory validation, save, archive, restore, button, and timeline feedback around lines 2732 onward.
  - Calculator out-of-range errors and generated Reference Math/Reference Total prose around lines 2912–2930.
  - CSV export and VAULT backup prepared toasts around lines 3122–3134.
  - Backup preview, restore button, summary, errors, reset copy, and import feedback around lines 3211–3225.
  - Auth validation, connecting, account confirmation, cloud errors, recovery, and Google sign-in statuses around lines 3733–3760.
- Add real keys to both `i18n/en.json` and `i18n/es-419.json`.
- Use `tx(key, fallback, params)` for generated copy; do not store translated strings as data.
- Keep `js/gridnode-modules.js` and other source counterparts consistent where the same logic exists.

Required deterministic coverage:

- Exercise each listed state with `gn.lang=es`.
- Assert the rendered/toast text is Spanish and contains none of the English fallback phrases.
- Cover success and failure states, including storage-full simulation, invalid calculator range, CSV mapping validation, backup preview/failure, inventory save/archive/restore, and auth validation/status.

### 2. Service-worker update activation is not yet atomic

Current `sw.js` uses network-first navigation. An old active worker can serve and cache a new unversioned `index.html` before the waiting new worker is applied. That new index requests new versioned assets, causing the visible app update to occur before the user chooses UPDATE.

Required root fix in `sw.js`:

1. Active-release navigation must be cache-first from its own `CACHE_NAME`:
   - `cache.match('/index.html') || cache.match('/')`
2. Only use network navigation if that release cache has no shell; do not refresh the old release's cached index from the network.
3. Asset lookup must use the active worker's own `CACHE_NAME`, not global `caches.match(...)`, so an old worker cannot read a waiting release's cache.
4. Preserve current deliberate activation:
   - waiting worker precaches the new release;
   - app preserves SHOT draft and active destination;
   - user chooses UPDATE;
   - app posts `SKIP_WAITING`;
   - new worker activates, removes old release caches, claims clients;
   - `controllerchange` reloads into the new cached index and asset set.

Required deterministic coverage:

- Serve/install an old release worker and shell.
- Switch the served files to the new release without activating the waiting worker.
- Assert the visible app/version remains old, the draft remains intact, and a waiting update is reported.
- Apply UPDATE.
- Assert controller change/reload produces exactly `0.12.0 / 20260804.1`, restores the draft/destination, and shows What’s New exactly once.

Do not claim safe update handling until this old-worker/new-server transition test passes.

### 3. Focused LAB content can start underneath the sticky header

Proof frame identified by the independent review:

- `/tmp/gridnode-012-final-en-light/390-lab-research.png`

The sticky `.gn-lab-tool-head` occupies the top of the overlay while the first Research content is scrolled to the same top origin. `openLabTool` calls `scrollIntoView({ block: 'start' })` around the time content is moved into the focused host, and the moved section has no matching scroll margin.

Required edits:

- `js/gridnode-bundle.js`: update `openLabTool(tool)` so content is appended and the overlay is activated before the final scroll position is applied.
- Prefer setting the focused overlay's `scrollTop = 0` after layout for a newly opened tool.
- If targeted scrolling remains, add shared `scroll-padding-top` / first-child `scroll-margin-top` equal to the sticky header height plus 12–16px.
- Relevant CSS: `.gn-lab-tool-head`, `#gnLabToolHost`, and the focused overlay in `css/gridnode-native.css`.

Required coverage:

- Research Peptides, Calculators, Inventory, Dose Projection, and syringe visualizer.
- English/Spanish and DAY OPS/NIGHT GRID.
- 320, 360, 390, 412, 430, tablet, and desktop.
- Assert the first content bounding box begins below the sticky header with at least a 12px gap.
- Verify touch, mouse, keyboard, browser Back, and nested-dropdown Escape after the change.

### 4. SHOT save and inventory auto-deduction are not atomic under storage failure

In `js/gridnode-bundle.js`, `saveShot` currently calls `reconcileInventoryForShot(record, existing)` before persisting `shots`. That function immediately persists inventory and queues workspace sync. If the subsequent SHOT write fails because storage is full, inventory has already been deducted or restored for a SHOT that was not saved.

Required root fix:

- Add a shared storage multi-write transaction helper in `S` (`js/gridnode-core.js` and loaded `js/gridnode-bundle.js`) that:
  - snapshots the raw current values for all keys;
  - attempts every write;
  - on any failure, removes partial writes and restores every snapshot;
  - returns success/failure;
  - queues no cloud sync until all local writes succeed.
- Refactor `reconcileInventoryForShot` into a preparation step that returns the next inventory state and whether it changed; it must not persist or sync itself.
- Persist `shots` and changed `inventory` through the multi-write helper.
- Queue `shot` and `workspace` cloud sync only after the local transaction succeeds.
- Keep linked weight behavior explicit; if weight must be part of the same logical commit, include it in the same multi-write transaction and test that decision.

Required deterministic coverage:

- Seed an auto-deduct inventory item and a SHOT draft.
- Force `localStorage.setItem` to fail on the SHOT/inventory transaction.
- Assert SHOTS, inventory quantity/history, event ledger, weights, and cloud-sync queue are unchanged.
- Remove the failure, save again, and assert exactly one SHOT, one correct deduction, and no duplicate history/sync entries.
- Repeat while editing an existing SHOT so restore/re-deduct behavior is also atomic.

## Coverage still required after blocker fixes

- Expand the readability audit beyond elements in the current visible viewport; scroll every major surface through its full content and audit newly visible text.
- Run responsive checks on every major system, not only the dashboard, at 320, 360, 390, 412, 430, tablet, desktop, and wide desktop.
- Recapture screenshot proof after the final fixes; all current `/tmp` screenshots predate the final shared overlay accessibility change and the unresolved blocker fixes.
- Chromium/Playwright is the only browser engine installed. No WebKit runtime or physical Android/iPhone device was available. Before production approval, run physical-device or trusted remote-device checks for:
  - iPhone Safari and iOS Add to Home Screen;
  - Android Chrome and installed Android PWA;
  - keyboard open/close, safe areas, browser/system Back, background/resume, standalone launch, offline shell, and real update activation.
- Browser plugin was not available; Playwright fallback was used.

## Exact freeze sequence after implementation

1. Run syntax and localization parsing:

   ```bash
   node --check js/gridnode-bundle.js
   node --check js/gridnode-core.js
   node --check js/gridnode-modules.js
   node --check js/gridnode-native.js
   node --check js/gridnode-product-completion.js
   node --check js/gridnode-whatsnew.js
   node -e "JSON.parse(require('fs').readFileSync('i18n/en.json')); JSON.parse(require('fs').readFileSync('i18n/es-419.json'))"
   ```

2. Run release synchronization:

   ```bash
   node scripts/verify-release-system.mjs
   ```

3. Run behavioral gates:

   ```bash
   node scripts/test-production-candidate.cjs http://127.0.0.1:4173 20260804.1 0.12.0
   node scripts/test-mobile-shell.cjs http://127.0.0.1:4173 20260804.1 0.12.0
   ```

4. Run the three complete rendered audits:

   ```bash
   node scripts/audit-served-day-ops.cjs http://127.0.0.1:4173 /tmp/gridnode-012-final-en-light en 20260804.1 light
   node scripts/audit-served-day-ops.cjs http://127.0.0.1:4173 /tmp/gridnode-012-final-es-light es 20260804.1 light
   node scripts/audit-served-day-ops.cjs http://127.0.0.1:4173 /tmp/gridnode-012-final-en-dark en 20260804.1 dark
   ```

5. Synchronize every changed locked-mirror runtime file under:

   `/home/thinkpadwinbash/workspaces/gridnode-terminal/01_SOURCE_TRUTH_LOCKED/production-20260802.01`

6. Recalculate `source-metadata.json` byte counts and SHA-256 values, then run:

   ```bash
   bash scripts/verify.sh
   git diff --check
   ```

7. Stage the exact deploy artifact again. The existing `.staging/gridnode-preview` is stale because it was created before the last `js/gridnode-native.js` accessibility fix.

   ```bash
   bash scripts/stage-deploy.sh
   find .staging/gridnode-preview -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum
   ```

8. Perform one new independent read-only review after all four blockers are fixed. Require an explicit statement that no P0/P1 blocker remains.

9. Commit the exact candidate once. Record the resulting commit hash. Any source change after this point requires a new commit and full rerun.

10. Deploy preview only:

    ```bash
    bash scripts/deploy-preview.sh
    ```

11. Rerun every gate against the exact served preview URL and recapture screenshots from that URL. Confirm the served version marker and changelog are `0.12.0 / 20260804.1`.

12. Give the final verdict only after served verification:

    - `READY FOR FOUNDER PRODUCTION APPROVAL`
    - or `BLOCKED — <exact remaining defect>`

13. Do not run production deployment without explicit Founder approval.

## Current worktree notes

- The worktree is intentionally dirty and contains all candidate changes.
- The locked mirror has been partially synchronized and its metadata updated through the overlay accessibility fix, but must be regenerated after the four blocker fixes.
- `01_SOURCE_TRUTH_LOCKED/production-20260802.01/js/gridnode-core.js` is currently untracked and must be intentionally included or deliberately removed from the locked candidate convention before commit.
- The newly added QA scripts are untracked and should be committed with the candidate after they cover all blocker regressions.
- Current staged artifact fingerprint `1e62aa496aab62f2776ef950d1df7d5c87a0b2b90776da84724f37f34076b224` is obsolete because staging predates the final overlay accessibility edit. Do not use it for deployment.

## Production and rollback

- Production has not been touched.
- Do not run a production command from this handoff.
- Rollback source commit remains:

  ```bash
  git switch --detach 9764766d60ec5a9c6761ca0bc5a4667bde567f64
  ```

Use a separate recoverable worktree for rollback verification; do not reset or discard this dirty candidate worktree.
