// CreteXchange Service Worker — versioned caching for icon auto-updates
// Bump this version any time icons or key assets change
const CACHE_VERSION = 'cx-v3';
const ICON_CACHE = `${CACHE_VERSION}-icons`;

const ICON_URLS = [
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  '/cretexchange-icon-192.png',
  '/cretexchange-icon-512.png',
  '/manifest.json',
];

// Install — pre-cache icons
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version', CACHE_VERSION);
  event.waitUntil(
    caches.open(ICON_CACHE).then((cache) => {
      return cache.addAll(ICON_URLS).catch((err) => {
        console.warn('[SW] Some icons failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate — clear old caches, take control, notify clients of update
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== ICON_CACHE).map((k) => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
        )
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Tell all open tabs there's a fresh version
        return self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'UPDATE_AVAILABLE', version: CACHE_VERSION });
          });
        });
      })
  );
});

// Fetch — cache-first for icons/manifest, network-first for everything else
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isIcon = ICON_URLS.some((u) => url.pathname === u || url.pathname.startsWith('/icons/'));

  if (isIcon) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(ICON_CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
  }
  // All other requests: normal network (no caching)
});

// Message — allow clients to trigger skipWaiting
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
