import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { stars } from "@/lib/format";

function statusBadge(status: string) {
  switch (status) {
    case "approved":
      return "bg-green-tint text-green";
    case "changes_requested":
      return "bg-red-tint text-red";
    case "pending_review":
      return "bg-amber/15 text-amber-dark";
    default:
      return "bg-blue-tint text-steel";
  }
}

export default async function AdminContractorsPage() {
  const supabase = createClient();
  const { data: contractors } = await supabase
    .from("contractor_profiles")
    .select("*, profiles(full_name)")
    .order("company_name", { ascending: true });

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <div className="mb-6">
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">
          Admin · Contractors
        </span>
        <h1 className="font-display text-2xl font-semibold text-navy mb-1">All contractors</h1>
        <p className="text-[13.5px] text-steel">
          {contractors?.length ?? 0} total. Edit details, change verification status, suspend, or delete.
        </p>
      </div>

      {!contractors?.length ? (
        <div className="border border-dashed border-border rounded p-10 text-center text-sm text-steel">
          No contractors have signed up yet.
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">
                Company
              </th>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">
                Status
              </th>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">
                Subscription
              </th>
              <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">
                Rating
              </th>
              <th className="border-b-2 border-navy py-2 px-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {contractors.map((c: any) => (
              <tr key={c.user_id} className="border-b border-border">
                <td className="py-3 px-2.5">
                  <div className="font-display font-semibold text-[13.5px]">{c.company_name}</div>
                  <div className="text-[11.5px] text-steel-light">
                    {c.profiles?.full_name} · {c.primary_trade || "Trade not set"}
                  </div>
                </td>
                <td className="py-3 px-2.5">
                  <div className="flex flex-col gap-1 items-start">
                    <span className={`font-mono text-[10px] uppercase px-2 py-0.5 rounded-full ${statusBadge(c.verification_status)}`}>
                      {c.verification_status.replace("_", " ")}
                    </span>
                    {c.is_suspended && (
                      <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded-full bg-red-tint text-red">
                        Suspended
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-2.5 font-mono text-xs text-steel">{c.subscription_status || "none"}</td>
                <td className="py-3 px-2.5">
                  <span className="text-amber text-[11px]">{stars(c.avg_rating)}</span>{" "}
                  <span className="font-mono text-[11px] text-steel">({c.review_count})</span>
                </td>
                <td className="py-3 px-2.5">
                  <Link
                    href={`/admin/contractors/${c.user_id}`}
                    className="border border-navy text-navy hover:bg-navy hover:text-white text-xs font-semibold rounded px-3 py-1.5"
                  >
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
