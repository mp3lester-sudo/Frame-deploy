import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { AvatarUpload } from "@/components/settings/avatar-upload";
import { ProfileForm } from "@/components/settings/profile-form";
import { PasswordChangeForm } from "@/components/settings/password-change-form";
import { VerifyEmailBanner } from "@/components/settings/verify-email-banner";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";
import { PushToggle } from "@/components/settings/push-toggle";
import { FavoriteTitlesEditor } from "@/components/settings/favorite-titles-editor";
import { LetterboxdImport } from "@/components/settings/letterboxd-import";
import { LetterboxdPasteImport } from "@/components/settings/letterboxd-paste-import";
import { ReferralCard } from "@/components/settings/referral-card";
import { siteOrigin } from "@/lib/seo/site";
import { signOut, signOutEverywhere } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/settings");

  const [{ data: profile }, { data: favoriteRows }, { count: referralCount }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("favorite_titles")
      .select("position, titles(id, name, release_date, poster_url)")
      .eq("user_id", user.id)
      .order("position", { ascending: true }),
    supabase.from("referrals").select("*", { count: "exact", head: true }).eq("referrer_id", user.id),
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

      {!user.email_confirmed_at && <VerifyEmailBanner />}

      <section className="mb-8">
        <AvatarUpload name={profile?.display_name ?? profile?.username ?? "you"} initialAvatarUrl={profile?.avatar_url ?? null} />
      </section>

      <section className="mb-8 rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <ProfileForm initialDisplayName={profile?.display_name ?? ""} initialBio={profile?.bio ?? ""} />
      </section>

      <section className="mb-8 rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <PasswordChangeForm />
      </section>

      <section className="mb-8 rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <PushToggle />
      </section>

      <section className="mb-8 rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <FavoriteTitlesEditor initialFavorites={favorites} />
      </section>

      <section className="mb-8 rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <LetterboxdPasteImport />
      </section>

      <section className="mb-8 rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <LetterboxdImport />
      </section>

      {profile?.referral_code && (
        <section className="mb-8 rounded-[var(--radius-md)] border border-border bg-surface p-4">
          <ReferralCard
            referralLink={`${siteOrigin()}/signup?ref=${profile.referral_code}`}
            referralCount={referralCount ?? 0}
            bonusPremiumUntil={profile.bonus_premium_until}
          />
        </section>
      )}

      <section className="flex flex-wrap gap-4 px-1 text-xs text-foreground-muted">
        <Link href="/privacy" className="hover:text-accent hover:underline">
          Privacy Policy
        </Link>
        <Link href="/terms" className="hover:text-accent hover:underline">
          Terms of Service
        </Link>
      </section>

      <form action={signOut} className="mt-8">
        <Button type="submit" variant="ghost" className="w-full text-danger hover:bg-danger/10">
          Log out
        </Button>
      </form>

      <form action={signOutEverywhere} className="mt-2">
        <Button type="submit" variant="ghost" className="w-full text-xs text-foreground-muted hover:bg-danger/10 hover:text-danger">
          Log out of all devices
        </Button>
      </form>

      <div className="mt-8 flex justify-center">
        <DeleteAccountForm />
      </div>
    </div>
  );
}
