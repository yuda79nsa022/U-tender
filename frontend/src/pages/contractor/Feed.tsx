import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { ContractorProfile, Project } from "@/api/types";
import { formatDeadline, timeRemaining } from "@/lib/format";
import { QueryError } from "@/components/QueryError";

export function ContractorFeedPage() {
  const { data: profile } = useQuery({
    queryKey: ["contractor-profile"],
    queryFn: () => apiFetch<ContractorProfile>("/contractor/profile"),
  });
  const {
    data: projects,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["contractor-feed"],
    queryFn: () => apiFetch<Project[]>("/contractor/feed"),
  });

  const isSubscribed = profile?.subscription_status === "active" || profile?.subscription_status === "trialing";

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <div className="mb-6">
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">Contractor · Open projects</span>
        <h1 className="font-display text-2xl font-semibold text-navy mb-1">Projects open for bidding</h1>
        <p className="text-[13.5px] text-steel">Sorted by closing soonest.</p>
      </div>

      {!isSubscribed && (
        <div className="bg-blue-tint border border-blue rounded px-5 py-4 mb-6 flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-navy">You're approved, but drawings and offers stay locked until you subscribe.</p>
          <Link to="/contractor/subscribe" className="bg-amber hover:bg-amber-dark text-white text-xs font-semibold rounded px-4 py-2 whitespace-nowrap">
            View plans
          </Link>
        </div>
      )}

      {isError && <QueryError onRetry={() => refetch()} />}

      {!isError && !projects?.length && (
        <div className="border border-dashed border-border rounded p-10 text-center text-sm text-steel">
          No open projects right now. Check back soon.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {projects?.map((p) => {
          const card = (
            <div className="tblock rounded px-5 pt-4 relative overflow-hidden h-full">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h3 className="font-display font-semibold text-[16.5px] mb-0.5">{p.title}</h3>
                  <p className="text-[12.5px] text-steel mb-3">{p.address}</p>
                </div>
                {p.my_offer_status && (
                  <span className="font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-tint text-green whitespace-nowrap">
                    {p.my_offer_status === "submitted" ? "Bid placed" : p.my_offer_status}
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
                  <span className="v">{p.offer_count}</span>
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
            <Link key={p.id} to={`/contractor/projects/${p.id}/offer`}>
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
