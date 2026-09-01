import { Outlet } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/i18n/I18nContext";

export function OwnerLayout() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen">
      <AppHeader roleLabel={t("owner.roleLabel")} homeHref="/owner/dashboard" />
      <Outlet />
    </div>
  );
}
