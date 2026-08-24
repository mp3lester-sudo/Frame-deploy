/**
 * Visual identity, derived from someone's actual taste rather than assigned
 * the same wine-and-gold theme as everyone else. Two tiers, most specific
 * wins:
 *
 * 1. Exact-title curated presets (resolveProfileTheme) -- a small,
 *    hand-designed list keyed to someone's literal #1 all-time favorite
 *    (e.g. "The Godfather"). These stay hand-authored on purpose: a
 *    specific film has a specific visual identity worth designing for by
 *    name, not approximating.
 * 2. Archetype-driven general theming (resolveTasteTheme) -- everyone
 *    else's Taste DNA already sorts their rated history into named
 *    archetypes (Neo-Noir, Feel-Good Comfort, etc. -- see
 *    lib/taste-dna/archetypes.ts). When one archetype clearly leads (both
 *    a real percent lead AND enough rated titles to trust it), that
 *    archetype's cluster gets a curated palette. When nothing clearly
 *    leads yet, the page stays the default theme -- this is deliberately
 *    NOT color extraction from poster art or any per-title mood data;
 *    it's a small, hand-designed set of moods (five, plus default) picked
 *    for restraint over a combinatorial "auto-generate a color from your
 *    favorite movie" gimmick.
 *
 * resolveTheme() is what pages actually call: it tries the exact-title
 * tier first (a deliberate top-favorite pick is the most specific signal
 * a person can give), then falls back to the archetype tier, then the
 * inert default.
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
  id: "default" | "godfather" | "noir" | "dread" | "comfort" | "prestige" | "explorer";
  vars: Record<string, string>;
  /** Accent color as "r,g,b" for the taste-fingerprint wheel's conic-gradient,
   *  kept in step with `vars["--accent"]` so the wheel never clashes with the
   *  rest of the theme. */
  accentRgb: string;
  /** Whether to render the small decorative flourish (rose + double rule)
   *  above the favorites panel -- only the Godfather preset opts into this,
   *  not the default theme or any archetype-driven theme (that flourish is
   *  specific to that film's own visual language, not a general "you have
   *  a theme" indicator). */
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

/** Cool steel-blue on near-black -- Neo-Noir / Psychological Slow Burn.
 *  Desaturated on purpose: this is a mood of restraint and tension, not
 *  a bright "blue theme." */
const NOIR_THEME: ProfileTheme = {
  id: "noir",
  vars: {
    "--background": "#08090b",
    "--surface": "#101317",
    "--surface-raised": "#171b21",
    "--border": "rgba(143,164,184,0.1)",
    "--border-strong": "rgba(143,164,184,0.22)",
    "--foreground-muted": "#96a3ad",
    "--accent": "#8fa4b8",
    "--accent-soft": "#c3d3e0",
    "--accent-deep": "#5c7386",
    "--accent-foreground": "#0a1116",
  },
  accentRgb: "143,164,184",
  showMotif: false,
};

/** Muted brick-red on warm near-black -- Horror & Dread. Deliberately not
 *  a saturated "horror red"; this reads as unease, not a costume shop. */
const DREAD_THEME: ProfileTheme = {
  id: "dread",
  vars: {
    "--background": "#0a0706",
    "--surface": "#150e0c",
    "--surface-raised": "#1e1512",
    "--border": "rgba(168,90,79,0.1)",
    "--border-strong": "rgba(168,90,79,0.24)",
    "--foreground-muted": "#ab9089",
    "--accent": "#a85a4f",
    "--accent-soft": "#c98275",
    "--accent-deep": "#7a3c33",
    "--accent-foreground": "#150705",
  },
  accentRgb: "168,90,79",
  showMotif: false,
};

/** Warm amber-coral -- Feel-Good Comfort / Witty Comedy. The one palette
 *  that leans warm and light rather than moody, matching the tone. */
const COMFORT_THEME: ProfileTheme = {
  id: "comfort",
  vars: {
    "--background": "#0d0906",
    "--surface": "#18120c",
    "--surface-raised": "#221a11",
    "--border": "rgba(224,162,94,0.12)",
    "--border-strong": "rgba(224,162,94,0.26)",
    "--foreground-muted": "#b9a48f",
    "--accent": "#e0a25e",
    "--accent-soft": "#f0c48c",
    "--accent-deep": "#ab7638",
    "--accent-foreground": "#2a1608",
  },
  accentRgb: "224,162,94",
  showMotif: false,
};

/** Dusty rose-bronze -- Prestige Drama / Emotional Character Study. Close
 *  in spirit to the default gold but shifted toward rose so it still
 *  reads as a distinct identity rather than "gold, slightly different." */
