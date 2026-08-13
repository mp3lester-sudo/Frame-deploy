import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/signup-form";
import { getAuthBackdropPosters } from "@/lib/auth/backdrop-posters";

export default async function SignUpPage() {
  const posters = await getAuthBackdropPosters();
  return (
    <AuthShell posters={posters}>
      <SignUpForm />
    </AuthShell>
  );
}
