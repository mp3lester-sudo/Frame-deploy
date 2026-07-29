import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TitleCard } from "@/components/title-card";
import { RemoveFromListButton } from "@/components/lists/remove-from-list-button";
import { DeleteListButton } from "@/components/lists/delete-list-button";

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  const { data: list } = await supabase.from("lists").select("*").eq("id", id).maybeSingle();
  // RLS already hides private lists from non-owners (the row simply won't
  // come back), so a missing list here means either it doesn't exist or the
  // viewer isn't allowed to see it — both render as a 404.
  if (!list) notFound();

  const { data: itemRows } = await supabase
    .from("list_items")
    .select("note, titles(*)")
    .eq("list_id", id)
    .order("position", { ascending: true });

  const items = (itemRows ?? [])
    .map((r) => ({
      note: r.note as string | null,
      title: (r as unknown as { titles: Parameters<typeof TitleCard>[0]["title"] | null }).titles,
    }))
    .filter((r): r is { note: string | null; title: Parameters<typeof TitleCard>[0]["title"] } => !!r.title);

  const { data: owner } = await supabase.from("profiles").select("username, display_name").eq("id", list.user_id).maybeSingle();
  const isOwner = viewer?.id === list.user_id;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{list.title}</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            By{" "}
            <Link href={`/profile/${owner?.username ?? ""}`} className="text-accent hover:brightness-110">
              {owner?.display_name ?? owner?.username ?? "Someone"}
            </Link>{" "}
            · {items.length} title{items.length === 1 ? "" : "s"} · {list.is_public ? "Public" : "Private"}
          </p>
          {list.description && <p className="mt-2 text-sm text-foreground-muted">{list.description}</p>}
        </div>
        {isOwner && (
          <div className="flex shrink-0 items-center gap-2">
            <DeleteListButton listId={list.id} />
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-foreground-muted">
          {isOwner ? "Nothing added yet — use \"Add to list\" on any movie page." : "This list is empty."}
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
          {items.map(({ title, note }) => (
            <div key={title.id} className="group relative">
              {isOwner && <RemoveFromListButton listId={list.id} titleId={title.id} />}
              <TitleCard title={title} reason={note ?? undefined} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
