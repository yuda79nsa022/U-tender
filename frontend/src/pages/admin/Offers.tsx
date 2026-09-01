import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { AdminOffer } from "@/api/types";
import { QueryError } from "@/components/QueryError";
import { useI18n } from "@/i18n/I18nContext";

const STATUS_BADGE: Record<string, string> = {
  submitted: "bg-blue-tint text-blue",
  approved: "bg-green-tint text-green",
  rejected: "bg-border text-steel",
  withdrawn: "bg-border text-steel-light",
};

export function AdminOffersPage() {
  const { t } = useI18n();
  const {
    data: offers,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin-offers"],
    queryFn: () => apiFetch<AdminOffer[]>("/admin/offers"),
  });

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <div className="mb-6">
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">{t("admin.offers.eyebrow")}</span>
        <h1 className="font-display text-2xl font-semibold text-navy mb-1">{t("admin.offers.heading")}</h1>
        <p className="text-[13.5px] text-steel">{offers?.length ?? 0} {t("admin.offers.total")}</p>
      </div>

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : !offers?.length ? (
        <div className="border border-dashed border-border rounded p-10 text-center text-sm text-steel">{t("admin.offers.empty")}</div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">{t("admin.offers.project")}</th>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">{t("admin.offers.contractor")}</th>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">{t("admin.offers.amount")}</th>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">{t("admin.offers.status")}</th>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">{t("admin.offers.tenderType")}</th>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">{t("admin.offers.submitted")}</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id} className="border-b border-border">
                <td className="py-3 px-2.5">
                  <Link to={`/admin/owners`} className="font-display font-semibold text-[13.5px] text-navy hover:underline">
                    {o.project_title}
                  </Link>
                  {o.revision > 1 && <span className="text-[11px] text-steel-light"> · {t("admin.offers.revised")} x{o.revision - 1}</span>}
                </td>
                <td className="py-3 px-2.5 text-[13px]">{o.contractor_company_name ?? "—"}</td>
                <td className="py-3 px-2.5 font-mono font-semibold text-navy text-sm">
                  {o.amount !== null ? `$${Number(o.amount).toLocaleString()}` : "—"}
                </td>
                <td className="py-3 px-2.5">
                  <span className={`font-mono text-[10px] uppercase px-2 py-0.5 rounded-full ${STATUS_BADGE[o.status] ?? "bg-blue-tint text-steel"}`}>
                    {o.status}
                  </span>
                </td>
                <td className="py-3 px-2.5 font-mono text-[11px] text-steel-light">{o.tender_type.replace(/_/g, " ")}</td>
                <td className="py-3 px-2.5 font-mono text-[11px] text-steel-light">{new Date(o.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </main>
  );
}
