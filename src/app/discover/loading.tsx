// Poster-grid skeleton matching Discover's actual layout (mx-auto max-w-6xl,
// same 2/3/6-column responsive grid as the real results) so the page
// doesn't visibly jump when real posters replace these placeholders.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="skeleton mb-6 h-8 w-40 rounded-[var(--radius-sm)]" />
      <div className="mb-6 flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-8 w-20 rounded-[var(--radius-full)]" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[2/3] w-full rounded-[var(--radius-md)]" />
            <div className="skeleton mt-2 h-3.5 w-4/5 rounded-[var(--radius-sm)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
