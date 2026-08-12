// Watched page skeleton -- back link plus the same poster-grid shape the
// real Watched grid uses.
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="skeleton h-4 w-28 rounded-[var(--radius-sm)]" />
      <div className="skeleton mt-4 h-7 w-40 rounded-[var(--radius-sm)]" />
      <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="skeleton aspect-[2/3] w-full rounded-[var(--radius-md)]" />
        ))}
      </div>
    </div>
  );
}
