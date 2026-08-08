/* GRID//NODE — single authoritative user-facing version source.
 * scripts/bump-version.sh updates the `release` field on every release;
 * `semver` bumps are deliberate per-release decisions.
 * Load this file FIRST, before the runtime bundle.
 */
(function () {
  'use strict';
  window.GN_VERSION = Object.freeze({
    APP_VERSION: '0.15.5',
    APP_BUILD: '20260808.8',
    semver: '0.15.5',
    release: '20260808.8',
    title: 'V0.15.5 — A11Y · I18N · WCAG SWEEP',
    date: '2026-08-08'
  });
})();
