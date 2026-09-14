/* GRID//NODE — single authoritative user-facing version source.
 * asset-store refresh 20260910: force new content hash after poisoned upload.
 * v0.15.41: APP_VERSION/semver are enforced by scripts/build.mjs to match
 * package.json — the build FAILS if they drift, so the version users see can
 * never go stale again. */
(function () {
  'use strict';
  window.GN_VERSION = Object.freeze({
    APP_VERSION: '0.15.52',
    APP_BUILD: '20260907.1',
    semver: '0.15.52',
    release: '20260907.1',
    title: 'V0.15.52 — PHASE ENGINE REFINED',
    date: '2026-09-14'
  });
})();
