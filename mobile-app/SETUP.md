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

## Running a TestFlight beta

TestFlight is Apple's beta-distribution system -- it uses the exact same
archive-and-upload flow as a full App Store release, just without needing
a finished App Store listing (screenshots, description, pricing) first.
This is the fastest path to getting the app on real iPhones, including
people who aren't you, before deciding whether to submit for a full
public release.

1. **Create the App Store Connect record** (one-time, if you haven't
   already): go to appstoreconnect.apple.com → **Apps** → **+** → **New
   App**. Platform iOS, name "Backlot", bundle ID `app.backlot.ios`
   (must match `capacitor.config.ts` exactly), and pick a SKU (any unique
   string, e.g. `backlot-ios-1`). None of the store-listing fields
   (screenshots, description, pricing, age rating) need to be filled in
   yet for TestFlight -- only for a full public submission.

2. **Bump the build number** before every archive -- App Store Connect
   rejects an upload whose build number was already used, even for
   TestFlight:
   ```bash
   cd mobile-app
   npm run bump-build
   npx cap sync ios   # if Xcode is already open, so it picks up the new number
   ```

3. **Archive and upload**: in Xcode, **Product → Archive** (this only
   works with a real device or "Any iOS Device" selected as the run
   destination, not a simulator). Once archiving finishes, the Organizer
   window opens automatically -- click **Distribute App → App Store
   Connect → Upload**. Xcode handles signing and submission; the build
   shows up in App Store Connect's TestFlight tab a few minutes later
   once Apple finishes processing it (usually 5-30 minutes; you'll get an
   email when it's ready).

4. **Add testers** in App Store Connect → your app → **TestFlight** tab:
   - **Internal testing**: anyone already listed as a user on your Apple
     Developer account (up to 100 people). No Apple review needed --
     builds are available to internal testers within minutes of
     processing finishing. This is the fastest way to get the app in
     front of a small group.
   - **External testing**: anyone via email or a public TestFlight link
     (up to 10,000 people), but the *first* build in a given external
     group requires a lightweight **Beta App Review** from Apple first
     (typically 24-48 hours, much faster and less strict than a full App
     Store review). Subsequent builds to the same group usually skip
     review unless they contain "significant" changes.

5. **Testers install the TestFlight app** (from the regular App Store)
   and accept your invite (email link, or the public link if you made
   one) to install Backlot through it.

### Things specific to TestFlight worth knowing

- **Builds expire after 90 days** -- testers get a notice a week before
  and the build stops launching after that. For an ongoing beta, plan to
  upload a fresh build periodically even if nothing native changed
  (remember: ordinary website changes need no new build at all, since
  this is a remote-mode wrapper -- only Capacitor-level changes, or
  keeping a build from expiring, need a new upload).
- **Crash reports and tester feedback** collect automatically in App
  Store Connect's TestFlight tab -- testers can also shake their device
  or use TestFlight's built-in feedback button to send screenshots/notes
  directly to you.
- Export compliance is already handled -- `Info.plist` declares
  `ITSAppUsesNonExemptEncryption = false` (this app only uses standard
  HTTPS via the WebView, no custom encryption), so Xcode/App Store
  Connect won't stop to ask that question on upload.

## Submitting to the App Store (full public release)

Once you're happy with a TestFlight build, moving to a full public
release is the same archive, just with the store listing filled in:

1. In App Store Connect, fill in the store listing (screenshots,
   description, pricing, age rating, etc.) on the app record you already
   created above.
2. Either promote an existing TestFlight build to the release, or archive
   and upload a new one the same way (Xcode: **Product → Archive** →
   **Distribute App**).
3. Submit for review from the **App Store** tab (not the TestFlight tab)
   -- this is the full review (can take anywhere from a day to a week or
   more), unlike TestFlight's lighter beta review.

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

### Push notifications don't work in this build yet

Backlot's push notification toggle (Settings -> Push notifications) is
built on the standard Web Push APIs (`Notification`, `PushManager`, VAPID
keys) -- these work in real browsers but don't exist inside a Capacitor
WKWebView, so `getInitialStatus()` in `push-toggle.tsx` correctly detects
that and hides the toggle entirely on iOS. Nothing crashes and nothing
misleading is shown, but the feature itself is simply unavailable in the
native app right now.

To actually ship native push, you'd need: an APNs authentication key from
your Apple Developer account, the `@capacitor/push-notifications` plugin,
the `aps-environment` entitlement added to the Xcode project, and a
parallel native subscribe/send path alongside (or replacing) the existing
Web Push one in `src/lib/push/`. None of that is done here -- it needs an
Apple Developer account and Xcode project surgery this repo can't do on
its own, the same category of manual step as the widget extension below.

## When you change things later

- **Website change only** (new feature, design tweak, bug fix): just
  deploy to Vercel as normal. Nothing to do in `mobile-app/`.
- **Icon, splash, app name, bundle ID, or native plugin change**: edit the
  relevant file, run `npx cap sync ios` again, run `npm run bump-build`,
  then re-archive and re-submit through Xcode (to either TestFlight or
  the App Store -- both need a bumped build number for every new upload).

## Home-screen widget (Backlot Daily Pick)

An optional iOS WidgetKit widget -- today's personalized recommendation,
right on the home screen, refreshed on the OS's own schedule whether or
not the app gets opened that day. The web-side pieces (the API endpoint,
the token that lets a widget authenticate without a browser session, and
the Swift source itself) are already in the repo. What's left is entirely
Xcode-project surgery that can't be done by editing files blind -- adding
a new build target is exactly the kind of change that's much safer done
through Xcode's own wizard than by hand-editing `project.pbxproj`.

Budget ~20-30 minutes the first time. None of this is required for the
app to keep working normally -- skip this section entirely if the widget
isn't a priority right now.

### 1. Pull the code, install the new plugin, sync

```
cd ~/Frame-deploy
git pull
cd mobile-app
npm install
npx cap sync ios
```

This links `capacitor-widget-bridge` (the plugin that lets the website's
JS write into a shared App Group container the widget can read) into the
Xcode project's Podfile.

### 2. Create the Widget Extension target

In Xcode: **File → New → Target...** → search "Widget Extension" → Next.

- Product Name: `BacklotWidget`
- Team: same team as the main `App` target
- Uncheck "Include Configuration Intent" (this widget doesn't need a
  user-configurable options screen)
- Uncheck "Include Live Activity" (not needed)
- Finish. Xcode will offer to "Activate" the new scheme -- yes.

This generates a `BacklotWidget/` group with placeholder Swift files and
its own `Info.plist` -- that's expected, they get replaced in step 4.

### 3. Enable App Groups on both targets

An App Group is what lets two separate processes (the main app, and the
widget extension) share a slice of storage -- this is how the widget
reads the login token the main app writes.

For **both** the `App` target and the new `BacklotWidget` target:

1. Select the target → **Signing & Capabilities** tab → **+ Capability**
   → **App Groups**.
2. Click **+** under App Groups → enter `group.app.backlot.ios` exactly
   (this must match `WidgetConstants.appGroup` in
   `BacklotWidget/DailyPickModels.swift` and `APP_GROUP` in
   `src/components/native/widget-token-bootstrap.tsx` on the website
   side -- all three have to agree character-for-character).
3. Xcode will prompt to register the group with your Apple Developer
   account -- allow it. This regenerates both targets' provisioning
   profiles, which is normal.

### 4. Replace the generated Swift files

Delete the placeholder files Xcode generated inside the `BacklotWidget`
group (typically `BacklotWidget.swift` and `BacklotWidgetBundle.swift`),
then drag the real ones from this repo into that same group in Xcode's
navigator, making sure **"Copy items if needed"** is off (they should
stay at their repo path) and the **BacklotWidget target membership
checkbox is checked**:

```
mobile-app/ios/App/BacklotWidget/DailyPickModels.swift
mobile-app/ios/App/BacklotWidget/DailyPickProvider.swift
mobile-app/ios/App/BacklotWidget/DailyPickWidgetView.swift
mobile-app/ios/App/BacklotWidget/DailyPickWidget.swift
mobile-app/ios/App/BacklotWidget/BacklotWidgetBundle.swift
```

If Xcode's wizard also generated an `Assets.xcassets` inside
`BacklotWidget/`, leave that in place -- it's harmless and unused.

### 5. Set the minimum deployment target

Widget's target → **General** tab → **Minimum Deployments** → iOS 17.0
(the widget code uses `.contentMarginsDisabled()`, an iOS 17 API). If the
main `App` target's minimum is lower than that, that's fine -- they don't
need to match; a person on an older iOS just won't be able to add the
widget.

### 6. Run it

Select the `BacklotWidget` scheme (not `App`) in Xcode's scheme picker,
choose your device, hit Run. Xcode installs the widget extension
alongside the already-installed main app rather than launching a
separate app.

Then on the device: make sure you're logged into Backlot in the main app
first (the widget has nothing to show until `WidgetTokenBootstrap` has
run at least once), then long-press the home screen → **+** → search
"Backlot" → add the widget in either the small or medium size.

If it shows "Open Backlot / Sign in to see your daily pick" after that,
force-quit and reopen the main app once (the token write happens on
mount, not instantly in the background) and check again after a few
seconds.

### Known limitation

Tapping the widget opens `taste-green-tau.vercel.app/movie/<id>` in
Safari, not inside the app itself -- true deep-linking into the native
app requires Associated Domains / Universal Links (a server-side
`apple-app-site-association` file plus an entitlement), which isn't set
up. Reasonable follow-up, not required for the widget to be useful.
