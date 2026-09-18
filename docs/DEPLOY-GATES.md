# GRID//NODE Deploy Gates — the "never again" runbook

Third broken-preview regression happened 2026-09-18: `css/native/*` never
reached staging (flat `css/*.css` copy), Cloudflare served `index.html`
(HTTP 200, `text/html`) as all five stylesheets, and the preview shipped
with broken icons and clipped panels. The old post-deploy check only
sampled 4 hardcoded asset paths, so it missed the other four stylesheets.

Every preview deploy now passes SIX gates. A deploy that fails a hard
gate aborts; nothing ships broken silently.

## Gate 1 — Build integrity (pre-stage, hard)

`npm run build` then `npm run verify`.

- `dist/` must be built from current HEAD (`BUILD_ID` stamp ends with the
  short commit hash). A dirty-tree build keeps the old stamp and is
  indistinguishable from the previous release, so always commit first,
  then build.
- No functional `__CURRENT_BUILD__` placeholder may survive in staged JS.

## Gate 2 — Bundle completeness (staging, hard)

`scripts/stage-deploy.sh` (deploy-gridnode.sh stages from `dist/` the same way).

- The full `dist/` tree is staged: `js/`, `css/` **recursively**
  (including `css/native/`), `assets/`, `i18n/`, `sw.js`, `manifest.json`,
  `_headers`.
- Every local asset `index.html` references (`src`/`href="./…"` and
  root-relative `src`/`href="/…"` — favicons, apple-touch-icons, splash
  screens) must exist and be non-empty in staging. A missing file serves
  `index.html` as fallback and silently breaks styling/scripting, so this
  fails loudly.

## Gate 3 — Local smoke (pre-deploy, hard)

`node scripts/smoke-dist.mjs` — serves `dist/` in headless Chromium and
fails on any failed local request, page error, or missing boot DOM node.

## Gate 4 — Deployed content match (post-deploy, hard)

`deploy-gridnode.sh` Step 4/6: the served `index.html` on the deployment
URL must be byte-identical to the staged candidate on `.pages.dev`.

## Gate 5 — Live asset audit (post-deploy, hard) ← the new one

`node scripts/audit-deployed-assets.mjs <deployment-url> --dist <staged-dir> --expect-stamp-from <staged-index.html>`

Fetches the LIVE deployment and checks EVERY asset the app needs —
`index.html` references (`./…`-relative AND root-relative `/…`
favicons, apple-touch-icons, splash screens), `url(...)`
sub-references inside served CSS (including `../`-relative paths),
AND assets JS fetches or assigns dynamically at runtime, discovered
by scanning served bundle text for local asset paths: static string
literals (`img.src = "/assets/brand/icons/pwa-192.png"`) and
template-literal directory prefixes (`` fetch(`./i18n/${file}`) ``
expands `./i18n/` against the staged tree, so new catalogs are
covered with no manifest to maintain):

- HTTP 200 for each asset
- `Content-Type` matches the extension (`text/css` for `.css`, …) —
  catches the SPA fallback that returns HTML with 200
- body is non-empty and NOT byte-identical to `index.html`
- served bytes are byte-identical to the staged file (catches partial
  uploads / slow fleet replication)
- served HTML contains the staged `?v=` build stamp

Proven: FAILS loudly on the broken 2026-09-18 preview (names all five
stylesheets served as `text/html`), PASSES on the fixed build
(43 assets + sub-refs verified live). Proven 2026-09-18: also FAILS
when a JS-fetched asset is missing from the deployment — simulated
Pages SPA fallback serving `index.html` as `/i18n/en.json` is caught
and named (`via js/gridnode-i18n.js → ./i18n/`).

Run it any time against any deployment, including production:
`node scripts/audit-deployed-assets.mjs https://gridnode.network --dist dist`

## Gate 6 — Visual check (post-deploy, advisory)

`deploy-gridnode.sh` Step 6/6 pixel-diffs the staged tree (exactly what
was uploaded) against the approved baseline in `visual-baselines/`
(pointer: `current.txt`), served locally via a loopback static server.

Advisory, not blocking: intentional redesigns change pixels legitimately,
so a human reviews `report.json` + diff overlays. A large diff ratio on a
no-design-change deploy means something rendered catastrophically wrong —
investigate before calling it good.

The harness is proven deterministic: 10/10 viewport×theme cells render
byte-identical (0px diff) when the same build is captured twice, so any
flagged diff is a real rendering change, not noise.

Refresh the baseline after an APPROVED visual change (serve the good
build locally first, then capture):
`node scripts/visual-regression-guard.cjs capture visual-baselines/<name> --release <build-id>`
then point `visual-baselines/current.txt` at the new dir. Note: the
guard's release flag is `--release <id>`; a positional release arg is
silently misparsed, so always use the flag form.

## Checklist before every preview deploy

1. Commit the change (build stamp must equal HEAD).
2. `npm run build && npm run verify`
3. `node scripts/smoke-dist.mjs`
4. `./deploy-gridnode.sh "what changed" <candidate>` — gates 4–6 run automatically.
5. If Gate 5 fails: the deployment is broken. Fix staging/pipeline, redeploy. Never hand a failed-audit URL to anyone as "the preview".
6. If Gate 6 flags diffs: open the report, confirm they are the intended change, else treat as a regression.

Production deploys additionally require Pipe's explicit approval (standing rule).
