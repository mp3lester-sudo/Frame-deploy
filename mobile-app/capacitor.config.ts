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
    // "never" lets the WebView draw its own content all the way to the
    // true top/bottom of the screen, under the status bar/notch and home
    // indicator -- "always" (the previous setting) forced a hard, uniform
    // inset on the ENTIRE page below the notch no matter what, which is
    // exactly why full-bleed elements (the movie-detail trailer hero, the
    // home page's cinematic intro) were capped short of the real screen
    // edge on-device even though the same CSS renders correctly full-
    // bleed in mobile Safari. The web side already has everything it
    // needs to handle this itself -- viewportFit: "cover" in
    // src/app/layout.tsx is the prerequisite for env(safe-area-inset-*)
    // to resolve to real pixel values instead of 0, and nav-bar.tsx /
    // bottom-nav.tsx use those values to keep actual tappable content
    // clear of the notch/home indicator while backgrounds and hero
    // imagery are free to extend under them.
    contentInset: "never",
  },
};

export default config;
