import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { submitOffer, withdrawOffer } from "./actions";
import { drawingUrlExpirySeconds } from "@/lib/storage";
import { formatDeadline, timeRemaining } from "@/lib/format";

export default async function SubmitOfferPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase.from("projects").select("*").eq("id", params.id).single();
  if (!project) notFound();

  const { data: drawings } = await supabase
    .from("project_drawings")
    .select("*")
    .eq("project_id", project.id);

  const drawingLinks = await Promise.all(
    (drawings ?? []).map(async (d) => {
      const { data } = await supabase.storage
        .from("project-drawings")
        .createSignedUrl(d.file_path, drawingUrlExpirySeconds(project.bid_deadline));
      return { ...d, url: data?.signedUrl ?? null };
    })
  );

  const { data: existingOffer } = await supabase
    .from("offers")
    .select("*")
    .eq("project_id", project.id)
    .eq("contractor_id", user.id)
    .maybeSingle();

  const biddingClosed = project.status !== "open" || new Date(project.bid_deadline) < new Date();
  const boundSubmitOffer = submitOffer.bind(null, project.id);

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
          {drawingLinks.length > 1 && (
            <a
              href={`/api/projects/${project.id}/drawings-zip`}
              className="font-mono text-[11px] text-blue underline"
            >
              Download all as .zip
            </a>
          )}
        </div>
        {drawingLinks.length ? (
          <ul className="flex flex-wrap gap-2">
            {drawingLinks.map((d) => (
              <li key={d.id}>
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-blue underline bg-blue-tint px-3 py-1.5 rounded"
                  >
                    {d.file_name}
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

      {searchParams.error && (
        <p className="text-xs bg-red-tint text-red border border-red rounded px-3 py-2.5 mb-5 max-w-2xl">
          {searchParams.error}
        </p>
      )}

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
          <form action={boundSubmitOffer} className="grid gap-[18px]">
            <div>
              <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">
                Your bid amount (USD)
              </label>
              <input
                name="amount"
                required
                defaultValue={existingOffer ? existingOffer.amount : ""}
                placeholder="8,400"
                className="w-full border border-border rounded px-3 py-2.5 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">
                Estimated timeline
              </label>
              <input
                name="timeline_estimate"
                defaultValue={existingOffer?.timeline_estimate ?? ""}
                placeholder="e.g. 3 weeks from start"
                className="w-full border border-border rounded px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">
                Message to owner
              </label>
              <textarea
                name="message"
                rows={4}
                defaultValue={existingOffer?.message ?? ""}
                placeholder="Outline your approach, materials, and anything the drawings don't cover."
                className="w-full border border-border rounded px-3 py-2.5 text-sm resize-y"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="bg-amber hover:bg-amber-dark text-white font-semibold text-sm rounded px-5 py-2.5 w-fit"
              >
                {existingOffer ? "Update offer" : "Submit offer"}
              </button>
              {existingOffer && existingOffer.status !== "withdrawn" && (
                <form
                  action={async () => {
                    "use server";
                    await withdrawOffer(project.id);
                  }}
                >
                  <button type="submit" className="text-xs text-red underline">
                    Withdraw offer
                  </button>
                </form>
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
