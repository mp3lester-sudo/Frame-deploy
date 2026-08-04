import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { createClient } from "@/lib/supabase/server";
import { getDirectorOfTheDay } from "@/lib/director-of-day/fetch";
import { DirectorOfTheDay } from "@/components/home/director-of-the-day";
import { getOrCreateDailyTrivia, toPublicTrivia } from "@/lib/daily-trivia/generate";
import { DailyTriviaCard } from "@/components/daily/daily-trivia-card";
import { getOnThisDayTitles } from "@/lib/on-this-day/fetch";
import { OnThisDayCard } from "@/components/daily/on-this-day-card";
import { getDailyNewsStory } from "@/lib/news/daily-story";
import { DailyNewsCard } from "@/components/daily/daily-news-card";

export default async function DailyPage() {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/daily");

  const supabase = await createClient();

  const [directorOfTheDay, trivia, onThisDayTitles, newsStory] = await Promise.all([
    getDirectorOfTheDay(user.id),
    getOrCreateDailyTrivia(),
    getOnThisDayTitles(),
    getDailyNewsStory(),
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
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-section-heading text-3xl">Daily</h1>
      <p className="font-section-body mt-2 text-sm text-foreground-muted">
        A new pick every day — trivia, a bit of film history, and what&apos;s happening in the industry.
      </p>

      <div className="mt-8 flex flex-col gap-6">
        {trivia &&
          (triviaResponse ? (
            <DailyTriviaCard
              question={trivia.question}
              options={trivia.options}
              alreadyAnswered
              correctIndex={trivia.correctIndex}
              selectedIndex={triviaResponse.selected_index}
            />
          ) : (
            <DailyTriviaCard {...toPublicTrivia(trivia)} alreadyAnswered={false} />
          ))}

        <OnThisDayCard titles={onThisDayTitles} />
        <DailyNewsCard story={newsStory} />

        {directorOfTheDay ? (
          <DirectorOfTheDay director={directorOfTheDay} />
        ) : (
          <p className="font-section-body text-sm text-foreground-muted">
            Rate a few titles to unlock your Director of the Day.
          </p>
        )}
      </div>
    </section>
  );
}
