// Your Lists skeleton -- header row plus a stack of list cards.
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div className="skeleton h-7 w-32 rounded-[var(--radius-sm)]" />
        <div className="skeleton h-9 w-28 rounded-[var(--radius-md)]" />
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-16 w-full rounded-[var(--radius-md)]" />
        ))}
      </div>
    </div>
  );
}
