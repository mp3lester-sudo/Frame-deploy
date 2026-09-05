import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Community Guidelines — Slate",
};

const LAST_UPDATED = "September 4, 2026";

export default function CommunityGuidelinesPage() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-14">
      <h1 className="font-display text-3xl">Community Guidelines</h1>
      <p className="mt-2 text-sm text-foreground-muted">Last updated {LAST_UPDATED}</p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-foreground-muted">
        <p>
          Slate is a place to talk about movies and shows with people who care as much as you do. These
          guidelines apply everywhere you can post on Slate: reviews, comments, club posts, direct
          messages, and your profile.
        </p>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">The basics</h2>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <strong className="text-foreground">Be honest about your own taste.</strong> Reviews and
              ratings are most useful when they&apos;re genuinely yours.
            </li>
            <li>
              <strong className="text-foreground">Disagree about movies, not about people.</strong>{" "}
              Strong opinions about a film are welcome; personal attacks on other users are not.
            </li>
            <li>
              <strong className="text-foreground">Spoiler-tag when it counts.</strong> Give people a
              heads-up before revealing a twist, ending, or major plot turn in a recent release.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Not allowed</h2>
          <ul className="mt-3 flex flex-col gap-2">
            <li>Harassment, threats, hate speech, or targeted abuse of any user.</li>
            <li>Sexual content involving minors, in any form — reported immediately and permanently banned.</li>
            <li>Spam, scams, or content posted purely to promote an unrelated product or service.</li>
            <li>Impersonating another person or organization.</li>
            <li>Sharing another user&apos;s private information without their consent.</li>
            <li>Content that infringes someone else&apos;s copyright — see our DMCA policy.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Reporting something</h2>
          <p className="mt-3">
            Every review, comment, message, club post, and profile has a report option. Reports go to a
            small moderation queue and are reviewed directly — they&apos;re not handled by an automated
            filter.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Enforcement</h2>
          <p className="mt-3">
            Depending on severity, we may remove specific content, temporarily suspend an account, or
            permanently ban it. We aim to be proportionate: a first-time, borderline case is treated
            differently than a repeated or severe one.
          </p>
        </div>

        <div>
          <h2 className="font-section-heading text-lg text-foreground">Contact</h2>
          <p className="mt-3">
            Questions about these guidelines can be sent to the account holder listed on this project.
          </p>
        </div>
      </div>
    </section>
  );
}
