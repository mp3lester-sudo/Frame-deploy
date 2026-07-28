export function SectionDivider() {
  return (
    <div className="my-8 flex items-center gap-4" aria-hidden="true">
      <div className="h-px flex-1 bg-border" />
      <span className="text-accent text-xs">&#9670;</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
