import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";

/**
 * Self-healing guard against a class of bug where an auth.users row exists
 * with no matching public.profiles row — which happened for real (a live
 * account had a confirmed session but no profile, so /profile/me 404'd and
 * every write that FKs to profiles, like ratings, would have failed too).
 *
 * Called once per request from the root layout for any authenticated user.
 * Cheap when the profile already exists (one indexed select, no write).
 */
export async function ensureProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: User
): Promise<void> {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) return;

  const metaUsername = (user.user_metadata as { username?: string } | null)?.username;
  const base = sanitizeUsername(metaUsername || user.email?.split("@")[0] || "user");

  let candidate = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      username: candidate,
      display_name: candidate,
    });
    if (!error) return;
    // Unique violation on username — try again with a random suffix.
    if (error.code === "23505") {
      candidate = `${base}${Math.floor(Math.random() * 10000)}`.slice(0, 20);
      continue;
    }
    // Anything else (e.g. RLS edge case): don't crash the page render over it.
    return;
  }
}

function sanitizeUsername(input: string): string {
  const cleaned = input.toLowerCase().replace(/[^a-z0-9_]/g, "");
  const padded = cleaned.length >= 3 ? cleaned : (cleaned + "user000").slice(0, 8);
  return padded.slice(0, 20);
}
