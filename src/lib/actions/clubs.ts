"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { revalidatePath } from "next/cache";
import { validateClubName, validateClubDescription, validateClubPostBody } from "@/lib/clubs/validate";

async function requireUser() {
  const supabase = await createClient();
  // Trusts the user middleware already verified for this request (see
  // src/lib/auth/verified-user.ts) instead of calling
  // supabase.auth.getUser() again — that's a real network round trip to
  // Supabase's Auth server, so re-deriving it here on top of middleware
  // (and again after this action's revalidatePath re-renders the layout)
  // was tripling that latency on every single mutating button.
  const user = await getVerifiedUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function createClub(name: string, description: string): Promise<string> {
  const nameResult = validateClubName(name);
  if (!nameResult.ok) throw new Error(nameResult.error);
  const descriptionResult = validateClubDescription(description);
  if (!descriptionResult.ok) throw new Error(descriptionResult.error);

  const { supabase, user } = await requireUser();

  const { data: club, error } = await supabase
    .from("clubs")
    .insert({ name: nameResult.value, description: descriptionResult.value, created_by: user.id })
    .select("id")
    .single();
  if (error || !club) throw new Error(error?.message ?? "Failed to create club");

  await supabase.from("club_members").insert({ club_id: club.id, user_id: user.id, role: "owner" });

  revalidatePath("/clubs");
  return club.id as string;
}

export async function joinClub(clubId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("club_members").upsert({ club_id: clubId, user_id: user.id, role: "member" });
  revalidatePath(`/clubs/${clubId}`);
  revalidatePath("/clubs");
}

export async function leaveClub(clubId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("club_members").delete().eq("club_id", clubId).eq("user_id", user.id);
  revalidatePath(`/clubs/${clubId}`);
  revalidatePath("/clubs");
}

export interface NewClubPost {
  id: string;
  club_id: string;
  user_id: string;
  body: string;
  created_at: string;
  username: string;
  avatar_url: string | null;
}

export async function postToClub(clubId: string, rawBody: string): Promise<NewClubPost> {
  const validation = validateClubPostBody(rawBody);
  if (!validation.ok) throw new Error(validation.error);
  const { supabase, user } = await requireUser();

  // The profile lookup only depends on user.id, not on the post insert
  // succeeding, so it doesn't need to wait behind it.
  const [{ data: post, error }, { data: profile }] = await Promise.all([
    supabase
      .from("club_posts")
      .insert({ club_id: clubId, user_id: user.id, body: validation.value })
      .select("id, club_id, user_id, body, created_at")
      .single(),
    supabase.from("profiles").select("username, avatar_url").eq("id", user.id).maybeSingle(),
  ]);
  if (error || !post) throw new Error(error?.message ?? "Failed to post — are you a member of this club?");

  revalidatePath(`/clubs/${clubId}`);
  return { ...post, username: profile?.username ?? "you", avatar_url: profile?.avatar_url ?? null };
}
