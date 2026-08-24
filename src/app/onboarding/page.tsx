import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { OnboardingSwipe, type SwipeTitle } from "@/components/onboarding/onboarding-swipe";
import { buildDiverseDeck, enrichDeckTitles } from "@/lib/catalogue/diverse-deck";
import { getActiveMediaType } from "@/lib/context/media-type";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/onboarding");

  // Exclude anything the user's already rated/watched — most commonly from
  // a landing-page taste-teaser session before signup (see signUp() in
  // auth.ts), so this quiz doesn't re-ask about a title they just swiped on.
  const { data: alreadyWatched } = await supabase.from("watch_history").select("title_id").eq("user_id", user.id);
  const excludeIds = (alreadyWatched ?? []).map((w) => w.title_id);

  const mediaType = await getActiveMediaType();
  const titles = await buildDiverseDeck(supabase, { excludeIds, mediaType });

  if (!titles.length) {
    // Catalogue not seeded yet, or the user's already rated everything in
    // the anchor deck — either way, nothing left to usefully ask here.
    redirect("/");
  }

  // Director + trailer enrichment is now shared with the adaptive
  // mid-session batch (see getAdaptiveOnboardingBatch in
  // src/lib/actions/onboarding.ts) so both produce cards in the same
  // shape without duplicating this lookup.
  const swipeTitles: SwipeTitle[] = await enrichDeckTitles(supabase, titles);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] px-6 py-10">
      <OnboardingSwipe titles={swipeTitles} excludeIds={excludeIds} />
    </div>
  );
}
