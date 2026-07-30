"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "@/components/ui/fade-image";
import { decideMovieNight } from "@/lib/actions/movie-night";
import { Button } from "@/components/ui/button";
import type { MovieNightCandidate } from "@/lib/recommendations/movie-night";

export function CandidatePicker({
  movieNightId,
  candidates,
}: {
  movieNightId: string;
  candidates: MovieNightCandidate[];
}) {
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function pick(titleId: string) {
    setPickingId(titleId);
    startTransition(async () => {
      await decideMovieNight({ movieNightId, titleId });
      router.refresh();
    });
  }

  if (!candidates.length) {
    return (
      <p className="text-sm text-foreground-muted">
        No candidates yet — invite at least one person, or wait until the catalogue has more titles.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {candidates.map((c) => (
        <div key={c.title.id}>
          <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-raised">
            {c.title.poster_url && (
              <Image
                src={c.title.poster_url}
                alt={c.title.name}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 33vw, 200px"
              />
            )}
          </div>
          <p className="mt-2 line-clamp-1 text-sm font-medium">{c.title.name}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-foreground-muted">{c.note}</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2 w-full"
            disabled={isPending}
            isLoading={isPending && pickingId === c.title.id}
            onClick={() => pick(c.title.id)}
          >
            Pick this
          </Button>
        </div>
      ))}
    </div>
  );
}
