import Link from "next/link";
import { Button } from "@/components/ui/button";

// Next.js renders this for any route that doesn't match a page, or when a
// route handler calls notFound() explicitly (e.g. a movie/person id that
// isn't in the catalogue). Before this existed, both cases fell through to
// Next's own generic black-on-white 404 -- the one moment in the whole app
// that broke the "premium editorial" feel established everywhere else.
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="font-hollywood text-gold-foil text-2xl uppercase tracking-[0.08em]">Marquee</span>
      <p className="font-display text-6xl italic text-foreground-muted">404</p>
      <h1 className="text-xl font-medium text-foreground">This page didn&apos;t make the final cut.</h1>
      <p className="max-w-sm text-sm text-foreground-muted">
        Whatever you were looking for isn&apos;t here -- it may have been moved, renamed, or never existed.
      </p>
      <Link href="/">
        <Button variant="primary">Back to Marquee</Button>
      </Link>
    </div>
  );
}
