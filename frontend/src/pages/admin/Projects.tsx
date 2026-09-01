import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { AdminProject } from "@/api/types";
import { QueryError } from "@/components/QueryError";
import { useI18n } from "@/i18n/I18nContext";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-border text-steel",
  open: "bg-green-tint text-green",
  closed: "bg-amber/15 text-amber-dark",
  under_evaluation: "bg-amber/15 text-amber-dark",
  awarded: "bg-blue-tint text-blue",
  no_award: "bg-border text-steel-light",
  canceled: "bg-red-tint text-red",
  expired: "bg-border text-steel-light",
};

export function AdminProjectsPage() {
  const { t } = useI18n();
  const {
    data: projects,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: () => apiFetch<AdminProject[]>("/admin/projects"),
  });

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <div className="mb-6">
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">{t("admin.projects.eyebrow")}</span>
        <h1 className="font-display text-2xl font-semibold text-navy mb-1">{t("admin.projects.heading")}</h1>
        <p className="text-[13.5px] text-steel">{projects?.length ?? 0} {t("admin.projects.total")}</p>
      </div>

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : !projects?.length ? (
        <div className="border border-dashed border-border rounded p-10 text-center text-sm text-steel">{t("admin.projects.empty")}</div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">{t("admin.projects.title")}</th>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">{t("admin.projects.owner")}</th>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">{t("admin.projects.status")}</th>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">{t("admin.projects.offers")}</th>
              <th className="border-b-2 border-navy py-2 px-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="py-3 px-2.5">
                  <div className="font-display font-semibold text-[13.5px]">{p.title}</div>
                  <div className="text-[11.5px] text-steel-light">{p.address}</div>
                </td>
                <td className="py-3 px-2.5 text-[13px]">
                  <div>{p.owner_name || p.owner_email || "—"}</div>
                  {p.owner_name && <div className="text-[11px] text-steel-light">{p.owner_email}</div>}
                </td>
                <td className="py-3 px-2.5">
                  <div className="flex flex-col gap-1 items-start">
                    <span className={`font-mono text-[10px] uppercase px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status] ?? "bg-blue-tint text-steel"}`}>
                      {p.status.replace(/_/g, " ")}
                    </span>
                    {p.is_suspended && (
                      <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded-full bg-red-tint text-red">
                        {t("admin.projects.suspendedBadge")}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-2.5 font-mono text-sm text-navy">{p.offer_count}</td>
                <td className="py-3 px-2.5">
                  <Link
                    to={`/admin/projects/${p.id}`}
                    className="border border-navy text-navy hover:bg-navy hover:text-white text-xs font-semibold rounded px-3 py-1.5"
                  >
                    {t("admin.projects.manage")}
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
