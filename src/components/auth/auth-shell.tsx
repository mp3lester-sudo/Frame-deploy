import type { ReactNode } from "react";
import Image from "@/components/ui/fade-image";

/**
 * Shared backdrop for login/signup/forgot-password/reset-password --
 * previously each of these was a bare centered form with no visual
 * identity at all, a jarring drop in polish next to the rest of the app
 * (the onboarding intro, the greeting splash, Wrapped). This is the same
 * "flex row of flush poster tiles + one shared gradient" technique the
 * profile banner collage uses (see profile/[username]/page.tsx), just
 * built from the catalogue's most popular titles instead of a specific
 * user's favorites, since these pages render before -- or entirely
 * without -- a session.
 */
export function AuthShell({ posters, children }: { posters: string[]; children: ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      {posters.length > 0 && (
        <div className="absolute inset-0 flex opacity-60">
          {posters.map((url, i) => (
            <div key={i} className="relative flex-1 overflow-hidden">
              <Image src={url} alt="" fill className="object-cover" sizes="20vw" />
            </div>
          ))}
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(10,9,8,0.55) 0%, rgba(10,9,8,0.88) 55%, #0a0908 100%)",
        }}
      />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center px-6 py-16">
        <p className="text-gold-foil font-hollywood mb-6 text-center text-3xl uppercase tracking-[0.08em]">
          Marquee
        </p>
        <div className="bento-card p-6">{children}</div>
      </div>
    </div>
  );
}
