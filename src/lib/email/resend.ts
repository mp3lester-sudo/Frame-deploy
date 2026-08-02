import { Resend } from "resend";

/**
 * Lazily-constructed Resend client, mirroring the posthog-server.ts
 * pattern: no-ops (rather than throwing) when RESEND_API_KEY isn't set,
 * so local dev and preview deploys without the key configured don't
 * break signup/other flows that send email as a side effect.
 */
let client: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) {
    client = new Resend(key);
  }
  return client;
}

// Verified sending domain/address goes here once the user has one set up
// in Resend. Falls back to Resend's shared onboarding address, which only
// delivers to the Resend account owner's own inbox -- fine for verifying
// the integration works, but a real "from" domain is needed before this
// can email arbitrary users.
const FROM = process.env.RESEND_FROM_EMAIL ?? "Backlot <onboarding@resend.dev>";

export async function sendWelcomeEmail(to: string, username: string) {
  const resend = getClient();
  if (!resend) return { sent: false as const, reason: "no RESEND_API_KEY configured" };

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Welcome to Backlot",
    html: welcomeEmailHtml(username),
  });

  if (error) return { sent: false as const, reason: error.message };
  return { sent: true as const };
}

function welcomeEmailHtml(username: string): string {
  return `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1512; background: #faf7f2;">
      <h1 style="font-size: 22px; letter-spacing: 0.02em; margin-bottom: 4px;">Welcome to Backlot, ${escapeHtml(username)}.</h1>
      <p style="font-size: 15px; line-height: 1.6; color: #4a4038;">
        Your account is live. Rate a few films to sharpen your Taste DNA, build a Personal Pyramid
        of your favorites, and start getting picks tuned to how you actually watch.
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #4a4038;">
        Jump back in any time at <a href="https://backlot.app" style="color: #9a7b2f;">backlot.app</a>.
      </p>
      <p style="font-size: 12px; color: #8a8078; margin-top: 32px;">
        You're receiving this because you created a Backlot account with this address.
      </p>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
