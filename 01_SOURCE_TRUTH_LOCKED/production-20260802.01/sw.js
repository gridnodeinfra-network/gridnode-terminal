/* GRID//NODE cache-safe service worker
 * Network-first by design so production releases do not strand users on stale app shells.
 */
const CACHE_NAME = 'gridnode-shell-20260802-14';
const SHELL = ['/', '/index.html', '/manifest.json', '/assets/gridnode-icon.svg', '/assets/scanner-body-rear.jpg', '/js/gridnode-bundle.js?v=20260802.14', '/js/gridnode-native.js?v=20260802.14', '/css/gridnode-native.css?v=20260802.14'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === '/sw.js') return;

  const cacheable = /^\/(index\.html)?$/.test(url.pathname) || /^\.(js|css|json|webp|png|jpg|jpeg|svg|ico)$/.test(url.pathname);
  const versioned = /[?&]v=/.test(url.search);
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && cacheable && versioned) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('/index.html');
        return Response.error();
      })
  );
});
