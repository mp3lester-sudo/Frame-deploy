# Backlot iOS app — setup on your Mac

This folder is a Capacitor wrapper around the live Backlot website. It has no
copy of the app's code or content — the native app just opens
`https://taste-green-tau.vercel.app` inside a WebView. That means:

- Shipping a feature or design change to the **website** (the normal
  `git push` to `main`, auto-deployed by Vercel) is enough — the iOS app
  picks it up automatically the next time someone opens it. No App Store
  update needed.
- A new App Store build is only needed for things Capacitor itself controls:
  app icon, splash screen, app name, bundle ID, native permissions, or
  adding a native plugin.

Everything below has to happen on your own Mac — building, signing, and
submitting an iOS app requires Xcode, which only runs on macOS.

## Prerequisites

1. A Mac with **Xcode** installed (free, via the Mac App Store). Xcode also
   installs the iOS SDK and simulator.
2. An **Apple Developer Program** account ($99/year) — required for code
   signing on a real device and for any App Store submission. You can build
   and run in the iOS Simulator without this, but not on a physical iPhone
   or in the App Store.
3. **CocoaPods** (`sudo gem install cocoapods`) — manages the native iOS
   dependencies Capacitor generates.
4. Node.js (any recent version) and `npm`.

## First-time setup

```bash
cd mobile-app
npm install
npx cap sync ios       # copies capacitor.config.ts settings into the native project, installs pods
npx cap open ios        # opens ios/App/App.xcworkspace in Xcode
```

Always open `App.xcworkspace`, not `App.xcodeproj` — CocoaPods requires the
workspace file once pods are installed.

## In Xcode

1. Select the `App` target → **Signing & Capabilities** tab.
2. Under **Team**, choose your Apple Developer account. Xcode will offer to
   fix signing automatically ("Automatically manage signing").
3. Confirm the **Bundle Identifier** — currently set to `app.backlot.ios` in
   `capacitor.config.ts`. If you want a different one (e.g. matching a
   specific App Store Connect app record you've already created), change it
   both there and in Xcode's signing settings, then re-run `npx cap sync ios`.
4. Confirm the **Display Name** (currently "Backlot") under the target's
   **General** tab if you want it to differ from what's in
   `capacitor.config.ts`.
5. The app icon (`AppIcon-1024.png`, the gold "B" monogram) and a matching
   splash screen are already wired into the Xcode asset catalog — nothing
   to do here unless you want to change the artwork.

## Running it

- **Simulator**: pick any iPhone simulator from Xcode's device dropdown and
  hit Run (▶). No Developer Program account needed for this.
- **Your own iPhone**: plug it in, select it as the run destination, hit
  Run. You'll need a Developer account signed in (step 2 above) and to
  trust the developer certificate on the phone once
  (Settings → General → VPN & Device Management).

## Submitting to the App Store

1. In App Store Connect (appstoreconnect.apple.com), create a new app
   record with the same bundle ID.
2. In Xcode: **Product → Archive**, then use the Organizer window's
   **Distribute App** flow to upload the build.
3. Fill in the App Store listing (screenshots, description, etc.) in App
   Store Connect and submit for review.

### One policy note worth knowing before you submit

Backlot's Premium subscription is sold via Stripe Checkout, not Apple's
In-App Purchase. Apple generally requires a choice here: either digital
subscriptions go through Apple's own In-App Purchase (StoreKit, with
Apple's 15-30% cut), or the purchase has to happen entirely *outside* the
app (the same pattern Netflix and Spotify use).

This app is already set up for the second option: the "Upgrade to Premium"
button opens Stripe Checkout in the system browser (Safari) instead of
inside the app's own WebView, so no purchase flow is ever rendered inside
the app. That's implemented in `src/app/premium/page.tsx` on the website
side (search for `isNativeApp()`), not in this `mobile-app/` folder — it
requires no extra step from you here, but it's the reason App Review
shouldn't flag the subscription as an undeclared in-app purchase. If you'd
rather use real Apple In-App Purchase instead, that's a bigger change
(StoreKit integration + server-side receipt validation) that isn't done
here.

## When you change things later

- **Website change only** (new feature, design tweak, bug fix): just
  deploy to Vercel as normal. Nothing to do in `mobile-app/`.
- **Icon, splash, app name, bundle ID, or native plugin change**: edit the
  relevant file, run `npx cap sync ios` again, then re-archive and
  re-submit through Xcode.
