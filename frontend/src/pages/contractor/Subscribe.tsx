import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/api/client";
import type { ContractorProfile } from "@/api/types";
import { PageLoading } from "@/components/PageLoading";
import { ErrorBanner } from "@/components/ErrorBanner";

const FEATURES = [
  "Unlimited open projects in your service area",
  "Full drawings and scope details on every listing",
  "Unlimited offers and revisions before deadline",
  "Public rating and review profile",
];

function PlanToggle({
  plan,
  setPlan,
  onSubscribe,
  pending,
}: {
  plan: "monthly" | "annual";
  setPlan: (p: "monthly" | "annual") => void;
  onSubscribe: () => void;
  pending: boolean;
}) {
  return (
    <div>
      <div className="inline-flex border border-navy rounded-full overflow-hidden mb-6">
        <button
          type="button"
          onClick={() => setPlan("monthly")}
          className={`font-mono text-xs px-4.5 py-2 uppercase tracking-wide ${plan === "monthly" ? "bg-navy text-white" : "bg-white text-navy"}`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setPlan("annual")}
          className={`font-mono text-xs px-4.5 py-2 uppercase tracking-wide border-l border-navy ${plan === "annual" ? "bg-navy text-white" : "bg-white text-navy"}`}
        >
          Annual — save 15%
        </button>
      </div>

      <div className="bg-white border border-border border-t-4 border-t-amber rounded px-7 py-7 max-w-md">
        <div className="font-display text-[42px] font-bold text-navy leading-none">
          ${plan === "monthly" ? "79" : "67"}
          <span className="font-mono text-sm font-normal text-steel">/month</span>
        </div>
        <p className="text-xs text-steel mt-2 mb-5">
          {plan === "monthly" ? "Billed monthly. No lead fees, no commission on top." : "Billed annually at $804. No lead fees, no commission on top."}
        </p>
        <ul className="mb-6">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2 text-[13.5px] py-2 border-t border-border">
              <span className="text-green font-mono font-bold">✓</span> {f}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onSubscribe}
          disabled={pending}
          className="bg-amber hover:bg-amber-dark disabled:opacity-60 text-white font-semibold text-sm rounded px-5 py-2.5 w-full"
        >
          Start subscription
        </button>
      </div>
    </div>
  );
}

export function ContractorSubscribePage() {
  const [plan, setPlan] = useState<"monthly" | "annual">("monthly");
  const [error, setError] = useState<string | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["contractor-profile"],
    queryFn: () => apiFetch<ContractorProfile>("/contractor/profile"),
  });

  const checkoutMutation = useMutation({
    mutationFn: () => apiFetch<{ url: string }>(`/billing/checkout-session?plan=${plan}`, { method: "POST" }),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => setError(err instanceof ApiError ? err.detail : "Could not start checkout. Try again."),
  });

  const portalMutation = useMutation({
    mutationFn: () => apiFetch<{ url: string }>("/billing/portal-session", { method: "POST" }),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => setError(err instanceof ApiError ? err.detail : "Could not open billing portal. Try again."),
  });

  if (!profile) return <PageLoading />;

  const hasRealSubscription = profile.subscription_status === "active" || profile.subscription_status === "trialing";
  // marketplace_status already folds in an admin payment override, so a
  // contractor can be fully active (verified_active) with no Stripe
  // subscription at all — that state gets its own message rather than
  // being lumped in with "Subscribe to bid".
  const isActive = profile.marketplace_status === "verified_active";
  const overrideOnly = isActive && !hasRealSubscription;

  return (
    <main className="max-w-3xl mx-auto px-5 py-8">
      <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">Contractor access</span>
      <h1 className="font-display text-2xl font-semibold text-navy mb-1">{isActive ? "Your subscription" : "Subscribe to bid on projects"}</h1>
      <p className="text-[13.5px] text-steel mb-7">{isActive ? "Manage your plan and billing details." : "One plan, full access. Cancel any time."}</p>

      <ErrorBanner message={error} />

      {isActive ? (
        <div className="bg-white border border-border border-t-4 border-t-green rounded px-7 py-7 max-w-md">
          <span className="font-mono text-[10px] uppercase px-2.5 py-1 rounded-full bg-green-tint text-green">
            {overrideOnly ? "admin override" : profile.subscription_status}
          </span>
          {overrideOnly && (
            <p className="text-sm text-steel mt-3">
              An administrator has granted your account full marketplace access without a paid subscription.
            </p>
          )}
          {!overrideOnly && profile.subscription_current_period_end && (
            <p className="text-sm text-steel mt-3">Renews {new Date(profile.subscription_current_period_end).toLocaleDateString()}</p>
          )}
          {!overrideOnly && (
            <button
              type="button"
              onClick={() => portalMutation.mutate()}
              className="mt-5 border border-navy text-navy hover:bg-navy hover:text-white text-sm font-semibold rounded px-5 py-2.5"
            >
              Manage billing
            </button>
          )}
        </div>
      ) : (
        <>
          <PlanToggle plan={plan} setPlan={setPlan} onSubscribe={() => checkoutMutation.mutate()} pending={checkoutMutation.isPending} />
          <p className="text-xs text-steel-light mt-6 max-w-md">You'll be redirected to Stripe's secure checkout to complete your subscription.</p>
        </>
      )}
    </main>
  );
}
