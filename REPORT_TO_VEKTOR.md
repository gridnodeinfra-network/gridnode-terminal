# GRID//NODE — Release Report for VEKTOR

**Date:** 2026-07-18  
**Build:** v2.0.1-stable / shell `20260718.11`  
**Production:** `https://gridnode.network/`  
**Cloudflare Pages:** `https://gridnode.pages.dev/`  
**Immutable deployment:** `https://c55e96ec.gridnode.pages.dev/`  
**Status:** Deployed, HTTP 200, production smoke-tested, and real-account cloud recovery verified.

## 1. Final recommendation

Use v2.0.1-stable as the controlled real-user web MVP baseline.

The core journey is operational: public entry, boot/authentication, local or cloud session, protocol entry, SHOT logging, history, Phase Engine, RESULTS, refresh persistence, and account-scoped cloud recovery. Keep the next phase focused on founder mobile QA and a small real-user cohort. Do not begin native applications until evidence from the web product identifies the right priorities.

## 2. Architecture

The unstable single-file runtime was consolidated into one source of truth:

- `index.html` preserves the approved GRID//NODE interface and embedded visual system.
- `js/gridnode-core.js` owns state, account namespaces, local persistence, authentication, Supabase access, synchronization, and tombstones.
- `js/gridnode-modules.js` owns SHOTS, scanner/location behavior, Phase Engine, RESULTS, LAB, VAULT utilities, and navigation.
- `js/gridnode-app.js` owns boot, public/private shell state, auth orchestration, recovery handling, and compatibility bridges.
- `js/gridnode-bundle.js` is generated from those modules and is the only browser runtime loaded by `index.html`.
- `supabase/schema.sql` is the idempotent schema/RLS source of truth.
- `sw.js` uses an update-safe shell cache with a versioned runtime URL.

The application remains a static web app. No native conversion and no unnecessary framework were introduced.

## 3. Fixed systems

### Core and UX boundary

- Unified boot and initialization path.
- Reliable local and cloud session handling.
- Account-scoped storage keys and consolidated state access.
- Public landing, boot, and auth hide all private navigation and SHOT controls.
- Entering local mode or cloud authentication reveals the private operating environment.
- Signing out immediately restores the public boundary.
- Purpose-built SVG operator icons replaced emoji-style utility icons.
- Consistent error, success, empty-state, and educational wording.

### SHOTS

- Scanner/location selection and selected-location source of truth.
- SHOT draft survives a scanner detour.
- Medication, dose, date/time, weight, symptom, and note logging.
- History rendering, edit, archive, archived view, restore, and permanent-delete cloud tombstones.
- Editing a SHOT-linked weight updates the existing record instead of duplicating it.

### Phase Engine

- Uses the latest active SHOT and protocol history.
- Calculates time since the latest record and educational cycle position.
- Updates from `NO DATA` to a phase after a SHOT is logged.
- Uses an event → rise → peak → decay educational curve.
- Clearly states that the curve is relative, estimated, and not a measured medication level or dosing guide.

### RESULTS, LAB, NODE, and VAULT

- Weight history, current result, trend context, and symptom/side-effect organization.
- Fixed literal HTML appearing in the side-effect trend.
- LAB DRAW/MIX/STOCK navigation and U-100 unit math remain operational.
- NODE remains a data-grounded pattern-awareness layer with no medical recommendations.
- CSV export, backup export/import foundation, reload, and sign-out controls.
- Backup/cloud workspace coverage includes results, notes, symptoms, labs, preferences, settings, arsenal, and selected location.

### Cloud and privacy

- Supabase email/password login and refreshed sessions work with real QA accounts.
- Cloud tables: `profiles`, `shots`, `weights`, and `workspaces`.
- Workspace synchronization covers results, notes, symptoms, labs, preferences, settings, arsenal, and selected location.
- RLS is enabled on all user-data tables.
- Ownership policies use `auth.uid()` and anonymous table privileges are revoked.
- Fixed a critical first-login migration bug that could copy one account's browser-local data into another account. Local migration is now bound to one cloud owner.
- Verified account A data did not appear in clean account C.

## 4. Verified QA evidence

### Functional/mobile test

The final application source was exercised at a 390 × 844 mobile viewport:

