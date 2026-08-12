// Invite-link landing skeleton -- centered card, same shape whether the
// invite resolves to a valid session or the not-found state.
export default function Loading() {
  return (
    <section className="mx-auto max-w-sm px-4 py-16 text-center">
      <div className="skeleton mx-auto h-6 w-40 rounded-[var(--radius-sm)]" />
      <div className="skeleton mx-auto mt-3 h-4 w-56 rounded-[var(--radius-sm)]" />
      <div className="skeleton mx-auto mt-6 h-11 w-32 rounded-[var(--radius-md)]" />
    </section>
  );
}
