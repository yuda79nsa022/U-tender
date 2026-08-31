import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { updateContractorProfile, setVerificationStatus, setSuspended } from "../actions";
import { DeleteContractorForm } from "./delete-button";
import { stars } from "@/lib/format";

const STATUS_OPTIONS = ["incomplete", "pending_review", "changes_requested", "approved"] as const;

export default async function AdminContractorDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: contractor } = await supabase
    .from("contractor_profiles")
    .select("*, profiles(full_name)")
    .eq("user_id", params.id)
    .single();

  if (!contractor) notFound();

  return (
    <main className="max-w-3xl mx-auto px-5 py-8">
      <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">
        Admin · Contractors
      </span>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-navy mb-1">{contractor.company_name}</h1>
          <p className="text-[13.5px] text-steel">
            {(contractor as any).profiles?.full_name} ·{" "}
            <span className="text-amber">{stars(contractor.avg_rating)}</span>{" "}
            <span className="font-mono text-steel">({contractor.review_count} reviews)</span>
          </p>
        </div>
        {contractor.is_suspended && (
          <span className="font-mono text-[10px] uppercase px-2.5 py-1 rounded-full bg-red-tint text-red">
            Suspended
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6 items-start">
        <form action={updateContractorProfile} className="grid gap-4 bg-white border border-border rounded px-5 py-4.5">
          <input type="hidden" name="contractor_id" value={contractor.user_id} />
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-navy -mb-1">Company details</h3>
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">
              Company name
            </label>
            <input
              name="company_name"
              defaultValue={contractor.company_name}
              required
              className="w-full border border-border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">
              License number
            </label>
            <input
              name="license_number"
              defaultValue={contractor.license_number ?? ""}
              className="w-full border border-border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">
              Primary trade
            </label>
            <input
              name="primary_trade"
              defaultValue={contractor.primary_trade ?? ""}
              className="w-full border border-border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">
              Service area
            </label>
            <input
              name="service_area"
              defaultValue={contractor.service_area ?? ""}
              className="w-full border border-border rounded px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="bg-navy hover:bg-navy-deep text-white font-semibold text-sm rounded px-4 py-2 w-fit"
          >
            Save changes
          </button>
        </form>

        <div className="grid gap-4">
          <div className="bg-white border border-border rounded px-5 py-4.5">
            <h3 className="font-mono text-[11px] uppercase tracking-wide text-navy mb-3">Verification status</h3>
            <form
              action={async (formData) => {
                "use server";
                await setVerificationStatus(contractor.user_id, formData.get("status") as string);
              }}
              className="flex items-center gap-2"
            >
              <select
                name="status"
                defaultValue={contractor.verification_status}
                className="border border-border rounded px-2.5 py-2 text-sm flex-1"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="border border-navy text-navy hover:bg-navy hover:text-white text-xs font-semibold rounded px-3 py-2"
              >
                Update
              </button>
            </form>
            <p className="text-[11px] text-steel-light mt-2">
              Admin override — bypasses the per-document review flow. Use with care.
            </p>
          </div>

          <div className="bg-white border border-border rounded px-5 py-4.5">
            <h3 className="font-mono text-[11px] uppercase tracking-wide text-navy mb-3">Account access</h3>
            <form
              action={async () => {
                "use server";
                await setSuspended(contractor.user_id, !contractor.is_suspended);
              }}
            >
              <button
                type="submit"
                className={`text-xs font-semibold rounded px-4 py-2 w-full ${
                  contractor.is_suspended
                    ? "bg-green-tint text-green"
                    : "bg-red-tint text-red"
                }`}
              >
                {contractor.is_suspended ? "Reactivate account" : "Suspend account"}
              </button>
            </form>
            <p className="text-[11px] text-steel-light mt-2">
              {contractor.is_suspended
                ? "This contractor can't view projects, drawings, or submit offers until reactivated."
                : "Immediately blocks the contractor from the feed and offers, without deleting anything."}
            </p>
          </div>

          <div className="bg-white border border-red/30 rounded px-5 py-4.5">
            <h3 className="font-mono text-[11px] uppercase tracking-wide text-red mb-3">Danger zone</h3>
            <DeleteContractorForm contractorId={contractor.user_id} companyName={contractor.company_name} />
          </div>
        </div>
      </div>
    </main>
  );
}
