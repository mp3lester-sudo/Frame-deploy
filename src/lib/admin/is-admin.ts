/**
 * Single-owner-app admin gate. This isn't a general roles/permissions
 * system (that would be overkill for one operator) -- it's an allowlist of
 * emails, sourced from the ADMIN_EMAILS env var (comma-separated) with the
 * project owner's own address as a fallback so the admin dashboard works
 * immediately without requiring a new env var to be set first.
 */
const FALLBACK_ADMIN_EMAILS = ["mp3lester@gmail.com"];

function adminEmails(): string[] {
  const fromEnv = process.env.ADMIN_EMAILS?.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return fromEnv && fromEnv.length > 0 ? fromEnv : FALLBACK_ADMIN_EMAILS;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}
