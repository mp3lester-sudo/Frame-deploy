/**
 * Single source of truth for the deployed origin, used to build absolute
 * URLs for Open Graph/Twitter card metadata (relative URLs don't resolve
 * correctly for social-media link unfurlers). There's no
 * NEXT_PUBLIC_SITE_URL configured for this project (see getOrigin() in
 * actions/auth.ts for why -- Vercel gives every branch/preview its own
 * hostname), but metadata is generated at request time on the server, so
 * VERCEL_URL (set automatically by Vercel on every deployment) covers
 * preview deploys too. Falls back to the known production domain.
 */
export function siteOrigin(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://taste-green-tau.vercel.app";
}

export const SITE_NAME = "Backlot";
export const SITE_DESCRIPTION =
  "Personalized movie and TV recommendations that actually get your taste.";
