// Club detail skeleton -- header block (name/description) plus a member/
// post list, matching the page's max-w-2xl column so nothing reflows.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-7 w-2/3 rounded-[var(--radius-sm)]" />
          <div className="skeleton h-4 w-1/3 rounded-[var(--radius-sm)]" />
        </div>
        <div className="skeleton h-9 w-24 rounded-[var(--radius-md)]" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-20 w-full rounded-[var(--radius-md)]" />
        ))}
      </div>
    </div>
  );
}
