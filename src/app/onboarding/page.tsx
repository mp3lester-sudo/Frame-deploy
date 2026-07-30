import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { OnboardingSwipe, type SwipeTitle } from "@/components/onboarding/onboarding-swipe";
import { buildDiverseDeck } from "@/lib/catalogue/diverse-deck";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/onboarding");

  // Exclude anything the user's already rated/watched — most commonly from
  // a landing-page taste-teaser session before signup (see signUp() in
  // auth.ts), so this quiz doesn't re-ask about a title they just swiped on.
  const { data: alreadyWatched } = await supabase.from("watch_history").select("title_id").eq("user_id", user.id);
  const excludeIds = (alreadyWatched ?? []).map((w) => w.title_id);

  const titles = await buildDiverseDeck(supabase, { excludeIds });

  if (!titles.length) {
    // Catalogue not seeded yet, or the user's already rated everything in
    // the anchor deck — either way, nothing left to usefully ask here.
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
    posterUrl: t.posterUrl,
    year: t.year,
    director: directorByTitle.get(t.id) ?? null,
    runtimeMinutes: t.runtimeMinutes,
    genres: t.genres,
  }));

  return (
    <div className="min-h-[calc(100vh-3.5rem)] px-6 py-10">
      <OnboardingSwipe titles={swipeTitles} />
    </div>
  );
}
