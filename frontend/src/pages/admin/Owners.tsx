import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { OwnerProfile } from "@/api/types";
import { QueryError } from "@/components/QueryError";
import { useI18n } from "@/i18n/I18nContext";

const STATUS_BADGE: Record<string, string> = {
  documents_incomplete: "bg-blue-tint text-steel",
  submitted_for_review: "bg-amber/15 text-amber-dark",
  changes_requested: "bg-red-tint text-red",
  verified_active: "bg-green-tint text-green",
  suspended: "bg-red-tint text-red",
};

export function AdminOwnersPage() {
  const { t } = useI18n();
  const {
    data: owners,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin-owners"],
    queryFn: () => apiFetch<OwnerProfile[]>("/admin/owners"),
  });

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <div className="mb-6">
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">{t("admin.owners.eyebrow")}</span>
        <h1 className="font-display text-2xl font-semibold text-navy mb-1">{t("admin.owners.heading")}</h1>
        <p className="text-[13.5px] text-steel">{owners?.length ?? 0} {t("admin.owners.total")}</p>
      </div>

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : !owners?.length ? (
        <div className="border border-dashed border-border rounded p-10 text-center text-sm text-steel">{t("admin.owners.empty")}</div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">{t("admin.owners.name")}</th>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">{t("admin.owners.status")}</th>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">{t("admin.owners.projects")}</th>
              <th className="border-b-2 border-navy py-2 px-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {owners.map((o) => (
              <tr key={o.user_id} className="border-b border-border">
                <td className="py-3 px-2.5">
                  <div className="font-display font-semibold text-[13.5px]">{o.full_name || o.email}</div>
                  <div className="text-[11.5px] text-steel-light">{o.email}</div>
                </td>
                <td className="py-3 px-2.5">
                  <div className="flex flex-col gap-1 items-start">
                    <span className={`font-mono text-[10px] uppercase px-2 py-0.5 rounded-full ${STATUS_BADGE[o.marketplace_status] ?? "bg-blue-tint text-steel"}`}>
                      {o.marketplace_status.replace(/_/g, " ")}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-2.5 font-mono text-sm text-navy">{o.project_count}</td>
                <td className="py-3 px-2.5">
                  <Link
                    to={`/admin/owners/${o.user_id}`}
                    className="border border-navy text-navy hover:bg-navy hover:text-white text-xs font-semibold rounded px-3 py-1.5"
                  >
                    {t("admin.owners.manage")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </main>
  );
}
