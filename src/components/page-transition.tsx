"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps <main> in layout.tsx so every route change gets a subtle fade/
 * slide-up instead of an abrupt cut — the nav bar and bottom nav (outside
 * this wrapper) stay put and don't re-animate on every click, only the
 * page content does. key={pathname} forces the fade to replay on each
 * navigation; harmless here since every route is server-rendered fresh
 * per request anyway, so there's no client-side state in this subtree
 * worth preserving across the remount.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
