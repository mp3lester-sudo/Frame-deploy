import { createClient } from "@/lib/supabase/server";
import { TasteHome } from "@/components/home/taste-home";
import { demoContext } from "@/lib/demo/home-demo-data";
import Link from "next/link";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center">
        <h1 className="font-display text-4xl sm:text-5xl">
          Never ask &ldquo;what should I watch&rdquo; again.
        </h1>
        <p className="max-w-xl text-lg text-foreground-muted">
          Frame learns your taste — pacing, tone, favorite directors, the things you can&apos;t stand —
          and turns it into three recommendations, not five hundred.
        </p>
        <Link
          href="/signup"
          className="inline-flex h-12 items-center rounded-[var(--radius-md)] bg-accent px-6 font-medium text-accent-foreground hover:brightness-110"
        >
          Get started
        </Link>
      </section>
    );
  }

  const [{ data: profile }, { count: ratedCount }] = await Promise.all([
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
    supabase.from("ratings").select("*", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  return (
    <TasteHome
      username={profile?.username ?? "you"}
      ratedCount={ratedCount ?? demoContext.ratingsCount}
    />
  );
}
