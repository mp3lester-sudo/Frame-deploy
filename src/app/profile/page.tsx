import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/verified-user";

/**
 * Bare /profile has no natural "whose profile" answer, so it 404'd with
 * no route handler at all (only /profile/[username] existed). Redirect
 * to the viewer's own profile via the existing "me" alias that
 * /profile/[username]/page.tsx already resolves, matching the
 * redirect("/login?next=...") pattern used by every other
 * viewer-required page (settings, lists, watchlist, taste-dna, ...).
 */
export default async function ProfileIndexPage() {
  const viewer = await getVerifiedUser();
  if (!viewer) redirect("/login?next=/profile/me");
  redirect("/profile/me");
}
