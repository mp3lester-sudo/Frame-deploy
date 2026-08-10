import "server-only";
import { headers } from "next/headers";

/**
 * Best-effort client IP for rate-limiting unauthenticated auth endpoints
 * (signup, login, password reset) -- these run before there's a user id to
 * key a rate limit on (see isRateLimited, rate-limit.ts), so IP is the only
 * signal available. Vercel's edge network sets x-forwarded-for with the
 * real client IP first in a comma-separated chain (any proxies it passed
 * through after that get appended) -- see
 * https://vercel.com/docs/edge-network/headers#x-forwarded-for.
 *
 * Falls back to a constant key when the header is missing (e.g. local dev
 * without going through Vercel's network) so rate limiting still no-ops
 * safely rather than throwing -- every request would then share one
 * bucket, which is fine for local dev and never happens in production.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
