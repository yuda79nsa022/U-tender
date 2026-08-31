import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { uploadDocument } from "../verify/actions";

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

export default async function ContractorStatusPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("contractor_profiles").select("*").eq("user_id", user.id).single();
  if (!profile) redirect("/contractor/verify");

  const { data: docs } = await supabase
    .from("contractor_documents")
    .select("*, document_requirements(name, description, is_required)")
    .eq("contractor_id", user.id);

  if (profile.is_suspended) {
    return (
      <main className="max-w-2xl mx-auto px-5 py-8">
        <div className="bg-white border border-red border-l-4 rounded px-5 py-4">
          <div className="font-display font-semibold text-navy">Account suspended</div>
          <p className="text-sm text-steel mt-1.5">
            Your account has been suspended by a site admin. You can&apos;t view new projects or submit
            offers while suspended. Contact support if you believe this is a mistake.
          </p>
        </div>
      </main>
    );
  }

  if (profile.verification_status === "approved") {
    return (
      <main className="max-w-2xl mx-auto px-5 py-8">
        <div className="bg-white border border-green border-l-4 rounded px-5 py-4">
          <div className="font-display font-semibold text-navy">You&apos;re approved</div>
          <p className="text-sm text-steel mt-1.5">
            Head to the{" "}
            <a href="/contractor/feed" className="text-navy underline">
              feed
            </a>{" "}
            to browse open projects.
          </p>
        </div>
      </main>
    );
  }

  const bannerClasses =
    profile.verification_status === "changes_requested" ? "border-red" : "border-amber";
  const bannerTitle =
    profile.verification_status === "changes_requested"
      ? "Changes requested — one or more documents need to be re-uploaded"
      : "Application under review";

  return (
    <main className="max-w-3xl mx-auto px-5 py-8">
      <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">
        Contractor · Account verification
      </span>
      <h1 className="font-display text-2xl font-semibold text-navy mb-1">Application status</h1>
      <p className="text-[13.5px] text-steel mb-6">{profile.company_name}</p>

      <div className={`bg-white border border-l-4 rounded px-5 py-4 mb-6 flex items-center justify-between flex-wrap gap-3 ${bannerClasses}`}>
        <div>
          <div className="font-display font-semibold text-navy text-sm">{bannerTitle}</div>
          <div className="font-mono text-[11px] text-steel mt-1">
            Submitted {new Date(profile.created_at).toLocaleDateString()}
          </div>
        </div>
        <span className={`font-mono text-[10px] uppercase px-2.5 py-1 rounded-full ${statusBadge(profile.verification_status === "pending_review" ? "pending" : "rejected")}`}>
          {profile.verification_status === "pending_review" ? "Pending" : "Action needed"}
        </span>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2">
              Document
            </th>
            <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2">
              Status
            </th>
            <th className="border-b-2 border-navy py-2"></th>
          </tr>
        </thead>
        <tbody>
          {docs?.map((d: any) => (
            <tr key={d.id} className="border-b border-border">
              <td className="py-3.5">
                <div className="font-display font-semibold text-[13.5px]">{d.document_requirements?.name}</div>
                <span className="font-mono text-[9.5px] uppercase text-steel-light">
                  {d.document_requirements?.is_required ? "Required" : "Optional"}
                </span>
                {d.status === "rejected" && d.admin_note && (
                  <div className="mt-1.5 text-[11.5px] text-red bg-red-tint px-2.5 py-1.5 rounded font-mono">
                    Admin note: {d.admin_note}
                  </div>
                )}
              </td>
              <td className="py-3.5">
                <span className={`font-mono text-[10px] uppercase px-2 py-1 rounded-full ${statusBadge(d.status)}`}>
                  {d.status.replace("_", " ")}
                </span>
              </td>
              <td className="py-3.5">
                {(d.status === "not_submitted" || d.status === "rejected") && (
                  <form action={uploadDocument} className="flex items-center gap-2">
                    <input type="hidden" name="requirement_id" value={d.requirement_id} />
                    <input type="file" name="file" required className="text-xs w-32" />
                    <button
                      type="submit"
                      className="border border-navy text-navy hover:bg-navy hover:text-white text-xs font-semibold rounded px-3 py-1.5"
                    >
                      {d.status === "rejected" ? "Re-upload" : "Upload"}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-steel-light mt-4">
        You&apos;ll be notified as soon as your account is fully approved. Full access to drawings and
        offers stays locked until then.
      </p>
    </main>
  );
}
