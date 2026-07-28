import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RateControl } from "@/components/rate-control";
import { ReviewCard } from "@/components/review-card";
import { CreditsSection, type Credit } from "@/components/credits-row";
import { Badge } from "@/components/ui/badge";
import { formatRuntime } from "@/lib/utils";

export default async function MovieDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: title }, { data: reviews }, { data: userRating }, { data: credits }] = await Promise.all([
    supabase.from("titles").select("*").eq("id", id).single(),
    supabase
      .from("reviews")
      .select("*, profiles(username, avatar_url), ratings:ratings(score)")
      .eq("title_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { data: null };
      return supabase.from("ratings").select("score").eq("title_id", id).eq("user_id", user.id).maybeSingle();
    })(),
    supabase
      .from("title_credits")
      .select("credit_type, character_name, billing_order, people(name, photo_url)")
      .eq("title_id", id),
  ]);

  if (!title) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="relative aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-[var(--radius-lg)] bg-surface-raised sm:w-56">
          {title.poster_url && (
            <Image src={title.poster_url} alt={title.name} fill className="object-cover" />
          )}
        </div>

        <div className="flex-1">
          <h1 className="text-2xl font-semibold sm:text-3xl">{title.name}</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {title.release_date?.slice(0, 4)} · {formatRuntime(title.runtime_minutes)}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {title.genres?.map((g) => (
              <Badge key={g}>{g}</Badge>
            ))}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-foreground-muted">{title.overview}</p>

          <CreditsSection credits={(credits ?? []) as unknown as Credit[]} />

          <div className="mt-6">
            <p className="mb-1 text-xs uppercase tracking-wide text-foreground-muted">Your rating</p>
            <RateControl titleId={title.id} initialScore={userRating?.score ?? 0} />
          </div>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Reviews</h2>
        {reviews?.length ? (
          reviews.map((r) => (
            <ReviewCard
              key={r.id}
              authorName={(r as unknown as { profiles: { username: string } }).profiles?.username ?? "Someone"}
              authorAvatarUrl={(r as unknown as { profiles: { avatar_url: string | null } }).profiles?.avatar_url}
              body={r.body}
              containsSpoilers={r.contains_spoilers}
              createdAt={r.created_at}
              rating={(r as unknown as { ratings: { score: number }[] }).ratings?.[0]?.score}
            />
          ))
        ) : (
          <p className="text-sm text-foreground-muted">No reviews yet — be the first.</p>
        )}
      </section>
    </div>
  );
}
