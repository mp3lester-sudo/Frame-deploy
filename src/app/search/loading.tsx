// Tab row + input + grid, matching the real search page's mx-auto
// max-w-6xl container and 2/3/6-column results grid.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="skeleton mb-4 h-10 w-full max-w-md rounded-[var(--radius-md)]" />
      <div className="mb-6 flex gap-2">
        <div className="skeleton h-8 w-16 rounded-[var(--radius-full)]" />
        <div className="skeleton h-8 w-16 rounded-[var(--radius-full)]" />
        <div className="skeleton h-8 w-28 rounded-[var(--radius-full)]" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="skeleton aspect-[2/3] w-full rounded-[var(--radius-md)]" />
        ))}
      </div>
    </div>
  );
}
