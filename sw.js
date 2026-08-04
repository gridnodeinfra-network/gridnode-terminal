/* GRID//NODE offline shell and deliberate update activation.
 * A newly installed worker waits until the user applies it; active SHOT drafts
 * are therefore never replaced underneath an in-progress session.
 */
'use strict';

const RELEASE = '20260804.1';
const CACHE_NAME = 'gridnode-shell-' + RELEASE.replace(/\./g, '-');
const V = '?v=' + RELEASE;
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/daylight-nexus-pilot.css' + V,
  '/css/gridnode-native.css' + V,
  '/js/gridnode-theme.js' + V,
  '/js/gridnode-version.js' + V,
  '/js/gridnode-i18n.js' + V,
  '/js/gridnode-bundle.js' + V,
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

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') event.source?.postMessage?.({ type: 'VERSION', release: RELEASE });
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('gridnode-shell-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'VERSION', release: RELEASE }));
  })());
});

async function navigationResponse(request) {
  // CACHE-FIRST from this worker's OWN release cache: an active old worker
  // never serves (or caches) a newer release's unversioned index.html. The
  // visible release only changes when the user applies the waiting worker
  // (SKIP_WAITING) and controllerchange reloads. Fall back to network only
  // when this release cache has no shell.
  const cache = await caches.open(CACHE_NAME);
  const cachedShell = (await cache.match('/index.html')) || (await cache.match('/'));
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
    const response = await fetch(request);
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
