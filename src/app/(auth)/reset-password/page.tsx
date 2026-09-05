import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getAuthBackdropPosters } from "@/lib/auth/backdrop-posters";

// This page has no dynamic APIs (no cookies()/headers()/searchParams), so
// Next treats it as fully static and renders it ONCE at build/deploy time --
// the getAuthBackdropPosters() call's own hourly unstable_cache revalidation
// never re-runs, because the *page* itself never re-executes. In production
// this baked in an empty posters array from whatever the catalogue looked
// like at build time (verified live: zero <img> in the backdrop). Forcing
// ISR here makes Next regenerate the page server-side on this cadence,
// matching the data cache's own window, so the backdrop self-heals instead
// of staying frozen until the next deploy.
export const revalidate = 3600;


export default async function ResetPasswordPage() {
  const posters = await getAuthBackdropPosters();
  return (
    <AuthShell posters={posters}>
      <ResetPasswordForm />
    </AuthShell>
  );
}
