// Minimal app-shell service worker -- deliberately NOT a full offline-cache-
// everything strategy, since almost every page here is personalized
// (auth-gated, per-viewer recommendations, live Movie Night voting) and
// caching that content would risk serving stale or cross-user-confusing
// data. The only jobs this does:
//   1. Cache the tiny set of static shell assets (icons, manifest, the
//      offline fallback page) so the app can install as a PWA.
//   2. Network-first for page navigations, falling back to a static
//      offline page if the network is unreachable -- so losing connection
//      mid-use shows something intentional instead of the browser's own
//      "no internet" error page.
//   3. Pass every other request (API routes, Server Actions, data
//      fetches, non-GET requests) straight through to the network,
//      untouched -- this service worker never caches or intercepts them.
const CACHE_VERSION = "backlot-shell-v1";
const SHELL_ASSETS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever handle top-level page navigations specially. Everything
  // else (assets, API calls, Server Actions) is left completely alone --
  // no caching, no interception -- so this can never accidentally serve
  // stale personalized data or a stale action response.
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(() => caches.match("/offline.html"))
  );
});
