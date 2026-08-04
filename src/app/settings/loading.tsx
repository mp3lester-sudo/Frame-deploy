// Settings skeleton matching the real page's stacked-section layout.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="skeleton h-8 w-32 rounded-[var(--radius-sm)]" />
        <div className="skeleton h-4 w-24 rounded-[var(--radius-sm)]" />
      </div>
      <div className="skeleton mb-8 h-20 w-20 rounded-full" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="mb-8 rounded-[var(--radius-md)] border border-border bg-surface p-4">
          <div className="skeleton mb-2 h-3 w-28 rounded-[var(--radius-sm)]" />
          <div className="skeleton h-9 w-full rounded-[var(--radius-md)]" />
        </div>
      ))}
    </div>
  );
}
