"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { validateListTitle, validateListDescription, validateListItemNote } from "@/lib/lists/validate";
import { captureServerError } from "@/lib/monitoring/sentry-server";

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

const MAX_LISTS_PER_USER = 200;

// ---------------------------------------------------------------------------
// Watchlist — a single, private "want to watch" queue per user. See
// migration 0020_watchlist.sql for why this is its own table rather than a
// reserved list.
// ---------------------------------------------------------------------------

export async function addToWatchlist(titleId: string) {
  const { titleId: id } = z.object({ titleId: z.string().uuid() }).parse({ titleId });
  const { supabase, user } = await requireUser();

  // onConflict must name the real (user_id, title_id) unique constraint --
  // without it PostgREST resolves against the fresh-uuid primary key,
  // which never matches, so re-adding a title already on the watchlist
  // (a double-click, or toggling it from two tabs) degraded to a plain
  // INSERT and threw on the real constraint. The error was also never
  // checked here, so the hero's optimistic bookmark toggle
  // (recommendation-reveal.tsx) could silently diverge from the DB with
  // no error ever reaching its catch block.
  const { error } = await supabase
    .from("watchlist")
    .upsert({ user_id: user.id, title_id: id }, { onConflict: "user_id,title_id" });
  if (error) {
    console.error("[addToWatchlist]", error.message);
    await captureServerError(error, { action: "addToWatchlist", userId: user.id, titleId: id });
    throw new Error("Couldn't add that to your watchlist -- try again");
  }

  revalidatePath(`/movie/${id}`);
  revalidatePath("/watchlist");
}

export async function removeFromWatchlist(titleId: string) {
  const { titleId: id } = z.object({ titleId: z.string().uuid() }).parse({ titleId });
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("watchlist").delete().eq("user_id", user.id).eq("title_id", id);
  if (error) {
    console.error("[removeFromWatchlist]", error.message);
    await captureServerError(error, { action: "removeFromWatchlist", userId: user.id, titleId: id });
    throw new Error("Couldn't remove that from your watchlist -- try again");
  }

  revalidatePath(`/movie/${id}`);
  revalidatePath("/watchlist");
}

// ---------------------------------------------------------------------------
// Custom lists — public.lists / public.list_items have existed since
// migration 0001 (the feed's EVENT_COPY even already had "list_created"
// copy waiting for it — see src/app/feed/page.tsx and
// src/components/home/circle-feed.tsx) but no UI ever wrote to them until
// now.
// ---------------------------------------------------------------------------

const createListSchema = z.object({
  title: z.string(),
  description: z.string().optional().default(""),
  isPublic: z.boolean().optional().default(true),
});

export async function createList(input: z.input<typeof createListSchema>) {
  const { title, description, isPublic } = createListSchema.parse(input);
  const { supabase, user } = await requireUser();

  const titleResult = validateListTitle(title);
  if (!titleResult.ok) throw new Error(titleResult.error);
  const descriptionResult = validateListDescription(description);
  if (!descriptionResult.ok) throw new Error(descriptionResult.error);

  const { count } = await supabase
    .from("lists")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= MAX_LISTS_PER_USER) {
    throw new Error(`You've hit the limit of ${MAX_LISTS_PER_USER} lists`);
  }

  const { data, error } = await supabase
    .from("lists")
    .insert({
      user_id: user.id,
      title: titleResult.value,
      description: descriptionResult.value || undefined,
      is_public: isPublic,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("activity_events").insert({
    user_id: user.id,
    event_type: "list_created",
    ref_id: data.id,
  });

  revalidatePath("/lists");
  return data.id as string;
}

const updateListSchema = z.object({
  listId: z.string().uuid(),
  title: z.string().optional(),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export async function updateList(input: z.input<typeof updateListSchema>) {
  const { listId, title, description, isPublic } = updateListSchema.parse(input);
  const { supabase, user } = await requireUser();

  const patch: { title?: string; description?: string; is_public?: boolean } = {};
  if (title !== undefined) {
    const result = validateListTitle(title);
    if (!result.ok) throw new Error(result.error);
    patch.title = result.value;
  }
  if (description !== undefined) {
    const result = validateListDescription(description);
    if (!result.ok) throw new Error(result.error);
    patch.description = result.value;
  }
  if (isPublic !== undefined) patch.is_public = isPublic;

  const { error } = await supabase.from("lists").update(patch).eq("id", listId).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
}

export async function deleteList(listId: string) {
  const { listId: id } = z.object({ listId: z.string().uuid() }).parse({ listId });
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("lists").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/lists");
}

const listItemSchema = z.object({
  listId: z.string().uuid(),
  titleId: z.string().uuid(),
  note: z.string().optional().default(""),
});

export async function addTitleToList(input: z.input<typeof listItemSchema>) {
  const { listId, titleId, note } = listItemSchema.parse(input);
  const { supabase, user } = await requireUser();

  const noteResult = validateListItemNote(note);
  if (!noteResult.ok) throw new Error(noteResult.error);

  // Ownership check — list_items' own RLS policy already enforces this, but
  // checking here first gives a clean "Not authenticated"-style Error
  // instead of a silent no-op insert that fails the RLS check.
  const { data: list } = await supabase.from("lists").select("user_id").eq("id", listId).maybeSingle();
  if (!list || list.user_id !== user.id) throw new Error("List not found");

  const { count } = await supabase
    .from("list_items")
    .select("*", { count: "exact", head: true })
    .eq("list_id", listId);

  const { error } = await supabase.from("list_items").upsert({
    list_id: listId,
    title_id: titleId,
    note: noteResult.value || undefined,
    position: count ?? 0,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/movie/${titleId}`);
}

export async function removeTitleFromList(input: { listId: string; titleId: string }) {
  const { listId, titleId } = z
    .object({ listId: z.string().uuid(), titleId: z.string().uuid() })
    .parse(input);
  const { supabase, user } = await requireUser();

  const { data: list } = await supabase.from("lists").select("user_id").eq("id", listId).maybeSingle();
  if (!list || list.user_id !== user.id) throw new Error("List not found");

  const { error } = await supabase
    .from("list_items")
    .delete()
    .eq("list_id", listId)
    .eq("title_id", titleId);
  if (error) throw new Error(error.message);

  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/movie/${titleId}`);
}
