# DESIGN TOKENS — shared component system (release 20260802.12)

> **Correction (anti-slop audit, 2026-10-20):** this doc's token table had
> drifted from the code and one claim was false. The canonical token source
> is `css/native/08-design-tokens.css` (15 native files load, not 5; order
> pinned in `css/native/order.json`, with `css/daylight-nexus-pilot.css`
> first and `12-legacy-externalized.css` last). `--text-dim #6f6f88` was
> claimed ">=4.5:1" — it measured **3.94:1** on `--surface-1`; the token
> is now `#8383a0` (5.23:1). The lava family in code is
> `--lava-core-hi #FF5B5B / --lava-core #FF3B3B / --lava-edge #D12424`, and
> `--radius-card` is **16px**. The 2026-10-20 audit also completed the
> `html[data-theme="light"]` block in 08-design-tokens.css (semantic
> success/warning/danger + chart tokens were previously dark-only values
> on light surfaces, measuring as low as 1.19:1).

Single source: `css/native/` (cascade pinned in `css/native/order.json`) + `css/daylight-nexus-pilot.css`
(DAY OPS overrides) + `:root` semantic tokens in index.html.

## Core identity tokens
| Token | NIGHT GRID | DAY OPS |
|---|---|---|
| --panel (surfaces) | #0e0e16 | #f4f1e9 |
| --surface (elevated) | #0a0a14 | #fbf9f2 |
| --text (primary) | #eef6f8 | #1c2b31 |
| --text-mid | #b7c7d3 | #2e424b |
| --text-dim | #8383a0 (5.23:1 on --surface-1) | #476169 |
| --border | rgba(255,255,255,.15) | rgba(20,60,70,.3) |
| system cyan | #00d4ff family | #006f82 family |
| action lava | --lava-core-hi #FF5B5B / --lava-core #FF3B3B / --lava-edge #D12424 | same family, deepened |
| --radius-card | 16px | 16px |

## Shared component classes (in gn-native.css)
- Typography-by-role: technical font for labels/headings/HUD; readable font for
  copy/help/warnings/forms (.form-label .64rem+; copy line-height 1.55)
- Controls: 44px touch target floor (.topbar-btn/.modal-btn/.time-tab/
  .scanner-mode-btn/.cp-option), press feedback (100ms scale), :focus-visible rings
- Red-lava CTA: .btn-primary/.gn-auth-primary/.future-confirm-save/.gn-whatsnew-close
  (gradient core + crimson edge + glow; labels get AA text-shadow)
- Hologram: bezel, scan sweep, zone pulse (reduced-motion static fallback)
- States: .gn-empty-state/.gn-loading-state/.gn-error-state/.gn-offline-banner
- Overlays/dropdowns/calendars/date pickers: one shared light-theme layer
- Data cards: instrument-well inset depth, HUD corner ticks
- Motion: property-list transitions, reduced-motion global kill switch
