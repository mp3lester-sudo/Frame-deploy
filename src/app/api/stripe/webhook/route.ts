import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { sendPushToUser } from "@/lib/push/send-push";

/**
 * Stripe webhook — the only writer of public.subscriptions. Uses the service
 * role client because it runs with no user session (Stripe calls this
 * server-to-server), and RLS intentionally has no authenticated-write policy
 * on subscriptions (see migration 0002_rls.sql).
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id ?? session.client_reference_id;
      if (userId) {
        await supabase.from("subscriptions").upsert({
          user_id: userId,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          status: "active",
        });
        await supabase.from("profiles").update({ is_premium: true }).eq("id", userId);
        await captureServerEvent(userId, "premium_activated", { source: "stripe_checkout" });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_subscription_id", sub.id)
        .maybeSingle();
      if (existing) {
        const isActive = sub.status === "active" || sub.status === "trialing";
        await supabase
          .from("subscriptions")
          .update({
            status: sub.status,
            current_period_end: new Date(sub.items.data[0].current_period_end * 1000).toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);
        await supabase.from("profiles").update({ is_premium: isActive }).eq("id", existing.user_id);
      }
      break;
    }
    case "invoice.payment_failed": {
      // No notify() here -- notify() (src/lib/actions/notifications.ts)
      // always expects a human actorId and no-ops when actorId equals the
      // recipient, so a system-generated notice needs its own insert
      // (actor_id: null, type: "payment_failed" -- both added specifically
      // for this) rather than going through that helper.
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (customerId) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (sub) {
          await supabase.from("notifications").insert({
            recipient_id: sub.user_id,
            actor_id: null,
            type: "payment_failed",
          });
          await sendPushToUser(sub.user_id, {
            title: "Payment failed",
            body: "We couldn't process your Backlot Premium payment. Update your card to keep your subscription.",
            url: "/premium",
          });
          await captureServerEvent(sub.user_id, "premium_payment_failed", {});
        }
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
