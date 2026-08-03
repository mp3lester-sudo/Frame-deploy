import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { PremiumUpgradeCard } from "@/components/premium/premium-upgrade-card";
import { PremiumManageCard } from "@/components/premium/premium-manage-card";

export default async function PremiumPage() {
  const user = await getVerifiedUser();
  if (!user) return <PremiumUpgradeCard />;

  const supabase = await createClient();
  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase.from("profiles").select("is_premium").eq("id", user.id).maybeSingle(),
    supabase.from("subscriptions").select("current_period_end").eq("user_id", user.id).maybeSingle(),
  ]);

  if (profile?.is_premium) {
    return <PremiumManageCard currentPeriodEnd={sub?.current_period_end ?? null} />;
  }

  return <PremiumUpgradeCard />;
}
