// Taste DNA skeleton -- this page previously had a real bug where it
// could hang on a blank loading state (see task history); this at least
// guarantees visible, animated feedback the instant you navigate here,
// rather than a blank screen while the DNA computation runs server-side.
export default function Loading() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-14 text-center">
      <div className="skeleton mx-auto h-8 w-56 rounded-[var(--radius-sm)]" />
      <div className="skeleton mx-auto mt-3 h-4 w-72 rounded-[var(--radius-sm)]" />
      <div className="skeleton mx-auto mt-8 h-64 w-64 rounded-full" />
      <div className="mt-8 grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-20 w-full rounded-[var(--radius-md)]" />
        ))}
      </div>
    </section>
  );
}
