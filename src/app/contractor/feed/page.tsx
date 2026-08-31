import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDeadline, timeRemaining } from "@/lib/format";

export default async function ContractorFeedPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: contractorProfile } = await supabase
    .from("contractor_profiles")
    .select("subscription_status")
    .eq("user_id", user.id)
    .single();

  const isSubscribed =
    contractorProfile?.subscription_status === "active" || contractorProfile?.subscription_status === "trialing";

  // RLS already restricts this to open/closed/awarded projects visible to
  // approved contractors — we don't need to filter by status client-side,
  // but we do want open ones sorted soonest-closing-first.
  const { data: projects } = await supabase
    .from("projects")
    .select("*, offers(count)")
    .eq("status", "open")
    .order("bid_deadline", { ascending: true });

  // Which of these has this contractor already bid on?
  const { data: myOffers } = await supabase
    .from("offers")
    .select("project_id, status")
    .eq("contractor_id", user.id);
  const myOfferByProject = new Map((myOffers ?? []).map((o) => [o.project_id, o.status]));

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <div className="mb-6">
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">
          Contractor · Open projects
        </span>
        <h1 className="font-display text-2xl font-semibold text-navy mb-1">Projects open for bidding</h1>
        <p className="text-[13.5px] text-steel">Sorted by closing soonest.</p>
      </div>

      {!isSubscribed && (
        <div className="bg-blue-tint border border-blue rounded px-5 py-4 mb-6 flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-navy">
            You&apos;re approved, but drawings and offers stay locked until you subscribe.
          </p>
          <Link
            href="/contractor/subscribe"
            className="bg-amber hover:bg-amber-dark text-white text-xs font-semibold rounded px-4 py-2 whitespace-nowrap"
          >
            View plans
          </Link>
        </div>
      )}

      {!projects?.length && (
        <div className="border border-dashed border-border rounded p-10 text-center text-sm text-steel">
          No open projects right now. Check back soon.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {projects?.map((p) => {
          const offerCount = (p.offers as unknown as { count: number }[])?.[0]?.count ?? 0;
          const myStatus = myOfferByProject.get(p.id);
          const card = (
            <div className="tblock rounded px-5 pt-4 relative overflow-hidden h-full">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h3 className="font-display font-semibold text-[16.5px] mb-0.5">{p.title}</h3>
                  <p className="text-[12.5px] text-steel mb-3">{p.address}</p>
                </div>
                {myStatus && (
                  <span className="font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-tint text-green whitespace-nowrap">
                    {myStatus === "submitted" ? "Bid placed" : myStatus}
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-blue">{timeRemaining(p.bid_deadline)}</p>
              <div className="tblock-strip mt-4">
                <div className="tblock-field">
                  <span className="k">Deadline</span>
                  <span className="v">{formatDeadline(p.bid_deadline)}</span>
                </div>
                <div className="tblock-field">
                  <span className="k">Offers so far</span>
                  <span className="v">{offerCount}</span>
                </div>
                <div className="tblock-field">
                  <span className="k">Trade</span>
                  <span className="v">{p.trade || "—"}</span>
                </div>
              </div>

              {!isSubscribed && (
                <div className="absolute inset-0 bg-navy/90 flex flex-col items-center justify-center text-center gap-2.5 px-4">
                  <div className="text-xl">🔒</div>
                  <strong className="font-display text-white text-sm">Subscribe to view drawings</strong>
                  <p className="text-[11.5px] text-white/70 max-w-[220px]">
                    Unlock full drawings, scope details, and the ability to submit offers.
                  </p>
                </div>
              )}
            </div>
          );

          return isSubscribed ? (
            <Link key={p.id} href={`/contractor/projects/${p.id}/offer`}>
              {card}
            </Link>
          ) : (
            <div key={p.id}>{card}</div>
          );
        })}
      </div>
    </main>
  );
}
