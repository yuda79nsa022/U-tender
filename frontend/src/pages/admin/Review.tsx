import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { ContractorProfile, DocumentStatus } from "@/api/types";

interface QueueDocument {
  id: string;
  requirement_id: string;
  status: DocumentStatus;
  requirement_name: string | null;
  requirement_description: string | null;
  requirement_is_required: boolean | null;
  url: string | null;
}

interface QueueEntry {
  contractor: ContractorProfile;
  documents: QueueDocument[];
}

function statusBadge(status: string) {
  switch (status) {
    case "approved":
      return "bg-green-tint text-green";
    case "rejected":
      return "bg-red-tint text-red";
    case "pending":
      return "bg-amber/15 text-amber-dark";
    default:
      return "bg-blue-tint text-steel";
  }
}

export function AdminReviewPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: queue } = useQuery({
    queryKey: ["admin-review-queue"],
    queryFn: () => apiFetch<QueueEntry[]>("/admin/review/queue"),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-review-queue"] });
  };

  const decisionMutation = useMutation({
    mutationFn: (vars: { contractorId: string; requirementId: string; decision: "approved" | "rejected"; note?: string }) =>
      apiFetch("/admin/review/documents", {
        method: "POST",
        body: { contractor_id: vars.contractorId, requirement_id: vars.requirementId, decision: vars.decision, note: vars.note ?? null },
      }),
    onSuccess: invalidate,
  });

  const approveMutation = useMutation({
    mutationFn: (contractorId: string) => apiFetch(`/admin/review/contractors/${contractorId}/approve`, { method: "POST" }),
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: (contractorId: string) => apiFetch(`/admin/review/contractors/${contractorId}/reject`, { method: "POST" }),
    onSuccess: invalidate,
  });

  const active = selectedId ?? queue?.[0]?.contractor.user_id ?? null;
  const selected = queue?.find((c) => c.contractor.user_id === active);

  const requiredDocs = selected?.documents.filter((d) => d.requirement_is_required) ?? [];
  const requiredApprovedCount = requiredDocs.filter((d) => d.status === "approved").length;
  const readyToApprove = requiredDocs.length > 0 && requiredApprovedCount === requiredDocs.length;

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <div className="mb-6">
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">Admin · Applications</span>
        <h1 className="font-display text-2xl font-semibold text-navy mb-1">Contractor applications</h1>
        <p className="text-[13.5px] text-steel">{queue?.length ?? 0} pending review{queue?.length === 1 ? "" : "s"}.</p>
      </div>

      {!queue?.length ? (
        <div className="border border-dashed border-border rounded p-10 text-center text-sm text-steel">No applications waiting on review.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[.9fr_1.6fr] gap-5 items-start">
          <div className="space-y-2.5">
            {queue.map((entry) => (
              <button
                key={entry.contractor.user_id}
                type="button"
                onClick={() => setSelectedId(entry.contractor.user_id)}
                className={`block w-full text-left px-4 py-3.5 border rounded ${
                  entry.contractor.user_id === active ? "border-l-[3px] border-l-amber bg-blue-tint border-border" : "border-border bg-white"
                }`}
              >
                <div className="font-display font-semibold text-sm">{entry.contractor.company_name}</div>
                <div className="font-mono text-[10.5px] text-steel mt-1">
                  {entry.contractor.primary_trade || "Trade not set"} · Submitted{" "}
                  {new Date(entry.contractor.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="tblock rounded px-5.5 pt-5 pb-0">
              <div className="flex justify-between items-start gap-2 mb-1">
                <div>
                  <h3 className="font-display font-semibold text-lg">{selected.contractor.company_name}</h3>
                  <p className="text-[12.5px] text-steel">{selected.contractor.primary_trade || "Trade not set"}</p>
                </div>
                <span
                  className={`font-mono text-[10px] uppercase px-2.5 py-1 rounded-full ${statusBadge(
                    selected.contractor.verification_status === "pending_review" ? "pending" : selected.contractor.verification_status
                  )}`}
                >
                  {selected.contractor.verification_status.replace("_", " ")}
                </span>
              </div>

              <div className="divide-y divide-border mt-4">
                {selected.documents.map((d) => (
                  <div key={d.id} className="py-3.5 flex justify-between items-start gap-3">
                    <div>
                      <div className="font-display font-semibold text-[13.5px]">{d.requirement_name}</div>
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-blue underline">
                          View document
                        </a>
                      ) : (
                        <div className="text-[11.5px] text-steel-light mt-0.5">
                          Not submitted {d.requirement_is_required ? "" : "— optional"}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {d.status === "approved" && (
                        <span className="font-mono text-[10px] uppercase px-2 py-1 rounded-full bg-green-tint text-green">Approved</span>
                      )}
                      {d.status === "not_submitted" && !d.requirement_is_required && (
                        <span className="font-mono text-[10px] uppercase px-2 py-1 rounded-full bg-border text-steel">N/A</span>
                      )}
                      {d.status === "pending" && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              decisionMutation.mutate({ contractorId: selected.contractor.user_id, requirementId: d.requirement_id, decision: "approved" })
                            }
                            className="border border-navy text-navy hover:bg-navy hover:text-white text-xs font-semibold rounded px-3 py-1.5"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              decisionMutation.mutate({ contractorId: selected.contractor.user_id, requirementId: d.requirement_id, decision: "rejected" })
                            }
                            className="bg-red-tint text-red text-xs font-semibold rounded px-3 py-1.5"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {d.status === "rejected" && (
                        <span className="font-mono text-[10px] uppercase px-2 py-1 rounded-full bg-red-tint text-red">Rejected</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2.5 py-4.5 border-t border-border mt-1">
                <button
                  type="button"
                  onClick={() => approveMutation.mutate(selected.contractor.user_id)}
                  disabled={!readyToApprove}
                  className="bg-navy hover:bg-navy-deep disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded px-4 py-2"
                >
                  Approve contractor
                </button>
                <button
                  type="button"
                  onClick={() => rejectMutation.mutate(selected.contractor.user_id)}
                  className="bg-red-tint text-red text-sm font-semibold rounded px-4 py-2"
                >
                  Reject application
                </button>
              </div>
              {!readyToApprove && (
                <p className="text-[11px] text-steel-light -mt-2 pb-4">
                  All required documents must be approved before this contractor can be approved.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
