/* GRID//NODE offline shell and deliberate update activation.
 * A newly installed worker waits until the user applies it; active SHOT drafts
 * are therefore never replaced underneath an in-progress session.
 */
'use strict';

const RELEASE = '20260811.1';
const CACHE_NAME = 'gridnode-shell-20260811-1';
const V = '?v=' + RELEASE;
const SHELL = [
  '/',
  // NOTE: /index.html is intentionally NOT cached as a shell entry. Cloudflare
  // Pages answers /index.html with a 308 redirect to /; the Cache API stores
  // that entry as redirected:true, and Chromium then fails (ERR_FAILED) when
  // the service worker serves it for a navigation. '/' is the canonical shell.
  '/manifest.json',
  '/css/daylight-nexus-pilot.css' + V,
  '/css/gridnode-native.css' + V,
  '/js/gridnode-theme.js' + V,
  '/js/gridnode-version.js' + V,
  '/js/gridnode-i18n.js' + V,
  '/js/gridnode-bundle.js' + V,
  '/js/gridnode-peptide-pk.js' + V,
  '/js/gridnode-peptide-viz.js' + V,
  '/js/gridnode-phase-sphere.js' + V,
  '/js/gridnode-product-completion.js' + V,
  '/js/gridnode-motivation.js' + V,
  '/js/gridnode-telemetry.js' + V,
  '/js/gridnode-native.js' + V,
  '/js/gridnode-i18n-overlay.js' + V,
  '/js/gridnode-whatsnew.js' + V,
  '/js/gridnode-onboarding.js' + V,
  '/i18n/en.json',
  '/i18n/es-419.json',
  '/assets/gridnode-icon.svg',
  '/assets/preview-dashboard.png'
];

// Unversioned i18n catalogs + manifest are served Cache-Control: immutable;
// fetch them with cache:'reload' at install so stale translations can never be
// baked into a new release's cache (assetResponse does the same on misses).
function shellRequest(path) {
  if (path === '/i18n/en.json' || path === '/i18n/es-419.json' || path === '/manifest.json') {
    return new Request(path, { cache: 'reload' });
  }
  return path;
}
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL.map(shellRequest))));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') event.source?.postMessage?.({ type: 'VERSION', release: RELEASE });
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // CLAIM FIRST (2026-08-08): control transfers instantly so the apply()
    // reload is served by the new shell. Old-cache purge runs in the
    // background — a slow purge (many stale shells on mobile storage) must
    // never delay controllerchange, or the page reloads into the old shell
    // and the UPDATE banner reappears for a second tap.
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'VERSION', release: RELEASE }));
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('gridnode-shell-') && name !== CACHE_NAME).map(name => caches.delete(name)));
  })());
});

async function navigationResponse(request) {
  // CACHE-FIRST from this worker's OWN release cache: an active old worker
  // never serves (or caches) a newer release's unversioned index.html. The
  // visible release only changes when the user applies the waiting worker
  // (SKIP_WAITING) and controllerchange reloads. Fall back to network only
  // when this release cache has no shell.
  const cache = await caches.open(CACHE_NAME);
  // Literal /index.html navigations are served from the '/' shell entry: a
  // pre-fix worker's cache still holds /index.html as a redirected:true entry
  // (Cloudflare 308), which Chromium refuses (ERR_FAILED) on navigation.
  const navTarget = new URL(request.url).pathname === '/index.html' ? new Request(request.url.replace(/\/index\.html$/, '/')) : request;
  const cachedShell = (await cache.match(navTarget, { ignoreSearch: true })) || (await cache.match('/'));
  if (cachedShell) return cachedShell;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put('/index.html', response.clone());
    return response;
  } catch (_) {
    return new Response('GRID//NODE is offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function assetResponse(request) {
  // Look up only in THIS worker's own CACHE_NAME so an old active worker can
  // never read (or serve) a waiting new release's cached assets.
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  try {
    // Unversioned resources (i18n catalogs, manifest) are served with
    // Cache-Control: immutable; bypass the HTTP cache so a returning user
    // never bakes stale translations into the new release's cache.
    const url = new URL(request.url);
    const bypassHttpCache = url.pathname.startsWith('/i18n/') || url.pathname === '/manifest.json';
    const response = await fetch(request, bypassHttpCache ? { cache: 'reload' } : undefined);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (_) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') { event.respondWith(navigationResponse(request)); return; }
  event.respondWith(assetResponse(request));
});
