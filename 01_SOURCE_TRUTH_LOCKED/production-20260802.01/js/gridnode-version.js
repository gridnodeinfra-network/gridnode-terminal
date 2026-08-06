/* GRID//NODE — single authoritative user-facing version source.
 * scripts/bump-version.sh updates the `release` field on every release;
 * `semver` bumps are deliberate per-release decisions.
 * Load this file FIRST, before the runtime bundle.
 */
(function () {
  'use strict';
  window.GN_VERSION = Object.freeze({
    APP_VERSION: '0.15.4',
    APP_BUILD: '20260805.6',
    semver: '0.15.4',
    release: '20260805.6',
    title: 'V0.15.4 — SEQUENCING FIX · BALANCED CRT',
    date: '2026-08-04'
  });
})();
