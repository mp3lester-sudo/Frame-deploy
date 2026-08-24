import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { CreateListForm } from "@/components/lists/create-list-form";
import Image from "@/components/ui/fade-image";
import { getActiveMediaType } from "@/lib/context/media-type";
import { getAutoCollections } from "@/lib/collections/auto-collections";
import { AutoCollectionRow } from "@/components/lists/auto-collection-row";

// How many posters to show in each list's fan preview -- enough to read
// as "a stack of films" without the row growing tall on long lists.
const PREVIEW_COUNT = 3;

export default async function ListsPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/lists");

  const mediaType = await getActiveMediaType();

  const [{ data: lists }, autoCollections] = await Promise.all([
    supabase
      .from("lists")
      .select("id, title, description, is_public, list_items(count)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    // Auto-curated shelves (magic-moments audit, task #756) -- built
    // entirely from ratings + genre-affinity.ts, already computed for
    // recommendations elsewhere; this just re-groups the person's own
    // rated titles by genre, no new heavy computation.
    getAutoCollections(user.id, mediaType),
  ]);

  const listIds = (lists ?? []).map((l) => l.id);

  // One extra query gets a few poster URLs per list for the fan preview.
  // Supabase embeds don't support a per-parent limit, so this fetches
  // everyone's first handful of items (ordered by position) in one shot
  // and trims to PREVIEW_COUNT per list client-side -- cheap since list
  // sizes here are small, and still a single round trip either way.
  const { data: itemRows } = listIds.length
    ? await supabase
        .from("list_items")
        .select("list_id, position, titles(poster_url)")
        .in("list_id", listIds)
        .order("position", { ascending: true })
    : { data: [] };

  const postersByList = new Map<string, string[]>();
  for (const row of itemRows ?? []) {
    const poster = (row as unknown as { titles: { poster_url: string | null } | null }).titles?.poster_url;
    if (!poster) continue;
    const existing = postersByList.get(row.list_id) ?? [];
    if (existing.length < PREVIEW_COUNT) {
      existing.push(poster);
      postersByList.set(row.list_id, existing);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Your lists</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Named collections you can share, like Letterboxd Lists.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <CreateListForm />
      </div>

      {autoCollections.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          {autoCollections.map((collection) => (
            <AutoCollectionRow key={collection.genre} collection={collection} />
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(lists ?? []).length === 0 ? (
          <p className="text-sm text-foreground-muted">You haven&apos;t created any lists yet.</p>
        ) : (
          (lists ?? []).map((list) => {
            const count = (list as unknown as { list_items: { count: number }[] }).list_items?.[0]?.count ?? 0;
            const posters = postersByList.get(list.id) ?? [];
            return (
              // Poster fan replaces the plain "N titles" text -- same
              // glass-card pattern as Clubs/Movie Night, browsing your
              // lists now looks like flipping through a stack of films
              // instead of reading a table row.
              <Link
                key={list.id}
                href={`/lists/${list.id}`}
                className="bento-card flex items-center justify-between gap-4 p-3"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex shrink-0">
                    {posters.length > 0 ? (
                      posters.map((url, i) => (
                        <div
                          key={i}
                          className="relative h-11 w-8 overflow-hidden rounded-[var(--radius-sm)] border-2 border-surface bg-surface-raised"
                          style={{ marginLeft: i === 0 ? 0 : -14, zIndex: posters.length - i }}
                        >
                          <Image src={url} alt="" fill className="object-cover" sizes="32px" />
                        </div>
                      ))
                    ) : (
                      <div className="h-11 w-8 rounded-[var(--radius-sm)] border-2 border-surface bg-surface-raised" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{list.title}</p>
                    {list.description && (
                      <p className="mt-0.5 line-clamp-1 text-sm text-foreground-muted">{list.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-foreground-muted">
                  <span>{count} title{count === 1 ? "" : "s"}</span>
                  <span>{list.is_public ? "Public" : "Private"}</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
