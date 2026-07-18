# GRID//NODE stable web build

This folder is a static, mobile-first GRID//NODE web application. The runtime is local-first: a user can open the app, create a local session, log SHOTS, review RESULTS, use LAB tools, and keep the record after refresh without an account.

Production URLs:

- `https://gridnode.network/`
- `https://gridnode.pages.dev/`

The public landing, boot, and authentication states intentionally hide all private navigation and SHOT controls. The private shell appears only after cloud authentication, account creation, or `CONTINUE LOCALLY`.

## Deploy

Upload these items to any static web host:

- `index.html`
- `sw.js`
- the complete `js/` folder

Use the project root as the publish directory. There is no build command and no server-side runtime required for local mode.

For Cloudflare Pages, Netlify, Vercel, or GitHub Pages, use:

- Build command: leave blank
- Output/publish directory: the folder containing `index.html`
- Entry file: `index.html`

After publishing, open the public HTTPS URL on a phone and complete the mobile QA checklist below.

## Optional cloud account setup

The optional cloud adapter is in `js/gridnode-core.js` and connects to the existing Supabase project configured for this build. Local mode does not depend on cloud auth.

Before calling cloud recovery launch-ready, verify the Supabase project has:

- Auth email/password enabled
- Google OAuth redirect URLs configured for the deployed HTTPS domain
- `profiles`, `shots`, and `weights` tables
- Row-level security policies keyed to the authenticated user id
- email confirmation and password recovery settings appropriate for the launch

Cloud signup, Google OAuth, and recovery require a real test account and the final deployed redirect URL; they were not end-to-end verified in this local QA environment.

## Source structure

- `index.html` - preserved GRID//NODE markup, visual system, and static shell
- `js/gridnode-core.js` - state, local storage, sessions, cloud adapter, sync helpers
- `js/gridnode-modules.js` - SHOTS, Phase Engine, RESULTS, LAB, VAULT, and navigation modules
- `js/gridnode-app.js` - boot, auth shell, compatibility bridge, and app orchestration
- `js/gridnode-bundle.js` - deployable browser bundle referenced by `index.html`
- `sw.js` - network-first update and offline fallback worker that prevents stale production shells

## Mobile QA checklist

1. Open the HTTPS URL on a 390px-wide phone viewport.
2. Tap `GET STARTED`.
3. Tap `CONTINUE LOCALLY`.
4. Open `SHOTS`, select a scanner zone, and tap `LOG YOUR FIRST SHOT`.
5. Select medication, enter dose, save, and confirm the record appears in history.
6. Confirm the Phase Engine changes from `NO DATA` to an educational phase estimate.
7. Open `TRENDS` and add a weight record.
8. Confirm RESULTS shows the weight record and Phase Engine source.
9. Refresh the page and confirm the session, SHOT, and weight remain.
10. Test `LAB`, `YOU`, archive/restore, CSV export, and backup export.

## Medical boundary

GRID//NODE provides tracking, organization, educational estimates, and data-grounded pattern awareness. It does not diagnose, prescribe, recommend treatment, validate preparation, or recommend dosing or timing changes. Medical decisions belong with a licensed clinician.
