"use client";

import { useState } from "react";

export function RoleFields() {
  const [role, setRole] = useState<"owner" | "contractor">("owner");

  return (
    <>
      <div>
        <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1.5">
          I am a...
        </label>
        <div className="flex border border-navy rounded overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => setRole("owner")}
            className={`px-4 py-2 text-xs font-mono uppercase ${
              role === "owner" ? "bg-navy text-white" : "bg-white text-navy"
            }`}
          >
            Property owner
          </button>
          <button
            type="button"
            onClick={() => setRole("contractor")}
            className={`px-4 py-2 text-xs font-mono uppercase border-l border-navy ${
              role === "contractor" ? "bg-navy text-white" : "bg-white text-navy"
            }`}
          >
            Contractor
          </button>
        </div>
        <input type="hidden" name="role" value={role} />
      </div>

      {role === "contractor" && (
        <div>
          <label className="block font-mono text-[11px] uppercase tracking-wide text-steel mb-1">
            Company name
          </label>
          <input name="company_name" required className="w-full border border-border rounded px-3 py-2.5 text-sm" />
          <p className="text-xs text-steel-light mt-1">
            You&apos;ll submit verification documents after signing up.
          </p>
        </div>
      )}
    </>
  );
}
