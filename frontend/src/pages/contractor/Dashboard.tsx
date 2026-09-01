import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { ContractorProfile, OfferStatus, ProjectStatus } from "@/api/types";
import { PageLoading } from "@/components/PageLoading";

interface MyBid {
  project_id: string;
  project_title: string;
  project_address: string;
  project_status: ProjectStatus;
  bid_deadline: string;
  offer_id: string;
  amount: string;
  offer_status: OfferStatus;
  revision: number;
  updated_at: string;
}

const STATUS_BANNER: Record<
  string,
  { tone: "green" | "blue" | "amber" | "red"; title: string; body: string; cta?: { label: string; href: string } }
> = {
  documents_incomplete: {
    tone: "amber",
    title: "Finish verifying your company",
    body: "Upload your documents so an admin can review your account.",
    cta: { label: "Continue verification", href: "/contractor/verify" },
  },
  submitted_for_review: {
    tone: "blue",
    title: "Application under review",
    body: "An admin is reviewing your documents. We'll notify you once a decision is made.",
    cta: { label: "View submission", href: "/contractor/status" },
  },
  changes_requested: {
    tone: "red",
    title: "Changes requested",
    body: "One or more documents need to be re-uploaded before your account can be approved.",
    cta: { label: "Review and re-upload", href: "/contractor/status" },
  },
  payment_required: {
    tone: "amber",
    title: "Subscribe to unlock bidding",
    body: "You're verified — subscribe to view drawings and submit offers.",
    cta: { label: "View plans", href: "/contractor/subscribe" },
  },
  payment_restricted: {
    tone: "red",
    title: "Payment issue on your account",
    body: "Your subscription payment failed or is past due. Update billing to keep bidding.",
    cta: { label: "Manage billing", href: "/contractor/subscribe" },
  },
  suspended: {
    tone: "red",
    title: "Account suspended",
    body: "Your account has been suspended by a site admin. Contact support if you believe this is a mistake.",
  },
};

function bannerClasses(tone: "green" | "blue" | "amber" | "red") {
  switch (tone) {
    case "green":
      return "border-green bg-green-tint text-green";
    case "blue":
      return "border-blue bg-blue-tint text-blue";
    case "red":
      return "border-red bg-red-tint text-red";
    default:
      return "border-amber bg-amber/10 text-amber-dark";
  }
}

function offerStatusBadge(status: OfferStatus) {
  switch (status) {
    case "approved":
      return "bg-green-tint text-green";
    case "rejected":
      return "bg-border text-steel";
    case "withdrawn":
      return "bg-border text-steel-light";
    default:
      return "bg-blue-tint text-blue";
  }
}

export function ContractorDashboardPage() {
  const { data: profile } = useQuery({
    queryKey: ["contractor-profile"],
    queryFn: () => apiFetch<ContractorProfile>("/contractor/profile"),
  });
  const { data: bids } = useQuery({
    queryKey: ["contractor-my-bids"],
    queryFn: () => apiFetch<MyBid[]>("/contractor/my-bids"),
    enabled: !!profile,
  });

  if (!profile) return <PageLoading />;

  const banner = STATUS_BANNER[profile.marketplace_status];
  const isActive = profile.marketplace_status === "verified_active";
  const activeBids = bids?.filter((b) => b.offer_status === "submitted" && b.project_status === "open").length ?? 0;
  const won = bids?.filter((b) => b.offer_status === "approved").length ?? 0;
  const totalBids = bids?.length ?? 0;

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <div className="mb-6">
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">Contractor</span>
        <h1 className="font-display text-2xl font-semibold text-navy mb-1">{profile.company_name}</h1>
      </div>

      {banner && (
        <div className={`border border-l-4 rounded px-5 py-4 mb-6 flex items-center justify-between flex-wrap gap-3 ${bannerClasses(banner.tone)}`}>
          <div>
            <div className="font-display font-semibold text-sm">{banner.title}</div>
            <p className="text-[13px] mt-1 opacity-90">{banner.body}</p>
          </div>
          {banner.cta && (
            <Link
              to={banner.cta.href}
              className="bg-navy hover:bg-navy-deep text-white text-xs font-semibold rounded px-4 py-2 whitespace-nowrap"
            >
              {banner.cta.label}
            </Link>
          )}
        </div>
      )}

      {isActive && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="border border-border bg-white rounded px-4 py-3">
              <div className="font-display text-2xl font-semibold text-navy leading-none">{activeBids}</div>
              <div className="font-mono text-[10px] uppercase tracking-wide text-steel mt-1">Active bids</div>
            </div>
            <div className="border border-border bg-white rounded px-4 py-3">
              <div className="font-display text-2xl font-semibold text-green leading-none">{won}</div>
              <div className="font-mono text-[10px] uppercase tracking-wide text-steel mt-1">Projects won</div>
            </div>
            <div className="border border-border bg-white rounded px-4 py-3">
              <div className="font-display text-2xl font-semibold text-navy leading-none">{totalBids}</div>
              <div className="font-mono text-[10px] uppercase tracking-wide text-steel mt-1">Total bids placed</div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono text-[11px] uppercase tracking-wide text-navy">My bids</h2>
            <Link to="/contractor/feed" className="text-xs text-navy underline">
              Browse open projects
            </Link>
          </div>

          {!bids?.length ? (
            <div className="border border-dashed border-border rounded p-10 text-center text-sm text-steel">
              You haven't placed any bids yet.{" "}
              <Link to="/contractor/feed" className="text-navy underline">
                Browse open projects
              </Link>
              .
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {bids.map((b) => (
                <Link key={b.offer_id} to={`/contractor/projects/${b.project_id}/offer`} className="tblock rounded px-5 pt-4">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h3 className="font-display font-semibold text-[15px] mb-0.5">{b.project_title}</h3>
                      <p className="text-[12px] text-steel mb-2">{b.project_address}</p>
                    </div>
                    <span className={`font-mono text-[10px] uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${offerStatusBadge(b.offer_status)}`}>
                      {b.offer_status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-navy font-semibold">${Number(b.amount).toLocaleString()}</span>
                    <span className="text-steel-light">{b.project_status.replace(/_/g, " ")}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
