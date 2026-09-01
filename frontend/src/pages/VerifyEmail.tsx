import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch, ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function VerifyEmailPage() {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"pending" | "success" | "error">(token ? "pending" : "error");
  const [error, setError] = useState<string | null>(token ? null : t("auth.verifyEmail.missingToken"));

  useEffect(() => {
    if (!token) return;
    apiFetch("/auth/verify-email", { method: "POST", body: { token } })
      .then(() => {
        setStatus("success");
        refresh();
      })
      .catch((err) => {
        setStatus("error");
        setError(err instanceof ApiError ? err.detail : t("auth.verifyEmail.invalidToken"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main className="max-w-sm mx-auto px-5 py-16 text-center">
      <div className="flex justify-end mb-6">
        <LanguageSwitcher />
      </div>

      {status === "pending" && <p className="text-sm text-steel">{t("auth.verifyEmail.heading")}</p>}

      {status === "success" && (
        <>
          <p className="text-xs bg-blue-tint text-blue border border-blue rounded px-3 py-2.5 mb-4">
            {t("auth.verifyEmail.success")}
          </p>
          <Link
            to="/"
            className="inline-block bg-amber hover:bg-amber-dark text-white font-semibold text-sm rounded px-5 py-2.5"
          >
            {t("auth.verifyEmail.continue")}
          </Link>
        </>
      )}

      {status === "error" && (
        <p className="text-xs bg-red-tint text-red border border-red rounded px-3 py-2.5 mb-4">{error}</p>
      )}
    </main>
  );
}
