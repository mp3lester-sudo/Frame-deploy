import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { PremiumUpgradeCard } from "@/components/premium/premium-upgrade-card";
import { PremiumManageCard } from "@/components/premium/premium-manage-card";

export default async function PremiumPage() {
  // Checked directly (not via lib/stripe.ts's AUTEUR_PRICE_ID export,
  // which is guarded by "server-only" and would need its own client
  // boundary) so PremiumUpgradeCard knows whether to render a working
  // Auteur buy button or a disabled "Coming soon" one -- see that
  // component's doc comment for why this stays off until real
  // Auteur-exclusive features exist behind it.
  const auteurAvailable = !!process.env.STRIPE_AUTEUR_PRICE_ID;

  const user = await getVerifiedUser();
  if (!user) return <PremiumUpgradeCard auteurAvailable={auteurAvailable} />;

  const supabase = await createClient();
  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase.from("profiles").select("is_premium, premium_tier").eq("id", user.id).maybeSingle(),
    supabase.from("subscriptions").select("current_period_end").eq("user_id", user.id).maybeSingle(),
  ]);

  if (profile?.is_premium) {
    return <PremiumManageCard currentPeriodEnd={sub?.current_period_end ?? null} tier={profile.premium_tier} />;
  }

  return <PremiumUpgradeCard auteurAvailable={auteurAvailable} />;
}
