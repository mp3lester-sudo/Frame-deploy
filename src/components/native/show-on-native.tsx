"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native/is-native";

/**
 * Renders nothing until mounted inside the native iOS app, then shows
 * its children -- used on the profile page to place a second copy of
 * the Wrapped preview card directly below the Backlot DNA panel,
 * native-app-only (its usual placement in the right rail is hidden on
 * native via the paired HideOnNative wrapper, so there's exactly one
 * copy visible regardless of platform).
 *
 * Defaults to null both during SSR and on the ordinary website (where
 * isNativeApp() is always false) -- there's no hydration mismatch risk
 * since the server and the non-native client agree on "render nothing."
 * On native, this renders null for one tick post-hydration and then
 * mounts the real content once the isNativeApp() check resolves --
 * the same tradeoff PullToRefresh makes for its own native-only gating,
 * since isNativeApp() genuinely cannot be evaluated during SSR.
 */
export function ShowOnNative({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [native, setNative] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- isNativeApp() can only be trusted client-side (same rationale/pattern as onboarding-swipe.tsx's phase-detection effect and PullToRefresh's native gate)
    setNative(isNativeApp());
  }, []);

  if (!native) return null;
  return <div className={className}>{children}</div>;
}
