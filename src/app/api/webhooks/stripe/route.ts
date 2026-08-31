import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, mapStripeStatus } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Webhooks arrive with no user session — they're authenticated by the
// signature check below, not by auth cookies — so this uses the
// service-role client to write regardless of RLS.
export async function POST(req: NextRequest) {
  const body = await req.text(); // raw body required for signature verification
  const signature = req.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("[stripe webhook] signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const contractorId = session.metadata?.contractor_id || session.client_reference_id;
        if (!contractorId || !session.subscription || !session.customer) break;

        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

        await supabase
          .from("contractor_profiles")
          .update({
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscription.id,
            subscription_status: mapStripeStatus(subscription.status),
            subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq("user_id", contractorId);
        break;
      }

      // Covers plan changes, renewals, payment failures, and cancellations —
      // Stripe sends this on essentially every status change after the
      // initial checkout, so it's the source of truth going forward.
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const contractorId = subscription.metadata?.contractor_id;

        const updateQuery = supabase
          .from("contractor_profiles")
          .update({
            subscription_status: mapStripeStatus(subscription.status),
            subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          });

        // Prefer matching on our own metadata; fall back to the Stripe
        // subscription ID in case metadata was somehow lost.
        if (contractorId) {
          await updateQuery.eq("user_id", contractorId);
        } else {
          await updateQuery.eq("stripe_subscription_id", subscription.id);
        }
        break;
      }

      default:
        // Unhandled event types are expected — Stripe sends many more
        // than we act on. No-op is correct here.
        break;
    }
  } catch (err) {
    console.error(`[stripe webhook] failed to process ${event.type}:`, err);
    // Return 500 so Stripe retries — better a duplicate delivery than a
    // silently missed subscription state change.
    return NextResponse.json({ error: "Internal error processing webhook" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
