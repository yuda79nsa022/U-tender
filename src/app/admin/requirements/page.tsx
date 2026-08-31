import { createClient } from "@/lib/supabase/server";
import { addRequirement, removeRequirement, toggleRequired } from "./actions";

export default async function AdminRequirementsPage() {
  const supabase = createClient();
  const { data: requirements } = await supabase
    .from("document_requirements")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  return (
    <main className="max-w-3xl mx-auto px-5 py-10">
      <span className="font-mono text-[11px] uppercase tracking-widest text-amber-dark block mb-2">
        Admin · Document requirements
      </span>
      <h1 className="font-display text-2xl font-semibold text-navy mb-2">
        Required documents for contractors
      </h1>
      <p className="text-sm text-steel mb-8">
        Turn requirements on or off, or remove one entirely. Changes apply to new submissions right
        away — contractors already approved aren&apos;t affected.
      </p>

      <div className="space-y-2.5">
        {requirements?.map((req) => (
          <div key={req.id} className="flex items-center gap-4 bg-white border border-border rounded px-4 py-3.5">
            <form
              action={async () => {
                "use server";
                await toggleRequired(req.id, !req.is_required);
              }}
            >
              <button
                type="submit"
                aria-pressed={req.is_required}
                aria-label={`Toggle required for ${req.name}`}
                className={`w-9 h-5 rounded-full relative transition-colors ${
                  req.is_required ? "bg-green" : "bg-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                    req.is_required ? "left-4" : "left-0.5"
                  }`}
                />
              </button>
            </form>

            <div className="flex-1">
              <div className="font-display font-semibold text-sm">{req.name}</div>
              <div className="text-xs text-steel-light">{req.description}</div>
            </div>

            <span className="font-mono text-[9.5px] uppercase text-steel-light">
              {req.is_required ? "Required" : "Optional"}
            </span>

            <form
              action={async () => {
                "use server";
                await removeRequirement(req.id);
              }}
            >
              <button
                type="submit"
                title="Remove requirement"
                className="w-7 h-7 border border-border rounded text-red hover:bg-red-tint text-sm"
              >
                ✕
              </button>
            </form>
          </div>
        ))}
      </div>

      <form
        action={addRequirement}
        className="grid grid-cols-1 sm:grid-cols-[1fr_1.6fr_auto_auto] gap-2.5 items-center bg-blue-tint border border-dashed border-blue rounded px-4 py-3.5 mt-4"
      >
        <input
          name="name"
          required
          placeholder="Document name, e.g. Workers' comp certificate"
          className="border border-border rounded px-2.5 py-2 text-sm"
        />
        <input
          name="description"
          placeholder="Short description shown to contractors"
          className="border border-border rounded px-2.5 py-2 text-sm"
        />
        <label className="flex items-center gap-1.5 font-mono text-[11px] text-navy whitespace-nowrap">
          <input type="checkbox" name="is_required" defaultChecked /> Required
        </label>
        <button type="submit" className="bg-navy hover:bg-navy-deep text-white text-xs font-semibold rounded px-3 py-2">
          + Add requirement
        </button>
      </form>
    </main>
  );
}
