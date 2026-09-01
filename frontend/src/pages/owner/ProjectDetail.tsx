import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError, API_URL } from "@/api/client";
import type { Drawing, Offer, ProjectDetail } from "@/api/types";
import { timeRemaining, stars } from "@/lib/format";
import { RatingInput } from "@/components/RatingInput";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PageLoading } from "@/components/PageLoading";
import { ClarificationsPanel } from "@/components/ClarificationsPanel";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.detail : fallback;
}

interface Review {
  id: string;
  project_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

function DrawingHistory({ projectId }: { projectId: string }) {
  const { data: history } = useQuery({
    queryKey: ["drawing-history", projectId],
    queryFn: () => apiFetch<Drawing[]>(`/projects/${projectId}/drawings/history`),
  });

  if (!history?.length) return <p className="mt-2 font-mono text-[10.5px] text-steel-light">No revision history yet.</p>;

  return (
    <ul className="mt-2 space-y-1 border-t border-white/20 pt-2">
      {history.map((d) => (
        <li key={d.id} className={`font-mono text-[10.5px] ${d.is_current ? "text-white" : "text-white/40"}`}>
          v{d.revision} · {d.file_name} {d.is_current && "(current)"}{" "}
          {d.url && (
            <a href={d.url} target="_blank" rel="noreferrer" className="underline">
              view
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function statusBadgeClasses(status: string) {
  switch (status) {
    case "open":
      return "bg-green-tint text-green";
    case "awarded":
      return "bg-amber/15 text-amber-dark";
    case "closed":
    case "under_evaluation":
      return "bg-blue-tint text-blue";
    case "draft":
      return "bg-border text-steel";
    default:
      // no_award, canceled, expired
      return "bg-red-tint text-red";
  }
}

export function OwnerProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const drawingsFormRef = useRef<HTMLFormElement>(null);

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: () => apiFetch<ProjectDetail>(`/projects/${id}`),
    enabled: !!id,
  });

  const { data: offers } = useQuery({
    queryKey: ["owner-offers", id],
    queryFn: () => apiFetch<Offer[]>(`/owner/projects/${id}/offers`),
    enabled: !!id,
  });

  const { data: existingReview } = useQuery({
    queryKey: ["owner-review", id],
    queryFn: () => apiFetch<Review | null>(`/owner/projects/${id}/review`),
    enabled: !!id && project?.status === "awarded",
  });

  const approvedOffer = offers?.find((o) => o.status === "approved");

  const approveMutation = useMutation({
    mutationFn: (offerId: string) => apiFetch(`/owner/projects/${id}/offers/${offerId}/approve`, { method: "POST" }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["owner-offers", id] });
      queryClient.invalidateQueries({ queryKey: ["owner-projects"] });
    },
    onError: (err) => setError(errorMessage(err, "Could not approve this offer.")),
  });

  const addDrawingsMutation = useMutation({
    mutationFn: (formData: FormData) => apiFetch(`/projects/${id}/drawings`, { method: "POST", formData }),
    onSuccess: () => {
      setError(null);
      drawingsFormRef.current?.reset();
      queryClient.invalidateQueries({ queryKey: ["project", id] });
    },
    onError: (err) => setError(errorMessage(err, "Could not add drawings.")),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/owner/reviews`, {
        method: "POST",
        body: { project_id: id, contractor_id: approvedOffer?.contractor_id, rating, comment: comment || null },
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["owner-review", id] });
    },
    onError: (err) => setError(errorMessage(err, "Could not submit review.")),
  });

  const lifecycleMutation = useMutation({
    mutationFn: (action: "publish" | "close" | "start-evaluation" | "no-award" | "cancel") =>
      apiFetch(`/owner/projects/${id}/${action}`, { method: "POST" }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["owner-projects"] });
    },
    onError: (err) => setError(errorMessage(err, "Could not update this project's status.")),
  });

  if (!project) return <PageLoading />;

  const deadlinePassed = new Date(project.bid_deadline) < new Date();

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">{project.title}</span>
          <h1 className="font-display text-2xl font-semibold text-navy mb-1">Review offers</h1>
          <p className="text-[13.5px] text-steel">{project.address}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-full bg-blue-tint text-steel">
            {project.tender_type === "sealed" ? "Sealed" : "Owner-visible"}
          </span>
          <span className={`font-mono text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-full ${statusBadgeClasses(project.status)}`}>
            {project.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      <ErrorBanner message={error} />

      {(project.status === "draft" ||
        project.status === "open" ||
        project.status === "closed" ||
        project.status === "under_evaluation") && (
        <div className="flex flex-wrap gap-2 mb-6">
          {project.status === "draft" && (
            <button
              type="button"
              onClick={() => lifecycleMutation.mutate("publish")}
              disabled={lifecycleMutation.isPending}
              className="bg-amber hover:bg-amber-dark disabled:opacity-60 text-white text-xs font-semibold rounded px-4 py-2"
            >
              Publish — start accepting bids
            </button>
          )}
          {project.status === "open" && (
            <button
              type="button"
              onClick={() => lifecycleMutation.mutate("close")}
              disabled={lifecycleMutation.isPending}
              className="border border-navy text-navy hover:bg-navy hover:text-white disabled:opacity-60 text-xs font-semibold rounded px-4 py-2"
            >
              Close bidding early
            </button>
          )}
          {project.status === "closed" && (
            <button
              type="button"
              onClick={() => lifecycleMutation.mutate("start-evaluation")}
              disabled={lifecycleMutation.isPending}
              className="border border-navy text-navy hover:bg-navy hover:text-white disabled:opacity-60 text-xs font-semibold rounded px-4 py-2"
            >
              Start evaluation
            </button>
          )}
          {(project.status === "closed" || project.status === "under_evaluation") && (
            <button
              type="button"
              onClick={() => lifecycleMutation.mutate("no-award")}
              disabled={lifecycleMutation.isPending}
              className="bg-red-tint text-red text-xs font-semibold rounded px-4 py-2"
            >
              Mark no award
            </button>
          )}
          <button
            type="button"
            onClick={() => lifecycleMutation.mutate("cancel")}
            disabled={lifecycleMutation.isPending}
            className="text-xs text-red underline disabled:opacity-60"
          >
            Cancel project
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-6 items-start">
        <div>
          <div className="aspect-[4/3] bg-navy rounded flex flex-col items-center justify-center gap-2 text-white/60 font-mono text-xs text-center px-4">
            {project.drawings.length ? (
              <ul className="space-y-2">
                {project.drawings.map((d) => (
                  <li key={d.id}>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="text-white underline">
                        {d.file_name}
                      </a>
                    ) : (
                      <span>{d.file_name}</span>
                    )}
                    {d.revision > 1 && <span className="text-white/50"> · v{d.revision}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <span>No drawings uploaded yet</span>
            )}
          </div>

          {project.drawings.length > 0 && (
            <a href={`${API_URL}/projects/${project.id}/drawings-zip`} className="mt-2.5 inline-block font-mono text-xs text-blue underline">
              Download all as .zip ({project.drawings.length} file{project.drawings.length === 1 ? "" : "s"})
            </a>
          )}
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="mt-2.5 block font-mono text-xs text-steel underline"
          >
            {showHistory ? "Hide" : "View"} revision history
          </button>
          {showHistory && <DrawingHistory projectId={project.id} />}

          <form
            ref={drawingsFormRef}
            onSubmit={(e) => {
              e.preventDefault();
              addDrawingsMutation.mutate(new FormData(e.currentTarget));
            }}
            className="mt-3.5 flex items-center gap-2"
          >
            <input type="file" name="drawings" multiple accept=".pdf,.dwg,.jpg,.jpeg,.png,.zip" className="text-[11px] flex-1" />
            <button
              type="submit"
              className="border border-navy text-navy hover:bg-navy hover:text-white text-xs font-semibold rounded px-3 py-1.5 whitespace-nowrap"
            >
              Add drawings
            </button>
          </form>
          <p className="text-[10.5px] text-steel-light mt-1">You can also upload a .zip folder of drawings.</p>
          <div
            className={`mt-3.5 px-3.5 py-3 rounded font-mono text-xs border-l-[3px] ${
              deadlinePassed ? "bg-red-tint text-red border-red" : "bg-blue-tint text-blue border-blue"
            }`}
          >
            ⏱ {timeRemaining(project.bid_deadline)} — {new Date(project.bid_deadline).toLocaleString()}
          </div>
          {project.description && (
            <div className="mt-4 text-sm text-steel">
              <h3 className="font-mono text-[11px] uppercase tracking-wide text-navy mb-1">Scope</h3>
              {project.description}
            </div>
          )}
          <div className="mt-4">
            <ClarificationsPanel projectId={project.id} role="owner" />
          </div>
        </div>

        <div>
          {!offers?.length ? (
            <div className="border border-dashed border-border rounded p-8 text-center text-sm text-steel">
              No offers yet. Contractors can bid until the deadline above.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">Contractor</th>
                  <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">Rating</th>
                  <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">Bid</th>
                  <th className="font-mono text-[10px] uppercase tracking-wide text-steel text-left border-b-2 border-navy py-2 px-2.5">Timeline</th>
                  <th className="border-b-2 border-navy py-2 px-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id} className="border-b border-border">
                    <td className="py-3 px-2.5">
                      <div className="font-display font-semibold text-[13.5px]">{o.contractor_company_name ?? "Contractor"}</div>
                      {o.message && <div className="text-xs text-steel-light mt-0.5 max-w-xs">{o.message}</div>}
                    </td>
                    <td className="py-3 px-2.5">
                      <span className="text-amber text-[11px] tracking-tight">{stars(Number(o.contractor_avg_rating ?? 0))}</span>{" "}
                      <span className="font-mono text-[11px] text-steel">({o.contractor_review_count ?? 0})</span>
                    </td>
                    <td className="py-3 px-2.5 font-mono font-semibold text-navy text-sm">${Number(o.amount).toLocaleString()}</td>
                    <td className="py-3 px-2.5 font-mono text-xs">{o.timeline_estimate || "—"}</td>
                    <td className="py-3 px-2.5">
                      {project.status === "awarded" || project.status === "no_award" ? (
                        <span
                          className={`font-mono text-[10px] uppercase px-2 py-1 rounded-full ${
                            o.status === "approved" ? "bg-green-tint text-green" : "bg-border text-steel"
                          }`}
                        >
                          {o.status}
                        </span>
                      ) : project.status === "closed" || project.status === "under_evaluation" ? (
                        <button
                          type="button"
                          onClick={() => approveMutation.mutate(o.id)}
                          disabled={approveMutation.isPending}
                          className="bg-navy hover:bg-navy-deep disabled:opacity-60 text-white text-xs font-semibold rounded px-3 py-1.5"
                        >
                          Approve
                        </button>
                      ) : (
                        <span className="font-mono text-[10px] text-steel-light">Close bidding to award</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {approvedOffer && (
        <div className="mt-8 max-w-xl">
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-navy mb-2">
            Rate {approvedOffer.contractor_company_name ?? "the contractor"}
          </h3>
          {existingReview ? (
            <div className="bg-white border border-border rounded px-4.5 py-4">
              <span className="text-amber text-lg tracking-tight">{stars(existingReview.rating)}</span>
              {existingReview.comment && <p className="text-sm text-steel mt-2">{existingReview.comment}</p>}
              <p className="font-mono text-[10.5px] text-steel-light mt-2">
                Submitted {new Date(existingReview.created_at).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                reviewMutation.mutate();
              }}
              className="bg-white border border-border rounded px-4.5 py-4 grid gap-3.5"
            >
              <RatingInput value={rating} onChange={setRating} />
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="How did the work go? Optional, but helps other owners."
                className="w-full border border-border rounded px-3 py-2.5 text-sm resize-y"
              />
              <button
                type="submit"
                disabled={!rating || reviewMutation.isPending}
                className="bg-amber hover:bg-amber-dark disabled:opacity-60 text-white font-semibold text-sm rounded px-5 py-2.5 w-fit"
              >
                Submit review
              </button>
            </form>
          )}
        </div>
      )}
    </main>
  );
}
