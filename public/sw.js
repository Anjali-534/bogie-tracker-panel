// Minimal app-shell service worker for installability + offline resilience.
// Deliberately simple: this panel is a live operational tool, so everything
// dynamic stays network-first; only same-origin static assets are cached.
// Bump the version to invalidate all cached assets on the next deploy.
const CACHE = 'bogie-tracker-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build assets are immutable — cache-first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
      )
    );
    return;
  }

  // Pages and public assets — network-first so users always get live data,
  // falling back to the last cached copy when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.mode === 'navigate' || url.pathname.match(/\.(png|jpg|jpeg|svg|ico|json|css|js)$/))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
