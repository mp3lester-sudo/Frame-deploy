"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native/is-native";

/**
 * Hides its children once mounted inside the native iOS app -- the web
 * counterpart of ShowOnNative (see that file for the paired use case:
 * moving the Wrapped preview card on the profile page to sit under
 * Backlot DNA specifically on native, instead of its usual spot in the
 * right rail).
 *
 * Starts by rendering children normally (matching what SSR produces,
 * since isNativeApp() can only be trusted client-side -- same
 * default-false-until-mount pattern PullToRefresh uses) and only hides
 * them after an effect confirms this is actually running inside the
 * Capacitor WebView. On the ordinary website this is a no-op forever;
 * children just render as they always did.
 */
export function HideOnNative({ children }: { children: React.ReactNode }) {
  const [native, setNative] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- isNativeApp() can only be trusted client-side (same rationale/pattern as onboarding-swipe.tsx's phase-detection effect and PullToRefresh's native gate)
    setNative(isNativeApp());
  }, []);

  if (native) return null;
  return <>{children}</>;
}