const PRESTIGE_THEME: ProfileTheme = {
  id: "prestige",
  vars: {
    "--background": "#0a0807",
    "--surface": "#15100d",
    "--surface-raised": "#1e1712",
    "--border": "rgba(194,135,106,0.1)",
    "--border-strong": "rgba(194,135,106,0.22)",
    "--foreground-muted": "#ab9990",
    "--accent": "#c2876a",
    "--accent-soft": "#ddb097",
    "--accent-deep": "#8f5f45",
    "--accent-foreground": "#1c0e08",
  },
  accentRgb: "194,135,106",
  showMotif: false,
};

/** Muted jade-teal -- World Cinema Explorer / Experimental Cinema. The
 *  coolest, most contemplative palette, distinct from Noir's steel-blue. */
const EXPLORER_THEME: ProfileTheme = {
  id: "explorer",
  vars: {
    "--background": "#070a09",
    "--surface": "#0e1613",
    "--surface-raised": "#151f1b",
    "--border": "rgba(111,173,160,0.1)",
    "--border-strong": "rgba(111,173,160,0.24)",
    "--foreground-muted": "#93a9a3",
    "--accent": "#6fada0",
    "--accent-soft": "#9ecabe",
    "--accent-deep": "#467a70",
    "--accent-foreground": "#06120f",
  },
  accentRgb: "111,173,160",
  showMotif: false,
};

/**
 * Which archetype cluster maps to which palette. Deliberately not
 * exhaustive -- Blockbuster Spectacle has no entry, so it (and any future
 * archetype added to archetypes.ts without a mapping here) falls through
 * to the default theme rather than forcing a mapping that doesn't fit.
 * The default gold already reads as "epic premium," which suits
 * Blockbuster Spectacle fine as a no-op.
 */
const ARCHETYPE_THEME: Record<string, ProfileTheme> = {
  "Psychological Slow Burn": NOIR_THEME,
  "Neo-Noir": NOIR_THEME,
  "Horror & Dread": DREAD_THEME,
  "Feel-Good Comfort": COMFORT_THEME,
  "Witty Comedy": COMFORT_THEME,
  "Prestige Drama": PRESTIGE_THEME,
  "Emotional Character Study": PRESTIGE_THEME,
  "World Cinema Explorer": EXPLORER_THEME,
  "Experimental Cinema": EXPLORER_THEME,
};

/** A person needs at least this many positively-rated titles before their
 *  archetype mix says anything structural about their taste -- same bar
 *  taste-dna/evolution.ts uses for "enough history to trust a read on
 *  change over time." Below this, re-theming the whole page off one or
 *  two ratings would be exactly the "fake personalization" the product
 *  is supposed to avoid. */
const MIN_SAMPLE_FOR_TASTE_THEME = 6;

/** The lead archetype needs to clear this percent before it counts as
 *  "your" mood rather than one of several roughly-tied archetypes. With
 *  10 archetypes, an even split would put each around 10%; 30% is a solid
 *  3x lead over that baseline -- a real signal, not a coin flip. */
const DOMINANT_ARCHETYPE_THRESHOLD = 30;

/**
 * Picks the archetype-driven theme from an already-percent-sorted (highest
 * first) archetype list -- same shape computeTasteDnaFromRatings returns.
 * Pure and only needs the two numbers callers already have on hand
 * (dna.archetypes, dna.sampleSize), so this never triggers its own query
 * or recomputation.
 */
export function resolveTasteTheme(
  archetypes: { name: string; percent: number }[],
  sampleSize: number
): ProfileTheme {
  if (sampleSize < MIN_SAMPLE_FOR_TASTE_THEME) return DEFAULT_THEME;
  const top = archetypes[0];
  if (!top || top.percent < DOMINANT_ARCHETYPE_THRESHOLD) return DEFAULT_THEME;
  return ARCHETYPE_THEME[top.name] ?? DEFAULT_THEME;
}

/** Unchanged existing entry point -- exact-title curated presets only.
 *  Kept as its own function (rather than folded into resolveTheme) so
 *  existing callers/tests that only care about the title-match tier don't
 *  need to pass archetype data they may not have computed. */
export function resolveProfileTheme(topFavoriteName: string | null | undefined): ProfileTheme {
  const normalized = (topFavoriteName ?? "").trim().toLowerCase();
  switch (normalized) {
    case "the godfather":
      return GODFATHER_THEME;
    default:
      return DEFAULT_THEME;
  }
}

/**
 * The real entry point for pages that have both signals available
 * (profile page, Taste DNA page): exact-title tier first, then the
 * archetype tier, then the inert default. A deliberate top-favorite pick
 * is a more specific signal than an aggregate archetype mix, so it wins
 * when both are present.
 */
export function resolveTheme(input: {
  topFavoriteName?: string | null;
  archetypes?: { name: string; percent: number }[];
  sampleSize?: number;
}): ProfileTheme {
  const exact = resolveProfileTheme(input.topFavoriteName);
  if (exact.id !== "default") return exact;
  return resolveTasteTheme(input.archetypes ?? [], input.sampleSize ?? 0);
}
