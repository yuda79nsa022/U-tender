"use server";

import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

function appUrl() {
  // Falls back to the actual request host if NEXT_PUBLIC_APP_URL isn't
  // set, so this works in local dev without extra config.
  const h = headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;
}

export async function createCheckoutSession(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const plan = (formData.get("plan") as string) === "annual" ? "annual" : "monthly";
  const priceId =
    plan === "annual"
      ? process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY;

  if (!priceId) {
    redirect(
      `/contractor/subscribe?error=${encodeURIComponent(
        "Billing isn't configured yet — a Stripe price ID is missing. Contact the site admin."
      )}`
    );
  }

  const { data: contractorProfile } = await supabase
    .from("contractor_profiles")
    .select("stripe_customer_id, company_name")
    .eq("user_id", user!.id)
    .single();

  const base = appUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    // Reuse the existing Stripe customer if this contractor has billed
    // before (e.g. resubscribing after a cancellation) instead of
    // creating a duplicate customer record.
    customer: contractorProfile?.stripe_customer_id || undefined,
    customer_email: contractorProfile?.stripe_customer_id ? undefined : user!.email,
    client_reference_id: user!.id,
    // The webhook has no session/user context of its own — metadata is
    // how it knows which contractor_profiles row to update.
    metadata: { contractor_id: user!.id },
    subscription_data: { metadata: { contractor_id: user!.id } },
    success_url: `${base}/contractor/feed?subscribed=1`,
    cancel_url: `${base}/contractor/subscribe`,
  });

  if (!session.url) {
    redirect(`/contractor/subscribe?error=${encodeURIComponent("Could not start checkout. Try again.")}`);
  }

  redirect(session.url!);
}

export async function createBillingPortalSession() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: contractorProfile } = await supabase
    .from("contractor_profiles")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  if (!contractorProfile?.stripe_customer_id) {
    redirect("/contractor/subscribe");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: contractorProfile!.stripe_customer_id!,
    return_url: `${appUrl()}/contractor/subscribe`,
  });

  redirect(session.url);
}
