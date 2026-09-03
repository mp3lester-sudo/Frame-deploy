// Mirrors the real person page: a full-bleed hero skeleton (matching
// PersonHero's -mt-14 h-[380px] sm:h-[520px] box) followed by the
// bio/iconic-roles/filmography grid below at the same 3/4/5-column
// breakpoints so the skeleton grid and real grid line up.
export default function Loading() {
  return (
    <div>
      <div className="skeleton -mt-14 h-[380px] w-full sm:h-[520px]" />
      <div className="mx-auto max-w-4xl px-4 pb-8 pt-6">
        <div className="space-y-2">
          <div className="skeleton h-3.5 w-full rounded-[var(--radius-sm)]" />
          <div className="skeleton h-3.5 w-full rounded-[var(--radius-sm)]" />
          <div className="skeleton h-3.5 w-1/2 rounded-[var(--radius-sm)]" />
        </div>
        <div className="skeleton mt-10 mb-4 h-5 w-40 rounded-[var(--radius-sm)]" />
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3] w-full rounded-[var(--radius-md)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
