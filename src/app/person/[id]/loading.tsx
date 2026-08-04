// Mirrors the real person page: portrait + name/bio at the top (max-w-4xl,
// same as page.tsx), then the iconic-roles/filmography grid below at the
// same 3/4/5-column breakpoints so the skeleton grid and real grid line up.
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex gap-6">
        <div className="skeleton h-40 w-40 shrink-0 rounded-[var(--radius-md)]" />
        <div className="flex-1 space-y-3 pt-2">
          <div className="skeleton h-8 w-2/3 rounded-[var(--radius-sm)]" />
          <div className="skeleton h-4 w-1/3 rounded-[var(--radius-sm)]" />
          <div className="space-y-2 pt-2">
            <div className="skeleton h-3.5 w-full rounded-[var(--radius-sm)]" />
            <div className="skeleton h-3.5 w-full rounded-[var(--radius-sm)]" />
            <div className="skeleton h-3.5 w-1/2 rounded-[var(--radius-sm)]" />
          </div>
        </div>
      </div>
      <div className="skeleton mt-10 mb-4 h-5 w-40 rounded-[var(--radius-sm)]" />
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="skeleton aspect-[2/3] w-full rounded-[var(--radius-md)]" />
        ))}
      </div>
    </div>
  );
}
