// Premium/Auteur pricing skeleton -- two pricing-card placeholders side
// by side, matching the page's two-tier layout.
export default function Loading() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-14 text-center">
      <div className="skeleton mx-auto h-8 w-48 rounded-[var(--radius-sm)]" />
      <div className="skeleton mx-auto mt-3 h-4 w-72 rounded-[var(--radius-sm)]" />
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <div className="skeleton h-80 w-full rounded-[var(--radius-lg)]" />
        <div className="skeleton h-80 w-full rounded-[var(--radius-lg)]" />
      </div>
    </section>
  );
}
