import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/verified-user";

// Placeholder shell only, per request -- Daily Trivia, Director of the Day
// (moving here from the home page), and a randomized daily news story all
// land in later passes. This just establishes the page and its nav entry.
export default async function DailyPage() {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/daily");

  return (
    <section className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-section-heading text-3xl">Daily</h1>
      <p className="font-section-body mt-3 text-sm text-foreground-muted">
        Trivia, Director of the Day, and a daily story land here soon.
      </p>
    </section>
  );
}
