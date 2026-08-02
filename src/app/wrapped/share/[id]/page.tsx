import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WrappedRecap } from "@/components/wrapped/wrapped-recap";
import { Button } from "@/components/ui/button";
import type { WrappedResult } from "@/lib/taste-dna/wrapped";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: share } = await supabase
    .from("wrapped_shares")
    .select("year, profiles(username, display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!share) return { title: "Wrapped not found" };

  const owner = (share as unknown as { profiles: { username: string; display_name: string | null } | null }).profiles;
  const ownerName = owner?.display_name ?? owner?.username ?? "A Backlot user";
  const title = `${ownerName}'s ${share.year} Wrapped`;
  const description = `See ${ownerName}'s year in movies and TV, powered by Backlot's Taste Graph.`;

  return {
    title,
    description,
    // opengraph-image.tsx in this route already renders a per-share image
    // dynamically, so this only needs to supply the surrounding title/
    // description -- Next.js wires the file-convention image in automatically.
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Public, no-auth share page — reads a frozen snapshot from wrapped_shares
 * (public-read RLS, see migration 0028), not a live recompute. Anyone with
 * the link can view this, including someone with no Backlot account.
 */
export default async function WrappedSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: share } = await supabase
    .from("wrapped_shares")
    .select("year, stats, profiles(username, display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!share) notFound();

  const owner = (share as unknown as { profiles: { username: string; display_name: string | null } | null }).profiles;
  const ownerName = owner?.display_name ?? owner?.username ?? "A Backlot user";
  const result = share.stats as unknown as WrappedResult;

  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <WrappedRecap result={result} headline={`${ownerName}'s ${share.year} Wrapped`} />

      <div className="mt-10 rounded-[var(--radius-md)] border border-border bg-surface p-4 text-center">
        <p className="text-sm text-foreground-muted">Want your own Taste Graph-powered recap?</p>
        <Link href="/signup" className="mt-3 inline-block">
          <Button>Create your own Wrapped</Button>
        </Link>
      </div>
    </section>
  );
}
