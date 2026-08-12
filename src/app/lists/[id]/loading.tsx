// List detail skeleton -- header plus the same poster grid shape Discover
// uses, since a list is fundamentally a curated title grid too.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-7 w-1/2 rounded-[var(--radius-sm)]" />
          <div className="skeleton h-4 w-1/3 rounded-[var(--radius-sm)]" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="skeleton aspect-[2/3] w-full rounded-[var(--radius-md)]" />
        ))}
      </div>
    </div>
  );
}
