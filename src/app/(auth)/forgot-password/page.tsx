import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getAuthBackdropPosters } from "@/lib/auth/backdrop-posters";

export default async function ForgotPasswordPage() {
  const posters = await getAuthBackdropPosters();
  return (
    <AuthShell posters={posters}>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
