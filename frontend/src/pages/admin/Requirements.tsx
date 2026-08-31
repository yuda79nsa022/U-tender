import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import type { DocumentRequirement } from "@/api/types";

export function AdminRequirementsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isRequired, setIsRequired] = useState(true);

  const { data: requirements } = useQuery({
    queryKey: ["admin-requirements"],
    queryFn: () => apiFetch<DocumentRequirement[]>("/admin/requirements"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-requirements"] });

  const addMutation = useMutation({
    mutationFn: () => apiFetch("/admin/requirements", { method: "POST", body: { name, description: description || null, is_required: isRequired } }),
    onSuccess: () => {
      setName("");
      setDescription("");
      setIsRequired(true);
      invalidate();
    },
  });

  const toggleRequiredMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      apiFetch(`/admin/requirements/${id}`, { method: "PATCH", body: { is_required: value } }),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/requirements/${id}`, { method: "PATCH", body: { is_active: false } }),
    onSuccess: invalidate,
  });

  const active = requirements?.filter((r) => r.is_active) ?? [];

  return (
    <main className="max-w-3xl mx-auto px-5 py-10">
      <span className="font-mono text-[11px] uppercase tracking-widest text-amber-dark block mb-2">Admin · Document requirements</span>
      <h1 className="font-display text-2xl font-semibold text-navy mb-2">Required documents for contractors</h1>
      <p className="text-sm text-steel mb-8">
        Turn requirements on or off, or remove one entirely. Changes apply to new submissions right away —
        contractors already approved aren't affected.
      </p>

      <div className="space-y-2.5">
        {active.map((req) => (
          <div key={req.id} className="flex items-center gap-4 bg-white border border-border rounded px-4 py-3.5">
            <button
              type="button"
              onClick={() => toggleRequiredMutation.mutate({ id: req.id, value: !req.is_required })}
              aria-pressed={req.is_required}
              aria-label={`Toggle required for ${req.name}`}
              className={`w-9 h-5 rounded-full relative transition-colors ${req.is_required ? "bg-green" : "bg-border"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${req.is_required ? "left-4" : "left-0.5"}`} />
            </button>

            <div className="flex-1">
              <div className="font-display font-semibold text-sm">{req.name}</div>
              <div className="text-xs text-steel-light">{req.description}</div>
            </div>

            <span className="font-mono text-[9.5px] uppercase text-steel-light">{req.is_required ? "Required" : "Optional"}</span>

            <button
              type="button"
              onClick={() => removeMutation.mutate(req.id)}
              title="Remove requirement"
              className="w-7 h-7 border border-border rounded text-red hover:bg-red-tint text-sm"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addMutation.mutate();
        }}
        className="grid grid-cols-1 sm:grid-cols-[1fr_1.6fr_auto_auto] gap-2.5 items-center bg-blue-tint border border-dashed border-blue rounded px-4 py-3.5 mt-4"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Document name, e.g. Workers' comp certificate"
          className="border border-border rounded px-2.5 py-2 text-sm"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description shown to contractors"
          className="border border-border rounded px-2.5 py-2 text-sm"
        />
        <label className="flex items-center gap-1.5 font-mono text-[11px] text-navy whitespace-nowrap">
          <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} /> Required
        </label>
        <button type="submit" className="bg-navy hover:bg-navy-deep text-white text-xs font-semibold rounded px-3 py-2">
          + Add requirement
        </button>
      </form>
    </main>
  );
}
