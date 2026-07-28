"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteToMovieNight } from "@/lib/actions/movie-night";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function InviteForm({ movieNightId }: { movieNightId: string }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await inviteToMovieNight({ movieNightId, username });
        setUsername("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not invite that person");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex gap-2">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Invite by username"
          disabled={isPending}
        />
        <Button type="submit" variant="secondary" isLoading={isPending}>
          Invite
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </form>
  );
}
