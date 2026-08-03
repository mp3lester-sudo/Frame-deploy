// Notifications list skeleton matching the real page's row layout.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="skeleton h-8 w-40 rounded-[var(--radius-sm)]" />
        <div className="skeleton h-6 w-24 rounded-[var(--radius-sm)]" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border p-3">
            <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
            <div className="skeleton h-3.5 w-2/3 rounded-[var(--radius-sm)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
