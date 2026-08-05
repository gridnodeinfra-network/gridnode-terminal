/* GRID//NODE — single authoritative user-facing version source.
 * scripts/bump-version.sh updates the `release` field on every release;
 * `semver` bumps are deliberate per-release decisions.
 * Load this file FIRST, before the runtime bundle.
 */
(function () {
  'use strict';
  window.GN_VERSION = Object.freeze({
    APP_VERSION: '0.15.1',
    APP_BUILD: '20260805.3',
    semver: '0.15.1',
    release: '20260805.3',
    title: 'V0.15.1 — QUICK SHOT · TUTORIAL · COMPACT TOPBAR',
    date: '2026-08-04'
  });
})();
