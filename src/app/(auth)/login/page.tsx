import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getAuthBackdropPosters } from "@/lib/auth/backdrop-posters";

export default async function LoginPage() {
  const posters = await getAuthBackdropPosters();
  return (
    <AuthShell posters={posters}>
      <LoginForm />
    </AuthShell>
  );
}
