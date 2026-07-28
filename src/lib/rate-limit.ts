import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Postgres-backed rate limiting (see migration 0007_rate_limiting.sql) — an
 * in-memory Map would only limit a single warm serverless instance, not the
 * endpoint as a whole, since Vercel doesn't guarantee the same instance
 * handles consecutive requests. Uses the service-role client since the
 * rate_limit_buckets table intentionally has no RLS policies for normal
 * clients.
 */
export async function isRateLimited(
  key: string,
  { maxRequests, windowSeconds }: { maxRequests: number; windowSeconds: number }
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    // Fail open — a broken rate limiter shouldn't take down the feature it's
    // protecting. Logged so it's visible without blocking real users.
    console.error("[rate-limit] check failed, allowing request:", error.message);
    return false;
  }
  return data === false;
}
