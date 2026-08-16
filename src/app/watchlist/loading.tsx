// Watchlist skeleton -- header plus a poster grid, matching the real
// page's TitleCard grid closely enough that there's no layout jump once
// data streams in. Was missing entirely (see perf audit), so this route
// showed a blank flash on every nav instead of instant feedback like
// every other data page already gets.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="skeleton h-7 w-32 rounded-[var(--radius-sm)]" />
      <div className="skeleton mt-2 h-4 w-72 rounded-[var(--radius-sm)]" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="skeleton aspect-[2/3] w-full rounded-[var(--radius-md)]" />
        ))}
      </div>
    </div>
  );
}
