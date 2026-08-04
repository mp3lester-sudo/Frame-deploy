import type { CapacitorConfig } from "@capacitor/cli";

// Backlot iOS wrapper — remote mode.
//
// This app has NO local web assets and ships NO copy of the Next.js app.
// The native WebView loads the live production site directly, so the
// website (Vercel) remains the single source of truth and the only thing
// that ever needs to be redeployed for a content/feature change. The
// native shell only needs a new App Store build for things Capacitor
// itself controls: app icon, splash screen, permissions, and native
// plugins (e.g. push notifications) — not for ordinary product changes.
const config: CapacitorConfig = {
  appId: "app.backlot.ios",
  appName: "Backlot",
  webDir: "www", // required by Capacitor's schema but unused in remote mode — no local assets are copied in
  server: {
    url: "https://taste-green-tau.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
