/* GRID//NODE — single authoritative user-facing version source.
 * scripts/bump-version.sh updates the `release` field on every release;
 * `semver` bumps are deliberate per-release decisions.
 * Load this file FIRST, before the runtime bundle.
 */
(function () {
  'use strict';
  window.GN_VERSION = Object.freeze({
    APP_VERSION: '0.15.6',
    APP_BUILD: '20260811.1',
    semver: '0.15.6',
    release: '20260811.1',
    title: 'V0.15.6 — LAUNCH INTEGRITY + 2026 SURFACE',
    date: '2026-08-11'
  });
})();
