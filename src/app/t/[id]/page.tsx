import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "@/components/ui/fade-image";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { TeaserPick } from "@/lib/actions/landing-teaser";

// Shared with generateMetadata (mirrors wrapped/share/[id]/page.tsx).
const getShareById = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("teaser_shares").select("picks").eq("id", id).maybeSingle();
  return data;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const share = await getShareById(id);
  if (!share) return { title: "Taste teaser not found" };

  const picks = share.picks as unknown as TeaserPick[];
  const title = "A friend&apos;s Slate taste teaser picks";
  const description =
    picks.length > 0
      ? `Slate picked ${picks.map((p) => p.name).join(", ")} for them off a 20-second taste test. See what it picks for you.`
      : "Take Slate's 20-second taste test and see what it picks for you.";

  return {
    title,
    description,
    // opengraph-image.tsx in this route renders a per-share image
    // dynamically from the same picks.
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Public landing spot for a shared pre-signup taste-teaser result (growth
 * audit: the teaser results screen previously had no share affordance at
 * all, despite being the highest-intent unauthenticated moment in the
 * app). No auth, no session -- reads a frozen snapshot from teaser_shares
 * (public-read RLS, migration 0082), same shape as Wrapped's public share
 * page. The CTA below sends the recipient into their own version of the
 * exact same flow (the landing page's live teaser), not a replay of the
 * sender's swipes -- a compatibility score is personal to the swiper, not
 * portable.
 */
export default async function TeaserSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const share = await getShareById(id);
  if (!share) notFound();

  const picks = share.picks as unknown as TeaserPick[];

  return (
    <section className="mx-auto max-w-md px-4 py-10 text-center">
      <p className="font-display text-xs font-semibold uppercase tracking-wide text-accent">
        A friend&apos;s Slate taste teaser
      </p>
      <h1 className="font-display mt-2 text-2xl">Here&apos;s what Slate picked for them</h1>

      {picks.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          {picks.map((p) => (
            <div key={p.id}>
              <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-md)] bg-surface-raised">
                {p.posterUrl && <Image src={p.posterUrl} alt={p.name} fill className="object-cover" />}
              </div>
              <p className="mt-2 line-clamp-2 text-xs font-medium">{p.name}</p>
            </div>
          ))}
        </div>
      )}

      <Card className="mt-10 text-center">
        <p className="text-sm text-foreground-muted">Curious what Slate would pick for you? Takes about 20 seconds.</p>
        <Link href="/" className="mt-3 inline-block">
          <Button>Take the taste test</Button>
        </Link>
      </Card>
    </section>
  );
}
