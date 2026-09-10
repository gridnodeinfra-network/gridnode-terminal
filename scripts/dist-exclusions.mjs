/* GRID//NODE dist exclusion list — single source of truth shared by
 * scripts/build.mjs (do not copy into dist/) and scripts/verify-build.mjs
 * (do not require in dist/).
 *
 * These are repo files that must NEVER ship to production: bundle sources
 * (their code ships inside js/gridnode-bundle.js), brand design sources and
 * proof renders, and duplicate root assets superseded by brand/icons/.
 * Verified unreferenced by index.html, sw.js SHELL, manifest.json, CSS and
 * JS on 2026-09-10. Nothing in this list is fetched at runtime.
 *
 * Entries are paths relative to the repo root. A trailing '/' means "this
 * directory and everything under it".
 */
export const DIST_EXCLUDE = [
  // Bundle sources — concatenated into js/gridnode-bundle.js by build-bundle.sh
  'js/gridnode-app.js',
  'js/gridnode-core.js',
  'js/modules/',
  // Split-order manifests — source organization, never fetched at runtime
  'css/native/order.json',
  // Brand design sources / proof renders — repo-only reference material
  'assets/brand/source/',
  'assets/brand/proof/',
  'assets/brand/master/',
  // Root duplicates — the brand/icons/ copies are the referenced ones
  'assets/splash-1290x2796.png',
  'assets/apple-touch-icon.png',
];

export function isExcluded(relPath) {
  const p = relPath.replace(/\\/g, '/');
  return DIST_EXCLUDE.some((e) =>
    e.endsWith('/') ? p === e.slice(0, -1) || p.startsWith(e) : p === e
  );
}
