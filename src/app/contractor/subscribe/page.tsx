import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createBillingPortalSession, createCheckoutSession } from "./actions";
import { PlanToggle } from "./plan-toggle";

export default async function SubscribePage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: contractorProfile } = await supabase
    .from("contractor_profiles")
    .select("subscription_status, subscription_current_period_end")
    .eq("user_id", user.id)
    .single();

  const isActive =
    contractorProfile?.subscription_status === "active" || contractorProfile?.subscription_status === "trialing";

  return (
    <main className="max-w-3xl mx-auto px-5 py-8">
      <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">
        Contractor access
      </span>
      <h1 className="font-display text-2xl font-semibold text-navy mb-1">
        {isActive ? "Your subscription" : "Subscribe to bid on projects"}
      </h1>
      <p className="text-[13.5px] text-steel mb-7">
        {isActive ? "Manage your plan and billing details." : "One plan, full access. Cancel any time."}
      </p>

      {searchParams.error && (
        <p className="text-xs bg-red-tint text-red border border-red rounded px-3 py-2.5 mb-5 max-w-2xl">
          {searchParams.error}
        </p>
      )}

      {isActive ? (
        <div className="bg-white border border-border border-t-4 border-t-green rounded px-7 py-7 max-w-md">
          <span className="font-mono text-[10px] uppercase px-2.5 py-1 rounded-full bg-green-tint text-green">
            {contractorProfile?.subscription_status}
          </span>
          {contractorProfile?.subscription_current_period_end && (
            <p className="text-sm text-steel mt-3">
              Renews {new Date(contractorProfile.subscription_current_period_end).toLocaleDateString()}
            </p>
          )}
          <form action={createBillingPortalSession} className="mt-5">
            <button
              type="submit"
              className="border border-navy text-navy hover:bg-navy hover:text-white text-sm font-semibold rounded px-5 py-2.5"
            >
              Manage billing
            </button>
          </form>
        </div>
      ) : (
        <>
          <form id="subscribe-form" action={createCheckoutSession}>
            <PlanToggle />
          </form>
          <p className="text-xs text-steel-light mt-6 max-w-md">
            You&apos;ll be redirected to Stripe&apos;s secure checkout to complete your subscription.
          </p>
        </>
      )}
    </main>
  );
}
