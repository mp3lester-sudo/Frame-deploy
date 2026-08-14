// App Router's built-in Suspense boundary for page navigation. Before this
// existed, clicking anywhere (most noticeably the "Marquee" wordmark back to
// "/", the heaviest page in the app — recs, weather, movie night, social
// feed all in one) left the browser sitting on the *previous* page with zero
// feedback until every server-side await finished. Next.js swaps this in
// immediately on navigation and streams the real page in once it's ready, so
// the click itself feels instant even though the underlying data fetches
// haven't gotten any faster.
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <span className="font-hollywood text-gold-foil animate-pulse text-2xl uppercase tracking-[0.08em]">
        Marquee
      </span>
      <div className="h-1 w-24 overflow-hidden rounded-full bg-surface">
        <div className="h-full w-full animate-pulse rounded-full bg-accent" />
      </div>
    </div>
  );
}
