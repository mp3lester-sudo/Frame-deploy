import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AvatarUpload } from "@/components/settings/avatar-upload";
import { ProfileForm } from "@/components/settings/profile-form";
import { FavoriteTitlesEditor } from "@/components/settings/favorite-titles-editor";
import { LetterboxdImport } from "@/components/settings/letterboxd-import";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const [{ data: profile }, { data: favoriteRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("favorite_titles")
      .select("position, titles(id, name, release_date, poster_url)")
      .eq("user_id", user.id)
      .order("position", { ascending: true }),
  ]);

  const favorites = (favoriteRows ?? [])
    .map((r) => (r as unknown as { titles: { id: string; name: string; release_date: string | null; poster_url: string | null } | null }).titles)
    .filter((t): t is { id: string; name: string; release_date: string | null; poster_url: string | null } => !!t);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl">Edit profile</h1>
        <Link href="/profile/me" className="text-xs uppercase tracking-wider text-foreground-muted hover:text-accent">
          Back to profile &rarr;
        </Link>
      </div>

      <section className="mb-8">
        <AvatarUpload name={profile?.display_name ?? profile?.username ?? "you"} initialAvatarUrl={profile?.avatar_url ?? null} />
      </section>

      <section className="mb-8 rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <ProfileForm initialDisplayName={profile?.display_name ?? ""} initialBio={profile?.bio ?? ""} />
      </section>

      <section className="mb-8 rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <FavoriteTitlesEditor initialFavorites={favorites} />
      </section>

      <section className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <LetterboxdImport />
      </section>
    </div>
  );
}
