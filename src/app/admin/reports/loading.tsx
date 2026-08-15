// Admin-only traffic (low priority relative to user-facing routes), but
// cheap to add now that every other route has one -- a bare list skeleton
// rather than anything bespoke.
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="skeleton h-7 w-40 rounded-[var(--radius-sm)]" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-20 w-full rounded-[var(--radius-lg)]" />
        ))}
      </div>
    </div>
  );
}
