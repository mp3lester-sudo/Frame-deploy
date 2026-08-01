"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TitleCard } from "@/components/title-card";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];
type Pick = { title: Title; reason: string };

// A handful of moody, specific prompts rather than genre names -- these
// exist to demonstrate the "describe the feeling, not the genre" pitch
// above the input, and to give someone a running start if they're
// staring at a blank box. Clicking one fills the input; it doesn't
// auto-submit, so there's still a chance to tweak it first.
const EXAMPLE_PROMPTS = [
  "Something that feels lonely",
  "A movie where the villain wins",
  "Turn my brain off tonight",
  "Comfort food for a bad day",
  "A twist I won't see coming",
];

export default function AskBacklotPage() {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ask(text: string) {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setUpgradeUrl(null);
    try {
      const res = await fetch("/api/ai/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(query);
  }

  function handleExampleClick(prompt: string) {
    setQuery(prompt);
    inputRef.current?.focus();
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-14 sm:py-20">
      {/* Concierge-desk header -- eyebrow label, gold-foil display
          heading, and a thin gradient hairline underneath (same "framed
          moment" treatment as the greeting splash's name), rather than
          a flat left-aligned h1 + one line of body copy. This is the
          one AI surface in the app framed as a person you're asking,
          not a search bar you're typing into. */}
      <div className="flex flex-col items-center text-center">
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent">AI Concierge</span>
        <h1 className="font-display text-gold-foil mt-2 text-4xl italic sm:text-5xl">Ask Backlot</h1>
        <div className="mt-4 h-px w-24 bg-gradient-to-r from-transparent via-accent-deep to-transparent" />
        <p className="font-section-body mt-5 max-w-md text-sm leading-relaxed text-foreground-muted sm:text-base">
          &ldquo;I want something that feels lonely.&rdquo; &ldquo;A movie where the villain wins.&rdquo;{" "}
          Describe the feeling, not the genre — your well-watched friend is listening.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-8 rounded-[var(--radius-lg)] border border-border bg-surface p-2 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.8)] transition-colors focus-within:border-accent/50"
      >
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What are you in the mood for?"
            className="h-12 border-none bg-transparent text-base focus:ring-0"
          />
          <Button type="submit" size="lg" isLoading={loading}>
            Ask
          </Button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => handleExampleClick(prompt)}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:border-accent/50 hover:text-foreground"
          >
            {prompt}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-8 rounded-[var(--radius-md)] border border-danger/40 bg-danger/10 px-4 py-3">
          <p className="text-sm text-danger">
            {error}
            {upgradeUrl && (
              <>
                {" "}
                <Link href={upgradeUrl} className="font-medium text-accent hover:underline">
                  Upgrade to Premium
                </Link>{" "}
                for unlimited conversations.
              </>
            )}
          </p>
        </div>
      )}

      {loading && (
        <div className="mt-10">
          <div className="skeleton mx-auto h-4 w-2/3 max-w-md rounded-[var(--radius-sm)]" />
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <div className="skeleton aspect-[2/3] w-full rounded-[var(--radius-md)]" />
                <div className="skeleton mt-2 h-3.5 w-4/5 rounded-[var(--radius-sm)]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && message && (
        <div className="stagger-card mt-10 rounded-[var(--radius-lg)] border border-border bg-surface-raised/60 px-6 py-5">
          <p className="font-display border-l-2 border-accent pl-4 text-base italic leading-relaxed text-foreground sm:text-lg">
            {message}
          </p>
        </div>
      )}

      {!loading && picks.length > 0 && (
        <div className="stagger-card mt-8">
          <p className="mb-4 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-foreground-muted">
            Tonight&apos;s suggestions
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
            {picks.map((p, i) => (
              <TitleCard key={p.title.id} title={p.title} reason={p.reason} index={i} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
