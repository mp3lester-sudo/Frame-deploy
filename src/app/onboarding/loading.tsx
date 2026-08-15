// Swipe-deck skeleton -- a single centered card placeholder roughly
// matching OnboardingSwipe's card frame, shown while buildDiverseDeck +
// the director-credits lookup resolve.
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-10">
      <div className="skeleton h-5 w-40 rounded-[var(--radius-sm)]" />
      <div className="skeleton mt-3 h-3 w-56 rounded-[var(--radius-sm)]" />
      <div className="skeleton mt-8 aspect-[2/3] w-full rounded-[var(--radius-lg)]" />
    </div>
  );
}
