import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DMCA / Copyright Policy — Slate",
};

const LAST_UPDATED = "September 4, 2026";

export default function DmcaPage() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-14">
      <h1 className="font-display text-3xl">DMCA / Copyright Policy</h1>
      <p className="mt-2 text-sm text-foreground-muted">Last updated {LAST_UPDATED}</p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-foreground-muted">
        <p>
          Slate respects the intellectual property rights of others and expects users to do the same.
          Movie and show metadata, posters, and artwork displayed on Slate are sourced from The Movie
          Database (TMDB) and OMDB under their respective terms. This policy covers user-generated
          content posted on Slate — reviews, comments, club posts, messages, list descriptions, custom
          posters/backdrops, and profile content.
        </p>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Filing a takedown notice</h2>
          <p className="mt-3">
            If you believe content on Slate infringes your copyright, send a notice to the contact
            address below including: (1) a description of the copyrighted work you claim has been
            infringed; (2) the specific URL or location of the material on Slate; (3) your contact
            information (name, address, phone, email); (4) a statement that you have a good-faith
            belief the use is not authorized by the copyright owner, its agent, or the law; (5) a
            statement, under penalty of perjury, that the information in the notice is accurate and
            that you are the copyright owner or authorized to act on their behalf; and (6) your
            physical or electronic signature.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">What happens next</h2>
          <p className="mt-3">
            Upon receiving a valid notice, we will remove or disable access to the identified content
            and notify the user who posted it. That user may submit a counter-notice if they believe
            the content was removed in error; if they do, we will forward it to you and may restore the
            content after a reasonable waiting period unless you notify us that you&apos;ve filed a
            court action.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Repeat infringers</h2>
          <p className="mt-3">
            Accounts that are the subject of repeated, valid takedown notices may be suspended or
            permanently banned.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Contact</h2>
          <p className="mt-3">
            Send copyright notices and counter-notices to the account holder listed on this project.
          </p>
        </div>

        <p className="border-t border-border pt-6 text-xs text-foreground-muted">
          This document is a general-purpose template and has not been reviewed by a lawyer. Before
          relying on it for a real, public launch, have it reviewed by counsel — in particular to
          confirm the designated-agent registration steps required to claim DMCA safe-harbor protection
          in the U.S.
        </p>
      </div>
    </section>
  );
}
