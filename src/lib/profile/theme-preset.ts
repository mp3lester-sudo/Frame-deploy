/**
 * Profile page visual theme, resolved from a person's #1 all-time
 * favorite title. Everyone gets the site's normal wine-and-gold theme
 * (an empty override set -- the page's own CSS variables already say
 * what that looks like) except for a small, curated list of exact-title
 * matches that get a bespoke palette instead.
 *
 * Deliberately narrow: this is NOT a general "auto-theme from any
 * movie" engine (that would need real per-title mood/color data this
 * app doesn't have yet). It's a hand-designed preset keyed to an exact
 * title match, with a safe no-op fallback for everyone else. Add more
 * `case` entries here if more presets get built later.
 *
 * `vars` are CSS custom-property overrides meant to be spread onto a
 * `style` prop on a wrapper element -- because the app's Tailwind theme
 * maps utilities like `bg-background`/`text-accent`/`border-border`
 * through `var(--background)`/`var(--accent)`/`var(--border)`,
 * overriding those custom properties on an ancestor re-themes every
 * existing utility class underneath it for free, with no per-element
 * className changes required and no risk to any other page.
 */
export interface ProfileTheme {
  id: "default" | "godfather";
  vars: Record<string, string>;
  /** Accent color as "r,g,b" for the taste-fingerprint wheel's conic-gradient,
   *  kept in step with `vars["--accent"]` so the wheel never clashes with the
   *  rest of the theme. */
  accentRgb: string;
  /** Whether to render the small decorative flourish (rose + double rule)
   *  above the favorites panel -- only the curated presets opt into this,
   *  not the default theme. */
  showMotif: boolean;
}

const DEFAULT_THEME: ProfileTheme = {
  id: "default",
  vars: {},
  accentRgb: "217,184,118",
  showMotif: false,
};

/**
 * Wedding-invitation gold on near-black, evoking the film's own opening
 * title card, plus a deep engraved-red for the rose flourish -- built
 * from original color/type/motif choices rather than any reproduction
 * of the film's actual marketing artwork or logo.
 */
const GODFATHER_THEME: ProfileTheme = {
  id: "godfather",
  vars: {
    "--background": "#050403",
    "--surface": "#0d0a07",
    "--surface-raised": "#171310",
    "--border": "rgba(196,164,90,0.16)",
    "--border-strong": "rgba(196,164,90,0.4)",
    "--foreground-muted": "#b8a999",
    "--accent": "#c9a227",
    "--accent-soft": "#e3c878",
    "--accent-deep": "#8a6c1f",
    "--accent-foreground": "#1a0605",
    "--font-display": "var(--font-cinzel)",
  },
  accentRgb: "201,162,39",
  showMotif: true,
};

export function resolveProfileTheme(topFavoriteName: string | null | undefined): ProfileTheme {
  const normalized = (topFavoriteName ?? "").trim().toLowerCase();
  switch (normalized) {
    case "the godfather":
      return GODFATHER_THEME;
    default:
      return DEFAULT_THEME;
  }
}
