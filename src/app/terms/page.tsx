import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Marquee",
};

const LAST_UPDATED = "August 2, 2026";

export default function TermsPage() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-14">
      <h1 className="font-display text-3xl">Terms of Service</h1>
      <p className="mt-2 text-sm text-foreground-muted">Last updated {LAST_UPDATED}</p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-foreground-muted">
        <p>
          These terms govern your use of Marquee (&ldquo;we,&rdquo; &ldquo;us&rdquo;). By creating an
          account or using the app, you agree to them.
        </p>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Your account</h2>
          <p className="mt-3">
            You&apos;re responsible for the activity on your account and for keeping your password
            secure. You must be at least 13 years old to use Marquee. You can delete your account at any
            time from Settings, or by contacting us.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Your content</h2>
          <p className="mt-3">
            Reviews, comments, lists, and anything else you post remain yours. By posting it, you give
            Marquee a license to display it back to you and other users as part of the ordinary
            operation of the app (e.g. showing your review on a movie page, or your list to people you
            share it with). You&apos;re responsible for what you post — don&apos;t post anything illegal,
            harassing, or that infringes someone else&apos;s rights.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Acceptable use</h2>
          <p className="mt-3">
            Don&apos;t use Marquee to harass other users, impersonate someone else, scrape or bulk-export
            the catalogue or other users&apos; data, attempt to break the recommendation or matching
            systems, or interfere with the service&apos;s normal operation. We may suspend or remove
            accounts that violate this.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Marquee Premium</h2>
          <p className="mt-3">
            Premium is a paid monthly subscription billed through Stripe. It renews automatically until
            you cancel; canceling stops future renewals but doesn&apos;t refund the current billing
            period unless required by law. Prices may change with advance notice.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Content and recommendations</h2>
          <p className="mt-3">
            Movie/show metadata comes from The Movie Database (TMDB) and other third-party sources and
            may occasionally be incomplete or inaccurate. Recommendations, taste scores, and match
            percentages are generated automatically and are for entertainment purposes — they&apos;re
            not a guarantee you&apos;ll enjoy any particular title.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Disclaimer and liability</h2>
          <p className="mt-3">
            Marquee is provided &ldquo;as is,&rdquo; without warranties of any kind. To the extent
            permitted by law, we&apos;re not liable for indirect or consequential damages arising from
            your use of the app.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Changes</h2>
          <p className="mt-3">
            We may update these terms as the app changes. Continuing to use Marquee after an update means
            you accept the revised terms.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Contact</h2>
          <p className="mt-3">Questions about these terms can be sent to the account holder listed on this project.</p>
        </div>

        <p className="border-t border-border pt-6 text-xs text-foreground-muted">
          This document is a general-purpose template and has not been reviewed by a lawyer. Before
          relying on it for a real, public launch — especially one processing payments — have it reviewed
          by counsel familiar with your jurisdiction&apos;s consumer protection and subscription laws.
        </p>
      </div>
    </section>
  );
}
