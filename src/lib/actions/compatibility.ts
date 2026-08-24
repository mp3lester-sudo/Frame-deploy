"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getActiveMediaType } from "@/lib/context/media-type";
import { computeCompatibilityForUsers } from "@/lib/matchmaking/compute";

/**
 * Freezes a two-person compatibility result into a public, shareable link
 * (growth audit finding -- see migration 0083). Recomputes fresh via
 * computeCompatibilityForUsers rather than trusting a client-supplied
 * percent, so a share can't be spoofed to claim a higher/lower match than
 * what's actually true; the viewer's own display name is looked up here
 * rather than trusted from the client for the same reason.
 */
export async function createCompatibilityShare(
  otherUserId: string,
  otherName: string
): Promise<{ id: string } | { error: string }> {
  const viewer = await getVerifiedUser();
  if (!viewer) return { error: "Sign in to share a compatibility card" };
  if (viewer.id === otherUserId) return { error: "Can't compare with yourself" };

  const supabase = await createClient();
  const mediaType = await getActiveMediaType();

  const [{ data: viewerProfile }, compatibility] = await Promise.all([
    supabase.from("profiles").select("username, display_name").eq("id", viewer.id).maybeSingle(),
    computeCompatibilityForUsers(viewer.id, otherUserId, mediaType),
  ]);

  if (!compatibility.hasEnoughData) {
    return { error: "Not enough ratings from both of you yet to share this" };
  }

  const viewerName = viewerProfile?.display_name ?? viewerProfile?.username ?? "A Slate user";

  const { data, error } = await supabase
    .from("compatibility_shares")
    .insert({
      viewer_id: viewer.id,
      other_id: otherUserId,
      viewer_name: viewerName,
      other_name: otherName,
      percent: compatibility.percent,
      shared_genres: compatibility.sharedFavoriteGenres,
      shared_directors: compatibility.sharedFavoriteDirectors.map((d) => d.name),
      disagreement_genre: compatibility.biggestDisagreementGenre,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[createCompatibilityShare] insert failed:", error?.message);
    return { error: "Couldn't create a share link -- try again" };
  }

  return { id: data.id };
}
