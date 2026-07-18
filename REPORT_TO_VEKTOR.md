# GRID//NODE — Stabilization Report for VEKTOR

**Date:** 2026-07-18  
**Project:** GRID//NODE  
**Build:** v2.0.0-stable  
**Status:** Static deployment-ready; production deployment still requires a hosting target and credentials.

## 1. Final recommendation

Use the current modular static build as the next web MVP baseline.

The build is ready for controlled real-user testing in local-first mode. Do not expand the feature set until real users have tested the core tracking flow and feedback has been collected.

Recommended sequence:

1. Deploy the static build.
2. Run founder Android/mobile QA on the deployed HTTPS URL.
3. Invite a small group of real users.
4. Collect feedback and usage data.
5. Stabilize based on evidence before considering native apps.

## 2. What changed

The original production source was a large single HTML file with duplicated inline JavaScript, multiple boot paths, session-dependent storage access, and conflicting authentication behavior.

The working build now uses:

- `index.html` for the preserved GRID//NODE interface and visual identity.
- `js/gridnode-core.js` for state, storage, sessions, and optional cloud sync.
- `js/gridnode-modules.js` for SHOTS, Phase Engine, RESULTS, LAB, VAULT, and navigation.
- `js/gridnode-app.js` for boot, authentication shell, compatibility bridges, and orchestration.
- `js/gridnode-bundle.js` as the deployable browser runtime.

`index.html` loads one consolidated runtime bundle instead of executing the previous duplicated JavaScript architecture.

## 3. Systems fixed

### Core

- Landing page to boot/auth flow.
- Local session entry without requiring cloud authentication.
- Account-scoped local persistence.
- Refresh recovery.
- Main navigation across HOME, SHOTS, RESULTS, LAB, and YOU/VAULT.
- Mobile layout and interaction pass.

### SHOTS

- Scanner zone selection.
- Medication category selection.
- Dose entry.
- Date and time handling.
- Required-field validation.
- SHOT history rendering.
- SHOT editing.
- Archive confirmation.
- Archive restore.
- Compatibility migration for older saved location strings.

### Phase Engine

- Uses the latest active logged SHOT.
- Calculates time since the latest SHOT.
- Displays educational cycle phase visibility.
- Shows estimated next-shot timing based on the existing reference cadence.
- Preserves educational and non-medical language.

### RESULTS

- Weight record entry.
- Weight history display.
- Trend summary.
- Phase Engine source context.
- SHOT continuity context.
- Fixed an HTML rendering bug that displayed literal `<span>` markup in the current-weight result.

### LAB

- U-100 syringe math.
- Dose/concentration calculation.
- Educational calculator output.
- Preserved safety boundaries and non-recommendation language.

### VAULT / Profile

- Local-only status visibility.
- Profile information surface.
- CSV export.
- Backup export.
- Branded sign-out confirmation.
- Local data retained after sign-out and re-entry.

### Reliability / compatibility

- Safe storage reads before session initialization.
- Legacy local storage fallback.
- Legacy mojibake text normalization for existing saved records.
- Fixed medication accordion behavior.
- Repaired visible text encoding in the active interface.

## 4. QA evidence

The build was tested locally through a browser against the static HTTP server.

Verified flows:

- Landing → GET STARTED → authentication screen.
- Authentication screen → CONTINUE LOCALLY.
- Scanner zone selection.
- Saved a SHOT using Zepbound, 2.5 mg, and Right Abdomen — Upper.
- Confirmed SHOT history record appeared.
- Confirmed Phase Engine changed to `ONSET`.
- Confirmed estimated next-shot date appeared.
- Edited the SHOT form.
- Archived the SHOT.
- Restored the SHOT.
- Logged a 180.0 lb weight record.
- Confirmed RESULTS displayed the weight record.
- Confirmed RESULTS displayed PHASE ENGINE SOURCE.
- Tested HOME, SHOTS, RESULTS, LAB, and YOU navigation.
- Refreshed the page and confirmed SHOT, weight, and Phase Engine state remained.
- Signed out and re-entered local mode.
- Confirmed saved data remained after re-entry.
- Tested at a 390 × 844 mobile viewport.
- Confirmed mobile SHOTS and LAB surfaces loaded.
- Confirmed no browser console errors during the tested flows.
- Confirmed `js/gridnode-bundle.js` passed Node syntax validation.

## 5. Known limitations

### Cloud authentication and sync

The Supabase adapter is implemented, but the following still require production verification:

- Real email/password signup.
- Real email/password login.
- Google OAuth redirect flow.
- Password recovery email.
- Cloud table schema.
- Row-level security policies.
- Cross-device recovery.
- Reinstall recovery.

These require a real test account, final HTTPS deployment URL, and correctly configured Supabase Auth settings.

### Local mode boundary

Local mode persists data in the browser on the current device. It cannot recover data after browser storage is cleared, device loss, or reinstall unless the user connects a working cloud account or exports a backup.

### Source cleanup

The active JavaScript architecture is modular and consolidated. The original visual CSS remains embedded inside the preserved HTML shell to reduce visual regression risk during stabilization.

## 6. Deployment instructions

Upload the following to any static host:

- `index.html`
- the complete `js/` folder

Deployment settings:

- Build command: none.
- Publish directory: the folder containing `index.html`.
- Entry point: `index.html`.
- HTTPS: required for production auth and reliable browser behavior.

After deployment:

1. Open the HTTPS URL on Android Chrome.
2. Complete the mobile QA checklist.
3. Test the deployed local-first flow.
4. Configure Supabase redirect URLs for the final domain.
5. Verify cloud signup/login with a real test account.
6. Verify RLS before allowing real cloud data.

## 7. Files for VEKTOR

- `index.html` — deployable application shell.
- `js/gridnode-bundle.js` — deployable runtime bundle.
- `js/gridnode-core.js` — storage/session/cloud source module.
- `js/gridnode-modules.js` — product systems source module.
- `js/gridnode-app.js` — application orchestration source module.
- `README.md` — beginner-safe deployment and QA notes.
- `REPORT_TO_VEKTOR.md` — this handoff report.

## 8. What to keep

- GRID//NODE branding and cyberpunk biotech identity.
- SHOTS as the primary tracking flow.
- Phase Engine as the central differentiator.
- RESULTS, LAB, NODE, and VAULT concepts.
- Local-first data ownership.
- Educational/non-medical safety boundary.
- Existing mobile-first interaction model.

## 9. What to reject

- Removing major systems to hide bugs.
- Reintroducing duplicated boot or storage logic.
- Making cloud authentication mandatory for first use.
- Adding dosing, treatment, diagnosis, or medical recommendation behavior.
- Building native apps before real web-user feedback exists.
- Adding features without evidence of user value.

## 10. Exact next prompt for VEKTOR

> Review `REPORT_TO_VEKTOR.md` and the current GRID//NODE stable web build. Deploy `index.html` plus the complete `js/` folder to the approved HTTPS static host. Do not redesign the brand or add features. First verify Android/mobile boot, local session entry, SHOT logging, scanner location selection, SHOT history, RESULTS weight tracking, refresh persistence, archive/restore, LAB navigation, and VAULT export. Then configure and test Supabase Auth, table access, RLS, and cross-device recovery using a dedicated test account. Report every failure with reproduction steps and the exact file/function involved.
