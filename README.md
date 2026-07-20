# GRID//NODE stable web build

GRID//NODE v2.0.2-stable is a static, mobile-first Personal Biotech Operating System beginning with GLP-1 protocol tracking. It supports local-first use and optional Supabase cloud accounts.

Production URLs:

- `https://gridnode.network/`
- `https://gridnode.pages.dev/`

The public landing, boot, and authentication states hide private navigation and SHOT controls. The private shell appears only after cloud authentication, account creation, or `CONTINUE LOCALLY`.

## Source structure

- `index.html` — preserved interface, visual system, and static shell.
- `js/gridnode-core.js` — state, local persistence, sessions, Supabase adapter, and synchronization.
- `js/gridnode-modules.js` — SHOTS, Phase Engine, RESULTS, LAB, NODE/VAULT surfaces, and navigation.
- `js/gridnode-app.js` — boot, authentication, compatibility bridge, and orchestration.
- `js/gridnode-bundle.js` — generated deployable browser runtime.
- `scripts/build-bundle.sh` — guarded deterministic bundle generator.
- `scripts/verify.sh` — parity, syntax, reference, hash, and growth gate.
- `scripts/stage-deploy.sh` — atomic local Pages staging.
- `scripts/backup.sh` — recoverable local archive with SHA-256.
- `scripts/deploy-preview.sh` / `scripts/deploy-production.sh` — Bash-only Pages deploys.
- `scripts/build-bundle.ps1` — legacy compatibility only; do not use for WSL development.
- `supabase/schema.sql` — idempotent cloud schema, indexes, grants, and RLS policies.
- `sw.js` — update-safe service worker and offline shell fallback.
- `_headers` — production security headers for Cloudflare Pages.

## Build

Run from the repository root in WSL2 Ubuntu:

```bash
bash scripts/build-bundle.sh
bash scripts/verify.sh
```

The readable modules remain in `js/`; the protected `.36` runtime bundle is used as the current behavioral baseline while modular reconciliation continues.

## Deploy

Static files required in the Cloudflare Pages upload:

- `index.html`
- `sw.js`
- `_headers`
- complete `js/` folder

Preview workflow:

```bash
bash scripts/verify.sh
bash scripts/stage-deploy.sh
bash scripts/deploy-preview.sh
```

Production requires a separate staging directory, `GRIDNODE_FOUNDER_APPROVAL=YES`, and `--confirm-production`:

```bash
GRIDNODE_STAGING_NAME=gridnode-production bash scripts/stage-deploy.sh
GRIDNODE_FOUNDER_APPROVAL=YES bash scripts/deploy-production.sh --confirm-production
```

Credentials stay outside Git and are supplied through Wrangler authentication/environment variables. No script commits or pushes changes.

There is no server-side runtime or build command. HTTPS is required for production authentication and service-worker behavior.

## Cloud status

Verified against the production Supabase project on 2026-07-18:

- Email/password authentication and session refresh work with real QA accounts.
- Google OAuth signup, returning-user sign-in, callback recovery, and refreshed sessions work with a real Google account.
- The primary Google web flow uses Google's official identity button and direct ID-token exchange, so the account chooser presents `gridnode.network` instead of the Supabase project hostname.
- `profiles`, `shots`, `weights`, and `workspaces` exist.
- RLS is enabled on every user-data table and ownership policies use `auth.uid()`.
- Anonymous table privileges are revoked.
- SHOTS, weights, results, notes, symptoms, labs, preferences, settings, arsenal, and selected location have account-scoped synchronization paths.
- Cross-account isolation was tested using two clean QA accounts.
- A cloud account recovered its SHOT and weight after refresh.

Still requiring dedicated end-to-end verification:

- Confirmation-email signup through a real mailbox.
- Password-recovery email delivery and callback through a real mailbox.
- Founder testing on a second physical device and after a true reinstall.

Local mode stores data only in the current browser. Users should connect a cloud account or export a backup before clearing browser storage or changing devices.

## Mobile QA checklist

1. Open the production HTTPS URL at a 390 px mobile width.
2. Confirm landing, boot, and authentication hide bottom navigation and the floating SHOT control.
3. Enter using a cloud account or `CONTINUE LOCALLY`; confirm the private shell appears.
4. Visit HOME, SHOTS, TRENDS, LAB, and YOU.
5. Open the scanner, choose a location, and confirm the unfinished SHOT form is preserved.
6. Log a SHOT with medication, dose, date/time, location, optional weight, symptom, and note.
7. Confirm history, Phase Engine, and RESULTS update.
8. Edit the SHOT and confirm its linked weight is updated without duplication.
9. Archive, view archived records, restore, and confirm history recovers.
10. Refresh and confirm the session and records persist.
11. Test LAB DRAW/MIX/STOCK, CSV export, backup export, and backup import.
12. Sign out and confirm private navigation disappears immediately.

## Medical boundary

GRID//NODE provides tracking, organization, educational estimates, and data-grounded pattern awareness. It does not diagnose, prescribe, recommend treatment, validate preparation, or recommend dosing or timing changes. Medical decisions belong with a licensed clinician.

