import { createClient } from "@/lib/supabase/server";
import { reviewDocument, approveContractor, rejectApplication } from "./actions";

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

export default async function AdminReviewPage({
  searchParams,
}: {
  searchParams: { contractor?: string };
}) {
  const supabase = createClient();

  const { data: queue } = await supabase
    .from("contractor_profiles")
    .select("user_id, company_name, primary_trade, created_at, verification_status, profiles(full_name)")
    .in("verification_status", ["pending_review", "changes_requested"])
    .order("created_at", { ascending: true });

  const selectedId = searchParams.contractor ?? queue?.[0]?.user_id;
  const selected = queue?.find((c) => c.user_id === selectedId);

  const { data: docs } = selectedId
    ? await supabase
        .from("contractor_documents")
        .select("*, document_requirements(name, description, is_required)")
        .eq("contractor_id", selectedId)
    : { data: null };

  const requiredDocs = docs?.filter((d) => d.document_requirements?.is_required) ?? [];
  const requiredApprovedCount = requiredDocs.filter((d) => d.status === "approved").length;
  const readyToApprove = requiredDocs.length > 0 && requiredApprovedCount === requiredDocs.length;

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <div className="mb-6">
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">
          Admin · Applications
        </span>
        <h1 className="font-display text-2xl font-semibold text-navy mb-1">Contractor applications</h1>
        <p className="text-[13.5px] text-steel">
          {queue?.length ?? 0} pending review{queue?.length === 1 ? "" : "s"}.
        </p>
      </div>

      {!queue?.length ? (
        <div className="border border-dashed border-border rounded p-10 text-center text-sm text-steel">
          No applications waiting on review.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[.9fr_1.6fr] gap-5 items-start">
          <div className="space-y-2.5">
            {queue.map((c: any) => (
              <a
                key={c.user_id}
                href={`/admin/review?contractor=${c.user_id}`}
                className={`block px-4 py-3.5 border rounded ${
                  c.user_id === selectedId ? "border-l-[3px] border-l-amber bg-blue-tint border-border" : "border-border bg-white"
                }`}
              >
                <div className="font-display font-semibold text-sm">{c.company_name}</div>
                <div className="font-mono text-[10.5px] text-steel mt-1">
                  {c.primary_trade || "Trade not set"} · Submitted{" "}
                  {new Date(c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </div>
              </a>
            ))}
          </div>

          {selected && (
            <div className="tblock rounded px-5.5 pt-5 pb-0">
              <div className="flex justify-between items-start gap-2 mb-1">
                <div>
                  <h3 className="font-display font-semibold text-lg">{selected.company_name}</h3>
                  <p className="text-[12.5px] text-steel">
                    {(selected as any).profiles?.full_name} · {selected.primary_trade || "Trade not set"}
                  </p>
                </div>
                <span className={`font-mono text-[10px] uppercase px-2.5 py-1 rounded-full ${statusBadge(selected.verification_status === "pending_review" ? "pending" : selected.verification_status)}`}>
                  {selected.verification_status.replace("_", " ")}
                </span>
              </div>

              <div className="divide-y divide-border mt-4">
                {docs?.map((d: any) => (
                  <div key={d.id} className="py-3.5 flex justify-between items-start gap-3">
                    <div>
                      <div className="font-display font-semibold text-[13.5px]">
                        {d.document_requirements?.name}
                      </div>
                      {d.file_path ? (
                        <div className="font-mono text-[11px] text-blue">{d.file_path.split("/").pop()}</div>
                      ) : (
                        <div className="text-[11.5px] text-steel-light mt-0.5">
                          Not submitted {d.document_requirements?.is_required ? "" : "— optional"}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {d.status === "approved" && (
                        <span className="font-mono text-[10px] uppercase px-2 py-1 rounded-full bg-green-tint text-green">
                          Approved
                        </span>
                      )}
                      {d.status === "not_submitted" && !d.document_requirements?.is_required && (
                        <span className="font-mono text-[10px] uppercase px-2 py-1 rounded-full bg-border text-steel">
                          N/A
                        </span>
                      )}
                      {(d.status === "pending" || d.status === "rejected") && (
                        <form action={reviewDocument} className="flex items-center gap-1.5">
                          <input type="hidden" name="contractor_id" value={selectedId} />
                          <input type="hidden" name="requirement_id" value={d.requirement_id} />
                          {d.status === "pending" && (
                            <>
                              <button
                                type="submit"
                                name="decision"
                                value="approved"
                                className="border border-navy text-navy hover:bg-navy hover:text-white text-xs font-semibold rounded px-3 py-1.5"
                              >
                                Approve
                              </button>
                              <button
                                type="submit"
                                name="decision"
                                value="rejected"
                                className="bg-red-tint text-red text-xs font-semibold rounded px-3 py-1.5"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {d.status === "rejected" && (
                            <span className="font-mono text-[10px] uppercase px-2 py-1 rounded-full bg-red-tint text-red">
                              Rejected
                            </span>
                          )}
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2.5 py-4.5 border-t border-border mt-1">
                <form
                  action={async () => {
                    "use server";
                    await approveContractor(selectedId!);
                  }}
                >
                  <button
                    type="submit"
                    disabled={!readyToApprove}
                    className="bg-navy hover:bg-navy-deep disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded px-4 py-2"
                  >
                    Approve contractor
                  </button>
                </form>
                <form
                  action={async () => {
                    "use server";
                    await rejectApplication(selectedId!);
                  }}
                >
                  <button
                    type="submit"
                    className="bg-red-tint text-red text-sm font-semibold rounded px-4 py-2"
                  >
                    Reject application
                  </button>
                </form>
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
