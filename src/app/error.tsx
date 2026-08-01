"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Route-segment error boundary -- catches render/data-fetch errors thrown
// anywhere below the root layout (a page's server component throwing, a
// client component's render throwing, etc.) and swaps in this instead of
// Next's default "Application error: a client-side exception has occurred"
// page, which had zero styling and no way back into the app. Does NOT
// catch errors in the root layout itself -- see global-error.tsx for that.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side errors are already logged where they're thrown; this
    // covers client-side render errors, which otherwise vanish once React
    // unmounts the broken tree.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="font-hollywood text-gold-foil text-2xl uppercase tracking-[0.08em]">Backlot</span>
      <h1 className="text-xl font-medium text-foreground">Something cut the scene short.</h1>
      <p className="max-w-sm text-sm text-foreground-muted">
        An unexpected error interrupted this page. Try again, or head back home.
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => reset()}>
          Try again
        </Button>
        <Link href="/">
          <Button variant="secondary">Back to Backlot</Button>
        </Link>
      </div>
      {error.digest && <p className="text-[11px] text-foreground-muted">Error ref: {error.digest}</p>}
    </div>
  );
}
