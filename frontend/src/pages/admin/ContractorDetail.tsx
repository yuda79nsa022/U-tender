import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { ContractorProfile } from "@/api/types";
import { stars } from "@/lib/format";
import { DeleteContractorForm } from "@/components/DeleteContractorForm";

const STATUS_OPTIONS = ["incomplete", "pending_review", "changes_requested", "approved"] as const;

export function AdminContractorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: detail } = useQuery({
    queryKey: ["admin-contractor", id],
    queryFn: () => apiFetch<{ contractor: ContractorProfile }>(`/admin/contractors/${id}`),
    enabled: !!id,
  });
  const contractor = detail?.contractor;

  const [companyName, setCompanyName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [primaryTrade, setPrimaryTrade] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [statusValue, setStatusValue] = useState<string>("");

  useEffect(() => {
    if (!contractor) return;
    setCompanyName(contractor.company_name);
    setLicenseNumber(contractor.license_number ?? "");
    setPrimaryTrade(contractor.primary_trade ?? "");
    setServiceArea(contractor.service_area ?? "");
    setStatusValue(contractor.verification_status);
  }, [contractor?.user_id]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-contractor", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-contractors"] });
  };

  const updateMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/admin/contractors/${id}`, {
        method: "PATCH",
        body: { company_name: companyName, license_number: licenseNumber || null, primary_trade: primaryTrade || null, service_area: serviceArea || null },
      }),
    onSuccess: invalidate,
  });

  const statusMutation = useMutation({
    mutationFn: () => apiFetch(`/admin/contractors/${id}/verification-status`, { method: "POST", body: { status: statusValue } }),
    onSuccess: invalidate,
  });

  const suspendMutation = useMutation({
    mutationFn: () => apiFetch(`/admin/contractors/${id}/suspend`, { method: "POST", body: { suspended: !contractor?.is_suspended } }),
    onSuccess: invalidate,
  });

  if (!contractor) return null;

  return (
    <main className="max-w-3xl mx-auto px-5 py-8">
      <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">Admin · Contractors</span>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-navy mb-1">{contractor.company_name}</h1>
          <p className="text-[13.5px] text-steel">
            <span className="text-amber">{stars(Number(contractor.avg_rating))}</span>{" "}
            <span className="font-mono text-steel">({contractor.review_count} reviews)</span>
          </p>
        </div>
        {contractor.is_suspended && <span className="font-mono text-[10px] uppercase px-2.5 py-1 rounded-full bg-red-tint text-red">Suspended</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6 items-start">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate();
          }}
          className="grid gap-4 bg-white border border-border rounded px-5 py-4.5"
        >
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-navy -mb-1">Company details</h3>
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">Company name</label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className="w-full border border-border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">License number</label>
            <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className="w-full border border-border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">Primary trade</label>
            <input value={primaryTrade} onChange={(e) => setPrimaryTrade(e.target.value)} className="w-full border border-border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">Service area</label>
            <input value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} className="w-full border border-border rounded px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="bg-navy hover:bg-navy-deep text-white font-semibold text-sm rounded px-4 py-2 w-fit">
            Save changes
          </button>
        </form>

        <div className="grid gap-4">
          <div className="bg-white border border-border rounded px-5 py-4.5">
            <h3 className="font-mono text-[11px] uppercase tracking-wide text-navy mb-3">Verification status</h3>
            <div className="flex items-center gap-2">
              <select value={statusValue} onChange={(e) => setStatusValue(e.target.value)} className="border border-border rounded px-2.5 py-2 text-sm flex-1">
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => statusMutation.mutate()}
                className="border border-navy text-navy hover:bg-navy hover:text-white text-xs font-semibold rounded px-3 py-2"
              >
                Update
              </button>
            </div>
            <p className="text-[11px] text-steel-light mt-2">Admin override — bypasses the per-document review flow. Use with care.</p>
          </div>

          <div className="bg-white border border-border rounded px-5 py-4.5">
            <h3 className="font-mono text-[11px] uppercase tracking-wide text-navy mb-3">Account access</h3>
            <button
              type="button"
              onClick={() => suspendMutation.mutate()}
              className={`text-xs font-semibold rounded px-4 py-2 w-full ${contractor.is_suspended ? "bg-green-tint text-green" : "bg-red-tint text-red"}`}
            >
              {contractor.is_suspended ? "Reactivate account" : "Suspend account"}
            </button>
            <p className="text-[11px] text-steel-light mt-2">
              {contractor.is_suspended
                ? "This contractor can't view projects, drawings, or submit offers until reactivated."
                : "Immediately blocks the contractor from the feed and offers, without deleting anything."}
            </p>
          </div>

          <div className="bg-white border border-red/30 rounded px-5 py-4.5">
            <h3 className="font-mono text-[11px] uppercase tracking-wide text-red mb-3">Danger zone</h3>
            <DeleteContractorForm
              contractorId={contractor.user_id}
              companyName={contractor.company_name}
              onDeleted={() => navigate("/admin/contractors")}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
