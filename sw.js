const CACHE_NAME = 'bypos-cache-v4';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './logo.png',
  './icon-app.png'
];

// 1. Install & pre-cache assets safely
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Use individual puts so if any one fails, others succeed
      await Promise.allSettled(
        STATIC_ASSETS.map(url =>
          fetch(url)
            .then(res => {
              if (res.ok) return cache.put(url, res);
            })
            .catch(() => {})
        )
      );
    })
  );
});

// 2. Activate & clean up old caches immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fast Fetch Handler (Only handles same-origin GET requests)
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // Skip browser extensions & non-http protocols
  if (!req.url.startsWith('http')) return;

  // Navigation (Page load) -> Network First with quick Cache Fallback
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          return caches.match('./index.html') || caches.match('./');
        })
    );
    return;
  }

  // Same-origin static assets -> Cache First with Background Update
  if (req.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(req).then(cachedResponse => {
        if (cachedResponse) {
          // Revalidate in background
          fetch(req)
            .then(netRes => {
              if (netRes && netRes.status === 200) {
                caches.open(CACHE_NAME).then(cache => cache.put(req, netRes));
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        return fetch(req).then(netRes => {
          if (netRes && netRes.status === 200) {
            const clone = netRes.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return netRes;
        });
      })
    );
  }
});
