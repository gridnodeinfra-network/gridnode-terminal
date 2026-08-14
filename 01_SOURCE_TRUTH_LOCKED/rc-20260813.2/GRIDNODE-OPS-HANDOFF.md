# GRID//NODE — Complete Ops Handoff for Another Harness/Agent

**Generated:** 2026-08-05 (state: v0.15.4 / release `20260805.6`, production LIVE, preview LIVE)
**Purpose:** everything a fresh harness/agent needs to build, test, and deploy GRID//NODE (Cloudflare Pages + Supabase) without prior context.

---

## 1. Top-level facts

| Thing | Value |
|---|---|
| Product | GRID//NODE — personal biotech OS (GLP-1/peptide + weight tracking). Vanilla JS SPA, no framework. |
| Production URL | `https://gridnode.network` (Cloudflare Pages custom domain → **branch `main`**) |
| Preview URL (stable alias) | `https://preview.gridnode.pages.dev` (always newest preview) |
| Repo (canonical) | WSL Ubuntu-24.04: `/home/thinkpadwinbash/workspaces/gridnode-terminal` (Windows: `\\wsl.localhost\Ubuntu-24.04\home\thinkpadwinbash\workspaces\gridnode-terminal`) |
| GitHub | `gridnodeinfra-network/gridnode-terminal`, branch `feature/gridnode-product-completion` |
| Current version | `20260805.6` / semver `0.15.4` (single source: `js/gridnode-version.js`) |
| Cloudflare account | r3dp0is0n2012@gmail.com — Account ID `f008e0b7e3867a6050b412d931a9abd9` |
| Wrangler auth | OAuth token at `/home/thinkpadwinbash/.wrangler/config/default.toml` |
| Host shell | Windows PowerShell → run WSL via `wsl.exe -e bash -lc '...'` |

## 2. Supabase (cloud sync + auth + passkeys)

| Thing | Value |
|---|---|
| Project URL | `https://quwbmhxgteyykujydvii.supabase.co` |
| Project ref | `quwbmhxgteyykujydvii` |
| Org | `boyqoalrwagmcjqfzgnj` |
| Anon/publishable key | `sb_publishable_rWPuL8wGfe2zok4cYNENng_L6n2Qttu` |
| Google OAuth client | `305099332421-u752btn6p8cbaq8opapvdkfau9gnd9a3.apps.googleusercontent.com` (whitelisted origins: gridnode.network only — preview domains log GSI_LOGGER origin warnings, expected) |

**Tables** (all RLS owner-scoped by `auth.uid()`, anon revoked): `profiles`, `shots`, `weights`, `workspaces` (+ `webauthn_credentials` for passkeys).

**Edge Functions (Supabase, in repo):**
- `supabase/functions/webauthn-authenticate-options`
- `supabase/functions/webauthn-authenticate-verify`
- `supabase/functions/webauthn-register-options`
- `supabase/functions/webauthn-register-verify`
- `supabase/functions/_shared/webauthn.ts`
- Also `functions/api/delete-account.ts` (Cloudflare Pages Function)

