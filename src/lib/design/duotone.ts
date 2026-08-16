import type { MediaType } from "@/lib/context/media-type-cookie";

/**
 * One shared duotone recipe for every place a real photo needs to sit
 * inside Slate's palette instead of clashing with it -- originally
 * built for the profile page's avatar-backdrop collage (see
 * profile/[username]/page.tsx), now also driving the home hero's
 * RecommendationReveal ("Kinetic Numerals" pass). Keeping this in one
 * module means both surfaces stay visually identical by construction:
 * change the recipe once here and every photo across the app re-tints
 * together, instead of two components drifting apart because someone
 * only touched one of two copy-pasted filter strings.
 *
 * Movies: warm gold-toward-black duotone (grayscale -> sepia -> hue-
 * rotated back toward the app's actual gold, not sepia's default
 * orange). Shows: a deliberately muted, desaturated icy slate-blue --
 * NOT a saturated cyan/teal, see the Shows palette comment in
 * globals.css for why that direction was rejected.
 */
export const BANNER_DUOTONE_FILTER: Record<MediaType, string> = {
  movie: "grayscale(1) sepia(0.5) hue-rotate(-8deg) saturate(2.2) brightness(0.68) contrast(1.1)",
  tv: "grayscale(1) sepia(0.25) hue-rotate(180deg) saturate(1.15) brightness(0.75) contrast(1.05)",
};
