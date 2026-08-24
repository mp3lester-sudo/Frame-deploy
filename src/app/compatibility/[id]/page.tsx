import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Shared with generateMetadata (mirrors t/[id]/page.tsx and
// wrapped/share/[id]/page.tsx).
const getShareById = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("compatibility_shares").select("*").eq("id", id).maybeSingle();
  return data;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const share = await getShareById(id);
  if (!share) return { title: "Compatibility card not found" };

  const title = `${share.viewer_name} and ${share.other_name} are ${share.percent}% compatible on Slate`;
  const description =
    share.shared_genres.length > 0
      ? `They both love ${share.shared_genres.slice(0, 3).join(", ")}. See how your taste compares.`
      : "See how your movie taste compares on Slate.";

  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Public landing spot for a shared two-person compatibility card (growth
 * audit: TasteCompatibilityCard previously only rendered in-app, for
 * someone already logged in, already looking at that exact profile or
 * Movie Night page -- no standalone shareable artifact). No auth, no
 * session -- reads a frozen snapshot from compatibility_shares
 * (public-read RLS, migration 0083). The CTA sends the recipient toward
 * signing up so *they* can generate their own compatibility card with the
 * sharer -- the natural next step, and the actual growth loop here.
 */
export default async function CompatibilitySharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const share = await getShareById(id);
  if (!share) notFound();

  return (
    <section className="mx-auto max-w-md px-4 py-10 text-center">
      <p className="font-display text-xs font-semibold uppercase tracking-wide text-accent">Slate Compatibility</p>
      <h1 className="font-display mt-2 text-2xl">
        {share.viewer_name} and {share.other_name} are{" "}
        <span className="text-accent">{share.percent}%</span> compatible
      </h1>

      <Card className="mt-8 text-left">
        {share.shared_genres.length > 0 && (
          <p className="text-sm text-foreground-muted">
            They both love: {share.shared_genres.join(", ")}
          </p>
        )}
        {share.shared_directors.length > 0 && (
          <p className="mt-2 text-sm text-foreground-muted">
            They both rank {share.shared_directors.join(", ")} among their favorite directors
          </p>
        )}
        {share.disagreement_genre && (
          <p className="mt-2 text-sm text-foreground-muted">Biggest disagreement: {share.disagreement_genre}</p>
        )}
      </Card>

      <Card className="mt-6 text-center">
        <p className="text-sm text-foreground-muted">See how your own taste compares with theirs on Slate.</p>
        <Link href="/" className="mt-3 inline-block">
          <Button>Get your compatibility score</Button>
        </Link>
      </Card>
    </section>
  );
}
