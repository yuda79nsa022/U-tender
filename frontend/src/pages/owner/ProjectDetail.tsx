import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, API_URL } from "@/api/client";
import type { Offer, ProjectDetail } from "@/api/types";
import { timeRemaining, stars } from "@/lib/format";
import { RatingInput } from "@/components/RatingInput";

interface Review {
  id: string;
  project_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

function statusBadgeClasses(status: string) {
  switch (status) {
    case "open":
      return "bg-green-tint text-green";
    case "awarded":
      return "bg-amber/15 text-amber-dark";
    case "closed":
      return "bg-blue-tint text-blue";
    default:
      return "bg-red-tint text-red";
  }
}

export function OwnerProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

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
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["owner-offers", id] });
      queryClient.invalidateQueries({ queryKey: ["owner-projects"] });
    },
  });

  const addDrawingsMutation = useMutation({
    mutationFn: (formData: FormData) => apiFetch(`/projects/${id}/drawings`, { method: "POST", formData }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", id] }),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/owner/reviews`, {
        method: "POST",
        body: { project_id: id, contractor_id: approvedOffer?.contractor_id, rating, comment: comment || null },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["owner-review", id] }),
  });

  if (!project) return null;

  const deadlinePassed = new Date(project.bid_deadline) < new Date();

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">{project.title}</span>
          <h1 className="font-display text-2xl font-semibold text-navy mb-1">Review offers</h1>
          <p className="text-[13.5px] text-steel">{project.address}</p>
        </div>
        <span className={`font-mono text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-full ${statusBadgeClasses(project.status)}`}>
          {project.status}
        </span>
      </div>

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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              addDrawingsMutation.mutate(form);
              e.currentTarget.reset();
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
                      {project.status === "awarded" ? (
                        <span
                          className={`font-mono text-[10px] uppercase px-2 py-1 rounded-full ${
                            o.status === "approved" ? "bg-green-tint text-green" : "bg-border text-steel"
                          }`}
                        >
                          {o.status}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => approveMutation.mutate(o.id)}
                          disabled={approveMutation.isPending}
                          className="bg-navy hover:bg-navy-deep disabled:opacity-60 text-white text-xs font-semibold rounded px-3 py-1.5"
                        >
                          Approve
                        </button>
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
