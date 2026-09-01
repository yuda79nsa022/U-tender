import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function HomePage() {
  const { user, loading } = useAuth();
  const { t } = useI18n();

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
    <main className="max-w-md mx-auto px-5 py-24 text-center">
      <div className="flex justify-center mb-6">
        <LanguageSwitcher />
      </div>
      <div className="w-10 h-10 border-2 border-navy flex items-center justify-center font-display font-bold text-lg text-navy mx-auto mb-4">
        U
      </div>
      <h1 className="font-display text-2xl font-semibold text-navy mb-2">U-Tender</h1>
      <p className="text-sm text-steel mb-8">{t("brand.tagline")}</p>

      <div className="flex items-center justify-center gap-3">
        <Link
          to="/login"
          className="border border-navy text-navy hover:bg-navy hover:text-white text-sm font-semibold rounded px-5 py-2.5"
        >
          {t("home.login")}
        </Link>
        <Link to="/signup" className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold rounded px-5 py-2.5">
          {t("home.signup")}
        </Link>
      </div>
    </main>
  );
}
