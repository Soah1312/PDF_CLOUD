// Service Worker for CloudPDF Studio — The Bindery
// Caches application shell and typography only. Strictly ZERO document or API persistence.

const CACHE_NAME = 'cloudpdf-shell-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest',
];

// Install: Cache core static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // STRICT GUARANTEE: Never intercept, modify, or cache API calls or user document streams
  if (
    url.pathname.startsWith('/api/') ||
    event.request.method !== 'GET' ||
    event.request.headers.get('range') ||
    url.pathname.includes('/download')
  ) {
    return;
  }

  // Google Fonts caching (Stale-while-revalidate)
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            cache.put(event.request, responseToCache).catch(() => {});
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Shell assets (JS, CSS, SVGs): Network first with cache fallback
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.webmanifest'))
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((network) => {
          if (network && network.status === 200) {
            const responseToCache = network.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache)).catch(() => {});
          }
          return network;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // SPA navigation fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
  }
});

