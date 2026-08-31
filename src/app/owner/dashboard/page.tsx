import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDeadline } from "@/lib/format";

function badgeClasses(status: string) {
  switch (status) {
    case "open":
      return "bg-green-tint text-green";
    case "closed":
      return "bg-blue-tint text-blue";
    case "awarded":
      return "bg-amber/15 text-amber-dark";
    default:
      return "bg-red-tint text-red";
  }
}

export default async function OwnerDashboard() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projects } = await supabase
    .from("projects")
    .select("*, offers(count)")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">
            Owner dashboard
          </span>
          <h1 className="font-display text-2xl font-semibold text-navy">Your projects</h1>
        </div>
        <Link
          href="/owner/projects/new"
          className="bg-amber hover:bg-amber-dark text-white font-semibold text-sm rounded px-5 py-2.5"
        >
          + New project
        </Link>
      </div>

      {!projects?.length && (
        <div className="border border-dashed border-border rounded p-10 text-center text-sm text-steel">
          You haven&apos;t posted a project yet.{" "}
          <Link href="/owner/projects/new" className="text-navy underline">
            Post your first one
          </Link>{" "}
          to start receiving offers.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {projects?.map((p) => {
          const offerCount = (p.offers as unknown as { count: number }[])?.[0]?.count ?? 0;
          const deadlinePassed = new Date(p.bid_deadline) < new Date();
          return (
            <Link key={p.id} href={`/owner/projects/${p.id}`} className="tblock rounded px-5 pt-4">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h3 className="font-display font-semibold text-[16.5px] mb-0.5">{p.title}</h3>
                  <p className="text-[12.5px] text-steel mb-3">{p.address}</p>
                </div>
                <span className={`font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${badgeClasses(p.status)}`}>
                  {p.status}
                </span>
              </div>
              <p className="font-mono text-xs text-blue">
                {offerCount} offer{offerCount === 1 ? "" : "s"} received
                {p.status === "open" && deadlinePassed && (
                  <span className="text-amber-dark"> · deadline passed, ready to review</span>
                )}
              </p>
              <div className="tblock-strip mt-4">
                <div className="tblock-field">
                  <span className="k">Deadline</span>
                  <span className="v">{formatDeadline(p.bid_deadline)}</span>
                </div>
                <div className="tblock-field">
                  <span className="k">Trade</span>
                  <span className="v">{p.trade || "—"}</span>
                </div>
                <div className="tblock-field">
                  <span className="k">Posted</span>
                  <span className="v">{new Date(p.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
