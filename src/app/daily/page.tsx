import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { createClient } from "@/lib/supabase/server";
import { getActiveMediaType } from "@/lib/context/media-type";
import { getDirectorOfTheDay } from "@/lib/director-of-day/fetch";
import { DirectorOfTheDay } from "@/components/home/director-of-the-day";
import { getCreatorSpotlight } from "@/lib/creator-spotlight/fetch";
import { CreatorSpotlight } from "@/components/home/creator-spotlight";
import { getOrCreateDailyTrivia, toPublicTrivia } from "@/lib/daily-trivia/generate";
import { DailyTriviaCard } from "@/components/daily/daily-trivia-card";
import { getOnThisDayTitles } from "@/lib/on-this-day/fetch";
import { OnThisDayCard } from "@/components/daily/on-this-day-card";
import { getDailyNewsStory } from "@/lib/news/daily-story";
import { DailyNewsCard } from "@/components/daily/daily-news-card";
import { HiddenGemCard } from "@/components/home/hidden-gem-card";
import { getHiddenGemForUser } from "@/lib/recommendations/hidden-gem";
import { IndieSpotlightSection, IndieSpotlightSkeleton } from "@/components/home/indie-spotlight";

export default async function DailyPage() {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/daily");

  const supabase = await createClient();
  const mediaType = await getActiveMediaType();
  // Director of the Day (movies) and Creator Spotlight (shows) are the
  // media-type-scoped pair here -- TV ingestion now carries a 'creator'
  // credit (migration 0073) instead of the director credit movies use
  // (see ingest-tmdb.ts's comments on why those two are kept as
  // genuinely separate credit types), so each mode gets its own feature
  // built off its own credit type rather than one mode showing a
  // mislabeled or missing feature.
  const [directorOfTheDay, creatorSpotlight, trivia, onThisDayTitles, newsStory, hiddenGem] = await Promise.all([
    mediaType === "movie" ? getDirectorOfTheDay(user.id) : Promise.resolve(null),
    mediaType === "tv" ? getCreatorSpotlight(user.id) : Promise.resolve(null),
    getOrCreateDailyTrivia(),
    getOnThisDayTitles(),
    getDailyNewsStory(),
    // Relocated here from Home (Option B declutter) -- a single high-match,
    // low-popularity pick from this user's own taste vector. No other
    // pick list on this page to exclude from, so no excludeIds needed.
    getHiddenGemForUser(user.id, mediaType),
  ]);

  // Only ever fetched once trivia is known to exist, and only to check
  // whether THIS user already answered today -- the correct answer itself
  // never gets sent to the client unless they have (see
  // components/daily/daily-trivia-card.tsx).
  let triviaResponse: { selected_index: number; is_correct: boolean } | null = null;
  if (trivia) {
    const { data } = await supabase
      .from("daily_trivia_responses")
      .select("selected_index, is_correct")
      .eq("user_id", user.id)
      .eq("date_key", trivia.dateKey)
      .maybeSingle();
    triviaResponse = data ?? null;
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-gold-foil font-section-heading text-4xl">Daily</h1>
      <p className="font-section-body mt-2 text-sm text-foreground-muted">
        A new pick every day — trivia, a bit of film history, and what&apos;s happening in the industry.
      </p>

      {/* Left column: On This Day, then Director of the Day underneath it.
          Right column: Daily Trivia, then Today's Story underneath it.
          Single stacked column on mobile, in that same top-to-bottom
          order per column. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <OnThisDayCard titles={onThisDayTitles} />

          {directorOfTheDay ? (
            <DirectorOfTheDay director={directorOfTheDay} />
          ) : creatorSpotlight ? (
            <CreatorSpotlight creator={creatorSpotlight} />
          ) : (
            <p className="font-section-body text-sm text-foreground-muted">
              {mediaType === "movie"
                ? "Rate a few titles to unlock your Director of the Day."
                : "Rate a few shows to unlock your Showrunner of the Day."}
            </p>
          )}

          {/* Relocated from Home (Option B declutter). */}
          {hiddenGem && (
            <HiddenGemCard title={hiddenGem.title} matchPercent={hiddenGem.matchPercent} />
          )}
        </div>

        <div className="flex flex-col gap-6">
          {trivia &&
            (triviaResponse ? (
              <DailyTriviaCard
                question={trivia.question}
                options={trivia.options}
                posterUrl={trivia.posterUrl}
                alreadyAnswered
                correctIndex={trivia.correctIndex}
                selectedIndex={triviaResponse.selected_index}
              />
            ) : (
              <DailyTriviaCard {...toPublicTrivia(trivia)} alreadyAnswered={false} />
            ))}

          <DailyNewsCard story={newsStory} />
        </div>
      </div>

      {/* Relocated from Home (Option B declutter) -- four live trade-press
          RSS fetches + best-effort image scraping, so it stays behind its
          own Suspense boundary rather than blocking the rest of this page. */}
      <div className="mt-6">
        <Suspense fallback={<IndieSpotlightSkeleton />}>
          <IndieSpotlightSection />
        </Suspense>
      </div>
    </section>
  );
}
