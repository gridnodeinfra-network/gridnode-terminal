/* GRID//NODE — single authoritative user-facing version source.
 * scripts/bump-version.sh updates the `release` field on every release;
 * `semver` bumps are deliberate per-release decisions.
 * Load this file FIRST, before the runtime bundle.
 */
(function () {
  'use strict';
  window.GN_VERSION = Object.freeze({
    semver: '0.9.1',
    release: '20260802.10',
    title: 'MOBILE POLISH PHASE TWO',
    date: '2026-08-02'
  });
})();
