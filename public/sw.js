// Minimal app-shell service worker -- deliberately NOT a full offline-cache-
// everything strategy, since almost every page here is personalized
// (auth-gated, per-viewer recommendations, live Movie Night voting) and
// caching that content would risk serving stale or cross-user-confusing
// data. The jobs this does:
//   1. Cache the tiny set of static shell assets (icons, manifest, the
//      offline fallback page) so the app can install as a PWA.
//   2. Network-first for page navigations, falling back to a static
//      offline page if the network is unreachable -- so losing connection
//      mid-use shows something intentional instead of the browser's own
//      "no internet" error page.
//   3. Pass every other request (API routes, Server Actions, data
//      fetches, non-GET requests) straight through to the network,
//      untouched -- this service worker never caches or intercepts them.
//   4. Show a system notification for incoming Web Push messages (see
//      src/lib/push/send-push.ts, the server side that sends these), and
//      focus/open the app to the right page when someone taps one.
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

// The push payload is whatever sendPushToUser() sent as its JSON body:
// { title, body, url }. Falls back to generic copy if parsing fails for
// any reason (malformed payload, or none at all) rather than throwing and
// silently dropping the notification.
self.addEventListener("push", (event) => {
  let data = { title: "Backlot", body: "You have a new notification", url: "/notifications" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Keep the fallback above.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
    })
  );
});

// Focuses an already-open Backlot tab and navigates it to the notification's
// target page if one exists, rather than always opening a fresh tab --
// closer to how native app notifications behave.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
