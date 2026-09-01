import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, ApiError } from "@/api/client";
import type { ProjectDetail, TenderType } from "@/api/types";

export function OwnerProjectNewPage() {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tenderType, setTenderType] = useState<TenderType>("owner_visible");

  const defaultDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const defaultDeadlineValue = new Date(defaultDeadline.getTime() - defaultDeadline.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  async function submitProject(status: "draft" | "open") {
    setError(null);
    const formEl = formRef.current;
    if (!formEl) return;
    if (!formEl.reportValidity()) return;

    const form = new FormData(formEl);
    if (!form.get("title") || !form.get("address") || !form.get("bid_deadline")) {
      setError("Title, address, and deadline are required.");
      return;
    }
    form.set("tender_type", tenderType);
    form.set("status", status);

    setPending(true);
    try {
      const project = await apiFetch<ProjectDetail>("/projects", { method: "POST", formData: form });
      navigate(`/owner/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not create project.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-5 py-8">
      <span className="font-mono text-[10.5px] uppercase tracking-widest text-amber-dark block mb-1">New project</span>
      <h1 className="font-display text-2xl font-semibold text-navy mb-1">Post a project</h1>
      <p className="text-[13.5px] text-steel mb-6">
        Add your drawings and set a deadline — contractors can only bid before it closes.
      </p>

      {error && <p className="text-xs bg-red-tint text-red border border-red rounded px-3 py-2.5 mb-5 max-w-2xl">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            submitProject("open");
          }}
          className="grid gap-[18px]"
        >
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">Tender type</label>
            <div className="flex border border-navy rounded overflow-hidden w-fit">
              <button
                type="button"
                onClick={() => setTenderType("owner_visible")}
                className={`px-4 py-2 text-xs font-mono uppercase ${tenderType === "owner_visible" ? "bg-navy text-white" : "bg-white text-navy"}`}
              >
                Owner-visible
              </button>
              <button
                type="button"
                onClick={() => setTenderType("sealed")}
                className={`px-4 py-2 text-xs font-mono uppercase border-s border-navy ${tenderType === "sealed" ? "bg-navy text-white" : "bg-white text-navy"}`}
              >
                Sealed
              </button>
            </div>
            <p className="text-xs text-steel-light mt-1.5">
              {tenderType === "sealed"
                ? "Bids stay hidden from you until bidding closes. Locked in once the first bid arrives."
                : "You can see bids as they come in. Locked in once the first bid arrives."}
            </p>
          </div>
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">Project title</label>
            <input
              name="title"
              required
              placeholder="e.g. Maple St. Duplex — Roof Replacement"
              className="w-full border border-border rounded px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">Site address</label>
            <input name="address" required placeholder="Street, city, state" className="w-full border border-border rounded px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">Trade</label>
            <input name="trade" placeholder="e.g. Roofing, Framing, Fencing" className="w-full border border-border rounded px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">Scope of work</label>
            <textarea
              name="description"
              rows={4}
              placeholder="Describe the work you need done. Contractors will use this alongside your drawings to price their offer."
              className="w-full border border-border rounded px-3 py-2.5 text-sm resize-y"
            />
          </div>
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">Drawings</label>
            <div className="border border-dashed border-blue bg-blue-tint rounded px-4 py-6 text-center">
              <input type="file" name="drawings" multiple accept=".pdf,.dwg,.jpg,.jpeg,.png,.zip" className="text-xs mx-auto" />
              <p className="text-[11px] text-blue mt-2">PDF, DWG, JPG, PNG, or a .zip folder of drawings — up to 50MB total</p>
            </div>
            <p className="text-xs text-steel-light mt-1.5">Only approved, subscribed contractors can view these files.</p>
          </div>
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">Bid deadline</label>
            <input
              type="datetime-local"
              name="bid_deadline"
              required
              defaultValue={defaultDeadlineValue}
              className="border border-border rounded px-3 py-2.5 text-sm"
            />
            <p className="text-xs text-steel-light mt-1.5">No offers are accepted after this time.</p>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <button
              type="submit"
              disabled={pending}
              className="bg-amber hover:bg-amber-dark disabled:opacity-60 text-white font-semibold text-sm rounded px-5 py-2.5 w-fit"
            >
              {pending ? "Posting…" : "Post project"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => submitProject("draft")}
              className="border border-navy text-navy hover:bg-navy hover:text-white disabled:opacity-60 text-sm font-semibold rounded px-5 py-2.5 w-fit"
            >
              Save as draft
            </button>
          </div>
          <p className="text-xs text-steel-light -mt-2.5">
            A draft is only visible to you. Publish it later from the project page when you're ready for bids.
          </p>
        </form>

        <div className="bg-white border border-border rounded px-4.5 py-4">
          <h3 className="font-mono text-[13px] uppercase tracking-wide text-navy mb-2">Before you post</h3>
          <ul className="text-[13px] text-steel leading-[1.7] list-disc pl-[18px]">
            <li>Clear drawings get more accurate offers — include dimensions where you can.</li>
            <li>Give contractors at least 5–7 days to price the job properly.</li>
            <li>You won't be charged. Posting and reviewing offers is free for property owners.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
