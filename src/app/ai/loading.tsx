// Ask Backlot concierge skeleton -- header plus the chat/input shell.
export default function Loading() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-14 sm:py-20">
      <div className="skeleton mx-auto h-4 w-24 rounded-[var(--radius-sm)]" />
      <div className="skeleton mx-auto mt-3 h-9 w-64 rounded-[var(--radius-sm)]" />
      <div className="skeleton mx-auto mt-8 h-40 w-full rounded-[var(--radius-lg)]" />
    </section>
  );
}