**Deploying functions:**
```bash
cd /home/thinkpadwinbash/workspaces/gridnode-terminal
# requires supabase CLI auth (service-role access); deploy each:
supabase functions deploy webauthn-authenticate-options --project-ref quwbmhxgteyykujydvii
supabase functions deploy webauthn-authenticate-verify --project-ref quwbmhxgteyykujydvii
supabase functions deploy webauthn-register-options --project-ref quwbmhxgteyykujydvii
supabase functions deploy webauthn-register-verify --project-ref quwbmhxgteyykujydvii
```
(If the CLI isn't authed on the machine, deploy from the Supabase dashboard → Edge Functions → deploy from repo, or `supabase login`.)

**Storage model (client):** local-first in `localStorage` (`gn_local_*` keys via `S.get/set` in `js/gridnode-core.js`; account-scoped as `gn_${accountKey}_${key}`) + optional Supabase sync queue (`queueCloudSync`, `flushCloudDeletes`, `hydrateCloudData`).

## 3. Release / version workflow (MANDATORY order)

1. **Edit source**: `index.html`, `js/gridnode-core.js`, `js/gridnode-modules.js`, `js/gridnode-app.js`, satellites (`js/gridnode-*.js`), `css/gridnode-native.css`, `css/daylight-nexus-pilot.css`, `i18n/en.json`, `i18n/es-419.json`, `sw.js`.
2. **Bundle**: `js/gridnode-bundle.js` is the ONLY runtime loaded (built by `scripts/build-bundle.sh` from core+modules+app) — BUT the bundle has drifted (passkey/quickLogShot code lives ONLY in the bundle). **Patch the bundle directly + mirror to modules**; do NOT regenerate blindly with build-bundle.sh or you will lose the passkey feature.
3. **Bump version** (`js/gridnode-version.js`): `release` + `APP_BUILD` (e.g. `20260805.7`), `semver` + `APP_VERSION` (e.g. `0.15.5`), `title`.
4. **Add WHAT'S NEW entry** (`js/gridnode-whatsnew.js` NOTES map): key = release, with `version/title/date/en/es`. Escape apostrophes (`\'`). Never write `null` values into i18n.
5. **Cache-bust**: replace the old `?v=20260805.6` with the new release in `index.html` (13 refs) + `js/gridnode-app.js`, `js/gridnode-native.js`, `sw.js`, `js/gridnode-bundle.js` (1 ref each). Zero stale refs allowed.
6. **i18n parity**: both `en.json` and `es-419.json` must have identical key sets, no `null` values.
7. **Re-lock**: sync changed files into `01_SOURCE_TRUTH_LOCKED/production-20260802.01/` + regenerate `source-metadata.json` (sha256 + bytes for all 38 files; key order sorted).
8. **verify.sh**: `bash scripts/verify.sh` — must end `VERIFICATION PASSED` (bundle deterministic vs locked baseline, 38 files hash-checked, shellcheck, node --check).
9. **Deploy preview**: `GRIDNODE_STAGING_NAME=gridnode-preview bash scripts/stage-deploy.sh` then `bash scripts/deploy-preview.sh` → returns `https://<hash>.gridnode.pages.dev` + alias.
10. **QA on preview** (see §5). Then **production** (§4).

## 4. Deployment (Cloudflare Pages)

```bash
cd /home/thinkpadwinbash/workspaces/gridnode-terminal

# PREVIEW (any time)
GRIDNODE_STAGING_NAME=gridnode-preview bash scripts/stage-deploy.sh
bash scripts/deploy-preview.sh            # → https://<hash>.gridnode.pages.dev

# PRODUCTION (requires Founder approval — never without it)
GRIDNODE_STAGING_NAME=gridnode-production bash scripts/stage-deploy.sh   # MUST re-stage first (deploy script does NOT re-stage)
GRIDNODE_FOUNDER_APPROVAL=YES GRIDNODE_STAGING_NAME=gridnode-production bash scripts/deploy-production.sh --confirm-production
```

**Deploy quirks (learned the hard way):**
- `deploy-production.sh` deploys `.staging/gridnode-production` — if you don't re-stage, you deploy a STALE build (happened twice).
- Cloudflare edge-caches versioned assets briefly: after deploy, verify with a fresh `?cb=<random>` query; `cf-cache-status: HIT` with old content is transient — wait ~15-30s and re-check.
- `gridnode.network` routes to branch `main`. Production deploys push to `main`.
- "0 files uploaded" is Cloudflare's cross-deployment dedup — not an error.
- Rollback: CF dashboard → the project → Deployments → rollback to previous deployment, or redeploy a prior commit.

## 5. QA harness (Windows, Playwright + Edge)

Location: `C:\Users\r3dp0\AppData\Roaming\reasonix\global-workspace\gn-qa\`
Run from PowerShell: `$env:BASE_URL="https://<preview>.gridnode.pages.dev"; node qa-<suite>.cjs`

**Suites (all must pass):**
- `qa-batchc.cjs` — drawer/toast/undo (11)
- `qa-batchd.cjs` — HUB/danger/peptide (11)
- `qa-project2.cjs` — peptide structure (18)
- `qa-gaps.cjs` — gap checks (9)
- `qa-b1-hub.cjs` (6), `qa-b2-404-tour.cjs` (7), `qa-b6-light.cjs` (4)
- `qa-modal-i18n.cjs` (12), `qa-peplock.cjs` (11), `qa-close-guard.cjs` (7)
- `qa-polish-verify.cjs` (10) — bottom toasts, CSV inline error, scanner lazy, version
- `qa-onb-verify.cjs` (13) — onboarding 4 states (fresh hero, mission-card, returning FAB, light)
- `qa-polish-matrix.cjs` (28) — viewport matrix 360/390/720/1440 × themes × lang × tabs
- `qa-polish-sweep.cjs` (17) — runtime walk, console-error sweep

**Official candidate test (WSL):**
```bash
cd /home/thinkpadwinbash/workspaces/gridnode-terminal
node scripts/test-production-candidate.cjs "https://<preview>.gridnode.pages.dev" "<release>" "<semver>"
# expect: result PASS | checks 76 | fails 0  (exit code 1 is a known harness quirk; read the JSON)
```

**Mobile shell / PWA:**
```bash
node scripts/test-mobile-shell.cjs "https://<preview>.gridnode.pages.dev"
```

**Local dev server (no package.json):** plain static file server on port 4173, WSL-side only (WSL2 localhost forwarding to Windows absent) — for behavioral QA use deployed previews.

## 6. Critical code invariants (do not break)

- `js/gridnode-bundle.js` is the runtime; passkey + quickLogShot exist ONLY in the bundle → patch bundle + mirror to `gridnode-modules.js`/`gridnode-app.js`.
- FAB NEVER auto-logs: tap → pre-filled bottom-sheet drawer → user confirms via SAVE → undoable bottom toast → no view jump (`quickLogShot` uses `moduleState.shotDraft` + `openLogModal({preserve:true})`; clears `gn_shot_draft_session_v1` first).
- Toasts are BOTTOM (`bottom: calc(84px + var(--safe-bottom))`) — two bundle-injected `.toast` rules must stay bottom (both `!important`).
- Onboarding sequencing: WHAT'S NEW dispatches `gn:whatsnew-shown/dismissed/resolved`; tour waits for resolution, auto-dismisses if WHAT'S NEW appears. Never both on screen.
- Spotlight ring: `#app .gn-onb-target` (1,1,0 specificity) — beats the lava `:is()` inset box-shadow.
- CRT overlay: `.scanlines` = `repeating-linear-gradient(0deg, transparent 0 3px, rgba(0,0,0,0.035) 3px 4px)` (kept subtle; founder wants CRT everywhere but no color wash). `.scan-sweep` alpha 0.05.
- Mars Red `#FF3B3B` / hover `#FF5B5B` / deep `#D12424` — NO coral, NO wine anywhere. Lava vars map to Mars Red.
- Cloud-first: Google + Passkey are headline CTAs; "CONTINUE ON THIS DEVICE ONLY" is demoted; no "Local-first" marketing copy.
- Errors render INLINE near the action (`.gn-inline-error`), never `alert()`/topbar SYSTEM CHECK banners.
- i18n: `t()`/`tx()` everywhere user-visible; no hardcoded UI strings; EN/ES parity.
- JACK IN screen: wordmark title, one-line value prop, full-width Mars Red CTAs, full viewport (mobile-first).

## 7. Vision skill for screenshots (lm-studio-vision-bridge)

- CLI: `python .reasonix/skills/lm-studio-vision-bridge/lms-vision.py <img> "<prompt>"` (needs LM Studio running on :1234 with a vision model — currently not installed).
- Fallback (working): modlens (Gemini) — `& "$env:LOCALAPPDATA\hermes.dirty-20260805-211919\node\modlens.cmd" -i <img> --timeout 120000 -o out.json` (key in `~/.modlens/config.json`; free quota ~5 calls/day then 429).
- Node (when PATH is broken): `& "C:\Program Files\nodejs\node.exe"` or `& "$env:LOCALAPPDATA\hermes.dirty-20260805-211919\node\node.exe"`.

## 8. Environment gotchas

- PowerShell `curl` (not curl.exe) / `$()`/quotes get mangled through `wsl.exe -e bash -lc '...'` — write script files to the Windows workspace, `cp` to `/tmp`, run.
- `node`/`npm` may not be on PATH in some sessions — use full paths above.
- AGENTS.md rule: scripts must be `#!/usr/bin/env bash; set -Eeuo pipefail`; scripts never commit/push.
- Backup config: `$env:APPDATA\reasonix\config.toml` (+ `.backup-*` files in workspace).

## 9. Current known state (2026-08-05)

- Production: `20260805.6` (v0.15.4) — deployment `aa3aafc8`, branch main, source `f8cca8c` (+ `ed00d3a` docs). All fixes live (sequencing, CRT balance, onboarding redesign, bottom toasts, CSV inline errors, scanner lazy-load, Mars Red, cloud-first).
- Git: `feature/gridnode-product-completion`, HEAD `ed00d3a`, tree clean.
- Deferred: B9 achievement badges → v0.16+ pending founder request (section doesn't exist in code).
- Vision model download (Qwen2.5-VL-3B via LM Studio) pending — local vision not yet available.
