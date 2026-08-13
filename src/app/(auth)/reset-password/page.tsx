import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getAuthBackdropPosters } from "@/lib/auth/backdrop-posters";

export default async function ResetPasswordPage() {
  const posters = await getAuthBackdropPosters();
  return (
    <AuthShell posters={posters}>
      <ResetPasswordForm />
    </AuthShell>
  );
}
