"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js once on mount. Skips entirely outside a browser
 * environment with SW support (older browsers, some in-app webviews) --
 * the app works identically without it, this only adds installability +
 * an offline fallback page on top.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failing (e.g. served over http in local dev) shouldn't
      // surface to the user -- the app is fully functional without a
      // service worker, this is a progressive enhancement only.
    });
  }, []);

  return null;
}
