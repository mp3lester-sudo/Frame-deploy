import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingSwipe, type SwipeTitle } from "@/components/onboarding/onboarding-swipe";

const BATCH_SIZE = 14;

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  const { data: titles } = await supabase
    .from("titles")
    .select("*")
    .order("tmdb_vote_count", { ascending: false })
    .limit(BATCH_SIZE);

  if (!titles?.length) {
    // Catalogue not seeded yet — nothing to rate, so don't block the user here.
    redirect("/");
  }

  const titleIds = titles.map((t) => t.id);
  const { data: directorCredits } = await supabase
    .from("title_credits")
    .select("title_id, people(name)")
    .eq("credit_type", "director")
    .in("title_id", titleIds);

  const directorByTitle = new Map<string, string>();
  for (const c of directorCredits ?? []) {
    const name = (c as unknown as { people: { name: string } | null }).people?.name;
    if (name && !directorByTitle.has(c.title_id)) directorByTitle.set(c.title_id, name);
  }

  const swipeTitles: SwipeTitle[] = titles.map((t) => ({
    id: t.id,
    name: t.name,
    overview: t.overview,
    posterUrl: t.poster_url,
    year: t.release_date?.slice(0, 4) ?? null,
    director: directorByTitle.get(t.id) ?? null,
    runtimeMinutes: t.runtime_minutes,
    genres: t.genres ?? [],
  }));

  return (
    <div className="min-h-[calc(100vh-3.5rem)] px-6 py-10">
      <OnboardingSwipe titles={swipeTitles} />
    </div>
  );
}
