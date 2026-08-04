// Post-card list skeleton, matching the feed's mx-auto max-w-2xl column.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl pb-12">
      <div className="skeleton h-32 w-full" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="border-b border-border px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
            <div className="space-y-1.5">
              <div className="skeleton h-3.5 w-24 rounded-[var(--radius-sm)]" />
              <div className="skeleton h-3 w-16 rounded-[var(--radius-sm)]" />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="skeleton h-3.5 w-full rounded-[var(--radius-sm)]" />
            <div className="skeleton h-3.5 w-2/3 rounded-[var(--radius-sm)]" />
          </div>
          <div className="skeleton mt-3 h-48 w-full rounded-[var(--radius-md)]" />
        </div>
      ))}
    </div>
  );
}
