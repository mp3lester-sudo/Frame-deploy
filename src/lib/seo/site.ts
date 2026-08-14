/**
 * Single source of truth for the deployed origin, used to build absolute
 * URLs for Open Graph/Twitter card metadata and the sitemap (relative
 * URLs don't resolve correctly for social-media link unfurlers or search
 * engines). There's no NEXT_PUBLIC_SITE_URL configured for this project
 * (see getOrigin() in actions/auth.ts for why -- Vercel gives every
 * branch/preview its own hostname).
 *
 * The known stable production domain is the correct default for
 * everything this is used for -- OG metadata, sitemap, robots.txt all
 * need to point at the URL real users and crawlers actually see, not a
 * per-deployment hostname.
 *
 * VERCEL_URL is deliberately NOT used as the default: it's set to a
 * unique per-deployment hostname on *every* deploy, production included
 * (confirmed live -- robots.txt's Sitemap line briefly pointed at
 * taste-<hash>-<team>.vercel.app instead of taste-green-tau.vercel.app
 * before this was caught). VERCEL_PROJECT_PRODUCTION_URL would be the
 * "correct" system var for this, but it requires a project-level toggle
 * ("Automatically expose System Environment Variables") this project
 * doesn't have enabled, so it's simply unavailable at runtime -- rather
 * than depend on a setting that has to be manually turned on in the
 * Vercel dashboard, VERCEL_URL is only consulted for genuine preview
 * deployments (VERCEL_ENV === "preview"), which is reliably set without
 * that toggle.
 */
export function siteOrigin(): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "https://taste-green-tau.vercel.app";
}

export const SITE_NAME = "Marquee";
export const SITE_DESCRIPTION =
  "Personalized movie and TV recommendations that actually get your taste.";
