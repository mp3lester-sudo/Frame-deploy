"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TitleCard } from "@/components/title-card";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];
type Pick = { title: Title; reason: string };

export default function AskBacklotPage() {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setUpgradeUrl(null);
    try {
      const res = await fetch("/api/ai/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUpgradeUrl(data.upgradeUrl ?? null);
        throw new Error(data.error ?? "Something went wrong");
      }
      setMessage(data.message);
      setPicks(data.recommendations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display mb-1 text-2xl">Ask Backlot</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        &ldquo;I want something that feels lonely.&rdquo; &ldquo;A movie where the villain wins.&rdquo;
        Describe the feeling, not the genre.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What are you in the mood for?"
        />
        <Button type="submit" isLoading={loading}>
          Ask
        </Button>
      </form>

      {error && (
        <p className="mt-4 text-sm text-danger">
          {error}
          {upgradeUrl && (
            <>
              {" "}
              <Link href={upgradeUrl} className="text-accent hover:underline">
                Upgrade to Premium
              </Link>{" "}
              for unlimited conversations.
            </>
          )}
        </p>
      )}
      {message && <p className="mt-6 text-sm text-foreground-muted">{message}</p>}

      {picks.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          {picks.map((p) => (
            <TitleCard key={p.title.id} title={p.title} reason={p.reason} />
          ))}
        </div>
      )}
    </section>
  );
}
