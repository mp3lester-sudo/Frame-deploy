// Movie Night session skeleton -- back link, header, and the candidate
// card stack live voting renders once data resolves.
export default function Loading() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <div className="skeleton h-3 w-28 rounded-[var(--radius-sm)]" />
      <div className="skeleton mt-4 h-7 w-1/2 rounded-[var(--radius-sm)]" />
      <div className="skeleton mt-2 h-4 w-1/3 rounded-[var(--radius-sm)]" />
      <div className="skeleton mt-6 aspect-[3/4] w-full max-w-sm rounded-[var(--radius-lg)]" />
    </section>
  );
}
