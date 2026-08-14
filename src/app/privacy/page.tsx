import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Marquee",
};

const LAST_UPDATED = "August 2, 2026";

export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-14">
      <h1 className="font-display text-3xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-foreground-muted">Last updated {LAST_UPDATED}</p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-foreground-muted">
        <p>
          This policy explains what information Marquee collects, how it&apos;s used, and the choices
          you have about it. It applies to the Marquee website and app (&ldquo;Marquee,&rdquo;
          &ldquo;we,&rdquo; &ldquo;us&rdquo;).
        </p>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Information we collect</h2>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <strong className="text-foreground">Account information:</strong> username, email address,
              and password (stored as a salted hash, never in plain text).
            </li>
            <li>
              <strong className="text-foreground">Activity you generate:</strong> ratings, reviews,
              watchlists, lists, comments, reactions, messages, club memberships, and Movie Night votes.
            </li>
            <li>
              <strong className="text-foreground">Profile details you choose to add:</strong> display
              name, bio, avatar, and favorite titles.
            </li>
            <li>
              <strong className="text-foreground">Usage data:</strong> pages viewed, features used, and
              approximate location/time-of-day signals used to personalize recommendations (e.g.
              weather- or time-aware picks).
            </li>
            <li>
              <strong className="text-foreground">Payment information:</strong> if you subscribe to
              Marquee Premium, payment is processed by Stripe. Marquee does not store your card number —
              only the subscription status Stripe reports back to us.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">How we use it</h2>
          <p className="mt-3">
            Primarily to run the recommendation engine (your Taste DNA, home page picks, Movie Night
            matching, Wrapped), to operate social features (feed, clubs, messages) you choose to use,
            and to maintain the security and reliability of the service. We also use aggregated,
            de-identified usage data to understand which features are actually useful and improve them.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Third parties</h2>
          <p className="mt-3">
            We rely on a small number of infrastructure providers to run Marquee: Supabase (database and
            authentication), Vercel (hosting), Stripe (payment processing), OpenAI (AI-generated
            recommendations and tagging), and The Movie Database / TMDB (movie and show catalogue data).
            Each only receives the data necessary to perform its function. We do not sell your personal
            information to advertisers or data brokers.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Your choices</h2>
          <p className="mt-3">
            You can edit or delete your profile information, ratings, reviews, and lists at any time from
            your account. To request full account deletion or a copy of your data, contact us at the
            address below and we&apos;ll process the request within a reasonable time.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Children&apos;s privacy</h2>
          <p className="mt-3">
            Marquee is not directed at children under 13, and we do not knowingly collect information
            from them.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Changes to this policy</h2>
          <p className="mt-3">
            If this policy changes materially, we&apos;ll update the date above and, where appropriate,
            let you know in the app.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Contact</h2>
          <p className="mt-3">
            Questions about this policy or your data can be sent to the account holder listed on this
            project.
          </p>
        </div>

        <p className="border-t border-border pt-6 text-xs text-foreground-muted">
          This document is a general-purpose template and has not been reviewed by a lawyer. Before
          relying on it for a real, public launch — especially one processing payments — have it reviewed
          by counsel familiar with your jurisdiction&apos;s privacy laws (e.g. GDPR, CCPA).
        </p>
      </div>
    </section>
  );
}
