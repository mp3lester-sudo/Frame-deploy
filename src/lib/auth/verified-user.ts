import "server-only";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { VERIFIED_USER_HEADER } from "@/lib/auth/verified-user-header";

/** The subset of Supabase's User actually used anywhere downstream of
 *  middleware (see grep across src/lib/actions/*.ts and src/app/layout.tsx
 *  before this existed) — deliberately not the full `User` type, since we
 *  only ever forward these three fields in the header. */
export interface VerifiedUser {
  id: string;
  email: string | undefined;
  user_metadata: Record<string, unknown>;
  /** Null/undefined means unverified -- Supabase only sets this once the
   *  signup/change-email confirmation link has been clicked. Used for the
   *  non-blocking verification nudge in Settings (see
   *  components/settings/verify-email-banner.tsx); deliberately never
   *  used to gate access, since enforcing this retroactively would lock
   *  out real existing accounts that were created before this field
   *  existed anywhere in the app. */
  email_confirmed_at?: string | null;
}

/**
 * Reads the user middleware already verified for this request (see
 * src/middleware.ts) instead of calling supabase.auth.getUser() again —
 * that call is a real network round trip to Supabase's Auth server, so
 * doing it a second (or third) time per request was pure wasted latency on
 * every mutating button. Falls back to a real getUser() call only if the
 * header is somehow missing (e.g. middleware didn't run for some reason),
 * so nothing is ever trusted without at least one real verification.
 */
export async function getVerifiedUser(): Promise<VerifiedUser | null> {
  const headerList = await headers();
  const raw = headerList.get(VERIFIED_USER_HEADER);

  if (raw === null) {
    // Defensive fallback only — should not happen in normal operation,
    // since middleware's matcher covers every route that can reach here.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user
      ? {
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata,
          email_confirmed_at: user.email_confirmed_at ?? null,
        }
      : null;
  }

  if (raw === "") return null;
  return JSON.parse(raw) as VerifiedUser;
}
