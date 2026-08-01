// Backdrop + detail skeleton for the movie page -- the backdrop block
// mimics BackdropHero's full-bleed image so the hero doesn't pop into
// existence after a blank gap, and the content block below approximates
// the poster + title/meta/synopsis layout underneath it.
export default function Loading() {
  return (
    <div>
      <div className="skeleton h-[45vh] w-full sm:h-[55vh]" />
      <div className="relative mx-auto -mt-20 max-w-4xl px-4 pb-8 sm:-mt-28">
        <div className="flex gap-5">
          <div className="skeleton aspect-[2/3] w-32 shrink-0 rounded-[var(--radius-md)] sm:w-44" />
          <div className="mt-auto flex-1 space-y-2">
            <div className="skeleton h-8 w-3/4 rounded-[var(--radius-sm)]" />
            <div className="skeleton h-4 w-1/3 rounded-[var(--radius-sm)]" />
          </div>
        </div>
        <div className="mt-8 space-y-2">
          <div className="skeleton h-4 w-full rounded-[var(--radius-sm)]" />
          <div className="skeleton h-4 w-full rounded-[var(--radius-sm)]" />
          <div className="skeleton h-4 w-2/3 rounded-[var(--radius-sm)]" />
        </div>
        <div className="mt-8 grid grid-cols-3 gap-4 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i}>
              <div className="skeleton aspect-square w-full rounded-full" />
              <div className="skeleton mx-auto mt-2 h-3 w-4/5 rounded-[var(--radius-sm)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
