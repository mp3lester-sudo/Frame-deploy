import { Capacitor } from "@capacitor/core";

/**
 * True only when the app is running inside the Backlot native wrapper
 * (Capacitor's iOS WebView). False for the ordinary website, including
 * when the website is opened in mobile Safari or installed as a PWA —
 * this is specifically about the native app shell, not device type.
 *
 * Kept as a single source of truth so purchase-flow and any other
 * native-context gating stays consistent across the codebase.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
