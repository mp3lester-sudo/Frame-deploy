import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { CreateListForm } from "@/components/lists/create-list-form";

export default async function ListsPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/lists");

  const { data: lists } = await supabase
    .from("lists")
    .select("id, title, description, is_public, list_items(count)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

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

      <div className="mt-6 flex flex-col gap-3">
        {(lists ?? []).length === 0 ? (
          <p className="text-sm text-foreground-muted">You haven&apos;t created any lists yet.</p>
        ) : (
          (lists ?? []).map((list) => {
            const count = (list as unknown as { list_items: { count: number }[] }).list_items?.[0]?.count ?? 0;
            return (
              <Link
                key={list.id}
                href={`/lists/${list.id}`}
                className="flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-surface p-4 hover:border-accent/50"
              >
                <div>
                  <p className="font-medium">{list.title}</p>
                  {list.description && (
                    <p className="mt-0.5 line-clamp-1 text-sm text-foreground-muted">{list.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-foreground-muted">
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
