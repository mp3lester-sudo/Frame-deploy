"use client";

import { useEffect } from "react";
import { WidgetBridgePlugin } from "capacitor-widget-bridge";
import { isNativeApp } from "@/lib/native/is-native";
import { getOrCreateWidgetToken } from "@/lib/actions/widget";

// Must match BOTH the App Group ID configured on the main app's and the
// widget extension's own Signing & Capabilities tab in Xcode (see
// mobile-app/SETUP.md's widget section) -- "group." + the app's bundle
// id (capacitor.config.ts's appId) is Apple's own convention, not a
// requirement, but there's no reason to deviate from it.
const APP_GROUP = "group.app.backlot.ios";
const TOKEN_KEY = "widget_token";

/**
 * Silent, renders nothing -- mounted once in the root layout (native-only,
 * same isNativeApp() gate as PullToRefresh) purely to keep the iOS home-
 * screen widget's credential fresh. The widget extension runs as its own
 * OS process with no cookies/session of any kind (see migration 0067's
 * comment on profiles.widget_token), so it needs this app to hand it a
 * bearer token through a channel it CAN read: the shared App Group
 * container, via capacitor-widget-bridge's UserDefaults(suiteName:)
 * bridge (the built-in @capacitor/preferences plugin's own "group"
 * option does NOT do this -- it's just a key prefix within the app's own
 * private storage, not a real shared container).
 *
 * getOrCreateWidgetToken() is idempotent (returns the same token on every
 * call rather than rotating it), so re-running this on every app-open is
 * cheap and just keeps the shared container in sync -- it's not "issuing
 * a new token," just making sure the widget has the one that already
 * exists.
 */
export function WidgetTokenBootstrap({ isAuthed }: { isAuthed: boolean }) {
  useEffect(() => {
    if (!isAuthed || !isNativeApp()) return;
    let cancelled = false;

    (async () => {
      try {
        const token = await getOrCreateWidgetToken();
        if (cancelled) return;
        await WidgetBridgePlugin.setItem({ key: TOKEN_KEY, value: token, group: APP_GROUP });
        // Nudges WidgetKit to fetch a fresh timeline right away rather
        // than waiting for its own next scheduled refresh -- matters
        // most right after a first login, when the widget (if already
        // added to the home screen from a previous account, or added
        // before ever logging in) would otherwise sit on a stale/empty
        // state for however long iOS's own budget takes to cycle.
        await WidgetBridgePlugin.reloadAllTimelines();
      } catch (err) {
        // Never worth surfacing to the person using the app -- the
        // widget just stays on its last-known state (or its "not set
        // up" placeholder) until the next successful bootstrap.
        console.error("[widget-token-bootstrap]", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthed]);

  return null;
}
