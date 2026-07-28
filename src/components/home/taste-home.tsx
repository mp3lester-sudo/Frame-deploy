"use client";

import { useEffect, useState } from "react";
import {
  demoContext,
  quickFilters,
  heroRecommendation,
  moodRow,
  movieNight,
  circleFeed,
  type QuickFilter,
} from "@/lib/demo/home-demo-data";
import { ContextCards } from "@/components/home/context-cards";
import { TasteSearchBar } from "@/components/home/taste-search-bar";
import { QuickFilters } from "@/components/home/quick-filters";
import { SectionDivider } from "@/components/home/section-divider";
import { HeroRecommendation } from "@/components/home/hero-recommendation";
import { MoodRow } from "@/components/home/mood-row";
import { MovieNightCard } from "@/components/home/movie-night-card";
import { CircleFeed } from "@/components/home/circle-feed";

const DEFAULT_FILTER: QuickFilter = "2 hours";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Demo-data-driven home experience — see src/lib/demo/home-demo-data.ts for
 * why this isn't wired to the real recommendation engine yet.
 */
export function TasteHome({ ratedCount, username }: { ratedCount: number; username: string }) {
  const now = useClock();
  const [query, setQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<QuickFilter>(DEFAULT_FILTER);

  const day = now.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
  const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";

  function resetDemo() {
    setQuery("");
    setSelectedFilter(DEFAULT_FILTER);
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between text-xs">
        <span className="text-foreground-muted">{time}</span>
        <span className="font-display tracking-[0.2em] text-accent">FRAME</span>
        <button
          type="button"
          onClick={resetDemo}
          className="text-foreground-muted hover:text-foreground"
        >
          Reset demo
        </button>
      </div>

      <ContextCards day={day} time={time} location={demoContext.location} weather={demoContext.weather} />

      <h1 className="font-display mt-6 text-3xl">{greeting}</h1>
      <p className="font-display mt-2 italic text-foreground-muted">
        {ratedCount} titles rated in Taste Training — tonight&apos;s picks are already tuned to that.
      </p>

      <div className="mt-5">
        <TasteSearchBar value={query} onChange={setQuery} onSubmit={() => {}} />
      </div>

      <div className="mt-4">
        <QuickFilters filters={quickFilters} selected={selectedFilter} onSelect={setSelectedFilter} />
      </div>

      <SectionDivider />

      <h2 className="font-display mb-3 text-xl">Recommended tonight</h2>
      <HeroRecommendation rec={heroRecommendation} />

      <div className="mt-6">
        <MoodRow items={moodRow} />
      </div>

      <SectionDivider />

      <MovieNightCard data={movieNight} />

      <SectionDivider />

      <CircleFeed items={circleFeed} />

      <p className="mt-8 text-center text-[11px] text-foreground-muted">
        Logged in as {username} &middot; full personalization arrives once your Taste Graph has enough ratings
      </p>
    </div>
  );
}
