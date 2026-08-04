// Stat-card skeleton matching Wrapped's mx-auto max-w-2xl column.
export default function Loading() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <div className="skeleton mx-auto h-8 w-48 rounded-[var(--radius-sm)]" />
      <div className="skeleton mx-auto mt-3 h-4 w-64 rounded-[var(--radius-sm)]" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-28 w-full rounded-[var(--radius-lg)]" />
        ))}
      </div>
    </section>
  );
}
