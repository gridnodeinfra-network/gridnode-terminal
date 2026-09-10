# DESIGN TOKENS — shared component system (release 20260802.12)

Single source: `css/native/` (shared; 5 ordered files, cascade pinned in `css/native/order.json`) + `css/daylight-nexus-pilot.css`
(DAY OPS overrides) + `:root` semantic tokens in index.html.

## Core identity tokens
| Token | NIGHT GRID | DAY OPS |
|---|---|---|
| --panel (surfaces) | #0e0e16 | #f4f1e9 |
| --surface (elevated) | #0a0a14 | #fbf9f2 |
| --text (primary) | #eef6f8 | #1c2b31 |
| --text-mid | #b7c7d3 | #2e424b |
| --text-dim | #6f6f88 (>=4.5:1) | #4d6b75 |
| --border | rgba(255,255,255,.15) | rgba(20,60,70,.3) |
| system cyan | #00d4ff family | #006f82 family |
| action lava | --lava-core-hi #ff5a6e / --lava-core #ff2d4d / --lava-edge #8f0f28 | same family, deepened |
| --radius-card | 12px | 12px |

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
