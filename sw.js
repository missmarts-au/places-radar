// Places Radar service worker.
// - navigations + places.json: network-first with cache fallback (updates
//   arrive whenever there's signal; metro dead zones fall back to cache)
// - static assets: stale-while-revalidate (instant load, refreshed in the
//   background so code fixes reach the phone on the next visit)

const CACHE = 'places-radar-v4';

const SHELL = [
  './',
  './index.html',
  './places.json',
  './css/app.css',
  './js/app.js',
  './js/geo.js',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function networkFirst(request, fallbackUrl) {
  return fetch(request)
    .then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
      return res;
    })
    .catch(() =>
      caches.match(request).then((hit) => hit || caches.match(fallbackUrl))
    );
}

function staleWhileRevalidate(request) {
  return caches.match(request).then((hit) => {
    const refresh = fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => hit);
    return hit || refresh;
  });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // tiles, Nominatim: browser default

  if (e.request.mode === 'navigate') {
    e.respondWith(networkFirst(e.request, './index.html'));
    return;
  }
  if (url.pathname.endsWith('places.json')) {
    e.respondWith(networkFirst(e.request));
    return;
  }
  e.respondWith(staleWhileRevalidate(e.request));
});
