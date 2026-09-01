import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/api/client";
import type { ContractorProfile } from "@/api/types";
import { PageLoading } from "@/components/PageLoading";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useI18n } from "@/i18n/I18nContext";

function PlanToggle({
  plan,
  setPlan,
  onSubscribe,
  pending,
  t,
}: {
  plan: "monthly" | "annual";
  setPlan: (p: "monthly" | "annual") => void;
  onSubscribe: () => void;
  pending: boolean;
  t: (key: string) => string;
}) {
  const features = [
    t("contractor.subscribe.feature1"),
    t("contractor.subscribe.feature2"),
    t("contractor.subscribe.feature3"),
    t("contractor.subscribe.feature4"),
  ];
  return (
    <div>
      <div className="inline-flex border border-navy rounded-full overflow-hidden mb-6">
        <button
          type="button"
          onClick={() => setPlan("monthly")}
          className={`font-mono text-xs px-4.5 py-2 uppercase tracking-wide ${plan === "monthly" ? "bg-navy text-white" : "bg-white text-navy"}`}
        >
          {t("contractor.subscribe.monthly")}
        </button>
        <button
          type="button"
          onClick={() => setPlan("annual")}
          className={`font-mono text-xs px-4.5 py-2 uppercase tracking-wide border-l border-navy ${plan === "annual" ? "bg-navy text-white" : "bg-white text-navy"}`}
        >
          {t("contractor.subscribe.annual")}
        </button>
      </div>

      <div className="bg-white border border-border border-t-4 border-t-amber rounded px-7 py-7 max-w-md">
        <div className="font-display text-[42px] font-bold text-navy leading-none">
          ${plan === "monthly" ? "79" : "67"}
          <span className="font-mono text-sm font-normal text-steel">/month</span>
        </div>
        <p className="text-xs text-steel mt-2 mb-5">
          {plan === "monthly" ? t("contractor.subscribe.priceMonthlyNote") : t("contractor.subscribe.priceAnnualNote")}
        </p>
        <ul className="mb-6">
          {features.map((f) => (
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
          {t("contractor.subscribe.start")}
        </button>
      </div>
    </div>
  );
}

export function ContractorSubscribePage() {
  const { t } = useI18n();
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
    onError: (err) => setError(err instanceof ApiError ? err.detail : t("contractor.subscribe.checkoutError")),
  });

  const portalMutation = useMutation({
    mutationFn: () => apiFetch<{ url: string }>("/billing/portal-session", { method: "POST" }),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => setError(err instanceof ApiError ? err.detail : t("contractor.subscribe.portalError")),
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
      <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">{t("contractor.subscribe.eyebrow")}</span>
      <h1 className="font-display text-2xl font-semibold text-navy mb-1">
        {isActive ? t("contractor.subscribe.headingActive") : t("contractor.subscribe.headingInactive")}
      </h1>
      <p className="text-[13.5px] text-steel mb-7">
        {isActive ? t("contractor.subscribe.subheadingActive") : t("contractor.subscribe.subheadingInactive")}
      </p>

      <ErrorBanner message={error} />

      {isActive ? (
        <div className="bg-white border border-border border-t-4 border-t-green rounded px-7 py-7 max-w-md">
          <span className="font-mono text-[10px] uppercase px-2.5 py-1 rounded-full bg-green-tint text-green">
            {overrideOnly ? t("contractor.subscribe.overrideBadge") : profile.subscription_status}
          </span>
          {overrideOnly && <p className="text-sm text-steel mt-3">{t("contractor.subscribe.overrideMessage")}</p>}
          {!overrideOnly && profile.subscription_current_period_end && (
            <p className="text-sm text-steel mt-3">
              {t("contractor.subscribe.renews")} {new Date(profile.subscription_current_period_end).toLocaleDateString()}
            </p>
          )}
          {!overrideOnly && (
            <button
              type="button"
              onClick={() => portalMutation.mutate()}
              className="mt-5 border border-navy text-navy hover:bg-navy hover:text-white text-sm font-semibold rounded px-5 py-2.5"
            >
              {t("contractor.subscribe.manageBilling")}
            </button>
          )}
        </div>
      ) : (
        <>
          <PlanToggle plan={plan} setPlan={setPlan} onSubscribe={() => checkoutMutation.mutate()} pending={checkoutMutation.isPending} t={t} />
          <p className="text-xs text-steel-light mt-6 max-w-md">{t("contractor.subscribe.checkoutNote")}</p>
        </>
      )}
    </main>
  );
}
