/**
 * Single source of truth for the deployed origin, used to build absolute
 * URLs for Open Graph/Twitter card metadata and the sitemap (relative
 * URLs don't resolve correctly for social-media link unfurlers or search
 * engines). There's no NEXT_PUBLIC_SITE_URL configured for this project
 * (see getOrigin() in actions/auth.ts for why -- Vercel gives every
 * branch/preview its own hostname).
 *
 * VERCEL_URL is NOT what you want for the canonical production origin --
 * it's set to a unique per-deployment hostname (e.g.
 * taste-<hash>-<team>.vercel.app) on every single deployment, including
 * production ones, not the stable production alias users actually visit.
 * VERCEL_ENV tells us whether this build is "production", and
 * VERCEL_PROJECT_PRODUCTION_URL (also auto-set by Vercel) is the actual
 * stable production domain -- that combination is what correctly
 * distinguishes "this is a preview deploy, use its throwaway URL" from
 * "this is production, use the real domain everyone links to."
 */
export function siteOrigin(): string {
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://taste-green-tau.vercel.app";
}

export const SITE_NAME = "Backlot";
export const SITE_DESCRIPTION =
  "Personalized movie and TV recommendations that actually get your taste.";
