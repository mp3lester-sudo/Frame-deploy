import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { captureServerError } from "@/lib/monitoring/sentry-server";
import { sendPushToUser } from "@/lib/push/send-push";
import { isSubscriptionStatusActive, resolveStripeCustomerId } from "@/lib/premium/subscription-status";

/**
 * Stripe webhook — the only writer of public.subscriptions. Uses the service
 * role client because it runs with no user session (Stripe calls this
 * server-to-server), and RLS intentionally has no authenticated-write policy
 * on subscriptions (see migration 0002_rls.sql).
 *
 * Every Supabase write below is checked for .error and reported to Sentry.
 * This matters more here than almost anywhere else in the app: a silently
 * failed "subscriptions" upsert means a customer's card was actually
 * charged by Stripe but premium never turns on for them, with nothing in
 * any log to explain why when they write in asking where their purchase
 * went. Stripe will retry the webhook on a non-2xx response, so on write
 * failure we return 500 (instead of the previous unconditional 200) to get
 * that retry instead of silently eating the event.
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

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id ?? session.client_reference_id;
        const tier = session.metadata?.tier === "auteur" ? "auteur" : "premium";
        if (userId) {
          const { error: subError } = await supabase.from("subscriptions").upsert({
            user_id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            status: "active",
            tier,
          });
          if (subError) throw new Error(`subscriptions upsert failed: ${subError.message}`);

          const { error: profileError } = await supabase
            .from("profiles")
            .update({ is_premium: true, premium_tier: tier })
            .eq("id", userId);
          if (profileError) throw new Error(`profiles update failed: ${profileError.message}`);

          await captureServerEvent(userId, "premium_activated", { source: "stripe_checkout", tier });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const { data: existing, error: fetchError } = await supabase
          .from("subscriptions")
          .select("user_id, tier")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();
        if (fetchError) throw new Error(`subscriptions lookup failed: ${fetchError.message}`);
        if (existing) {
          const isActive = isSubscriptionStatusActive(sub.status);
          // Falls back to whichever tier is already on file (defaulting to
          // "premium" for rows that predate Auteur) rather than the
          // subscription's own metadata alone -- Stripe only carries
          // subscription_data.metadata forward from Checkout for
          // subscriptions created after that field was added here, so an
          // older subscription being renewed/cancelled won't have
          // sub.metadata.tier set at all.
          const tier = (sub.metadata?.tier === "auteur" ? "auteur" : sub.metadata?.tier === "premium" ? "premium" : existing.tier) ?? "premium";
          const { error: updateError } = await supabase
            .from("subscriptions")
            .update({
              status: sub.status,
              tier,
              current_period_end: new Date(sub.items.data[0].current_period_end * 1000).toISOString(),
            })
            .eq("stripe_subscription_id", sub.id);
          if (updateError) throw new Error(`subscriptions update failed: ${updateError.message}`);

          const { error: profileError } = await supabase
            .from("profiles")
            .update({ is_premium: isActive, premium_tier: isActive ? tier : null })
            .eq("id", existing.user_id);
          if (profileError) throw new Error(`profiles update failed: ${profileError.message}`);
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
        const customerId = resolveStripeCustomerId(invoice.customer);
        if (customerId) {
          const { data: sub, error: fetchError } = await supabase
            .from("subscriptions")
            .select("user_id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          if (fetchError) throw new Error(`subscriptions lookup failed: ${fetchError.message}`);
          if (sub) {
            const { error: notifError } = await supabase.from("notifications").insert({
              recipient_id: sub.user_id,
              actor_id: null,
              type: "payment_failed",
            });
            if (notifError) throw new Error(`notifications insert failed: ${notifError.message}`);

            // Push delivery failing shouldn't fail the whole webhook --
            // the notification row above is the source of truth the user
            // will see in-app regardless of whether the push arrives.
            try {
              await sendPushToUser(sub.user_id, {
                title: "Payment failed",
                body: "We couldn't process your Marquee Premium payment. Update your card to keep your subscription.",
                url: "/premium",
              });
            } catch (pushErr) {
              await captureServerError(pushErr, { route: "stripe/webhook", event: event.type, stage: "push" });
            }
            await captureServerEvent(sub.user_id, "premium_payment_failed", {});
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe webhook] handler failed", event.type, err);
    await captureServerError(err, { route: "stripe/webhook", eventType: event.type, eventId: event.id });
    // Non-2xx tells Stripe to retry this event later instead of treating
    // a failed DB write as a successfully processed one.
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
