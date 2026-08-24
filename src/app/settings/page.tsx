import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getActiveMediaType } from "@/lib/context/media-type";
import { AvatarUpload } from "@/components/settings/avatar-upload";
import { ProfileForm } from "@/components/settings/profile-form";
import { PasswordChangeForm } from "@/components/settings/password-change-form";
import { VerifyEmailBanner } from "@/components/settings/verify-email-banner";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";
import { PushToggle } from "@/components/settings/push-toggle";
import { NotificationPreferences } from "@/components/settings/notification-preferences";
import { FavoriteTitlesEditor } from "@/components/settings/favorite-titles-editor";
import { LetterboxdImport } from "@/components/settings/letterboxd-import";
import { LetterboxdPasteImport } from "@/components/settings/letterboxd-paste-import";
import { LetterboxdRssImport } from "@/components/settings/letterboxd-rss-import";
import { ReferralCard } from "@/components/settings/referral-card";
import { siteOrigin } from "@/lib/seo/site";
import { LogoutButtons } from "@/components/settings/logout-buttons";
import { TasteTwinToggle } from "@/components/settings/taste-twin-toggle";

/**
 * Small uppercase label above each bento-card group -- the page is a long
 * stack of otherwise-identical panels (profile, password, notifications,
 * favorites, import, referrals), so a label is what turns "scroll through
 * a wall of forms" into "find the Notifications section and skip there."
 */
function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-[10px] uppercase tracking-wider text-accent">{children}</p>;
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/settings");

  const mediaType = await getActiveMediaType();
  const [{ data: profile }, { data: favoriteRows }, { count: referralCount }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("favorite_titles")
      .select("position, titles(id, name, release_date, poster_url)")
      .eq("user_id", user.id)
      .eq("media_type", mediaType)
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

      {/* Avatar and the display-name/bio form are logically one "who you
          are" group -- previously the avatar sat in its own unstyled
          section above a separately-bordered profile form, which visually
          split one idea into two. */}
      <section className="mb-6 bento-card p-4">
        <SectionLabel>Profile</SectionLabel>
        <AvatarUpload name={profile?.display_name ?? profile?.username ?? "you"} initialAvatarUrl={profile?.avatar_url ?? null} />
        <div className="mt-4">
          <ProfileForm initialDisplayName={profile?.display_name ?? ""} initialBio={profile?.bio ?? ""} />
        </div>
      </section>

      <section className="mb-6 bento-card p-4">
        <SectionLabel>Password</SectionLabel>
        <PasswordChangeForm />
      </section>

      <section className="mb-6 bento-card p-4">
        <SectionLabel>Notifications</SectionLabel>
        <PushToggle />
        <NotificationPreferences />
      </section>

      <section className="mb-6 bento-card p-4">
        <SectionLabel>Privacy</SectionLabel>
        <TasteTwinToggle initialOptIn={profile?.taste_twin_opt_in ?? false} />
      </section>

      <section id="favorites" className="mb-6 scroll-mt-20 bento-card p-4">
        <SectionLabel>Favorite films</SectionLabel>
        <FavoriteTitlesEditor key={mediaType} initialFavorites={favorites} mediaType={mediaType} />
      </section>

      {/* All three import paths (RSS by username, paste-HTML for free
          Letterboxd accounts, and the full export upload) are the same
          underlying action -- "bring your Letterboxd history over" -- so
          they read as one section with three methods rather than three
          separate, identically-titled panels. RSS leads since it's the
          fastest (just a username), with the other two below it as the
          full-history options. */}
      <section className="mb-6 bento-card p-4">
        <SectionLabel>Import from Letterboxd</SectionLabel>
        <LetterboxdRssImport />
        <div className="mt-4 border-t border-[var(--glass-border)] pt-4">
          <LetterboxdPasteImport />
        </div>
        <div className="mt-4 border-t border-[var(--glass-border)] pt-4">
          <LetterboxdImport />
        </div>
      </section>

      {profile?.referral_code && (
        <section className="mb-6 bento-card p-4">
          <SectionLabel>Invite friends</SectionLabel>
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
        <a href="/api/account/export" className="hover:text-accent hover:underline">
          Export my data
        </a>
      </section>

      <LogoutButtons />

      <div className="mt-8 flex justify-center">
        <DeleteAccountForm />
      </div>
    </div>
  );
}
