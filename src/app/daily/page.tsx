import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getDirectorOfTheDay } from "@/lib/director-of-day/fetch";
import { DirectorOfTheDay } from "@/components/home/director-of-the-day";

// Trivia and a randomized daily news story land in later passes -- for now
// this hosts Director of the Day, moved here from the home page (see
// src/app/page.tsx, replaced there by Hidden Gem).
export default async function DailyPage() {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/daily");

  const directorOfTheDay = await getDirectorOfTheDay(user.id);

  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-section-heading text-3xl">Daily</h1>
      <p className="font-section-body mt-2 text-sm text-foreground-muted">
        Trivia and a daily story land here soon.
      </p>

      <div className="mt-8">
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
