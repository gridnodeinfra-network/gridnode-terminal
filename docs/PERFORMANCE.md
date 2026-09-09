# PERFORMANCE — baseline (release 20260802.12, preview d63fb973)

Measured via Edge headless (playwright-core) at 390x800, preview, fresh context:

| Metric | Value | Note |
|--------|-------|------|
| Wall load (goto→load) | 513 ms | |
| DOMContentLoaded | 444 ms | |
| load event | 495 ms | |
| First paint | 292 ms | |
| First contentful paint | 1,308 ms | includes font + SRI'd CDN libs; < 2s target |
| Navigation transfer | 221,692 B (raw) | gzip'd by CF edge |
| Total resource bytes | 167,678 B | 18 resources |
| Largest transfers | supabase UMD 27.8KB · fonts ~56KB total · bundle ~? (below top 8) | no oversized assets |

Size audit:
- Runtime bundle 284 KB (est. ~75 KB gzip) — unchanged by all polish passes (delta +392 B for P6 safety).
- City backgrounds WebP 65 KB each (theme-conditional); splash 30 KB; icons tiny.
- Satellites (native/onboarding/whatsnew/theme/etc.) each 3-10 KB.

Quick wins already in place across the loop: WebP assets, SW whitelisted-versioned cache,
immutable cache headers, SRI, deferred satellites, CSS-only animations, reduced-motion
static fallbacks, no WebGL/hologram cost.

Limitations: TBT/CLS and on-device jank need DevTools/real-device tracing (no lab device
farm here); long-task attribution via CDP tracing was out of scope for the harness.
Performance has no serious regression vs production (production load path identical
architecture).
