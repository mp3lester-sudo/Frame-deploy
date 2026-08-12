// Hot Takes feed skeleton -- header plus a stack of take cards.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="skeleton h-7 w-40 rounded-[var(--radius-sm)]" />
      <div className="skeleton mt-2 h-4 w-56 rounded-[var(--radius-sm)]" />
      <div className="mt-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-28 w-full rounded-[var(--radius-md)]" />
        ))}
      </div>
    </div>
  );
}