- Landing → boot → auth → local entry.
- No bottom navigation or floating SHOT action before private entry.
- HOME, SHOTS, TRENDS, LAB, and YOU.
- Scanner detour with unfinished form preservation.
- SHOT creation with Mounjaro 2.5 mg, location, 200 lb weight, nausea, and a note.
- SHOT history, edit prefill, linked-weight update without duplication, archive, restore.
- Phase Engine changed to `ONSET`.
- RESULTS displayed weight and side-effect trend correctly.
- LAB DRAW/MIX/STOCK and 2.5 mg at 5 mg/mL → 50.0 U calculation.
- Refresh persistence.
- No horizontal overflow in the tested mobile viewport.

### Production verification

- Cloudflare upload completed successfully: six static files plus `_headers`.
- `https://gridnode.network/` returned HTTP 200.
- Production returned `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, the restricted permissions policy, and the configured referrer policy.
- Public landing contained no private navigation or floating SHOT action.
- Boot/auth contained no private navigation or floating SHOT action.
- A separate browser environment signed into cloud QA account A and recovered:
  - last SHOT: July 18;
  - next estimated SHOT: July 25;
  - phase: `ONSET`;
  - weight: 200.0 lb;
  - VAULT state: `CLOUD_SYNCED`.
- Refresh retained the cloud session and recovered records.
- Production HOME, SHOTS, TRENDS, LAB, and YOU navigation all passed.
- The generated JavaScript bundle passed Node syntax validation.

The founder's laptop screenshot was a cropped excerpt. A full 1110 × 456 laptop reproduction showed no corresponding layout shift; no speculative CSS change was made from the crop.

## 5. Remaining limitations

- Google OAuth is still disabled because a Google OAuth client ID and secret have not been created/configured.
- Confirmation-email signup has not been completed through a real email inbox.
- Password-recovery delivery and callback have not been completed through a real email inbox.
- Cross-browser cloud recovery is verified. A true second physical-device/reinstall test remains founder QA.
- Local mode cannot recover after browser storage is cleared unless the user previously exported a backup or connected a cloud account.
- Notes and symptoms are currently captured through SHOTS; LAB data has cloud storage foundation, but dedicated longitudinal record-entry UX can be expanded only after real-user evidence.
- The preserved visual CSS remains embedded in `index.html` to avoid destabilizing the approved interface during emergency stabilization.

## 6. Deployment instructions

Build:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-bundle.ps1
node --check .\js\gridnode-bundle.js
```

Stage only:

- `index.html`
- `sw.js`
- `_headers`
- complete `js/` folder

Deploy:

```powershell
wrangler pages deploy .\deploy-gridnode-stable --project-name=gridnode --branch=main
```

Then verify the immutable deployment URL, `gridnode.pages.dev`, and `gridnode.network` with a unique `?qa=` query to bypass old client caches.

## 7. What to keep

- GRID//NODE identity and cyberpunk biotech command-center language.
- SHOTS as the primary action.
- Phase Engine as the reactor core and differentiator.
- RESULTS, LAB, NODE, and VAULT as one connected system.
- Local-first ownership plus optional cloud recovery.
- Tracking/education boundary with no diagnosis, treatment, or dosing recommendations.
- Web-first sequence: product → users → evidence → native apps.

## 8. What to reject

- Reintroducing duplicated storage, boot, or authentication paths.
- Hiding defects by removing major systems.
- Making cloud authentication mandatory for first use.
- Medical recommendation, sourcing, treatment, or dosing behavior.
- Feature expansion before founder mobile QA and real-user evidence.
- Native development before the web experience proves retention and product value.

## 9. Exact next prompt for VEKTOR

> Review GRID//NODE v2.0.1-stable at `https://gridnode.network/?qa=20260718.11` and the `main` branch of `gridnodeinfra-network/gridnode-terminal`. Do not redesign or add features. Run founder Android QA for landing, boot, auth boundary, local entry, cloud login, scanner draft preservation, SHOT create/edit/archive/restore, Phase Engine, RESULTS, LAB, VAULT export/import, refresh, sign-out, and cloud recovery. Report only reproducible failures with the exact screen, action, expected result, actual result, and relevant file/function. Separately complete real-inbox confirmation signup, password recovery, and Google OAuth configuration/testing.

## 10. B12 / b12.io contamination scan

No b12.io service, content, code, account, or data transfer was used. No B12 / b12.io contamination was found in this release workflow.

