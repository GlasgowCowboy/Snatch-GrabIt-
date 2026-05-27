/* Snatch&GrabIt! service worker.
 *
 * Goals (V1, deliberately minimal):
 *   - Make the app installable as a PWA (the SW registration unlocks
 *     beforeinstallprompt on Chrome / desktop / Android).
 *   - Cache the app shell so a cold load on flaky Wi-Fi at least shows
 *     a layout instead of a blank page.
 *   - DO NOT cache /api/* or /ws — those need to hit the live server,
 *     never a stale copy.
 *
 * Non-goals (deliberately): offline gameplay, push notifications,
 * background sync. Multiplayer games can't function offline anyway.
 *
 * Bump CACHE_VERSION whenever the build output changes shape (rare —
 * the browser also revalidates on `?v=` query strings from the bundler).
 */
const CACHE_VERSION = 'sg-shell-v1';
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never cache same-origin API or WebSocket traffic — these must always
  // hit the live server.
  if (
    req.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/ws')
  ) {
    return; // let the browser handle it normally
  }

  // Network-first for navigation requests so users get fresh HTML when
  // online, with cached shell as fallback when they're not.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('/'))),
    );
    return;
  }

  // Cache-first for static assets (JS / CSS / images / fonts).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Only cache successful same-origin responses.
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      });
    }),
  );
});
