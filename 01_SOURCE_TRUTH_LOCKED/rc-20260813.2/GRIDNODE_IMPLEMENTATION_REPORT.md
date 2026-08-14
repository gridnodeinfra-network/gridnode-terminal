# GRID//NODE Implementation Report

**Product:** GRID//NODE
**Date:** 2026-08-13
**Build:** v0.15.20 / shell `20260813.1`
**Production:** `https://gridnode.network/`
**Cloudflare Pages:** `https://gridnode.pages.dev/`
**Status:** Locked GRID//NODE v2.0 brand rollout shipped across the public surface, the offline shell, and the runtime token authority.

## 1. Outcome

The locked GRID//NODE v2.0 identity is now the single shipped brand across:

- Public entry, boot, and authentication surfaces.
- PWA manifest, service worker offline shell, and apple-touch icon.
- Inline brand `<img>` lockup/symbol/wordmark/scan badge elements.
- Brand token authority (`--gn-brand-*` CSS custom properties).
- Scanner precision UI (kept intact, recolored through the brand token system).

## 2. Identity surface

- **Canonical mark:** angular GN, G = GRID = Mars Red `#EA0917`, N = NODE = Cyber Cyan `#06BBE3`, `//` operator, tiny Signal Yellow `#FCEE0A` accent.
- **Wordmark / lockups:** see `assets/brand/master/`.
- **Icon set:** see `assets/brand/icons/` (favicon SVG, 16/32 favicon PNGs, apple-touch-icon, 192/512 PWA PNGs, 512 maskable PNG).
- **UI derivatives:** `header-lockup.svg`, `boot-mark.svg`, `scanner-badge.svg`, `update-badge.svg`, `watermark.svg` under `assets/brand/ui/`.

## 3. Verification

- `scripts/test-brand-assets.py` — 7/7 OK (fidelity proofs, color authority, geometry, safe-zone, small-size).
- `scripts/test-brand-rollout.py` — runs after Agent 3 wires `js/*` and `css/*`.

## 4. Rollback

The pre-rollout commit `08fd7db` on `codex/precision-cinematic-scanner` is the rollback point for the brand surface; runtime fixes landed in 0.15.19 (`7e66c1b`) and earlier.
