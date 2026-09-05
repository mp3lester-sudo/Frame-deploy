// Bespoke nav marks shared by both the mobile BottomNav and the desktop
// NavBar, so Discover and Ask read identically wherever someone
// encounters them. See bottom-nav.tsx for the full rationale: a compass
// reads as "navigate/maps" and a sparkle reads as "generic AI assistant"
// (AI Design Fingerprint Audit) -- these replace them with a lens iris
// and a perforated film-strip speech bubble, drawn at the same
// 24x24/stroke-based convention as the surrounding lucide icons so they
// don't look like a different icon set was dropped in.
export type NavIconProps = { size?: number; strokeWidth?: number; className?: string };

export function DiscoverIcon({ size = 20, strokeWidth = 1.5, className }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </svg>
  );
}

export function AskIcon({ size = 20, strokeWidth = 1.5, className }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 5h16v10H9l-4 4z" />
      <circle cx="8" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="8" cy="12.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
