// Daily trivia skeleton -- title/subtitle plus the card itself.
export default function Loading() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <div className="skeleton h-8 w-28 rounded-[var(--radius-sm)]" />
      <div className="skeleton mt-2 h-4 w-64 rounded-[var(--radius-sm)]" />
      <div className="skeleton mt-6 h-56 w-full rounded-[var(--radius-lg)]" />
    </section>
  );
}
