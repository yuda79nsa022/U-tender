import Stripe from "stripe";

// Server-only — STRIPE_SECRET_KEY must never reach client code.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// Maps Stripe's subscription.status values onto our narrower
// subscription_status enum (trialing | active | past_due | canceled).
// Stripe has a few extra states (incomplete, incomplete_expired, unpaid,
// paused) that don't have a clean equivalent — we fold those into
// whichever of ours is closest in meaning for gating access.
export function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status
): "trialing" | "active" | "past_due" | "canceled" {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
    default:
      return "canceled";
  }
}
