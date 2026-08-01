// Full-width banner block (matches the real editorial cover-photo banner's
// height) plus the three-column xl:grid-cols-[1fr_1.3fr_1fr] layout below
// it (Personal Pyramid / DNA panel / stats rail), so the heaviest page in
// the app doesn't flash blank before its data-heavy fetches resolve.
export default function Loading() {
  return (
    <div>
      <div className="skeleton h-[280px] w-full sm:h-[344px]" />
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 px-4 pt-8">
        <div className="skeleton h-6 w-40 rounded-[var(--radius-sm)]" />
        <div className="flex gap-4">
          <div className="skeleton h-4 w-16 rounded-[var(--radius-sm)]" />
          <div className="skeleton h-4 w-16 rounded-[var(--radius-sm)]" />
          <div className="skeleton h-4 w-16 rounded-[var(--radius-sm)]" />
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr_1fr] xl:items-start">
          <div className="skeleton h-72 w-full rounded-[var(--radius-lg)]" />
          <div className="skeleton h-96 w-full rounded-[var(--radius-lg)]" />
          <div className="skeleton h-72 w-full rounded-[var(--radius-lg)]" />
        </div>
      </div>
    </div>
  );
}
