/* ============================================================================
 * sw.js — service worker for offline-capable use
 * ----------------------------------------------------------------------------
 * Strategy:
 *   - Precache the same-origin app shell on install.
 *   - Navigations: network-first, falling back to the cached shell offline.
 *   - Same-origin assets: cache-first, then populate the cache in the
 *     background.
 *   - Cross-origin CDN libraries (Lucide, esm.sh): stale-while-revalidate so
 *     they keep working offline once fetched. QR/PDF/ZIP are lazy-loaded, so
 *     those libraries are only available offline after one online use.
 *
 * Bump CACHE_VERSION on every release to retire older caches.
 * ========================================================================== */

const CACHE_VERSION = "canary-tokens-v1";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/styles.css",
  "./assets/img/favicon.svg",
  "./assets/img/icon.svg",
  "./assets/img/icon-192.png",
  "./assets/img/icon-512.png",
  "./js/app.js",
  "./js/ui.js",
  "./js/store.js",
  "./js/tokenEngine.js",
  "./js/qrGenerator.js",
  "./js/pdfGenerator.js",
  "./js/kitBuilder.js",
  "./js/templates.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // App shell: always try the network first so updates land promptly.
    if (request.mode === "navigate") {
      event.respondWith(fetch(request).catch(() => caches.match("./index.html")));
      return;
    }
    // Static assets: cache-first with background fill.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((response) => {
              if (response && response.ok) {
                const copy = response.clone();
                caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
              }
              return response;
            })
            .catch(() => cached)
      )
    );
    return;
  }

  // Cross-origin CDN requests: stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && (response.ok || response.type === "opaque")) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
