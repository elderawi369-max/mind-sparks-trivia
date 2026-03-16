/* Mind Sparks Trivia – basic PWA service worker
 *
 * Strategies:
 *  - Precache core shell assets on install (cache-first).
 *  - Cache-first for static assets (HTML/CSS/JS/fonts/images).
 *  - Network-first for non-static requests (e.g., APIs).
 *  - Offline fallback for navigation requests when totally offline.
 */

const CACHE_VERSION   = 'v1';
const STATIC_CACHE    = `mst-static-${CACHE_VERSION}`;
const RUNTIME_CACHE   = `mst-runtime-${CACHE_VERSION}`;

// Core app shell assets to precache
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/scripts/firebase.js',
  '/scripts/ai.js',
  '/scripts/utils/images.js',
  '/scripts/app.js',
  '/offline.html',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isStaticAsset(request) {
  const url = new URL(request.url);
  // Same-origin static files by extension
  if (url.origin === self.location.origin) {
    return (
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('.css')  ||
      url.pathname.endsWith('.js')   ||
      url.pathname.endsWith('.png')  ||
      url.pathname.endsWith('.jpg')  ||
      url.pathname.endsWith('.jpeg') ||
      url.pathname.endsWith('.webp') ||
      url.pathname === '/'           ||
      url.pathname === '/offline.html'
    );
  }
  return false;
}

self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Navigation requests → network-first with offline fallback
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached => cached || caches.match('/offline.html'))
        )
    );
    return;
  }

  // Static assets → cache-first
  if (isStaticAsset(request)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Other requests (APIs, third-party calls) → network-first with runtime cache fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        const clone = response.clone();
        caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request))
  );
});

