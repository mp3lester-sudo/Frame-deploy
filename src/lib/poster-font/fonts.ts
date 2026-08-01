import {
  Oswald,
  Cinzel,
  Special_Elite,
  Pacifico,
  Orbitron,
  Abril_Fatface,
  Righteous,
  UnifrakturMaguntia,
  Dancing_Script,
  Bangers,
  Cormorant_Garamond,
  Anton,
  Josefin_Sans,
  Creepster,
} from "next/font/google";

/**
 * Curated set of loadable Google Fonts a poster can be matched against. Kept
 * deliberately small (rather than "any Google Font") for two reasons: every
 * font here is statically imported via next/font/google so Next can
 * self-host and optimize it (no runtime <link> injection, no layout-shift
 * flash-of-unstyled-text), and a constrained list is something a vision
 * model can reliably pick *one* best match from — "name the closest font"
 * against the entire Google Fonts catalogue is not a reliable ask.
 *
 * Range is deliberately genre-spanning: bold/condensed for action, gothic
 * for horror, script for romance, futuristic for sci-fi, typewriter for
 * noir/thriller, classic serif for prestige drama, and a couple of
 * playful/rounded options for comedy and animation.
 */
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "700"] });
const cinzel = Cinzel({ subsets: ["latin"], weight: ["600"] });
const specialElite = Special_Elite({ subsets: ["latin"], weight: ["400"] });
const pacifico = Pacifico({ subsets: ["latin"], weight: ["400"] });
const orbitron = Orbitron({ subsets: ["latin"], weight: ["600"] });
const abrilFatface = Abril_Fatface({ subsets: ["latin"], weight: ["400"] });
const righteous = Righteous({ subsets: ["latin"], weight: ["400"] });
const unifraktur = UnifrakturMaguntia({ subsets: ["latin"], weight: ["400"] });
const dancingScript = Dancing_Script({ subsets: ["latin"], weight: ["600"] });
const bangers = Bangers({ subsets: ["latin"], weight: ["400"] });
const cormorantGaramond = Cormorant_Garamond({ subsets: ["latin"], weight: ["600"] });
const anton = Anton({ subsets: ["latin"], weight: ["400"] });
const josefinSans = Josefin_Sans({ subsets: ["latin"], weight: ["600"] });
const creepster = Creepster({ subsets: ["latin"], weight: ["400"] });

/**
 * The exact string set the vision model is allowed to choose from — also
 * the source of truth for validating its response (an AI can hallucinate a
 * font name that isn't in the list, so the caller must reject anything not
 * in POSTER_FONT_NAMES rather than trusting the response blindly).
 */
export const POSTER_FONTS: Record<string, { className: string; description: string }> = {
  Oswald: { className: oswald.className, description: "bold, condensed sans-serif — action, thriller" },
  Cinzel: { className: cinzel.className, description: "classic engraved serif — epic, historical, fantasy" },
  "Special Elite": { className: specialElite.className, description: "typewriter — noir, mystery, true crime" },
  Pacifico: { className: pacifico.className, description: "casual flowing script — romance, comedy, feel-good" },
  Orbitron: { className: orbitron.className, description: "geometric futuristic — sci-fi" },
  "Abril Fatface": { className: abrilFatface.className, description: "high-contrast bold display serif — prestige drama" },
  Righteous: { className: righteous.className, description: "rounded bold display — animation, family, adventure" },
  UnifrakturMaguntia: { className: unifraktur.className, description: "gothic blackletter — horror" },
  "Dancing Script": { className: dancingScript.className, description: "elegant cursive script — romance" },
  Bangers: { className: bangers.className, description: "comic-book bold display — comedy, superhero, animation" },
  "Cormorant Garamond": { className: cormorantGaramond.className, description: "refined classic serif — period drama" },
  Anton: { className: anton.className, description: "ultra-bold condensed — action, war" },
  "Josefin Sans": { className: josefinSans.className, description: "clean modern geometric sans — indie drama" },
  Creepster: { className: creepster.className, description: "dripping horror display — horror, campy thriller" },
};

export const POSTER_FONT_NAMES = Object.keys(POSTER_FONTS);

export function getPosterFontClassName(name: string | null | undefined): string | null {
  if (!name) return null;
  return POSTER_FONTS[name]?.className ?? null;
}
