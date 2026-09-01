import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { apiFetch } from "@/api/client";

interface PublicStats {
  open_tenders: number;
  verified_contractors: number;
  awarded_projects: number;
  total_awarded_value: string;
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="border border-border bg-white rounded px-5 py-4 text-center">
      <div className="font-display text-3xl font-bold text-navy leading-none">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-wide text-steel mt-2">{label}</div>
    </div>
  );
}

export function HomePage() {
  const { user, loading } = useAuth();
  const { t, language } = useI18n();

  const { data: cms } = useQuery({
    queryKey: ["public-cms", language],
    queryFn: () => apiFetch<Record<string, string>>(`/public/cms?language=${language}`),
    enabled: !user,
  });
  const { data: stats } = useQuery({
    queryKey: ["public-stats"],
    queryFn: () => apiFetch<PublicStats>("/public/stats"),
    enabled: !user,
  });

  if (loading) return null;

  if (user) {
    if (user.role === "admin") return <Navigate to="/admin/requirements" replace />;
    if (user.role === "owner") return <Navigate to="/owner/dashboard" replace />;
    // The contractor dashboard itself branches on marketplace_status —
    // documents incomplete, pending review, payment required, active, or
    // suspended all land there and get the right prompt.
    return <Navigate to="/contractor/dashboard" replace />;
  }

  return (
    <main className="max-w-4xl mx-auto px-5 py-14">
      <div className="flex items-center justify-between mb-14">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 border-2 border-navy flex items-center justify-center font-display font-bold text-navy">
            U
          </div>
          <div className="font-display font-bold text-lg text-navy leading-none">U-TENDER</div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link to="/login" className="text-sm text-navy font-semibold hover:underline">
            {t("home.login")}
          </Link>
          <Link to="/signup" className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold rounded px-4 py-2">
            {t("home.signup")}
          </Link>
        </div>
      </div>

      <div className="text-center max-w-2xl mx-auto mb-14">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-navy mb-4 leading-tight">
          {cms?.hero_heading ?? t("brand.tagline")}
        </h1>
        <p className="text-[15px] text-steel mb-8">{cms?.hero_subheading ?? ""}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/signup" className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold rounded px-6 py-3">
            {t("home.signup")}
          </Link>
          <Link
            to="/login"
            className="border border-navy text-navy hover:bg-navy hover:text-white text-sm font-semibold rounded px-6 py-3"
          >
            {t("home.login")}
          </Link>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-14">
          <StatCard value={String(stats.open_tenders)} label="Open tenders" />
          <StatCard value={String(stats.verified_contractors)} label="Verified contractors" />
          <StatCard value={String(stats.awarded_projects)} label="Projects awarded" />
        </div>
      )}

      {(cms?.how_it_works_title || cms?.how_it_works_body) && (
        <div className="bg-white border border-border rounded px-7 py-7 max-w-2xl mx-auto">
          <h2 className="font-display text-xl font-semibold text-navy mb-3">{cms.how_it_works_title}</h2>
          <p className="text-[14px] text-steel leading-relaxed">{cms.how_it_works_body}</p>
        </div>
      )}
    </main>
  );
}
