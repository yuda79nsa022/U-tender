import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError, API_URL } from "@/api/client";
import type { Offer, ProjectDetail } from "@/api/types";
import { formatDeadline, timeRemaining } from "@/lib/format";
import { PageLoading } from "@/components/PageLoading";
import { ErrorBanner } from "@/components/ErrorBanner";

export function ContractorOfferPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [timeline, setTimeline] = useState("");
  const [message, setMessage] = useState("");

  const {
    data: project,
    isError: projectError,
  } = useQuery({
    queryKey: ["project", id],
    queryFn: () => apiFetch<ProjectDetail>(`/projects/${id}`),
    enabled: !!id,
  });

  // The backend 404s this endpoint identically whether the project doesn't
  // exist or this contractor doesn't currently have marketplace access to
  // it (unpaid, unverified, etc.) — by design, so the response can't be
  // used to enumerate projects. Land back on the feed with a plain notice
  // instead of spinning forever.
  useEffect(() => {
    if (projectError) {
      navigate("/contractor/feed", {
        replace: true,
        state: { notice: "That project isn't available to you right now." },
      });
    }
  }, [projectError, navigate]);

  const { data: existingOffer } = useQuery({
    queryKey: ["my-offer", id],
    queryFn: () => apiFetch<Offer | null>(`/projects/${id}/offers/mine`),
    enabled: !!id,
  });

  useEffect(() => {
    if (existingOffer) {
      setAmount(String(existingOffer.amount));
      setTimeline(existingOffer.timeline_estimate ?? "");
      setMessage(existingOffer.message ?? "");
    }
  }, [existingOffer]);

  const submitMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/projects/${id}/offers`, {
        method: "POST",
        body: { amount: Number(amount.replace(/[^0-9.]/g, "")), timeline_estimate: timeline || null, message: message || null },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-offer", id] });
      queryClient.invalidateQueries({ queryKey: ["contractor-feed"] });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () => apiFetch(`/projects/${id}/offers/withdraw`, { method: "POST" }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["my-offer", id] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.detail : "Could not withdraw offer."),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await submitMutation.mutateAsync();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not submit offer.");
    }
  }

  if (!project) return <PageLoading />;

  const biddingClosed = project.status !== "open" || new Date(project.bid_deadline) < new Date();

  return (
    <main className="max-w-4xl mx-auto px-5 py-8">
      <div className="bg-navy text-white rounded px-5 py-4 mb-6 flex items-center justify-between flex-wrap gap-2.5">
        <div>
          <div className="font-display font-semibold text-base">{project.title}</div>
          <div className="font-mono text-[11.5px] text-white/70 mt-0.5">
            {project.address} · Deadline {formatDeadline(project.bid_deadline)}
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-full bg-white/15">
          {biddingClosed ? "Closed" : timeRemaining(project.bid_deadline)}
        </span>
      </div>

      {project.description && (
        <div className="mb-6 text-sm text-steel">
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-navy mb-1">Scope</h3>
          {project.description}
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-navy">Drawings</h3>
          {project.drawings.length > 1 && (
            <a href={`${API_URL}/projects/${project.id}/drawings-zip`} className="font-mono text-[11px] text-blue underline">
              Download all as .zip
            </a>
          )}
        </div>
        {project.drawings.length ? (
          <ul className="flex flex-wrap gap-2">
            {project.drawings.map((d) => (
              <li key={d.id}>
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-blue underline bg-blue-tint px-3 py-1.5 rounded">
                    {d.file_name}
                    {d.revision > 1 && <span className="text-blue/60"> · v{d.revision}</span>}
                  </a>
                ) : (
                  <span className="font-mono text-xs text-steel">{d.file_name}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-steel-light">No drawings were uploaded for this project.</p>
        )}
      </div>

      <ErrorBanner message={error} />

      {biddingClosed ? (
        <div className="border border-dashed border-border rounded p-6 text-sm text-steel">
          Bidding on this project has closed.
          {existingOffer && (
            <div className="mt-3 font-mono text-xs text-navy">
              Your final offer: ${Number(existingOffer.amount).toLocaleString()} — status: {existingOffer.status}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
          <form onSubmit={handleSubmit} className="grid gap-[18px]">
            <div>
              <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">Your bid amount (USD)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder="8,400"
                className="w-full border border-border rounded px-3 py-2.5 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">Estimated timeline</label>
              <input
                value={timeline}
                onChange={(e) => setTimeline(e.target.value)}
                placeholder="e.g. 3 weeks from start"
                className="w-full border border-border rounded px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">Message to owner</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Outline your approach, materials, and anything the drawings don't cover."
                className="w-full border border-border rounded px-3 py-2.5 text-sm resize-y"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={submitMutation.isPending}
                className="bg-amber hover:bg-amber-dark disabled:opacity-60 text-white font-semibold text-sm rounded px-5 py-2.5 w-fit"
              >
                {existingOffer ? "Update offer" : "Submit offer"}
              </button>
              {existingOffer && existingOffer.status !== "withdrawn" && (
                <button
                  type="button"
                  onClick={() => withdrawMutation.mutate()}
                  disabled={withdrawMutation.isPending}
                  className="text-xs text-red underline disabled:opacity-60"
                >
                  {withdrawMutation.isPending ? "Withdrawing…" : "Withdraw offer"}
                </button>
              )}
            </div>
          </form>

          <div className="bg-white border border-border rounded px-4.5 py-4">
            <h3 className="font-mono text-[13px] uppercase tracking-wide text-navy mb-2">Tips for winning bids</h3>
            <ul className="text-[13px] text-steel leading-[1.7] list-disc pl-[18px]">
              <li>Reference specific details from the drawings — it signals you reviewed them closely.</li>
              <li>Owners can see your rating and past reviews next to your bid.</li>
              <li>You can revise your offer any time before the deadline.</li>
            </ul>
          </div>
        </div>
      )}
    </main>
  );
}
