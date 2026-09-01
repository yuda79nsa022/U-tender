import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NotificationBell } from "@/components/NotificationBell";

export function AppHeader({ roleLabel, homeHref }: { roleLabel: string; homeHref: string }) {
  const { logout } = useAuth();
  const { t } = useI18n();

  return (
    <div className="max-w-5xl mx-auto px-5 pt-6">
      <div className="flex items-center justify-between border-b-2 border-navy pb-4">
        <Link to={homeHref} className="flex items-center gap-2.5">
          <div className="w-7 h-7 border-2 border-navy flex items-center justify-center font-display font-bold text-sm text-navy">
            U
          </div>
          <div>
            <div className="font-display font-bold text-lg text-navy leading-none">U-TENDER</div>
            <div className="text-[10px] text-steel uppercase tracking-widest">{t("brand.tagline")}</div>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <NotificationBell />
          <LanguageSwitcher />
          <span className="font-mono text-[11px] uppercase tracking-wide text-steel border border-border rounded-full px-2.5 py-1">
            {roleLabel}
          </span>
          <Link to="/account" className="text-xs text-steel hover:text-navy underline">
            {t("header.account")}
          </Link>
          <button type="button" onClick={() => logout()} className="text-xs text-steel hover:text-navy underline">
            {t("header.logOut")}
          </button>
        </div>
      </div>
    </div>
  );
}
