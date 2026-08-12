// Conversation thread skeleton -- header row plus alternating message
// bubbles so the thread doesn't visibly jump once real messages load.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="skeleton h-9 w-9 rounded-full" />
        <div className="skeleton h-5 w-32 rounded-[var(--radius-sm)]" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`skeleton h-10 rounded-[var(--radius-md)] ${i % 2 === 0 ? "ml-auto w-2/3" : "w-1/2"}`}
          />
        ))}
      </div>
    </div>
  );
}
