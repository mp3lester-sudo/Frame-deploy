// Movie Night list skeleton matching the real page's row-card layout.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="skeleton h-8 w-36 rounded-[var(--radius-sm)]" />
        <div className="skeleton h-9 w-28 rounded-[var(--radius-md)]" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[var(--radius-md)] border border-border p-4">
            <div className="skeleton mb-2 h-4 w-1/2 rounded-[var(--radius-sm)]" />
            <div className="skeleton h-3 w-1/3 rounded-[var(--radius-sm)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
