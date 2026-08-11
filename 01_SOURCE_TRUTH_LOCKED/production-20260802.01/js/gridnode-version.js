/* GRID//NODE — single authoritative user-facing version source.
 * scripts/bump-version.sh updates the `release` field on every release;
 * `semver` bumps are deliberate per-release decisions.
 * Load this file FIRST, before the runtime bundle.
 */
(function () {
  'use strict';
  window.GN_VERSION = Object.freeze({
    APP_VERSION: '0.15.5',
    APP_BUILD: '20260810.2',
    semver: '0.15.5',
    release: '20260810.2',
    title: 'V0.15.5 — 2026 PREMIUM REFINEMENT PASS',
    date: '2026-08-10'
  });
})();
