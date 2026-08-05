/* GRID//NODE — single authoritative user-facing version source.
 * scripts/bump-version.sh updates the `release` field on every release;
 * `semver` bumps are deliberate per-release decisions.
 * Load this file FIRST, before the runtime bundle.
 */
(function () {
  'use strict';
  window.GN_VERSION = Object.freeze({
    semver: '0.12.0',
    release: '20260805.1',
    title: 'V0.14 POLISH — CORAL CTA · CORNER TOGGLES · HUB CORNER',
    date: '2026-08-05'
  });
})();
