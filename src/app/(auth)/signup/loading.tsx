// Matches AuthShell's centered card frame (without the poster backdrop,
// which needs the resolved posters array) while getAuthBackdropPosters +
// the page's own render resolve.
export default function Loading() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div className="relative mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center px-6 py-16">
        <div className="skeleton mx-auto mb-6 h-8 w-32 rounded-[var(--radius-sm)]" />
        <div className="bento-card space-y-3 p-6">
          <div className="skeleton h-10 w-full rounded-[var(--radius-md)]" />
          <div className="skeleton h-10 w-full rounded-[var(--radius-md)]" />
          <div className="skeleton h-10 w-full rounded-[var(--radius-md)]" />
        </div>
      </div>
    </div>
  );
}
