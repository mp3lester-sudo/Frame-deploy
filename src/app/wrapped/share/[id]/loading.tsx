// Public Wrapped share-page skeleton -- full-bleed card shape matching
// WrappedRecap so the shared link doesn't flash blank for first-time
// visitors (often coming from an external link, with a cold cache).
export default function Loading() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <div className="skeleton aspect-[3/4] w-full rounded-[var(--radius-lg)]" />
    </section>
  );
}
